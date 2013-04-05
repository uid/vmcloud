var config = require('./config.js');
var rpc = require('./rpc.js');
var common = require('./common.js');
var error = common.error;
var log = common.log;
var vlog = common.vlog;
var dlog = common.dlog;
var openstack = require('./openstack.js');
var express = require('express');
var fs = require('fs');

var vmData = {}; // TODO: put in database
var nextVMID = 1;

var BeliefState = common.BeliefState;
var VMStates = common.VMStates;

var openstackController = null;

function verState(vmid, state) {
    return {
        state: state,
        get: function () {
            return this.state
        },
        version: 0,
        getVer: function () {
            return this.version;
        },
        set: function (newState) {
            var oldState = this.state;
            this.state = newState;
            this.version++;
            vlog("VM #" + vmid + " belief state transition: " + BeliefState.name(oldState) + " -> " + BeliefState.name(newState));
            return this.version;
        },
        verSet: function (ver, newState) {
            if (this.version == ver) {
                this.set(newState);
            }
        }
    };
}

// TODO: state versioning, so that an old async task cannot come back way later to reset a WAIT state or ERROR state.

function bootNewVM() {
    var vmid = nextVMID;
    nextVMID++;
    vmData[vmid] = {state: verState(vmid, BeliefState.CREATING)}; // TODO: possible issues?
    openstackController.boot(vmid, function (server) {
        vmData[vmid].server = server;
        vmData[vmid].state.verSet(0, BeliefState.BOOTING);
        log("Successfully booted: " + vmid + ", OpenStack instance id = " + server.id
            + ", server info: " + JSON.stringify(server));
    });
}

function killVM(vmid) {
    var vm = vmData[vmid];
    var id = vm.server.id;
    if (!id) {
        log("Error when killing VM: VM " + vmid + " not ready!");
        return;
    }
    vm.state.set(BeliefState.WAIT);
    openstackController.kill(id, function (id) {
        log("Successfully terminated: " + vmid + ": " + id);
        delete vmData[vmid];
    })
}

function getVMMaintainer() {
    var numVMs = 0;
    var maintainer = {
        run: function () {
            setInterval(function maintain() {
                var currentCount = Object.keys(vmData).length;
                if (currentCount < numVMs) {
                    // BOOT!
                    for (var i = currentCount; i < numVMs; i++) {
                        bootNewVM();
                    }
                } else if (currentCount > numVMs) {
                    // KILL!
                    var tokill = currentCount - numVMs;
                    for (var vmid in vmData) {
                        var state = vmData[vmid].state;
                        if (state == BeliefState.BOOTING || state == BeliefState.FREE) {
                            killVM(vmid);
                            tokill--;
                        }
                        if (state == BeliefState.WAIT) {
                            tokill--; // could be in a dead state - assume dead.
                        }
                        if (tokill == 0) break;
                    }
                }
            }, 5000);
        },
        setNumVMs: function (num) {
            numVMs = parseInt(num);
        },
        getNumVMs: function () {
            return numVMs;
        }
    };
    return maintainer;
}

function getVMHeartbeater() {
    return {
        run: function () {
            setInterval(function heartbeat() {
                for (var vmid in vmData) {
                    var vm = vmData[vmid];
                    var state = vm.state.get();
                    if (state != BeliefState.CREATING && state != BeliefState.BOOTING && state != BeliefState.WAIT) {
                        (function (vmid, vm) {
                            vmrpc(vmid, function (remote, cb) {
                                remote.ping(cb);
                            }, function (err, result) {
                                var state = vm.state.get();
                                if (err) {
                                    log('Pinging VM ' + vmid + ' failed: ' + err);
                                    vm.state.set(BeliefState.ERROR);
                                } else if (state == BeliefState.WAIT) {
                                    // do nothing
                                } else if (state == BeliefState.FREE) {
                                    if (result != VMStates.FREE) {
                                        log('VM ' + vmid + " is " + VMStates.name(result)
                                            + " but belief state is FREE!");
                                        vm.state.set(BeliefState.ERROR);
                                    } else {
                                        vm.state.set(BeliefState.FREE); // refresh it
                                    }
                                } else if (state == BeliefState.READY || state == BeliefState.OCCUPIED) {
                                    if (result != VMStates.READY) {
                                        log('VM ' + vmid + ' is ' + VMStates.name(result)
                                            + ' but belief state is ' + BeliefState.name(state) + "!");
                                    } else {
                                        vm.state.set(state);
                                    }
                                }
                            });
                        })(vmid, vm);
                    }
                }
            }, 5000);
        }
    };
}

function getVMWatchdog() {
    return {
        run: function () {
            var knowledge = {};
            setInterval(function watchdog() {
                var time = new Date().getTime();
                for (var vmid in vmData) {
                    var vm = vmData[vmid];
                    var state = vm.state.get();
                    var ver = vm.state.getVer();
                    if (!(vmid in knowledge)) {
                        knowledge[vmid] = {
                            lastVer: ver,
                            time: time
                        };
                    }
                    if (knowledge[vmid].lastVer != ver) {
                        knowledge[vmid].lastVer = ver;
                        knowledge[vmid].time = time;
                    } else {
                        if (time - knowledge[vmid].time > config.control.watchdog_timeout) {
                            killVM(vmid);
                        }
                    }
                }
            }, 1000);
        }
    }
}

// Refresh the server info from openstack, and then transition into the given state
function updateInstanceInfoFromOpenStack(vmid, destState) {
    var vm = vmData[vmid];
    var ver = vm.state.set(BeliefState.WAIT);
    openstackController.getServer(vm.server.id, function (server) {
        vlog("VM #" + vmid + " info updated: " + JSON.stringify(server));
        vm.server = server;
        vm.state.verSet(ver, destState);
    });
}

function runControlServer() {
    var rpc_server = new rpc({
        checkin: function (vmid, callback) {
            vlog("Checkin received from: " + vmid);
            updateInstanceInfoFromOpenStack(vmid, BeliefState.FREE);
            callback();
        },
        browser_event: function (vmid, data, callback) {
            vlog("Browser event received: " + JSON.stringify(data));
            callback();
        },
        log: function (vmid, msg, callback) {
            dlog("Remote log [" + vmid + "]: " + msg);
            callback();
        },
        getConfig: function (vmid, callback) {
            vlog("VM #" + vmid + " fetching config.");
            fs.readFile('config.js', 'utf8', function (err, data) {
                if (err) {
                    log("Cannot fetch config file.");
                    callback('');
                } else {
                    callback(data);
                }
            });
        }
    });

    var maintainer = getVMMaintainer();
    var heartbeater = getVMHeartbeater();
    var watchdog = getVMWatchdog();

    var app = express();
    app.get('/set-num-vm/:num', function (req, res) {
        log('Received web request to set number of vm to ' + req.params.num);
        if (req.params.num > 10) {
            log("Can't set num vms higher than 10! (temporary security measure.)");
        } else {
            maintainer.setNumVMs(req.params.num);
        }
        res.send("");
    });

    app.get('/prepare/:vmid/:url', function (req, res) {
        log('Received web request to set up a firefox session pointing to home page '
            + req.params.url + ' on VM #' + req.params.vmid);
        var vmid = parseInt(req.params.vmid);
        if (vmid in vmData) {
            var vm = vmData[vmid]; // TODO: state versioning
            if (vm.state.get() == BeliefState.FREE) {
                var ver = vm.state.set(BeliefState.WAIT);
                vmrpc(vmid, function (remote, cb) {
                    remote.prepare({
                        profile_name: 'vmprofile',
                        home_page: req.params.url
                    }, cb);
                }, function (err, result) {
                    if (err) {
                        log("Error while preparing VM: " + err);
                    } else {
                        vm.state.verSet(ver, result.state == VMStates.READY ? BeliefState.READY : BeliefState.ERROR);
                    }
                });
            } else {
                log("VM not in the correct state! State is " + BeliefState.name(vm.state.get()));
            }
        }
        res.send('');
    });

    app.get('/cleanup/:vmid', function (req, res) {
        log('Received web request to tear down the firefox session on VM #' + req.params.vmid);
        var vmid = parseInt(req.params.vmid);
        if (vmid in vmData) {
            var vm = vmData[vmid];
            if (vm.state.get() == BeliefState.READY || vm.state.get() == BeliefState.OCCUPIED) {
                var ver = vm.state.set(BeliefState.WAIT);
                vmrpc(vmid, function (remote, cb) {
                    remote.cleanup({}, cb);
                }, function (err, result) {
                    if (err) {
                        log("Error while cleaning up VM: " + err);
                    } else {
                        vm.state.verSet(result.state == VMStates.FREE ? BeliefState.FREE : BeliefState.ERROR);
                    }
                });
            } else {
                log("VM not in the correct state! State is " + BeliefState.name(vm.state.get()));
            }
        }
        res.send('');
    });


    log("Authenticating into OpenStack and getting parameters...");
    // prepare openstack
    openstack.getOpenStackController(function (controller) {
        openstackController = controller;
        log("Openstack connected.");

        rpc_server.listen(config.control.port);
        log("Server running on port " + config.control.port);

        maintainer.run();
        log("VM maintainer started.");

        heartbeater.run();
        log("Heartbeater started.");

        watchdog.run();
        log("Watchdog started.");

        app.listen(config.control.external_port);
        log("External web server started on port " + config.control.external_port);
    });
}

/**
 * Perform an RPC to a VM
 * @param vmid the vmid of the VM
 * @param action a function, whose param is 'remote' to be used to call remote procedures
 * @param callback called with (null, result) if success, or (err) if error
 */
function vmrpc(vmid, action, callback) {
    var port = config.vm.interface_port;
    if (!('server' in vmData[vmid])) {
        callback("VM " + vmid + " is not ready yet.");
        return;
    }

    var ip = vmData[vmid].server.addresses.private[0].addr; // TODO: multiple addresses possible?
    rpc.connect(port, ip, function (remote, conn) {
        action(remote, function () {
            conn.destroy();
            conn.end();
            callback.apply(null, [null].concat(arguments));
        });
    });
}


exports = module.exports = runControlServer;

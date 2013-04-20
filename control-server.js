var config = require('./configurator.js');
var rpcEngine = require('./rpc.js');
var rpcBuilder = require('./rpc-builder.js');
var vmRPCInterface = require('./rpc-interfaces.js').vmInterface;
var common = require('./common.js');
var error = common.error;
var log = common.log;
var vlog = common.vlog;
var dlog = common.dlog;
var openstack = require('./openstack.js');
var express = require('express');
var fs = require('fs');
var async = require('async');

var vmData = {}; // TODO: put in database
var rpc = {};
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
						var state = vmData[vmid].state.get();
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
							rpc[vmid].ping(function (result) {
								var vmState = result.state;
								var state = vm.state.get();
								if (state == BeliefState.WAIT) {
									// do nothing
								} else if (state == BeliefState.FREE) {
									if (vmState != VMStates.FREE) {
										log('VM ' + vmid + " is " + VMStates.name(vmState)
											+ " but belief state is FREE!");
										vm.state.set(BeliefState.ERROR);
									} else {
										vm.state.set(BeliefState.FREE); // refresh it
									}
								} else if (state == BeliefState.READY || state == BeliefState.OCCUPIED) {
									if (vmState != VMStates.READY) {
										log('VM ' + vmid + ' is ' + VMStates.name(vmState)
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
						if (state == BeliefState.BOOTING) {
							if (time - knowledge[vmid].time > config.control.watchdog_bootup_timeout) {
								killVM(vmid);
							} else {
								(function (vmid) {
									openstackController.getServer(vm.server.id, function (server) {
										if (server.status == 'ERROR') {
											log("VM #" + vmid + " launching error. Killing VM.");
											killVM(vmid);
										}
									});
								})(vmid);
							}
						} else {
							if (time - knowledge[vmid].time > config.control.watchdog_timeout) {
								killVM(vmid);
							}
						}
					}
				}
			}, 4000);
		}
	}
}

// Refresh the server info from openstack, and then transition into the given state
function updateInstanceInfoFromOpenStack(vmid, callback) {
	var vm = vmData[vmid];
	openstackController.getServer(vm.server.id, function (server) {
		vlog("VM #" + vmid + " info updated: " + JSON.stringify(server));
		vm.server = server;
		callback();
	});
}

function runControlServer() {
	var rpc_server = new rpcEngine({
		checkin: function (vmid, callback) {
			vlog("Checkin received from: " + vmid);
			var vm = vmData[vmid];
			var ver = vm.state.set(BeliefState.WAIT);
			updateInstanceInfoFromOpenStack(vmid, function () {
				vm.state.verSet(ver, BeliefState.FREE);
				rpc[vmid] = rpcBuilder.rpcInterface(vm.server.addresses.private[0].addr, config.vm.interface_port,
					vmRPCInterface); // TODO: multiple addresses possible?
				callback();
			});
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
			callback({
				vm: config.vm,
				external: config.external
			})
		}
	});

	var maintainer = getVMMaintainer();
	var heartbeater = getVMHeartbeater();
	var watchdog = getVMWatchdog();

	var app = express();

	app.all('*', function(req, res, next) {
		res.header('Access-Control-Allow-Origin', '*');
		res.header('Access-Control-Allow-Methods', 'PUT, GET, POST, DELETE, OPTIONS');
		res.header('Access-Control-Allow-Headers', 'Content-Type');
		next();
	});

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
			var vm = vmData[vmid];
			if (vm.state.get() == BeliefState.FREE) {
				var ver = vm.state.set(BeliefState.WAIT);
					async.parallel([function (cb) {
						rpc[vmid].prepare({
							profile_name: 'vmprofile',
							home_page: req.params.url
						}, function (result) {
							vm.vnc_passwd = result.vnc_passwd;
							cb(null, result);
						});
					}, function (cb) {
						openstackController.assignIP(vm.server.id, function(err, ip) {
							if (err) {
								cb(err);
							} else {
								vm.server.public_ip = ip;
								cb(null);
							}
						});
					}], function (err, result) {
						if (err) {
							vm.state.verSet(ver, BeliefState.ERROR);
							log(err);
						} else {
							vm.state.verSet(ver, result[0].state == VMStates.READY ? BeliefState.READY : BeliefState.ERROR);
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
				async.parallel([function(cb) {
					rpc[vmid].cleanup({}, function (result) {
						delete vm.vnc_passwd;
						cb(null, result);
					});
				}, function(cb) {
					openstackController.removeIP(vm.server.id, vm.server.public_ip, function(err) {
						if (err) {
							cb(err);
						} else {
							delete vm.server.public_ip;
							cb(null);
						}
					});
				}], function(err, result) {
					if (err) {
						vm.state.verSet(ver, BeliefState.ERROR);
						log(err);
					} else {
						vm.state.verSet(ver, result[0].state == VMStates.FREE ? BeliefState.FREE : BeliefState.ERROR);
					}
				});
			} else {
				log("VM not in the correct state! State is " + BeliefState.name(vm.state.get()));
			}
		}
		res.send('');
	});

	app.get('/status', function(req, res) {
		//log("Received web request to query status");
		res.send(JSON.stringify(vmData));
	});

	app.use('/static', express.static(__dirname+'/static'));

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

exports = module.exports = runControlServer;

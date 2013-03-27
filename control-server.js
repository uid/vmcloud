var config = require('./config.js');
var rpc = require('./rpc.js');
var common = require('./common.js');
var error = common.error;
var log = common.log;
var vlog = common.vlog;
var dlog = common.dlog;
var openstack = require('./openstack.js');
var express = require('express');

var vmData = {}; // TODO: put in database
var nextVMID = 1;

var BeliefState = common.BeliefState;
var VMStates = common.VMStates;

var openstackController = null;

// TODO: state versioning, so that an old async task cannot come back way later to reset a WAIT state or ERROR state.

function bootNewVM() {
	var vmid = nextVMID;
	nextVMID++;
	vmData[vmid] = {state: BeliefState.WAIT}; // TODO: possible issues?
	openstackController.boot(vmid, function (server) {
		vmData[vmid].server = server;
		vmData[vmid].state = BeliefState.BOOTING;
		log("Successfully booted: " + vmid + ", OpenStack instance id = " + server.id);
	});
}

function killVM(vmid) {
	var id = vmData[vmid].server.id;
	if (!id) {
		log("Error when killing VM: VM " + vmid + " not ready!");
		return;
	}
	vmData[vmid].state = BeliefState.WAIT;
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
	var heartbeater = {
		run: function () {
			setInterval(function heartbeat() {
				for (var vmid in vmData) {
					if (vmData[vmid].state != BeliefState.BOOTING && vmData[vmid].state != BeliefState.WAIT) {
						vmrpc(vmid, function (remote, cb) {
							remote.ping(cb);
						}, function (err, result) {
							if (err) {
								log('Pinging VM ' + vmid + ' failed: ' + err);
								vmData[vmid].state = BeliefState.ERROR;
							} else if (vmData[vmid].state != BeliefState.ERROR) {
								var mapping = {};
								mapping[VMStates.BUSY] = BeliefState.WAIT;
								mapping[VMStates.FREE] = BeliefState.FREE;
								mapping[VMStates.READY] = BeliefState.READY; // TODO: Ready vs Occupied!
								mapping[VMStates.ERROR] = BeliefState.ERROR;
								vmData[vmid].state = mapping[result];
							}
						});
					}
				}
			}, 5000);
		}
	};
	return heartbeater;
}

function runControlServer() {
	var rpc_server = new rpc({
		checkin: function (vmid, callback) {
			vlog("Checkin received from: " + vmid);
			vmData[vmid].state = BeliefState.WAIT;
			callback();
		},
		browser_event: function (vmid, data, callback) {
			vlog("Browser event received: " + JSON.stringify(data));
			callback();
		},
		log: function (vmid, msg, callback) {
			dlog("Remote log [" + vmid + "]: " + msg);
			callback();
		}
	});

	var maintainer = getVMMaintainer();
	var heartbeater = getVMHeartbeater();

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

		app.listen(config.control.external_port);
		log("External web server started.");
	});
}

/**
 * Perform an RPC to a VM
 * @param vmid the vmid of the VM
 * @param action a function, whose param is 'remote' to be used to call remote procedures
 * @param callback called with (null, result) if success, or (err) if error
 */
function vmrpc(vmid, action, callback) {
	var port = config.vm.port;
	if (!('server' in vmData[vmid])) {
		callback("VM " + vmid + " is not ready yet.");
		return;
	}

	var ip = vmData[vmid].server.ip;
	rpc.connect(port, ip, function (remote, conn) {
		action(remote, function (result) {
			conn.destroy();
			conn.end();
			callback(null, result);
		});
	});
}


exports = module.exports = runControlServer;

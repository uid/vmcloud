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

var openstackController = null;

var BeliefState = {
	BOOTING : 1,
	WAIT : 2,
	FREE : 3,
	READY : 4,
	OCCUPIED: 5,
	ERROR: -1
};

function bootNewVM() {
	var vmid = nextVMID;
	nextVMID++;
	vmData[vmid] = {state: BeliefState.BOOTING};
	openstackController.boot(vmid, function(id) {
		vmData[vmid].id = id;
		log("Successfully booted: "+vmid+": "+id);
	});
}

function killVM(vmid) {
	var id = vmData[vmid].id;
	if (!id) {
		log("Error: VM "+vmid +" not ready!");
		return;
	}
	vmData[vmid].state = BeliefState.WAIT;
	openstackController.kill(id, function(id) {
		log("Successfully terminated: " + vmid + ": "+id);
		delete vmData[vmid];
	})
}

function getVMMaintainer() {
	var numVMs = 0;
	var maintainer = {
		run : function() {
			setInterval(function maintain() {
				var currentCount = Object.keys(vmData).length;
				if (currentCount < numVMs) {
					// BOOT!
					for(var i=currentCount;i<numVMs;i++) {
						bootNewVM();
					}
				} else if (currentCount > numVMs) {
					// KILL!
					var tokill = currentCount - numVMs;
					for (var vmid in vmData) {
						var state = vmData[vmid].state;
						if (state == BeliefState.BOOTING || state == BeliefState.FREE) {
							killVM(vmid);
							tokill --;
						}
						if (state == BeliefState.WAIT) {
							tokill --; // could be in a dead state - assume dead.
						}
						if (tokill == 0) break;
					}
				}
			}, 5000);
		},
		setNumVMs : function(num) {
			numVMs = num;
		},
		getNumVMs : function() {
			return numVMs;
		}
	};
	return maintainer;
}

function runControlServer() {
	var rpc_server = new rpc({
		checkin: function (vmid, callback) {
			// TODO: do stuff
			vlog("Checkin received from: " + vmid);
			callback();
		},
		browser_event: function (vmid, data, callback) {
			vlog("Browser event received: " + JSON.stringify(data));
			callback();
		},
		log: function(vmid, msg, callback) {
			dlog("Remote log ["+vmid+"]: "+msg);
			callback();
		}
	});

	var maintainer = getVMMaintainer();

	var app = express();
	app.get('/set-num-vm/:num', function(req, res) {
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
	openstack.getOpenStackController(function(controller) {
		openstackController = controller;
		log("Openstack connected.");

		rpc_server.listen(config.control.port);
		log("Server running on port "+config.control.port);

		maintainer.run();
		log("VM maintainer started.");

		app.listen(config.control.external_port);
		log("External web server started.");
	});
}


exports = module.exports = runControlServer;
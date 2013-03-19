var config = require('./config.js');
var rpc = require('./rpc.js');
var express = require('express');
var common = require('./common.js');
var error = common.error;
var log = common.log;
var vlog = common.vlog;

var vmActions = require('./vm-actions.js');

var ctrl_server = config.control.host;
var ctrl_port = config.control.port;
var vmid = config.boot.vmid;


var VMStates = {
	BUSY: 1,
	FREE: 2,
	READY: 3,
	OCCUPIED: 4,
	ERROR: -1
};

var vmState = VMStates.BUSY;

function runFirefoxPluginListenerServer() {

	function browser_page_loaded(profile, url) {
		log("Browser page loaded: " + JSON.stringify({profile: profile, url: url}));
		rpc.connect(ctrl_port, ctrl_server, function (remote, conn) {
			remote.browser_event(vmid, {
				'action': 'page-load',
				'profile': profile,
				'url': url
			}, function () {
				conn.destroy();
				conn.end();
			});
		});
	}

	var app = express();
	app.use(express.bodyParser());
	app.post('/browser-events', function (req, res) {
		log("POST /browser-events " + JSON.stringify(req.body));
		var data = req.body;
		if ('action' in data) {
			switch (data['action']) {
				case 'page-load':
					var url = data['url'];
					var profile = data['profile'];
					if (!url || !profile) {
						error("page-load data must contain url and profile");
					}
					if ('url' in data && 'profile' in data) {
						browser_page_loaded(profile, url);
					}
					break;
				default:
					error("invalid action: " + data['action']);
			}
		} else {
			error("invalid request to /browser-events: " + JSON.stringify(data));
		}
	});

	app.listen(config.vm.firefox_port);
}


//////////////////////////////////////////////
function vmCheckIn(callback) {
	log("checking in, id = " + vmid);
	rpc.connect(ctrl_port, ctrl_server, function (remote, conn) {
		remote.checkin(vmid, function () {
			log("Checkin successful.");
			conn.destroy();
			conn.end();
			callback();
		})
	})
}

function runRpcServer() {
	var rpc_server = new rpc({
		ping: function (callback) {
			callback({
				state: vmState
			});
		},

		prepare: function(data, callback) {
			vmState = VMStates.BUSY;
			vmActions.prepare(data, function(result) {
				if (result.success) {
					vmState = VMStates.READY;
				} else {
					vmState = VMStates.ERROR;
				}
				callback({
					result: result,
					state: vmState
				});
			}); // TODO: revisit
		},

		serve: function(data, callback) {
			// no idea what to do yet.
			vmState = VMStates.OCCUPIED;
			callback({
				state: vmState
			});
		},

		cleanup: function(data, callback) {
			// no idea what to do either.
			vmState = VMStates.BUSY;
			vmActions.cleanup(data, function(result) {
				if (result.success) {
					vmState = VMStates.FREE;
				} else {
					vmState = VMStates.ERROR;
				}
				callback({
					result: result,
					state: vmState
				});
			});
		}
	});
	rpc_server.listen(config.vm.interface_port);
}

function runVMInterface() {
	runRpcServer();
	runFirefoxPluginListenerServer();
	vmCheckIn(function() {
		vmState = VMStates.FREE;
	});
}

exports = module.exports = runVMInterface;
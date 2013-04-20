var config = require('./configurator.js');
var rpcEngine = require('./rpc.js');
var express = require('express');
var common = require('./common.js');
var error = common.error;
var fs = require('fs');
var log = common.log;
var vlog = common.vlog;

var vmActions = require('./vm-actions.js');

var vmid = config.vmid;

var VMStates = common.VMStates;

var vmState = VMStates.BUSY;

var rpc = config.rpcInterface;

function runFirefoxPluginListenerServer() {

	function browser_page_loaded(profile, url) {
		log("Browser page loaded: " + JSON.stringify({profile: profile, url: url}));
		rpc.browser_event(vmid, {
			'action': 'page-load',
			'profile': profile,
			'url': url
		}, function (result) {
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
	rpc.checkin(vmid, function () {
		log("Checkin successful.");
		callback();
	});
}

// TODO: This is just to be simple. But if we want to ultimately support multiple instances per VM, this needs to be
// changed somehow.
var sessionPayload;

function getRPCImpl() {
	return {
		ping: function (callback) {
			callback({
				state: vmState
			});
		},

		prepare: function (data, callback) {
			vmState = VMStates.BUSY;
			vmActions.prepare(data, function (err, result) {
				if (err) {
					vmState = VMStates.ERROR;
					callback({
						state: vmState
					});
				} else {
					vmState = VMStates.READY;
					sessionPayload = result;
					callback({
						firefox_pid: result.firefox_proc.pid,
						vnc_passwd: result.vnc_passwd,
						state: vmState
					});
				}
			});
		},

		cleanup: function (data, callback) {
			vmState = VMStates.BUSY;
			vmActions.cleanup({
				payload: sessionPayload
			}, function (err, result) {
				if (err) {
					vmState = VMStates.ERROR;
					callback({
						state: vmState
					});
				} else {
					vmState = VMStates.FREE;
					callback({
						result: result,
						state: vmState
					});
				}
			});
		}
		// TODO: add debug commands such as enter error state
	};
}

function runFlashPolicyServer() {
	var net = require("net");

	var flashPolicyServer = net.createServer(function (stream) {
		stream.setTimeout(0);
		stream.setEncoding("utf8");

		stream.addListener("connect", function () {
		});

		stream.addListener("data", function (data) {
			if ( data.indexOf('<policy-file-request/>') != -1){
				stream.write('<cross-domain-policy><allow-access-from domain="*" to-ports="*" /></cross-domain-policy>');
			}
			stream.end();
		});

		stream.addListener("end", function() {
			stream.end();
		});
	});

	flashPolicyServer.listen(1234);
}

function runRpcServer() {
	var rpc_server = new rpcEngine(getRPCImpl());
	rpc_server.listen(config.vm.interface_port);
}

function runVMInterface() {
	vmActions.initial_bootup(function (err, result) {
		if (err) {
			log("Initial bootup failed.");
			vmState = VMStates.ERROR;
			vmCheckIn(function () {
			});
		} else {
			runRpcServer();
			runFirefoxPluginListenerServer();
			runFlashPolicyServer();
			vmState = VMStates.FREE;
			vmCheckIn(function () {
			});
		}
	});

	return {
		rpcImpl: getRPCImpl()
	};
}

exports = module.exports = runVMInterface;

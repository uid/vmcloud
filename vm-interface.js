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

	var app = express();
	app.use(express.bodyParser());
	app.post('/browser-events', function (req, res) {
		log("POST /browser-events " + JSON.stringify(req.body));
		var data = req.body;
		rpc.browser_event(vmid, data, function(){});
		res.send('');
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
			callback(vmState != VMStates.ERROR);
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
			setTimeout(function() {
				vmCheckIn(function () {
				});
			}, 2000);
		}
	});

	return {
		rpcImpl: getRPCImpl()
	};
}

exports = module.exports = runVMInterface;

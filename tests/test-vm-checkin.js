var mockControl = require('./mock-control-rpc-interface.js');
var rpcBuilder = require('../rpc-builder.js');
var mockRPC = rpcBuilder.mockRPCInterface(mockControl);
var config = require('../configurator.js');
var exec = require('child_process').exec;

mockRPC.on('checkin', function (vmid) {
	console.log("Test successful.");
	process.exit(0);
});

config.testing();
config.initInstance(5, mockRPC, function () {
	setTimeout(function () {
		console.log("Test failed: did not receive checkin within 10 seconds!");
		process.exit(1);
	}, 10000);

	var vmInterface = require('../vm-interface.js');
	vmInterface();
});

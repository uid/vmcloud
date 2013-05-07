var mockControl = require('./mock-control-rpc-interface.js');
var rpcBuilder = require('../rpc-builder.js');
var mockRPC = rpcBuilder.mockRPCInterface(mockControl);
var config = require('../configurator.js');
var exec = require('child_process').exec;

config.testing();
config.initInstance(5, mockRPC, function () {
	var vmInterface = require('../vm-interface.js');
	vmInterface();
});

var mockControl = require('./mock-control-rpc-interface.js');
var rpcBuilder = require('../rpc-builder.js');
var mockRPC = rpcBuilder.mockRPCInterface(mockControl);
var config = require('../configurator.js');
var exec = require('child_process').exec;
var VMStates = require('../common.js').VMStates;
var should = require('should');

var rpcImpl;

mockRPC.on('checkin', function (vmid) {
	rpcImpl.prepare({
		profile_name: 'testprofile',
		home_page: 'youtube.com'
	}, function (result) {
		should.equal(result.state, VMStates.READY);
		console.log("Prepare successful.");
	});
});

config.testing();
config.initInstance(5, mockRPC, function () {
	var vmInterface = require('../vm-interface.js');
	rpcImpl = vmInterface().rpcImpl;
});

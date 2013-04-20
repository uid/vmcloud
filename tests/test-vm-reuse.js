var mockControl = require('./mock-control-rpc-interface.js');
var rpcBuilder = require('../rpc-builder.js');
var mockRPC = rpcBuilder.mockRPCInterface(mockControl);
var config = require('../configurator.js');
var exec = require('child_process').exec;
var VMStates = require('../common.js').VMStates;
var should = require('should');
process.chdir(__dirname+"/..");

var rpcImpl;

mockRPC.on('checkin', function (vmid) {
	function spawn_and_kill(callback) {
		rpcImpl.prepare({
			profile_name: 'testprofile',
			home_page: 'youtube.com'
		}, function (result) {
			should.equal(result.state, VMStates.READY);
			console.log("Prepare successful.");
			setTimeout(function () {
				rpcImpl.cleanup({}, function (result) {
					should.equal(result.state, VMStates.FREE);
					console.log("Cleanup successful.");
					setTimeout(callback, 2000);
				});
			}, 5000);

		});
	}

	var repeat = 5;
	spawn_and_kill(function r() {
		if (repeat > 0) {
			repeat--;
			spawn_and_kill(r);
		} else {
			console.log("Test successful.");
			process.exit(0);
		}
	});

});

config.testing();
config.initInstance(5, mockRPC, function () {
	setTimeout(function () {
		console.log("Test failed: did not finish test within 60 seconds!");
		process.exit(1);
	}, 60000);

	var vmInterface = require('../vm-interface.js');
	rpcImpl = vmInterface().rpcImpl;
});

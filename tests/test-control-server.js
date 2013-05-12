var mock = require('./mock-cloud-controller-and-vm-rpc-interface.js');
var rpcBuilder = require('../rpc-builder.js');
var config = require('../configurator.js');
config.testing();
config.initControl(mock.cloudController, function(ip) {
	return rpcBuilder.mockRPCInterface(mock.vmRpcInterface());
});
require('../control-server.js')();
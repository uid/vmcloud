process.chdir(__dirname);
var configParams = require('./config.js');
var config = require('./configurator.js');
config.openstack = configParams.openstack; // a hack.. otherwise circular dependency
var openstack = require('./openstack.js');
var rpcBuilder = require('./rpc-builder.js');
var vmRPCInterface = require('./rpc-interfaces.js').vmInterface;
var log = require('./common.js').log;
log("Authenticating into Cloud service and getting parameters...");
openstack.getOpenStackController(function(controller) {
	config.initControl(controller, function(ip) {
		return rpcBuilder.rpcInterface(ip, config.vm.interface_port, vmRPCInterface);
	});
	bootstrap_control_server();
});

function bootstrap_control_server() {
	var control_server = require('./control-server.js');
	control_server();
}

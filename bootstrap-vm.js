var config = require('./configurator.js');
var instance_config = require(config.boot_json_file);
var exec = require('child_process').exec;
var rpcBuilder = require('./rpc-builder.js');
var controlInterface = require('./rpc-interfaces.js').controlInterface;
var fs = require('fs');
process.chdir(__dirname);

// get config file from control server
var ctrl_server = instance_config.control_server;
var ctrl_port = instance_config.control_port;
var vmid = instance_config.vmid;
var rpc = rpcBuilder.rpcInterface(ctrl_server, ctrl_port, controlInterface);
config.initInstance(vmid, rpc, function () {
	bootstrap_vm_instance();
});

function bootstrap_vm_instance() {
	var vm_interface = require('./vm-interface.js');
	vm_interface();
}
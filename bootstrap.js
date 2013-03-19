var config = require('./config.js');
if (config.boot.isControl) {
	bootstrap_control_server();
} else {
	bootstrap_vm_instance();
}

function bootstrap_control_server() {
	var control_server = require('./control-server.js');
	control_server();
}

function bootstrap_vm_instance() {
	var vm_interface = require('./vm-interface.js');
	vm_interface();
}
var instance_config = require('/opt/vmcloud.json');
var exec = require('child_process').exec;
var rpc = require('./rpc.js');
var fs = require('fs');
process.chdir(__dirname);

// update from git
exec('git fetch --all; git reset --hard origin/master', function(error, stdout, stderr) {
	if (error !== null) {
		console.log("[vmcloud] Warning: Cannot update from git repository");
	}

	// get config file from control server
	var ctrl_server = instance_config.control_server;
	var ctrl_port = instance_config.control_port;
	var vmid = instance_config.vmid;
	rpc.connect(ctrl_port, ctrl_server, function (remote, conn) {
		remote.getConfig(vmid, function (config_js) {
			console.log("[vmcloud] Successfully fetched config file");
			fs.writeFile('config.js', config_js, function(err) {
				if (err) {
					console.log("[vmcloud] Cannot write config file!");
					throw err;
				} else {
					console.log("[vmcloud] Starting VM interface.");

					var config = require('./config.js');
					config.i_am_instance(vmid);
					bootstrap_vm_instance();
				}
			});
			conn.destroy();
			conn.end();
		})
	})
});

function bootstrap_vm_instance() {
	var vm_interface = require('./vm-interface.js');
	vm_interface();
}
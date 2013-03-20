// Copy to config.js and edit the following parameters.
var config = {
	// Open stack configurations
	openstack: {
		// credentials
		user: 'openstackuser',
		pass: 'openstackpassword',

		// server IP
		server: '123.123.123.123',

		// the tenant name
		tenant: 'project1',

		// Boot parameters
		keypair: 'vmcloud',
		security_group: 'vmcloud',
		image_name: 'vmcloud-vm',
		flavor_name: 'medium',
		instance_name_prefix: "cloud-vm-instance"
	},

	control: {
		// endpoint of the control server
		host: '127.0.0.1', // IP or host name
		port: 9090,

		external_port: 8080
	},

	vm: {
		firefox_port: 9091,    // port for Firefox plugin calls
		interface_port: 9092,   // port for control server calls

		// directory which bootstrap.js is located when a VM boots (no trailing slash)
		// MUST be ABSOLUTE
		deploy_dir: '/var/vmcloud'
	},

	general: {
		// File in which the initial boot config json should be stored
		// This path MUST be ABSOLUTE
		boot_json_file: '/opt/vmcloud.json'
	}
};


//////////////////////////////////////////////////////////
// Do not edit from this point below
//////////////////////////////////////////////////////////

var boot_config = require(config.general.boot_json_file);

module.exports = exports = {
	boot: {
		isControl: boot_config.isControl,
		vmid: boot_config.vmid
	},
	openstack: config.openstack,
	control: config.control,
	vm: config.vm,
	general: config.general
};

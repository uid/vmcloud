var config = {
	// Open stack configurations
	openstack: {
		// credentials
		user: 'openstackuser',
		pass: 'openstackpassword',

		// OpenStack server IP
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

		// directory which bootstrap-vm.js is located when a VM boots (no trailing slash)
		// MUST be ABSOLUTE
		// DO NOT CHANGE: Changing is not supported at the moment
		deploy_dir: '/var/vmcloud'
	},

	general: {
		// File in which the initial boot config json should be stored
		// This path MUST be ABSOLUTE
		// DO NOT CHANGE: Changing is not supported at the moment
		boot_json_file: '/opt/vmcloud.json'
	},

	// configuration parameters for the external application; in our case, FlightCrew apps
	external: {
		rtsp_publish_port: 5555,
		audio_sink_name: 'vmcapture'
	}
};


//////////////////////////////////////////////////////////
// Do not edit from this point below
//////////////////////////////////////////////////////////
module.exports = exports = {
	isControl: null,
	vmid: null,
	openstack: config.openstack,
	control: config.control,
	vm: config.vm,
	general: config.general,
	external: config.external,
	i_am_control: function() {
		this.isControl = true;
	},
	i_am_instance: function(vmid) {
		this.isControl = false;
		this.vmid = vmid;
	}
};

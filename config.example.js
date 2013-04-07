module.exports = exports = {
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

		external_port: 8080,

		// time (milliseconds) to kill VM if VM hasn't responded for this long
		watchdog_timeout: 20000
	},

	vm: {
		firefox_port: 9091,    // port for Firefox plugin calls
		interface_port: 9092,   // port for control server calls
	},

	// configuration parameters for the external application; in our case, FlightCrew apps
	external: {
		rtsp_publish_port: 5555,
		audio_sink_name: 'vmcapture',
		firefox_profile_dir: '/home/vmuser/firefox-profiles/',  // MUST end with slash
	}
};
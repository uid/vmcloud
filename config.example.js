module.exports = exports = {
	// Open stack configurations
	openstack: {
		// credentials
		credentials: {
			passwordCredentials: {
				username: 'openstackuser',
				password: 'openstackpassword'
			},
			tenantName: "tenant"
		},

		// OR
		/*credentials: {
			apiAccessKeyCredentials: {
				accessKey: 'accesskeyhere',
				secretKey: 'secretkeyhere'
			},
			tenantId: '123123123123'
		},*/


		// OpenStack server IP
		auth_url: 'http://123.123.123.123:5000/v2.0',
		compute_url: 'http://123.123.123.123:8774/v2',

		// Boot parameters
		keypair: 'vmcloud',
		security_group: 'vmcloud',
		image_name: 'vmcloud-vm',
		flavor_name: 'medium',
		instance_name_prefix: "cloud-vm-instance",

		private_ip_index: 1
	},

	control: {
		// endpoint of the control server
		host: '127.0.0.1', // IP or host name
		port: 9090,

		external_port: 8080,

		// time (milliseconds) to kill VM if VM hasn't responded for this long
		watchdog_timeout: 20*1000,
		watchdog_bootup_timeout: 4*60*1000 // time to kill VM if it does not finish booting within this long
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
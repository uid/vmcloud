module.exports = exports = {
	// Open stack configurations
	openstack: {
		/**
		 * This is the credentials being sent to the authentication server of OpenStack. There are two ways to specify
		 * the credentials: by username/password, or by accessKey/secretKey. Refer to the manuals of your OpenStack
		 * setup and put the appropriate credentials here.
		 */
		credentials: {
			passwordCredentials: {
				username: 'openstackuser',
				password: 'openstackpassword'
			},
			tenantName: "tenant"
		},

		// OR use the following instead for access key login
		/*credentials: {
			apiAccessKeyCredentials: {
				accessKey: 'accesskeyhere',
				secretKey: 'secretkeyhere'
			},
			tenantId: '123123123123'
		},*/


		/**
		 * These are the OpenStack endpoints. Refer to your OpenStack configuration for these URLs.
		 * Do not include the tenant ID for the compute URL.
		 * Do not end with slash.
		 * For compute, both v2 and v1.1 should work.
		 */
		auth_url: 'http://123.123.123.123:5000/v2.0',
		compute_url: 'http://123.123.123.123:8774/v2',

		/**
		 * These are the boot parameters. An instance will be booted with the given keypair, security_group, from the
		 * given image name, with the given flavor, and with the given instance name prefix. For example, the VM with
		 * ID #5 will be named 'cloud-vm-instance5' in the default configuration.
		 */
		keypair: 'vmcloud',
		security_group: 'vmcloud',
		image_name: 'vmcloud-vm',
		flavor_name: 'medium',
		instance_name_prefix: "cloud-vm-instance",

		/**
		 * These are cloud-specific configuration for how to obtain the IP.
		 *   'use_floating_ip':
		 *      true if: Public IP is not assigned automatically by the cloud, so a floating IP has to be allocated by
		 *               the VMcloud when the instance is in use. Requires a floating IP pool; VM cloud does not
		 *               automatically allocate floating IPs at this time. Floating IPs may cost money.
		 *      false if: Public IP is automatically assigned by the cloud when an instance is booted.
		 *                In this case, 'private_ip_index' is the index in the private IP array in the server info JSON.
		 * There may be cases that these does not cover, in which case please modify openstack.js getIPFromServer method
		 * appropriately.
		 */
		private_ip_index: 1,
		use_floating_ip: false
	},

	control: {
		/**
		 * End point for the control server's RPC interface, to be used by VM instances only.
		 * the host name/IP, private or public, should be an address that the VM instance can reach.
		 */
		host: '127.0.0.1', // IP or host name
		port: 9090,

		/**
		 * port for the external web interface for the application server.
		 */
		external_port: 8080,

		/**
		 * Timeout parameters for VM instance management.
		 */
		timeout_openstack: 10 * 1000, // Max. time for openstack to respond
		timeout_boot: 4 * 60 * 1000, // Max. time to boot
		timeout_update: 20 * 1000, // Max. time for VM to respond to periodic ping
		timeout_operation: 30 * 1000, // Max. time for VM to complete a prepare/cleanup operation

		/**
		 * Milliseconds per ping to VM instances
		 */
		ping_interval: 5 * 1000, // Ping interval
	},

	vm: {
		firefox_port: 9091,    // port for Firefox plugin calls
		interface_port: 9092,   // RPC port for control server calls
	},

	// configuration parameters for the external application; in our case, FlightCrew apps
	external: {
		audio_sink_name: 'vmcapture',  // Pulse audio sink name. Not very important
		firefox_profile_dir: '/home/vmuser/firefox-profiles/',  // MUST end with slash. directory where profiles are stored
	}
};
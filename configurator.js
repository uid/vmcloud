module.exports = exports = {
	isTesting: false,
	isControl: null,
	vmid: null,
	rpcInterface: null,
	testing: function () {
		this.isTesting = true;
	},
	initControl: function () {
		var config = require('./config.js');
		this.openstack = config.openstack;
		this.control = config.control;
		this.vm = config.vm;
		this.external = config.external;
		this.isControl = true;
	},
	initInstance: function (vmid, rpcInterface, callback) {
		this.vmid = vmid;
		this.rpcInterface = rpcInterface;
		var _this = this;
		rpcInterface.getConfig(vmid, function (config) {
			_this.vm = config.vm;
			_this.external = config.external;
			_this.isControl = false;
			callback();
		});
	},

	// two config params that isn't changeable, and perhaps will never be
	deploy_dir: "/var/vmcloud",
	boot_json_file: "/opt/vmcloud.json"
};
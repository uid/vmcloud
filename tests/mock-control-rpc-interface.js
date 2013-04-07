module.exports = exports = {
	log: function (vmid, msg, callback) {
		console.log("Remote log (mock) [" + vmid + "]: " + msg);
		callback();
	},
	checkin: function (vmid, callback) {
		callback();
	},
	browser_event: function (vmid, data, callback) {
		callback();
	},
	getConfig: function (callback) {
		callback({
			vm: {
				firefox_port: 9091,
				interface_port: 9092
			},
			external: {
				rtsp_publish_port: 5555,
				audio_sink_name: 'vmcapture',
				firefox_profile_dir: '/tmp/ffxprofiles'
			}
		});
	}
};
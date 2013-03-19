var config = require('./config.js');
var rpc = require('./rpc.js');
var common = require('./common.js');
var error = common.error;
var log = common.log;
var vlog = common.vlog;
var dlog = common.dlog;

function runControlServer() {
	var rpc_server = new rpc({
		checkin: function (vmid, callback) {
			// TODO: do stuff
			vlog("Checkin received from: " + vmid);
			callback();
		},
		browser_event: function (vmid, data, callback) {
			vlog("Browser event received: " + JSON.stringify(data));
			callback();
		},
		log: function(vmid, msg, callback) {
			dlog("Remote log ["+vmid+"]: "+msg);
			callback();
		}
	});


	rpc_server.listen(config.control.port);
	log("Server running on port "+config.control.port);

}

exports = module.exports = runControlServer;
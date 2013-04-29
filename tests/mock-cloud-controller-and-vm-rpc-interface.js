var vms = {};
var nextId = 1;
var VMStates = require('../common.js').VMStates;
var rpc = require('../rpc.js');

module.exports = exports = {
	cloudController: {
		boot: function (vmid, callback) {
			var id = nextId;
			nextId++;
			vms[id] = {
				id: '' + id
			};
			setTimeout(function() {
				callback(vms[id]);
			}, 2000);
			setTimeout(function() {
				rpc.connect(9090, 'localhost', function(remote, conn) {
					remote.checkin(vmid, function() {
						conn.end();
						conn.destroy();
					});
				});
			}, 15000);
		},
		kill: function (id, callback) {
			setTimeout(callback, 1000);
		},
		getServer: function (id, callback) {
			setTimeout(function() {
				callback(vms[id]);
			}, 1000);
		},
		assignIP: function (id, callback) {
			setTimeout(function() {
				callback(null, id);
			}, 2000);
		},
		removeIP: function (id, ip, callback) {
			setTimeout(callback, 1000);
		},
		getIPFromServer: function (server) {
			return server.id;
		}
	},
	vmRpcInterface: {
		ping: function(callback) {
			setTimeout(function() {
				callback(true);
			}, 400);
		},
		prepare: function(data, callback) {
			setTimeout(function() {
				callback({vncpasswd: 'mockpasswd', state: VMStates.READY});
			}, 6000);
		},
		cleanup: function(data, callback) {
			setTimeout(function() {
				callback({state: VMStates.FREE});
			}, 3000);
		}
	}
};
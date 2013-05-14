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
			setTimeout(function () {
				callback(null, vms[id]);
			}, 2000);
			setTimeout(function () {
				rpc.connect(9090, 'localhost', function (remote, conn) {
					remote.checkin(vmid, function () {
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
			setTimeout(function () {
				callback(vms[id]);
			}, 1000);
		},
		assignIP: function (id, callback) {
			setTimeout(function () {
				callback(null, id);
			}, 2000);
		},
		removeIP: function (id, ip, callback) {
			setTimeout(callback, 1000);
		},
		getIPFromServer: function (server) {
			return server == null ? null : server.id;
		},
		getNameFromServer: function (server) {
			return server == null ? null : server.name;
		},
		getIDFromServer: function (server) {
			return server == null ? null : server.id;
		},
		getAllServers: function (id, callback) {
			return [];
		}
	},
	vmRpcInterface: function () {
		var state = VMStates.FREE;
		return {
			ping: function (callback) {
				setTimeout(function () {
					callback(state);
				}, 400);
			},
			prepare: function (data, callback) {
				state = VMStates.WAIT;
				setTimeout(function () {
					callback({vnc_passwd: 'mockpasswd', state: VMStates.READY});
					state = VMStates.READY;
				}, 6000);
			},
			cleanup: function (data, callback) {
				state = VMStates.WAIT;
				setTimeout(function () {
					callback({state: VMStates.FREE});
					state = VMStates.FREE;
				}, 3000);
			}
		};
	}
};
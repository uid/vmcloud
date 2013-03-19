var request = require('request');
var config = require('./config.js');

var v20url = "http://" + config.openstack.server + ":5000/v2.0";
var v2url = "http://" + config.openstack.server + ":8774/v2";

function getAuthToken(user, pass, callback) {
	request({
			url: v20url + "/tokens",
			method: 'POST',
			headers: {
				'Content-type': 'application/json'
			},
			body: JSON.stringify({
				auth: {
					passwordCredentials: {
						username: user,
						password: pass
					},
					tenantName: "mario"
				}
			})
		}, function (e, r, body) {
			//console.log(body);
			var result = JSON.parse(body);
			callback(result.access.token.id);
		}
	);
}

function getTenants(authToken, callback) {
	request({
		url: v20url + "/tenants",
		headers: {
			'X-Auth-Token': authToken
		},
		method: 'GET'
	}, function (e, r, body) {
		//console.log(body);
		var result = JSON.parse(body);
		callback(result.tenants);
	});
}


function V2Client(arg_tenant_id, arg_authToken) {
	if (!(this instanceof V2Client)) return new V2Client(tenant_id, authToken);

	this.tenant_id = arg_tenant_id;
	this.authToken = arg_authToken;

	this.getV2JSON = function (where, callback) {
		request({
			url: v2url + "/" + this.tenant_id + "/" + where,
			headers: {
				'X-Auth-Token': this.authToken
			},
			method: 'GET'
		}, function (e, r, body) {
			callback(JSON.parse(body));
		});
	};

	this.getInfo = function (callback) {
		request({
			url: v2url,
			headers: {
				'X-Auth-Token': this.authToken
			},
			method: 'GET'
		}, function (e, r, body) {
			callback(JSON.parse(body));
		});
	};

	this.getImages = function (callback) {
		this.getV2JSON("images", function (json) {
			callback(json.images);
		});
	};

	this.getFlavors = function (callback) {
		this.getV2JSON("flavors", function (json) {
			callback(json.flavors);
		});
	};

	this.getKeyPairs = function (callback) {
		this.getV2JSON("os-keypairs", function (json) {
			callback(json.keypairs);
		});
	};
	this.getSecurityGroups = function (callback) {
		this.getV2JSON("os-security-groups", function (json) {
			callback(json.security_groups);
		})
	};

	this.getServers = function (callback) {
		this.getV2JSON("servers", function (json) {
			callback(json.servers);
		});
	};

	this.getServer = function (server_id, callback) {
		this.getV2JSON("servers/" + server_id, function (json) {
			callback(json.server);
		});
	};

	this.getFloatingIPs = function (callback) {
		this.getV2JSON("os-floating-ips", function (json) {
			callback(json.floating_ips);
		});
	};

	this.addFloatingIP = function (server_id, ip, callback) {
		request({
			url: v2url + "/" + this.tenant_id + "/servers/" + server_id + "/action",
			method: "POST",
			headers: {
				'X-Auth-Token': this.authToken,
				'Content-type': 'application/json'
			},
			body: JSON.stringify({
				addFloatingIp: {
					address: ip
				}
			})
		}, function (e, r, body) {
			console.log(body);
			callback();
		});
	};

	this.boot = function (params, callback) {
		request({
			url: v2url + "/" + this.tenant_id + "/servers",
			method: "POST",
			headers: {
				'X-Auth-Token': this.authToken,
				'Content-type': 'application/json'
			},
			body: JSON.stringify({
				server: params
			})
		}, function (e, r, body) {
			callback(JSON.parse(body).server);
		});
	}
}

function idOf(array, key, criteria) {
	for (var i = 0; i < array.length; i++) {
		if (key in array[i] && criteria(array[i][key])) {
			return array[i].id;
		}
	}
}

function EQ(val) {
	return function (a) {
		return a == val;
	}
}

function sync(num, func, after) {
	var remain = num;
	var done = function () {
		remain--;
		if (remain == 0) {
			after();
		}
	};
	func(done);
}

//test
getAuthToken(config.openstack.user, config.openstack.pass, function (authToken) {
	//console.log(id);
	getTenants(authToken, function (tenants) {
		var tenant_id = tenants[0].id;
		var client = new V2Client(tenant_id, authToken);

		var images, flavors, keypairs, sgroups, servers, ips;
		sync(6, function (done) {
			client.getImages(function (r) {
				images = r;
				done();
			});
			client.getFlavors(function (r) {
				flavors = r;
				done();
			});
			client.getKeyPairs(function (r) {
				keypairs = r;
				done();
			});
			client.getSecurityGroups(function (r) {
				sgroups = r;
				done();
			});
			client.getServers(function (r) {
				servers = r;
				done();
			});
			client.getFloatingIPs(function (r) {
				ips = r;
				done();
			})
		}, function () {
			var imageId = idOf(images, "name", EQ("Ubuntu 12.04LTS cloudimg amd64"));
			var flavorId = idOf(flavors, "name", EQ("m1.tiny"));
			var keypairId = "robin";
			var sgroupId = idOf(sgroups, "name", EQ("robin"));
			var ip = ips[0].ip;
			console.log({
				image: imageId, flavor: flavorId, key: keypairId, sgroup: sgroupId
			});
			/*client.getServer('3e3e6ab2-612a-4f9f-b71b-e80227dda653', function(json) {
			 console.log(json);
			 });*/

			client.boot({
				security_group: "robin",
				imageRef: imageId,
				flavorRef: flavorId,
				name: "robin-test-server-created-with-api",
				key_name: keypairId
			}, function (json) {
				console.log(json);
				// Find some way to get around this!
				setTimeout(function () {
					client.addFloatingIP(json.id, ip, function () {
						console.log("floating IP added");
					});
				}, 5000);
			});
		});
	});
});


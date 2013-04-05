var request = require('request');
var config = require('./config.js');
var _ = require('underscore');
var async = require('async');

var auth_url = "http://" + config.openstack.server + ":5000/v2.0";
var nova_url = "http://" + config.openstack.server + ":8774/v2";

exports = module.exports = {
	getOpenStackController : getOpenStackController
};

function getAuthToken(user, pass, callback) {
	request({
			url: auth_url + "/tokens",
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
					tenantName: config.openstack.tenant
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
		url: auth_url + "/tenants",
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
	this.authToken = arg_authToken; // TODO: need to renew token periodically; resets a certain time of day

	this.getV2JSON = function (where, callback) {
		request({
			url: nova_url + "/" + this.tenant_id + "/" + where,
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
			url: nova_url,
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
			url: nova_url + "/" + this.tenant_id + "/servers/" + server_id + "/action",
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
			callback();
		});
	};

	this.boot = function (params, callback) {
		request({
			url: nova_url + "/" + this.tenant_id + "/servers",
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
	};

	this.shutdown = function(id, callback) {
		request({
			url: nova_url + "/" + this.tenant_id + "/servers/" + id,
			method: "DELETE",
			headers: {
				'X-Auth-Token': this.authToken,
				'Content-type' : 'application/json'
			}
		}, function(e, r, body) {
			callback();
		});
	};
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


function getOpenStackController(bigCallback) {
	async.waterfall([
		// get auth token
		function (callback) {
			getAuthToken(config.openstack.user, config.openstack.pass, function (authToken) {
				callback(null, authToken);
			});
		},

		// get tenant ID
		function (authToken, callback) {
			getTenants(authToken, function (tenants) {
				callback(null, authToken, tenants[0].id);
			});
		},

		// get launch params
		function (authToken, tenantId, callback) {
			var client = new V2Client(tenantId, authToken);
			var images, flavors, keypairs, sgroups, servers, ips;
			async.parallel([function (done) {
				client.getImages(function (r) {
					images = r;
					done();
				});
			}, function (done) {
				client.getFlavors(function (r) {
					flavors = r;
					done();
				});
			}, function (done) {
				client.getKeyPairs(function (r) {
					keypairs = r;
					done();
				});
			}, function (done) {
				client.getSecurityGroups(function (r) {
					sgroups = r;
					done();
				});
			}, function (done) {
				client.getServers(function (r) {
					servers = r;
					done();
				});
			}], function () {
				var imageId = _.findWhere(images, {name: config.openstack.image_name}).id;
				var flavorId = _.findWhere(flavors, {name: config.openstack.flavor_name}).id;
				var keypairId = config.openstack.keypair;
				var sgroupId = config.openstack.security_group;
				var prefix = config.openstack.instance_name_prefix;

				console.log("Launching parameters:");
				console.log({
					image: imageId, flavor: flavorId, key: keypairId, sgroup: sgroupId
				});

				function getStartupScript(vmid) {
					var startupJSON = JSON.stringify({
						vmid: vmid,
						control_server: config.control.host,
						control_port: config.control.port
					});

					var escapedJSON = JSON.stringify(startupJSON); // TODO: fishy way to escape things..

					var lines = [
						'#!/bin/sh',
						'echo ' + escapedJSON + ' > ' + config.general.boot_json_file,
						'chmod 777 ' + config.general.boot_json_file
					];
					return lines.join('\n');
				}

				bigCallback({
					client: client, // for debugging purposes
					boot: function (vmid, callback) {
						client.boot({
							name: prefix + vmid,
							imageRef: imageId,
							flavorRef: flavorId,
							key_name: keypairId,
							security_groups: [{name: sgroupId}],
							user_data: new Buffer(getStartupScript(vmid)).toString('base64')
						}, function (json) {
							callback(json); // TODO: what if booting fails?
						});
					},
					kill: function (id, callback) {
						client.shutdown(id, function (json) {
							callback(); // TODO: what if shutdown fails?
						});
					},
                    getServer: function(id, callback) {
                        client.getServer(id, function(json) {
                            callback(json);
                        });
                    }
				});

			});
			callback(null);
		}

	]);

}
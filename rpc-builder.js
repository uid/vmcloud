var rpc = require('./rpc.js');
var EventEmitter = require('events').EventEmitter;
function doRPC(host, port, action, callback) {
	rpc.connect(port, host, function (remote, conn) {
		action(remote, function (result) {
			conn.destroy();
			conn.end();
			callback(result);
		});
	});
}

function rpcInterface(host, port, funcNames) {
	var rpcObject = {};
	funcNames.forEach(function (name) {
		rpcObject[name] = function () {
			var argArray = Array.prototype.slice.call(arguments);
			var args = argArray.slice(0, argArray.length - 1);
			var callback = argArray[argArray.length - 1];
			doRPC(host, port, function (remote, cb) {
				remote[name].apply(remote, args);
			}, function (result) {
				callback(result);
			});
		};
	});
	return rpcObject;
}

function mockRPCInterface(mockImpl) {
	var mock = new EventEmitter();
	for (var action in mockImpl) {
		(function (action) {
			mock[action] = function () {
				var argArray = Array.prototype.slice.call(arguments);
				var args = argArray.slice(0, argArray.length - 1);
				mock.emit.apply(mock, [action].concat(args));
				mockImpl[action].apply(mockImpl, argArray);
			};
		})(action);
	}
	return mock;
}

exports = module.exports = {
	rpcInterface: rpcInterface,
	mockRPCInterface: mockRPCInterface
};
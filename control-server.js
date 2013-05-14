require('setimmediate');
var util = require('util');
var _ = require('underscore');
var config = require('./configurator.js');
var rpcEngine = require('./rpc.js');
var common = require('./common.js');
var error = common.error;
var log = common.log;
var vlog = common.vlog;
var dlog = common.dlog;
var assert = common.assert;
var express = require('express');
var fs = require('fs');
var path = require('path');
var async = require('async');

var BeliefState = common.BeliefState;
var VMStates = common.VMStates;


Array.prototype.remove = function () {
	var what, a = arguments, L = a.length, ax;
	while (L && this.length) {
		what = a[--L];
		while ((ax = this.indexOf(what)) !== -1) {
			this.splice(ax, 1);
		}
	}
	return this;
};

Array.prototype.removeAt = function (index) {
	var removed = this[index];
	this.splice(index, 1);
	return removed;
};

function verState(vmid, state) {
	return {
		state: state,
		version: 0,
		refreshTime: Date.now(),
		changeTime: Date.now(),
		get: function () {
			return this.state
		},
		getVer: function () {
			return this.version;
		},
		set: function (newState) {
			var oldState = this.state;
			this.state = newState;
			this.refresh();
			if (oldState != newState) {
				vlog("VM #" + vmid + " belief state transition: " + BeliefState.name(oldState) + " -> " + BeliefState.name(newState));
				this.changeTime = Date.now()
			}
			return this.version;
		},
		refresh: function () {
			this.version++;
			this.refreshTime = Date.now()
		},
		verSet: function (ver, newState) {
			if (this.version == ver) {
				this.set(newState);
			}
		},
		verRefresh: function (ver) {
			if (this.version == ver) {
				this.refresh();
			}
		},
		isRefreshTimeout: function () {
			var timeout = {};
			timeout[BeliefState.CREATING] = config.control.timeout_openstack;
			timeout[BeliefState.BOOTING] = config.control.timeout_boot;
			timeout[BeliefState.FREE] = config.control.timeout_update;
			timeout[BeliefState.READY] = config.control.timeout_update;
			timeout[BeliefState.OCCUPIED] = config.control.timeout_update;
			timeout[BeliefState.WAIT] = config.control.timeout_operation;
			timeout[BeliefState.ERROR] = 0;
			return timeout[this.state] < Date.now() - this.refreshTime;
		}
	};
}

var pool = [];
var vmData = {}; // TODO: put in database
var rpc = {};
var nextVMID = 1;
var batches = [];
var batchData = {};
var nextBatchID = 1;
var prepQueue = [];
var handles = [];
var handleData = {};
var nextHandle = 1;
var pendingLocks = [];
var poolSize = {
	min: 0, max: 0, linger: 0
};
var cloudController = null;
var eventsWindow = {};

/**
 * Return a JSON containing ALL the states
 */
function saveAllStates() {
	return JSON.stringify({
		pool: pool,
		vmData: vmData,
		nextVMID: nextVMID,
		batches: batches,
		batchData: batchData,
		nextBatchID: nextBatchID,
		prepQueue: prepQueue,
		handles: handles,
		handleData: handleData,
		nextHandle: nextHandle,
		pendingLocks: pendingLocks,
		poolSize: poolSize
	});
}

/**
 * Load all states from a JSON
 * @param json
 */
function loadAllStates(json) {
	var obj = JSON.parse(json);
	rpc = {};
	pool = obj.pool;
	vmData = obj.vmData;
	nextVMID = obj.nextVMID;
	batches = obj.batches;
	batchData = obj.batchData;
	nextBatchID = obj.nextBatchID;
	prepQueue = obj.prepQueue;
	handles = obj.handles;
	handleData = obj.handleData;
	nextHandle = obj.nextHandle;
	pendingLocks = obj.pendingLocks;
	poolSize = obj.poolSize;
	for (var i = 0; i < pool.length; i++) {
		var vmid = pool[i];
		var vm = vmData[vmid];
		vm.state = verState(vmid, vm.state.state);
		var state = vm.state.get();
		// If not a stable state, then let's not try to recover it.
		if (!_.contains([BeliefState.FREE, BeliefState.READY, BeliefState.OCCUPIED], state)) {
			vm.state.set(BeliefState.ERROR);
		} else {
			rpc[vmid] = config.rpcFactory(vm.ip);
		}
	}
}


function VMInfo(vmid) {
	return {
		id: vmid,
		state: verState(vmid, BeliefState.CREATING),
		server: null,
		ip: null,
		public_ip: null,
		vnc_passwd: null
	};
}

function bootNewVM() {
	var vmid = nextVMID;
	nextVMID++;
	pool.push(vmid);
	vmData[vmid] = VMInfo(vmid);
	cloudController.boot(vmid, function (server) {
		vmData[vmid].server = server;
		vmData[vmid].state.verSet(0, BeliefState.BOOTING);
		log("Successfully booted: " + vmid + ", Cloud instance id = " + cloudController.getIDFromServer(server)
			/*+ ", server info: " + JSON.stringify(server)*/
		);
		checkRules();
	});
	checkRules();
}

function killVM(vmid) {
	var vm = vmData[vmid];
	var id = cloudController.getIDFromServer(vm.server);
	if (!id) {
		log("Error when killing VM: VM " + vmid + " not ready!");
		return;
	}
	vm.state.set(BeliefState.KILLING);
	pool.remove(vmid); // Remove from pool because it's no longer considered part of the pool
	cloudController.kill(id, function () {
		log("Successfully terminated: " + vmid + ": " + id);
		delete vmData[vmid];
		checkRules();
	});
	checkRules();
}


// Refresh the server info from the cloud, and then transition into the given state
function updateInstanceInfoFromCloud(vmid, callback) {
	var vm = vmData[vmid];
	cloudController.getServer(cloudController.getIDFromServer(vm.server), function (server) {
		//vlog("VM #" + vmid + " info updated: " + JSON.stringify(server));
		vm.server = server;
		callback();
	});
}


function checkinReceived(vmid, callback) {
	if (!_.contains(pool, vmid)) return;
	var vm = vmData[vmid];
	var ver = vm.state.getVer();
	updateInstanceInfoFromCloud(vmid, function () {
		vm.state.verSet(ver, BeliefState.FREE);
		vm.ip = cloudController.getIPFromServer(vm.server);
		rpc[vmid] = config.rpcFactory(vm.ip);
		callback();
		checkRules();
	});
	checkRules();
}

function prepareVM(vmid, data, callback) {
	assert(_.contains(pool, vmid));
	var vm = vmData[vmid];
	assert(vm.state.get() == BeliefState.FREE);
	var ver = vm.state.set(BeliefState.WAIT);
	async.parallel([function (cb) {
		rpc[vmid].prepare(data, function (result) {
			vm.vnc_passwd = result.vnc_passwd;
			cb(null, result);
		});
	}, function (cb) {
		cloudController.assignIP(cloudController.getIDFromServer(vm.server), function (err, ip) {
			if (err) {
				cb(err);
			} else {
				vm.public_ip = ip;
				cb(null);
			}
		});
	}], function (err, result) {
		if (err) {
			vm.state.verSet(ver, BeliefState.ERROR);
			log(err);
			callback(false);
			checkRules();
		} else {
			vm.state.verSet(ver, result[0].state == VMStates.READY ? BeliefState.READY : BeliefState.ERROR);
			callback(true);
			checkRules();
		}
	});
	checkRules();
}

function cleanupVM(vmid, data, callback) {
	if (!data) data = {};
	if (!callback) callback = function () {
	};
	assert(_.contains(pool, vmid));
	var vm = vmData[vmid];
	assert(vm.state.get() == BeliefState.READY || vm.state.get() == BeliefState.OCCUPIED);
	var ver = vm.state.set(BeliefState.WAIT);
	async.parallel([function (cb) {
		rpc[vmid].cleanup(data, function (result) {
			delete vm.vnc_passwd;
			cb(null, result);
		});
	}, function (cb) {
		cloudController.removeIP(cloudController.getIDFromServer(vm.server), vm.public_ip, function (err) {
			if (err) {
				cb(err);
			} else {
				delete vm.public_ip;
				cb(null);
			}
		});
	}], function (err, result) {
		if (err) {
			vm.state.verSet(ver, BeliefState.ERROR);
			log(err);
			callback(false);
			checkRules();
		} else {
			vm.state.verSet(ver, result[0].state == VMStates.FREE ? BeliefState.FREE : BeliefState.ERROR);
			callback(true);
			checkRules();
		}
	});
	checkRules();
}

function occupyVM(vmid) {
	assert(_.contains(pool, vmid));
	var vm = vmData[vmid];
	assert(vm.state.get() == BeliefState.READY);
	vm.state.set(BeliefState.OCCUPIED);
	checkRules();
}

function pingVMs() {
	for (var i = 0; i < pool.length; i++) {
		var vmid = pool[i];
		var vm = vmData[vmid];
		var state = vm.state.get();
		if (_.contains([BeliefState.FREE, BeliefState.READY, BeliefState.OCCUPIED], state)) {
			(function (vmid, vm) {
				var ver = vm.state.getVer();
				var state = vm.state.get();
				rpc[vmid].ping(function (result) {
					if (result == VMStates.FREE && state == BeliefState.FREE
						|| result == VMStates.READY && (state == BeliefState.READY || state == BeliefState.OCCUPIED)) {
						vm.state.verRefresh(ver);
					} else {
						vm.state.set(BeliefState.ERROR);
						checkRules();
					}
				});
			})(vmid, vm);
		}
		if (state == BeliefState.BOOTING) {
			(function (vmid, vm) {
				cloudController.getServer(cloudController.getIDFromServer(vm.server), function (server) {
					if (server && server.status == 'ERROR') {
						log("VM #" + vmid + " launching error. Killing VM.");
						killVM(vmid);
						checkRules();
					}
				});
			})(vmid, vm);
		}
	}
}

function setPoolSize(minSize, maxSize, lingerTime) {
	poolSize = {min: minSize, max: maxSize, linger: lingerTime};
	checkRules();
}

function prepareBatch(batchSize, data) {
	// Generate new batch ID
	var batchId = nextBatchID;
	nextBatchID++;

	// Add batch to batch list
	batches.push(batchId);
	batchData[batchId] = {
		id: batchId,
		size: batchSize,
		data: data,
		vms: [],
		markDelete: false
	};

	// Add batchSize copies of batchId into preparation queue
	for (var i = 0; i < batchSize; i++)
		prepQueue.push(batchId);
	checkRules();
	return batchId;
}

function lockVM(batchId) {
	var handle = nextHandle;
	nextHandle++;

	if (batchData[batchId].size > 0) {
		batchData[batchId].size--;
	}

	handles.push(handle);
	handleData[handle] = {
		handle: handle,
		assigned: false,
		vmid: null
	};
	pendingLocks.push({
		batchId: batchId,
		handle: handle
	});
	checkRules();
	return handle;
}

function releaseVM(handle) {
	if (handleData[handle].assigned) {
		// If #H is assigned, clean up VM and remove from handle list
		var vmid = handleData[handle].vmid;
		cleanupVM(vmid);
		handles.remove(handle);
		delete handleData[handle];
	} else {
		// If #H is in the pending locks list with batch id #B
		// Remove #H from handle list and pending locks list
		for (var i = 0; i < pendingLocks.length; i++) {
			var item = pendingLocks[i];
			if (item.handle == handle) {
				var batchId = item.batchId;
				pendingLocks.removeAt(i);
				handles.remove(handle);
				delete handleData[handle];
				break;
			}
		}
	}
	checkRules();
}

function cancelBatch(batchId) {
	batchData[batchId].size = 0;
	batchData[batchId].markDelete = true;
	checkRules();
}

function getVMInfo(vmid) {
	var vm = vmData[vmid];
	return {
		vmid: vmid,
		state: vm.state.get(),
		ip: vm.ip,
		public_ip: vm.public_ip,
		//server: vm.server,
		vnc_passwd: vm.vnc_passwd
	};
}

function getHandleInfo(handle) {
	if (!handleData[handle].assigned) {
		return {
			assigned: false
		};
	} else {
		var vmid = handleData[handle].vmid;
		return {
			assigned: true,
			vmid: vmid,
			vm: getVMInfo(vmid),
			expires: false,
			expireTime: null
		};
	}
}

var checkRulesScheduled = false;
function checkRules() {
	if (checkRulesScheduled) return;
	checkRulesScheduled = true;
	setImmediate(executeRules);
}

var isWritingToDisk = false;
var isCheckpointPending = false;

function checkPointToDisk() {
	if (!isWritingToDisk) {
		var checkpointfile = config.control.checkpoint_file;
		fs.writeFile(checkpointfile + ".temp", saveAllStates(), 'utf8', function () {
			fs.rename(checkpointfile + ".temp", checkpointfile, function () {
				isWritingToDisk = false;
				if (isCheckpointPending) {
					isCheckpointPending = false;
					checkPointToDisk();
				}
			});
		});
	} else {
		isCheckpointPending = true;
	}
}

function loadCheckpointFromDisk() {
	var checkpointfile = config.control.checkpoint_file;
	if (path.existsSync(checkpointfile)) {
		var data = fs.readFileSync(checkpointfile, 'utf8');
		loadAllStates(data);
	}
}

function executeRules() {
	checkRulesScheduled = false;
	var ruleTriggered = runRule_pool()
		|| runRule_preparation()
		|| runRule_lock()
		|| runRule_release()
		|| runRule_timeout()
		|| runRule_batchCleanup()
		|| runRule_handleExpire();

	if (ruleTriggered) {
		//log("VM list: " + JSON.stringify(vmData));
		//log("Prep queue: " + JSON.stringify(prepQueue));
		//log("Batch list: " + JSON.stringify(batchData));
		checkRules();
	} else {
		checkPointToDisk();
	}
}

function runRule_pool() {
	var i, vmid, state;
	// Whenever # VMs < min pool size, boot a VM
	if (pool.length < poolSize.min) {
		bootNewVM();
		return true;
	}

	// Whenever #VMs > min pool size and there is a VM #X that is free and has been free for [linger time],
	// shut down the VM
	if (pool.length > poolSize.min) {
		for (i = 0; i < pool.length; i++) {
			vmid = pool[i];
			state = vmData[vmid].state;
			if (state.get() == BeliefState.FREE
				&& Date.now() - state.changeTime > poolSize.linger) {
				killVM(vmid);
				return true;
			}
		}
	}

	// Whenever #VMs > max pool size and there is a VM #X that is either FREE or BOOTING (BOOTING takes priority)
	// Shutdown VM #X
	if (pool.length > poolSize.max) {
		for (i = 0; i < pool.length; i++) {
			vmid = pool[i];
			state = vmData[vmid].state;
			if (state.get() == BeliefState.BOOTING) {
				killVM(vmid);
				return true;
			}
		}
		for (i = 0; i < pool.length; i++) {
			vmid = pool[i];
			state = vmData[vmid].state;
			if (state.get() == BeliefState.FREE) {
				killVM(vmid);
				return true;
			}
		}
	}

	return false;
}

function runRule_preparation() {
	return (function () {
		// Whenever the preparation queue is non-empty and there is a free VM #X,
		// Pop batch id #Y from the preparation queue; prepare VM #X with batch data of #Y; append #X to VMs of batch #Y
		if (prepQueue.length != 0) {
			for (var i = 0; i < pool.length; i++) {
				var vmid = pool[i];
				var vm = vmData[vmid];
				if (vm.state.get() == BeliefState.FREE) {
					var batchId = prepQueue.removeAt(0);
					batchData[batchId].vms.push(vmid);
					(function (vmid, batchId) {
						prepareVM(vmid, batchData[batchId].data, function (success) {
							if (success) {
								if (!_.contains(batches, batchId) || !_.contains(batchData[batchId].vms, vmid)) {
									cleanupVM(vmid);
								}
							}
						});
					})(vmid, batchId);
					return true;
				}
			}
		}
		return false;
	})() || (function () {
		// Whenever there is a VM #Y in batch #X that no longer exists or is in the ERROR state
		// Remove #Y from batch #X and add #X to the preparation queue
		for (var i = 0; i < batches.length; i++) {
			var batchId = batches[i];
			var vms = batchData[batchId].vms;
			for (var j = 0; j < vms.length; j++) {
				var vmid = vms[j];
				if (!_.contains(pool, vmid) || vmData[vmid].state.get() == BeliefState.ERROR) {
					vms.removeAt(j);
					prepQueue.splice(0, 0, batchId);
					return true;
				}
			}
		}
		return false;
	})() || (function () {
		// Whenever the preparation queue is non-empty, there is no free VM, the #VMs < max pool size, and
		// # preparation queue items > # VMs in CREATING/BOOTING state, boot new VM.
		if (prepQueue.length != 0 && pool.length < poolSize.max) {
			var numBooting = 0;
			for (var i = 0; i < pool.length; i++) {
				var vmid = pool[i];
				var vm = vmData[vmid];
				if (vm.state.get() == BeliefState.FREE) {
					return false;
				}
				if (vm.state.get() == BeliefState.CREATING || vm.state.get() == BeliefState.BOOTING) {
					numBooting++;
				}
			}
			if (prepQueue.length > numBooting) {
				bootNewVM();
				return true;
			}
		}
		return false;
	})();
}

function runRule_lock() {
	return function () {
		// Whenever an item (#B, #H) is in the pending locks list for which there is a VM #X for batch #B in the READY state
		// Remove VM #X from the batch; decrement batch size; occupy VM #X, set vmid of #H (in the handle list) to #X
		// and set it to ASSIGNED.
		for (var i = 0; i < pendingLocks.length; i++) {
			var item = pendingLocks[i];
			var batchId = item.batchId;
			var handle = item.handle;
			var vms = batchData[batchId].vms;
			for (var j = 0; j < vms.length; j++) {
				var vmid = vms[j];
				if (_.contains(pool, vmid) && vmData[vmid].state.get() == BeliefState.READY) {
					pendingLocks.removeAt(i);
					batchData[batchId].vms.removeAt(j);
					occupyVM(vmid);
					handleData[handle].assigned = true;
					handleData[handle].vmid = vmid;
					return true;
				}
			}
		}
		return false;
	}() || function () {

		// Whenever a handle that is assigned has its VM no longer existing, remove the handle.
		for (var i = 0; i < handles.length; i++) {
			var handle = handles[i];
			if (handleData[handle].assigned) {
				var vmid = handleData[handle].vmid;
				if (!_.contains(pool, vmid)) {
					handles.removeAt(i);
					delete handleData[handle];
					return true;
				}
			}
		}
		return false;
	}();
}

function runRule_release() {
	// Whenever there is a batch #B for which (size of batch #B + #pending locks for #B) is smaller than (#VMs in that batch + #occurances of #B in the preparation queue)
	//   If the preparation queue contains an item of #B
	//     Remove the item
	//   Otherwise if there is a VM #X in the batch with state WAIT
	//     Remove #X from the batch
	//   Otherwise
	//     Remove VM #X from the batch; clean up #X
	// Whenever there is a batch #B for which (size of batch #B + #pending locks for #B) is larger than (#VMs in that batch + #occurances of #B in the preparation queue)
	//   Push #B to the preparation queue
	for (var i = 0; i < batches.length; i++) {
		var batchId = batches[i];
		var batch = batchData[batchId];
		var pendingLocksCount = 0;
		for (var k = 0; k < pendingLocks.length; k++) {
			if (pendingLocks[k].batchId == batchId) pendingLocksCount++;
		}
		var occurancesInPrepQueue = 0;
		var anOccurance = -1;
		for (k = 0; k < prepQueue.length; k++) {
			if (prepQueue[k] == batchId) {
				occurancesInPrepQueue++;
				anOccurance = k;
			}
		}

		if (batch.size + pendingLocksCount < batch.vms.length + occurancesInPrepQueue) {
			if (occurancesInPrepQueue > 0) {
				prepQueue.removeAt(anOccurance);
				return true;
			}
			for (var j = 0; j < batch.vms.length; j++) {
				var vmid = batch.vms[j];
				if (vmData[vmid].state.get() == BeliefState.WAIT) {
					batch.vms.removeAt(j);
					return true;
				}
			}
			vmid = batch.vms.removeAt(0);
			cleanupVM(vmid);
			return true;
		} else if (batch.size + pendingLocksCount > batch.vms.length + occurancesInPrepQueue) {
			prepQueue.push(batchId);
			return true;
		}
	}
	return false;
}


function runRule_timeout() {
	for (var i = 0; i < pool.length; i++) {
		var vmid = pool[i];
		var vm = vmData[vmid];
		if (vm.state.isRefreshTimeout()) {
			killVM(vmid);
			return true;
		}
	}
	return false;
}

function runRule_batchCleanup() {
	for (var i = 0; i < batches.length; i++) {
		var batchId = batches[i];
		var batch = batchData[batchId];
		if (batch.markDelete && batch.size == 0 && batch.vms.length == 0) {
			// extra check: make sure the pending locks list does not contain an item for this batch.
			// This is because it's possible that the batch is being needed but one of the VMs is still being prepared
			var lockPending = false;
			for (var j = 0; j < pendingLocks.length; j++) {
				var item = pendingLocks[j];
				if (item.batchId == batchId) {
					lockPending = true;
					break;
				}
			}
			if (!lockPending) {
				batches.remove(batchId);
				delete batchData[batchId];
				return true;
			}
		}
	}
	return false;
}

function runRule_handleExpire() {
	var time = Date.now();
	for (var i = 0; i < handles.length; i++) {
		var handleId = handles[i];
		var handle = handleData[handleId];
		if (handle.expires) {
			if (time > handle.expireTime) {
				releaseVM(handleId);
				return true;
			}
		}
	}
	return false;
}

function removeStrayVMs() {
	cloudController.getAllServers(function (data) {
		_.each(data, function (server) {
			var name = cloudController.getNameFromServer(server);
			if (name.indexOf(config.openstack.instance_name_prefix) == 0) {
				var trail = name.substring(config.openstack.instance_name_prefix.length);
				var vmid = parseInt(trail);
				var cloudId = cloudController.getIDFromServer(server);
				if (!_.contains(pool, vmid)) {
					log("Removing stray VM " + name + " with ID " + cloudId);
					cloudController.kill(cloudId, function () {
					});
				} else {
					if (cloudController.getIDFromServer(vmData[vmid].server) != cloudId) {
						log("Removing stray VM " + name + " with ID " + cloudId);
						cloudController.kill(cloudId, function () {
						});
					}
				}
			}
		});
	});
}

function runRuleMaintainer() {
	setInterval(checkRules, 1000);
}

function runPinger() {
	setInterval(pingVMs, config.control.ping_interval);
}

function runStrayVMRemover() {
	setInterval(removeStrayVMs, 60000);
	removeStrayVMs();
}


function EventWindow() {
	this.offset = 0;
	this.window = [];
	this.pendingWaits = [];
	this.addEvent = function (event) {
		var curTime = Date.now();
		this.window.push({
			time: curTime,
			data: event
		});

		for (var i = 0; i < this.pendingWaits.length; i++) {
			this.pendingWaits[i]();
		}
		this.pendingWaits.length = 0;

		// Keep events around for 1 minute, but only cleaning them if 2 miunutes pass so we don't have to clean them
		// so frequently.
		if (curTime - this.window[0].time > 2 * 60 * 1000) {
			var lastUnexpiredIndex = 0;
			while (lastUnexpiredIndex < this.window.length && curTime - this.window[lastUnexpiredIndex].time > 60 * 1000) {
				lastUnexpiredIndex++;
			}
			this.offset += lastUnexpiredIndex;
			this.window.splice(0, lastUnexpiredIndex);
		}
	};

	this.getEvents = function (lastKnownId) {
		var lastId = this.getLastId();
		if (lastId <= lastKnownId) {
			return {
				lastId: lastId,
				newEvents: []
			};
		} else {
			return {
				lastId: lastId,
				newEvents: this.window.slice(lastKnownId - this.offset + 1)
			};
		}
	};

	this.getLastId = function () {
		return this.window.length - 1 + this.offset;
	};

	this.waitForEvents = function (lastKnownId, maxWait, callback) {
		var _this = this;
		var events = this.getEvents(lastKnownId);
		if (events.newEvents.length > 0) {
			callback(events);
		} else {
			var alreadyReplied = false;
			var reply = function () {
				if (alreadyReplied) return;
				alreadyReplied = true;
				callback(_this.getEvents(lastKnownId));
			};
			setTimeout(reply, maxWait);
			this.pendingWaits.push(reply);
		}
	};
}

function waitForPendingEvent(handle, lastKnownId, callback, timeout) {
	if (!(handle in eventsWindow)) {
		// shouldn't happen if client is following protocol
		callback({error: "Invalid handle"});
	} else {
		eventsWindow[handle].waitForEvents(lastKnownId, timeout, callback);
	}
}

function addEventToHandle(handle, data) {
	if (!(handle in eventsWindow)) {
		eventsWindow[handle] = new EventWindow();
	}
	eventsWindow[handle].addEvent(data);
}

function getHandleEventsLastId(handle) {
	if (!(handle in eventsWindow)) {
		eventsWindow[handle] = new EventWindow();
	}
	return eventsWindow[handle].getLastId();
}

function runControlServer() {
	var rpc_server = new rpcEngine({
		checkin: function (vmid, callback) {
			vlog("Checkin received from: " + vmid);
			checkinReceived(vmid, callback);
		},
		browser_event: function (vmid, data, callback) {
			vlog("Browser event received: " + JSON.stringify(data));
			var handle = null;
			for (var i = 0; i < handles.length; i++) {
				if (handleData[handles[i]].vmid == vmid) {
					handle = handles[i];
					break;
				}
			}
			//vlog("Browser event is for handle "+handle);
			if (handle != null) {
				addEventToHandle(handle, data);
			}
			callback();
		},
		log: function (vmid, msg, callback) {
			dlog("Remote log [" + vmid + "]: " + msg);
			callback();
		},
		getConfig: function (vmid, callback) {
			vlog("VM #" + vmid + " fetching config.");
			callback({
				vm: config.vm,
				external: config.external
			})
		}
	});

	var app = express();

	app.all('*', function (req, res, next) {
		res.header('Access-Control-Allow-Origin', '*');
		res.header('Access-Control-Allow-Methods', 'PUT, GET, POST, DELETE, OPTIONS');
		res.header('Access-Control-Allow-Headers', 'Content-Type');
		next();
	});

	app.post('/set-pool-size/:min/:max/:linger', function (req, res) {
		log(util.format('Received web request to set pool Size to (min: %s, max: %s, linger: %s)',
			req.params.min, req.params.max, req.params.linger));

		var min = parseInt(req.params.min);
		var max = parseInt(req.params.max);
		var linger = parseInt(req.params.linger);
		if (min > max || min < 0 || max < 0) {
			log("Invalid params.");
		} else {
			var maxAllowed = config.control.max_pool_size_allowed;
			if (max > maxAllowed) {
				log("Exceeding max pool size; setting max instead to " + maxAllowed);
				max = maxAllowed;
			}
			setPoolSize(min, max, linger);
		}
		res.send("");
	});

	app.post('/prepare-batch/:size/:url', function (req, res) {
		log('Received web request to set up a batch that point to home page '
			+ req.params.url + ' with ' + req.params.size + ' number of VMs');
		var size = parseInt(req.params.size);
		if (size < 0) {
			log("Invalid params.");
			res.send('');
		} else {
			var batchId = prepareBatch(size, {
				profile_name: "vmprofile",
				home_page: req.params.url
			});
			res.send('' + batchId);
		}
	});

	app.post('/lock/:batchId', function (req, res) {
		log('Received web request to lock a VM from batch #' + req.params.batchId);
		var batchId = parseInt(req.params.batchId);
		res.send('' + lockVM(batchId));
		res.send('');
	});

	app.post('/renew-expire/:handle/:time', function (req, res) {
		//log('Received web request to renew and schedule for expiration handle #'
		//	+ req.params.handle + ' after ' + req.params.time + 'ms');
		var handle = parseInt(req.params.handle);
		var time = parseInt(req.params.time);
		if (!_.contains(handles, handle)) {
			log("Invalid params.");
			res.send(JSON.stringify({}));
		} else {
			handleData[handle].expires = true;
			handleData[handle].expireTime = Date.now() + time;
			res.send(JSON.stringify({}));
		}
	});

	app.post('/release/:handle', function (req, res) {
		log("Received web request to release handle #" + req.params.handle);
		var handle = parseInt(req.params.handle);
		if (!_.contains(handles, handle)) {
			log("Invalid params.");
		} else {
			releaseVM(handle);
		}
		res.send('');
	});

	app.get('/handle-status/:handle', function (req, res) {
		log("Received web request to get status of handle #" + req.params.handle);
		var handle = parseInt(req.params.handle);
		if (!_.contains(handles, handle)) {
			log("Invalid params.");
			res.send(JSON.stringify({}));
		} else {
			res.send(JSON.stringify(getHandleInfo(handle)));
		}
	});

	app.post('/cancel-batch/:batchId', function (req, res) {
		log('Received web request to cancel batch #' + req.params.batchId);
		var batchId = parseInt(req.params.batchId);
		if (!_.contains(batches, batchId)) {
			log("Invalid params.");
		} else {
			cancelBatch(batchId);
		}
		res.send('');
	});

	app.get('/fetch-events/:handle/:lastid', function (req, res) {
		var handle = parseInt(req.params.handle);
		var lastId = parseInt(req.params.lastid);

		waitForPendingEvent(handle, lastId, function (result) {
			res.send(result);
		}, 5000);
	});

	app.get('/last-event-id/:handle', function (req, res) {
		var handle = parseInt(req.params.handle);

		res.send('' + getHandleEventsLastId(handle));
	});

	app.get('/all-status', function (req, res) {
		var vmList = [];
		var i;
		for (i = 0; i < pool.length; i++) {
			var vmid = pool[i];
			vmList.push(getVMInfo(vmid));
		}

		var batchList = [];
		for (i = 0; i < batches.length; i++) {
			batchList.push(batchData[batches[i]]);
		}

		var prepList = prepQueue.slice(0);
		var handleList = [];
		for (i = 0; i < handles.length; i++) {
			handleList.push(handleData[handles[i]]);
		}

		var pendingLocksList = pendingLocks.slice(0);

		var result = {
			vms: vmList,
			batches: batchList,
			preps: prepList,
			handles: handleList,
			pendingLocks: pendingLocksList,
			poolSize: poolSize
		};

		res.send(JSON.stringify(result));
	});

	app.post('/shutdown', function (req, res) {
		var handlesToRelease = handles.slice(0);
		var batchesToCancel = batches.slice(0);
		for (var i = 0; i < handlesToRelease.length; i++) {
			var handle = handlesToRelease[i];
			releaseVM(handle);
		}
		for (var i = 0; i < batchesToCancel.length; i++) {
			var batch = batchesToCancel[i];
			cancelBatch(batch);
		}
		setPoolSize(0, 0, 0);
	});

	app.use('/static', express.static(__dirname + '/static'));

	loadCheckpointFromDisk();

	cloudController = config.cloudController;
	log("Cloud connected.");

	rpc_server.listen(config.control.port);
	log("Server running on port " + config.control.port);

	runRuleMaintainer();
	runPinger();
	runStrayVMRemover();
	log("Rule maintainer, pinger, and stray VM remover started.");

	app.listen(config.control.external_port);
	log("External web server started on port " + config.control.external_port);
}

exports = module.exports = runControlServer;

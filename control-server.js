var rpc = require('./rpc.js');
var common = require('./cbvms_common.js');
var error = common.error;
var log = common.log;
var vlog = common.vlog;

// for now just keep an in-memory list; DB in the future.
var vm_instances = [];
var next_vm = 1;

var rpc_server = new rpc({
    checkin: function(data, callback) { //todo: what data?
        vm_instances.push(next_vm);
        callback(next_vm);
        vlog("Checkin received: "+data+", assigned vm_id = "+next_vm);
        next_vm++;
    },
    browser_event: function(data, callback) {
        vlog("Browser event received: "+JSON.stringify(data));
        callback();
    }
});


rpc_server.listen(9090);
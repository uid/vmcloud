var rpc = require('./rpc.js');
var express = require('express');
var common = require('./cbvms_common.js');
var error = common.error;
var log = common.log;
var vlog = common.vlog;


var app = express();
app.use(express.bodyParser());
app.post('/browser-events', function(req, res) {
    log("POST /browser-events "+JSON.stringify(req.body));
    var data = req.body;
    if ('action' in data) {
        switch(data['action']) {
            case 'page-load':
                var url = data['url'];
                var profile = data['profile'];
                if (!url || !profile) {
                    error("page-load data must contain url and profile");
                }
                if ('url' in data && 'profile' in data) {
                    browser_page_loaded(profile, url);
                }
                break;
            default:
                error("invalid action: "+data['action']);
        }
    } else {
        error("invalid request to /browser-events: "+JSON.stringify(data));
    }
});

app.listen(9091);


function browser_page_loaded(profile, url) {
    log("Browser page loaded: "+JSON.stringify({profile:profile, url:url}));
    rpc.connect(ctrl_port, ctrl_server, function(remote, conn) {
        remote.browser_event({
            'action':'page-load',
            'vm_id': vm_id,
            'profile':profile,
            'url':url
        }, function() {
            conn.destroy();
            conn.end();
        });
    });
}


// todo: configure somehow
var ctrl_server = "127.0.0.1";
var ctrl_port = 9090;
var vm_id;

log("checking in... ");
rpc.connect(ctrl_port, ctrl_server, function(remote, conn) {
    remote.checkin("", function(my_vm_id) {
        vm_id = my_vm_id;
        log("Got vm id: "+my_vm_id);
        conn.destroy();
        conn.end();
    });
});


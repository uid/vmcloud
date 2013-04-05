var config = require('./config.js');
var rpc = require('./rpc.js');

Object.defineProperty(global, '__stack', {
    get: function () {
        var orig = Error.prepareStackTrace;
        Error.prepareStackTrace = function (_, stack) {
            return stack;
        };
        var err = new Error;
        Error.captureStackTrace(err, arguments.callee);
        var stack = err.stack;
        Error.prepareStackTrace = orig;
        return stack;
    }
});

function error(e) {
    var frame = __stack[1];
    var line = frame.getLineNumber();
    var file = frame.getFileName();
    console.log("Error [" + file + ":" + line + "]: " + e);
}

function log(msg) {
    var frame = __stack[1];
    var line = frame.getLineNumber();
    var file = frame.getFileName();
    var logmsg = "Log [" + file + ":" + line + "]: " + msg;
    if (config.isControl) {
        // TODO: log to file!
        console.log(logmsg);
    } else {
        console.log(logmsg);
        rpc.connect(config.control.port, config.control.host, function (remote, conn) {
            remote.log(config.vmid, logmsg, function () {
                conn.destroy();
                conn.end();
            })
        });
    }
}

function dlog(msg) {
    // TODO: log to file!
    console.log(msg);
}

function vlog(msg) {
    var frame = __stack[1];
    var line = frame.getLineNumber();
    var file = frame.getFileName();
    console.log("Log [" + file + ":" + line + "]: " + msg);
}


var VMStates = {
    BUSY: 1,
    FREE: 2,
    READY: 3,
    ERROR: -1
};


var BeliefState = {
    CREATING: 0,
    BOOTING: 1,
    WAIT: 2,
    FREE: 3,
    READY: 4,
    OCCUPIED: 5,
    ERROR: 6,
    name: function (val) {
        return ['CREATING', 'BOOTING', 'WAIT', 'FREE', 'READY', 'OCCUPIED', 'ERROR'][val];
    }
};


exports = module.exports = {
    error: error,
    log: log,
    vlog: vlog,
    dlog: dlog,
    VMStates: VMStates,
    BeliefState: BeliefState
};
Object.defineProperty(global, '__stack', {
    get: function(){
        var orig = Error.prepareStackTrace;
        Error.prepareStackTrace = function(_, stack){ return stack; };
        var err = new Error;
        Error.captureStackTrace(err, arguments.callee);
        var stack = err.stack;
        Error.prepareStackTrace = orig;
        return stack;
    }
});

function error(e) {
    var frame = __stack[2];
    var line = frame.getLineNumber();
    var file = frame.getFileName();
    console.log("Error ["+file+":"+line+"]: "+e);
}
function log(msg) {
    var frame = __stack[2];
    var line = frame.getLineNumber();
    var file = frame.getFileName();
    console.log("Log ["+file+":"+line+"]: "+msg);
}
function vlog(msg) {
    var frame = __stack[2];
    var line = frame.getLineNumber();
    var file = frame.getFileName();
    console.log("Log ["+file+":"+line+"]: "+msg);
}

exports = module.exports = {
    error: error,
    log: log,
    vlog: vlog
};
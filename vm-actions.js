exports = module.exports = {
	prepare: prepare,
	cleanup: cleanup
};

var child_process = require('child_process');
var spawn = child_process.spawn;
var exec = child_process.exec;
var async = require('async');
var config = require('./configurator.js');
var common = require('./common.js');
var log = common.log;

function clearAllFirefoxProfiles(callback) {
	log("Clearing all firefox profiles (deleting profiles.ini)");
	exec('rm -f ~/.mozilla/firefox/profiles.ini', function (error) {
		if (error) {
			callback("Cannot remove all firefox profiles: " + JSON.stringify(error));
		} else {
			callback(null);
		}
	})
}

function initFirefoxProfileDirectory(callback) {
	log("Initializing firefox profile directory " + config.external.firefox_profile_dir);
	exec('mkdir -p ' + config.external.firefox_profile_dir, function (error) {
		if (error) {
			callback("Cannot create firefox profile directory: " + JSON.stringify(error));
		} else {
			callback(null);
		}
	});
}

/**
 * Deletes a Firefox profile on the local VM. Asynchronous. Does not return.
 * @param profile_name the name of the profile to delete
 * @param callback called when the profile deletion is complete
 */
function deleteFirefoxProfile(profile_name, callback) {
	log("Deleting firefox profile " + profile_name);
	exec('rm -rf ' + config.external.firefox_profile_dir + profile_name, function (error, stdout, stderr) {
		if (error) {
			callback("Cannot delete firefox profile + " + profile_name + ": " + JSON.stringify(error));
		} else {
			callback(null);
		}
	});
}


/**
 * Creates a Firefox profile on the local VM. Asynchronous. Does not return.
 * @param profile_name the name of the profile
 * @param callback called when the profile creation is complete
 */
function createFirefoxProfile(profile_name, callback) {
	log("Creating firefox profile " + profile_name);
	var proc = spawn('firefox', ['-CreateProfile',
		profile_name + " " + config.external.firefox_profile_dir + profile_name, '-new-instance']);
	proc.on('exit', function (code) {
		if (code == 0) {
			callback(null);
		} else {
			callback('firefox -CreateProfile returns code ' + code);
		}
	});
}

/**
 * Launch a Firefox instance with the given profile and home page
 * @param profile_name profile name
 * @param home_page the home page Firefox will go to initially
 * @returns {*} the ChildProcess representing the firefox process
 */
function launchFirefox(profile_name, home_page) {
	log("Launching firefox with profile " + profile_name + " on home page " + home_page);
	return spawn('firefox', ['-P', profile_name, '-new-instance',
		home_page]);
}

/**
 * Capture and redirect audio output of the local VM, by creating a null sink with the given name and then redirecting
 * audio to that sink.
 * @param sink_name the name of the null sink to create
 * @param callback called with parameter (null) if success, or an error message otherwise.
 */
function redirectAudio(sink_name, callback) {
	log("Setting up audio redirection with sink " + sink_name);
	async.series([
		function (cb) {
			log("loading null sink module");
			var proc = spawn('pactl', ['load-module', 'module-null-sink',
				'sink_name=' + sink_name]);
			proc.on('exit', function (code) {
				if (code == 0) {
					cb(null, null);
				} else {
					cb('pactl load-module returns code ' + code, null);
				}
			});
		},
		function (cb) {
			log("setting default sink");
			var proc = spawn('pacmd', ['set-default-sink', sink_name]);
			proc.on('exit', function (code) {
				if (code == 0) {
					cb(null, null);
				} else {
					cb('pacmd set-default-sink returns code ' + code, null);
				}
			})
		}

	], function (err, results) {
		if (err) {
			callback(err);
		} else {
			callback(null);
		}
	});
}

/**
 * Publish the audio from the monitor of the given sink to the given port of the local VM, with RTSP protocol
 * @param sink_name the name of the sink whose monitor should be published
 * @param port the port
 * @returns {*} the ChildProcess representing the publishing process
 */
function publish_audio_rtsp(sink_name, port) {
	log("Publishing sink " + sink_name + " to RTSP port " + port);
	return exec("parec --latency=1 --format=s16le --channels=1 -d " + sink_name + ".monitor | " +
		"cvlc -vvv - --demux=rawaud --rawaud-channels 1 --rawaud-samplerate 44100 --sout " +
		"'#transcode{acodec=mp3, ab=192}:rtp{dst=0.0.0.0,port=" + port + ",sdp=rtsp://0.0.0.0:" + port + "/}'");
}


/**
 * Execute initial bootup sequence: set up null sink, set default sink to the null sink, and publish null sink's monitor
 * @param callback called with (err) if error, or (null, process) with the ChildProcess object representing the
 * audio publishing process
 */
function initial_bootup(callback) {
	log("Executing initial bootup sequence");
	var port = config.external.rtsp_publish_port;
	var sink_name = config.external.audio_sink_name;
	async.series([
		function (cb) {
			initFirefoxProfileDirectory(cb);
		},
		function (cb) {
			redirectAudio(sink_name, cb);
		},
		function (cb) {
			cb(null, publish_audio_rtsp(sink_name, port));
		}
	], function (err, result) {
		if (err) {
			log("Error during initial bootup: " + err);
			callback(err);
		} else {
			log("Initial bootup complete");
			callback(null, result[2]);
		}
	});
	// TODO: do some monitoring on the process, such as when firefox closed. Probably need up propagate such event
	// TODO: all the way to the top so that the VM can turn into error state or something like that.
}

/**
 * Create a profile and launch a Firefox session with the given profile and home page.
 * @param profile_name the profile name
 * @param home_page the home page Firefox initially points to
 * @param callback called with (err) if error, or (null, process) with the ChildProcess object representing the Firefox
 * process
 */
function setupSession(profile_name, home_page, callback) {
	log("Setting up firefox session with profile " + profile_name + " and home page: " + home_page);
	async.series([
		function (cb) {
			clearAllFirefoxProfiles(cb);
		},
		function (cb) {
			deleteFirefoxProfile(profile_name, cb);
		},
		function (cb) {
			createFirefoxProfile(profile_name, cb);
		},
		function (cb) {
			cb(null, launchFirefox(profile_name, home_page));
		}
	], function (err, result) {
		if (err) {
			log("Error setting up firefox session: " + err);
			callback(err);
		} else {
			log("Firefox session setup successful.");
			callback(null, result[3]);
		}
	});
	// TODO: do some monitoring on the process, such as when firefox closed. Probably need up propagate such event
	// TODO: all the way to the top so that the VM can turn into error state or something like that.
}

/**
 * Terminate a Firefox session.
 * @param process the ChildProcess object given with the callback by setupSession.
 * @param callback called with (err) if error, or (null) if success.
 */
function teardownSession(process, callback) {
	log("Terminating session PID" + process.pid);
	process.on('exit', function (code, signal) {
		callback(null); // TODO: when would an error happen?
	});
	process.kill('SIGINT');
}

/**
 * Prepare a session with the given data.
 * @param data a dictionary: profile_name -> the profile; home_page -> the home page URL
 * @param callback called with (err) if error, or (null, payload) for some payload that the caller needs to keep;
 * the payload is passed to cleanup afterwards.
 */
function prepare(data, callback) {
	setupSession(data.profile_name, data.home_page, function (err, result) {
		if (err) {
			callback(err);
		} else {
			callback(null, {
				process: result
			});
		}
	});
}

/**
 * Terminate a session and clean up.
 * @param data a dictionary: payload -> the payload given by prepare(...)
 * @param callback called with (err) if error, or (null) if success
 */
function cleanup(data, callback) {
	teardownSession(data.payload.process, callback);
}

module.exports = exports = {
	initial_bootup: initial_bootup,
	prepare: prepare,
	cleanup: cleanup
};
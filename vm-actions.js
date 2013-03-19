exports = module.exports = {
	prepare: prepare,
	cleanup: cleanup
};

function prepare(data, callback) {
	// TODO: do stuff
	setTimeout(function () {
		callback({
			success: true
		})
	}, 1000);
}

function cleanup(data, callback) {
	// TODO: do stuff
	setTimeout(function () {
		callback({
			success: true
		})
	}, 1000);
}
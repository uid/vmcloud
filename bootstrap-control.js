process.chdir(__dirname);
var config = require('./configurator.js');
config.initControl();
bootstrap_control_server();

function bootstrap_control_server() {
	var control_server = require('./control-server.js');
	control_server();
}

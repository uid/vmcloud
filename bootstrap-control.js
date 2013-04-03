process.chdir(__dirname);
var config = require('./config.js');
config.i_am_control();

bootstrap_control_server();

function bootstrap_control_server() {
	var control_server = require('./control-server.js');
	control_server();
}

vmcloud
=======

VM Cloud with OpenStack for FlightCrew backend.

The VM Cloud is a system that manages a pool of virtual machines, each running a web browser. It serves two purposes:

1. To allow a crowd worker to use a web browser within their web browser by remoting (VNC + audio forwarding) into a virtual machine. This allows us to capture the pages they visit while retaining the full functionality of a web browser. In addition we have control over the web browser such as pre-configuring it with a cookie.
2. To capture the audio output of the web browser so that it can be relayed to the end user's device (for FlightCrew Tuner).

This is **still under heavy development**. The set up will roughly follow these steps:

1. Boot a control server, either a VM in OpenStack, or some other standalone machine, as long as it has a public IP. Let `1.1.1.1` denote the IP of the control server.
2. As any user, `git clone` this repo on the control server. Copy `config.example.js` to `config.js` and edit the parameters.
3. Launch a Ubuntu 12.04 image on OpenStack. SSH into this machine and `sudo -i` as root. `git clone` the repo as root and run `sh init.sh` within the `vmcloud` folder.
4. Create a snapshot of this instance, calling it the same name as the image name you specified you the config file.
5. Run the control server by typing `node bootstrap-control.js` on the control server within the `vmcloud` folder.
6. (Beyond this point things are being developed) navigate to `http://1.1.1.1:8080/static/config.html` and enter `1.1.1.1` and `8080` to use the management interface and VNC/audio.
7. Compile the Android demo to see a monitoring interface with the ability to listen to each server. (This requires uid/fc-platform.)

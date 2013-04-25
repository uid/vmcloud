vmcloud
=======

VM Cloud with OpenStack for FlightCrew backend.

This is **still under heavy development**. The set up will roughly follow these steps:

1. Boot a control server, either a VM in OpenStack, or some other standalone machine, as long as it has a public IP. Let `1.1.1.1` denote the IP of the control server.
2. As any user, `git clone` this repo on the control server. Copy `config.example.js` to `config.js` and edit the parameters.
3. Launch a Ubuntu 12.04 image on OpenStack. SSH into this machine and `sudo -i` as root. `git clone` the repo as root and run `sh init.sh` within the `vmcloud` folder.
4. Create a snapshot of this instance, calling it the same name as the image name you specified you the config file.
5. Run the control server by typing `node bootstrap-control.js` on the control server within the `vmcloud` folder.
6. (Beyond this point things are being developed) navigate to `http://1.1.1.1:8080/static/config.html` and enter `1.1.1.1` and `8080` to use the management interface and VNC/audio.
7. Compile the Android demo to see a monitoring interface with the ability to listen to each server.

vmcloud
=======

VM Cloud with OpenStack for FlightCrew backend.

The VM Cloud is a system that manages a pool of virtual machines, each running a web browser. It serves two purposes:

1. To allow a crowd worker to use a web browser within their web browser by remoting (VNC + audio forwarding) into a virtual machine. This allows us to capture the pages they visit while retaining the full functionality of a web browser. In addition we have control over the web browser such as pre-configuring it with a cookie.
2. To capture the audio output of the web browser so that it can be relayed to the end user's device (for FlightCrew Tuner).

To deploy the VM cloud:

1. Boot a control server, either a VM in OpenStack, or some other standalone machine, as long as it has a public IP. Let `1.1.1.1` denote the IP of the control server.
2. As any user, `git clone` this repo on the control server. Copy `config.example.js` to `config.js` and edit the parameters.
3. Launch a Ubuntu 12.04 image on OpenStack. SSH into this machine and `sudo -i` as root. `git clone` the repo as root and run `sh init.sh` within the `vmcloud` folder.
4. Create a snapshot of this instance, calling it the same name as the image name you specified in the config file.
5. Run the control server by typing `node bootstrap-control.js` on the control server within the `vmcloud` folder.
6. Navigate to `http://1.1.1.1:8080/static/monitor.html` for a full management and monitoring interface.

VM cloud is currently programmed only for FlightCrew Tuner; however, the design should support other applications with reasonable amount of change.

Currently, the external interface of the control server exposes the following RESTful API (POST requests don't take any extra parameters):

1. POST `/set-pool-size/:min/:max/:linger`: Set the pool size to `min` VMs at least, `max` #VMs at most, and when in between, a VM will stay continuously idle for maximally `linger` milliseconds. Returns nothing.
2. POST `/prepare-batch/:size/:homepage`: Prepare a batch of `size` VMs whose browser will all point to URL `homepage`. Returns a new batch ID.
3. POST `/lock/:batch`: Lock a VM from batch ID #`batch`. This means the VM can be exclusively used by the application until released. Returns a new VM handle. It is okay to invoke this command as long as the batch exists, even if the batch already has 0 VMs remaining.
4. POST `/release/:vmhandle`: Release the given VM handle so its session can be cleaned up and reused for a new batch. Returns nothing.
5. GET `/handle-status/:vmhandle`: Returns the status of the given VM handle, which is a JSON that encodes either `{assigned: false}` or `{assigned: true, vmid: ..., vm: {/* vm data */}}` (see actual data for details).
6. POST `/cancel-batch/:batch`: Cancel batch whose ID is `batch`. All currently locked VMs from this batch can still be used until they are released, but new VMs may not be locked from this batch anymore.

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

1. POST `/set-pool-size/{min}/{max}/{linger}`: Set the pool size to `min` VMs at least, `max` #VMs at most, and when in between, a VM will stay continuously idle for maximally `linger` milliseconds. Returns nothing.
2. POST `/prepare-batch/{size}/{homepage}`: Prepare a batch of `size` VMs whose browser will all point to URL `homepage`. Returns a new batch ID.
3. POST `/lock/{batch}`: Lock a VM from batch ID #`batch`. This means the VM can be exclusively used by the application until released. Returns a new VM handle. It is okay to invoke this command as long as the batch exists, even if the batch already has 0 VMs remaining.
4. POST `/release/{vmhandle}`: Release the given VM handle so its session can be cleaned up and reused for a new batch. Returns nothing.
5. GET `/handle-status/{vmhandle}`: Returns the status of the given VM handle, which is a JSON that encodes either `{assigned: false}` or `{assigned: true, vmid: ..., vm: {/* vm data */}}` (see actual data for details).
6. POST `/renew-expire/{vmhandle}/{expireTime}`: Set the VM handle `vmhandle` to be released after `expireTime` milliseconds. If there is currently such a timer, reset it.
7. GET `/last-event-id/{vmhandle}`: Get the last event ID to be used in the first request to `fetch-events`. Returns an integer.
8. GET `/fetch-events/{vmhandle}/{lastId}`: Get all events for the VM handle since the last request. `lastId` should be the `lastId` received from the previous request. Returns `{lastId: int, newEvents: [{...}, {...}, ...]}`.
9. POST `/cancel-batch/{batch}`: Cancel batch whose ID is `batch`. All currently locked VMs from this batch can still be used until they are released, but new VMs may not be locked from this batch anymore.
10. POST `/shutdown`: Cleanly release all handles, cancel all batches, and shut down all VMs.

Some additional notes:

1. The system is designed to be fault tolerant (i.e. remains stable with reasonable behavior) except in the following cases:
  * A VM becomes faulty when it is being used by a worker or by the application. In this case there's not much we can do about it.
  * The control server is forcefully terminated (or crashes due to a bug) and a VM is in the middle of an operation. In this case the VM will be terminated upon restart of the control server. Only the VMs that are in a stable state (FREE, READY, or OCCUPIED) can be recovered (if the state matches the VM's actual state).
2. Checkpointing is done whenever states change (or as fast as I/O can handle), so that restarting the control server can recover as much state as possible. If it is undesired to load from checkpoint, simply delete `checkpoint.json`.
3. Stray VMs, defined as VMs in the given OpenStack cloud with the same prefix as the one used by VM cloud but whose identity is not being kept track of, will be terminated periodically. So one cannot run other VMs in the same cloud that uses the same prefix.
4. If the control server is shut down forcefully and one wishes to clean up running VMs in the cloud, simply run the control server again and issue the `/shutdown` command. If the checkpoint is faulty for some reason, just delete the checkpoint file and restart the control server, which should terminate all VMs.
5. Audio delay is about 2.5 seconds to the browser, and a few seconds to Android.
6. Multiple users can remote into the same machine (interfering with each other's controls of course). This can be useful for manually watch what workers are doing, or perhaps for designing some cooperative tasks in the future. Who knows.

var BeliefState = {
	CREATING: 0,
	BOOTING: 1,
	WAIT: 2,
	FREE: 3,
	READY: 4,
	OCCUPIED: 5,
	ERROR: 6,
	KILLING: 7,
	name: function (val) {
		return ['CREATING', 'BOOTING', 'WAIT', 'FREE', 'READY', 'OCCUPIED', 'ERROR', 'KILLING'][val];
	}
};

(function($) {

	$.fn.streamer = function(vmcloudRoot, audioUrl) {
		this.empty();
		this.flash({
			src: vmcloudRoot+"static/streamer.swf",
			width:0,
			height:0,
			AllowScriptAccess: 'always',
			flashvars:{audioUrl:audioUrl}
		});
	};

})(jQuery);

(function($) {
	$.fn.vmRemote = function(vmcloudRoot, handle, eventCallback) {
		var target = this;
		target.text("One moment while we prepare your task...");
		setTimeout(function check() {
			$.get(vmcloudRoot + 'handle-status/'+handle, function(data) {
				if (data.assigned) {
					target.empty();
					target.flash({
						src: vmcloudRoot+'static/Flashlight.swf',
						width:1024,
						height:768,
						flashvars: {
							hideControls: true,
							autoConnect: true,
							viewOnly: false,
							host: data.vm.public_ip,
							port: 5910,
							securityPort: 1234,
							useSecurity: true,
							password: data.vm.vnc_passwd,
							jpegCompression: 7
						}
					});
					var div = $("<div>");
					target.append(div);
					div.streamer(vmcloudRoot, "http://"+data.vm.public_ip+":8000/stream.mp3");

					var lastEventId;


					function fetchEvent() {
						$.get(vmcloudRoot + 'fetch-events/'+handle + '/' + lastEventId, function(data) {
							if (data.newEvents.length > 0) {
								for(var i=0;i<data.newEvents.length;i++) {
									eventCallback(data.newEvents[i]);
								}
							}
							lastEventId = data.lastId;
							fetchEvent();
						}, 'json');
					}

					function getLastEventId() {
						$.get(vmcloudRoot + 'last-event-id/'+handle, function(id) {
							lastEventId = parseInt(id);
							fetchEvent();
						})
					}
					getLastEventId();
				} else {
					setTimeout(check, 1000);
				}
			}, 'json');
		}, 0);
	};
})(jQuery);
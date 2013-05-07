function doPost(url, params) {
    var http = new XMLHttpRequest();
    var encode = function (d) {
        var result = "";
        var first = true;
        for (var k in d) {
            if (!first) {
                result += "&";
            }
            result += k;
            result += "=";
            result += encodeURIComponent(d[k]);
            first = false;
        }
        return result;
    };
    var encodedParams = encode(params);
    http.open("POST", url, true);
    http.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
    http.setRequestHeader("Content-length", encodedParams.length);
    http.setRequestHeader("Connection", "close");
    http.send(encodedParams);
}
var cbeventExtension = {
    init: function() {
        if (gBrowser) {
			gBrowser.addEventListener("DOMContentLoaded", cbeventExtension.onPageLoad, true);
		}
	},
	
	onPageLoad: function(event) {
        var doc = event.originalTarget;
        doPost("http://localhost:9091/browser-events", {
            action: 'page-load',
            url: doc.location,
	        title: doc.title
        });
    }
};

function cbevent_init() {
	window.removeEventListener("load", cbevent_init, false);
	cbeventExtension.init();
}

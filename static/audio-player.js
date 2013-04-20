(function($) {

$.fn.audioPlayer = function(audioUrl) {
  this.empty();
  this.flash({
    src: "streamer.swf",
    width:112,
    height:29,
    flashvars:{audioUrl:audioUrl}
  });
};

})(jQuery);
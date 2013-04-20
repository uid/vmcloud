(function($) {

$.fn.audioPlayer = function(audioUrl, iconize) {
  this.empty();
  this.flash({
    src: iconize? "player-icon.swf" : "player.swf",
    width:112,
    height:29,
    flashvars:{audioUrl:audioUrl}
  });
};

})(jQuery);
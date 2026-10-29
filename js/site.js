// Plays a demo video only while it is on screen, and never auto-plays for visitors
// who ask for reduced motion (they get the poster and the native controls instead).
(function () {
  var videos = Array.prototype.slice.call(document.querySelectorAll('video.demo'));
  if (!videos.length) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) {
    videos.forEach(function (v) { v.controls = true; });
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var v = entry.target;
      if (entry.isIntersecting) {
        if (v.preload === 'none') v.preload = 'auto';
        var p = v.play();
        if (p && p.catch) p.catch(function () { v.controls = true; });
      } else {
        v.pause();
      }
    });
  }, { threshold: 0.35 });

  videos.forEach(function (v) { observer.observe(v); });
})();

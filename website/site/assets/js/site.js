// Hero film: plays muted when on screen, pauses off screen, never autoplays
// for people who ask for reduced motion. The button always gives control.
(function () {
  var video = document.getElementById("film");
  var btn = document.getElementById("film-toggle");
  if (!video || !btn) return;
  var label = document.getElementById("film-label");
  var icon = document.getElementById("film-icon");
  var PLAY = '<path d="M4 2.5v11l9-5.5z" fill="currentColor"/>';
  var PAUSE = '<path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor"/>';
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var userPaused = reduce;

  function sync() {
    var playing = !video.paused;
    label.textContent = playing ? "Mettre en pause" : "Lire la vidéo";
    icon.innerHTML = playing ? PAUSE : PLAY;
    btn.setAttribute("aria-pressed", playing ? "true" : "false");
  }

  btn.addEventListener("click", function () {
    if (video.paused) {
      userPaused = false;
      video.play().catch(function () {});
    } else {
      userPaused = true;
      video.pause();
    }
  });
  video.addEventListener("play", sync);
  video.addEventListener("pause", sync);

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting && !userPaused) video.play().catch(function () {});
          else if (!e.isIntersecting && !video.paused) video.pause();
        });
      },
      { threshold: 0.35 }
    ).observe(video);
  } else if (!userPaused) {
    video.play().catch(function () {});
  }
  sync();
})();

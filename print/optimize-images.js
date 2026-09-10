/* ============================================================================
 * PLAZA 600 — PRINT IMAGE RESAMPLING
 * ----------------------------------------------------------------------------
 * The site serves full-resolution photography because a browser window may be
 * 2,000px wide. On paper the same tiles are printed at one to four inches, so
 * embedding the originals produces a ten-megabyte PDF for a document that is
 * meant to be emailed.
 *
 * Each image is redrawn through a canvas at roughly 300dpi for the size it
 * actually occupies on the sheet and swapped for the result. Aspect ratios are
 * preserved, so pagination — which runs after this — measures the same layout.
 * ========================================================================== */
(function () {
  "use strict";

  /* longest side in CSS px, ~3x the printed size for 288dpi */
  var CAPS = [
    [".asset-tile img",     440],
    [".gallery .g-tile img", 560],
    [".snapshot-media img", 1180],
    [".portal-shot img",    1200]
  ];
  var DEFAULT_CAP = 1000;
  var QUALITY = 0.9;

  function capFor(img) {
    for (var i = 0; i < CAPS.length; i++) if (img.matches(CAPS[i][0])) return CAPS[i][1];
    return DEFAULT_CAP;
  }

  function decoded(img) {
    if (img.complete && img.naturalWidth) return Promise.resolve(img);
    return new Promise(function (res) {
      img.addEventListener("load", function () { res(img); }, { once: true });
      img.addEventListener("error", function () { res(null); }, { once: true });
    });
  }

  function resample(img) {
    var cap = capFor(img);
    var w = img.naturalWidth, h = img.naturalHeight;
    var scale = Math.min(1, cap / Math.max(w, h));
    if (scale >= 1) return;                       /* already small enough */
    var cw = Math.round(w * scale), ch = Math.round(h * scale);
    var c = document.createElement("canvas");
    c.width = cw; c.height = ch;
    var ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    /* JPEG has no alpha; the page ground shows through anywhere the source did */
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, cw, ch);
    var url = c.toDataURL("image/jpeg", QUALITY);
    if (url.length < 32) return;                  /* tainted or failed */
    img.removeAttribute("srcset");
    img.src = url;
    img.dataset.printResampled = w + "x" + h + " to " + cw + "x" + ch;
  }

  var imgs = Array.prototype.slice.call(document.querySelectorAll("#source img"));

  window.PRINT_IMAGES_READY = Promise.all(imgs.map(decoded))
    .then(function (loaded) {
      loaded.forEach(function (img) { if (img) { try { resample(img); } catch (e) { void e; } } });
      /* the swapped data URIs must decode before anything is measured */
      return Promise.all(imgs.map(decoded));
    })
    .then(function () {
      window.PRINT_IMAGE_REPORT = imgs.map(function (i) {
        return { src: (i.getAttribute("src") || "").slice(0, 24), change: i.dataset.printResampled || "kept" };
      });
    });
})();

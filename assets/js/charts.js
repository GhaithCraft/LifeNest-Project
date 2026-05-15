(function () {
  function safeGet(id) {
    var el = document.getElementById(id);
    return el && el.getContext ? el : null;
  }

  function drawPie(canvas, ratioDone) {
    var ctx = canvas.getContext("2d");

    // HiDPI crispness
    var dpr = (window.devicePixelRatio || 1);
    var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
    var cssW = rect && rect.width ? rect.width : canvas.width;
    var cssH = rect && rect.height ? rect.height : canvas.height;
    var targetW = Math.max(1, Math.round(cssW * dpr));
    var targetH = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    var w = canvas.width, h = canvas.height;
    var cx = w / 2, cy = h / 2;
    var r = Math.min(w, h) / 2 - 2;

    var done = Math.max(0, Math.min(1, Number(ratioDone) || 0));
    var start = -Math.PI / 2;

    ctx.clearRect(0, 0, w, h);

    function slice(a0, a1, fill) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a0, a1);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    }

    // Reference look: filled pie with 3 slices.
    // Keep the ratio meaningfully represented while always showing 3 colors.
    var neutral = 0.18;
    var eff = 1 - neutral;
    var donePart = eff * done;
    var restPart = eff - donePart;

    var a0 = start;
    var aNeutralEnd = a0 + Math.PI * 2 * neutral;
    var aDoneEnd = aNeutralEnd + Math.PI * 2 * donePart;
    var aRestEnd = aDoneEnd + Math.PI * 2 * restPart;

    // neutral (lime)
    slice(a0, aNeutralEnd, "rgba(171, 213, 96, .78)");
    // done (green)
    if (donePart > 0.0001) slice(aNeutralEnd, aDoneEnd, "rgba(47,111,85,.86)");
    // remaining (blue)
    slice(aDoneEnd, aRestEnd, "rgba(78, 155, 207, .72)");

    // soft highlight ring (like a card sheen)
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,.85)";
    ctx.stroke();
  }

  function drawSpark(canvas, values) {
    var ctx = canvas.getContext("2d");
    var w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!values || !values.length) return;

    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var pad = 6;

    function x(i) { return pad + (w - pad * 2) * (i / Math.max(1, (values.length - 1))); }
    function y(v) {
      if (max === min) return h / 2;
      var t = (v - min) / (max - min);
      return (h - pad) - (h - pad * 2) * t;
    }

    // area
    ctx.beginPath();
    ctx.moveTo(x(0), h - pad);
    for (var i = 0; i < values.length; i++) {
      ctx.lineTo(x(i), y(values[i]));
    }
    ctx.lineTo(x(values.length - 1), h - pad);
    ctx.closePath();
    ctx.fillStyle = "rgba(47,111,85,.10)";
    ctx.fill();

    // line
    ctx.beginPath();
    for (var j = 0; j < values.length; j++) {
      var px = x(j), py = y(values[j]);
      if (j === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(47,111,85,.62)";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    // last dot
    ctx.beginPath();
    ctx.arc(x(values.length - 1), y(values[values.length - 1]), 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(47,111,85,.72)";
    ctx.fill();
  }

  window.LifeNestCharts = { drawPie: drawPie, drawSpark: drawSpark };

  document.addEventListener("DOMContentLoaded", function () {
    var pie = safeGet("studyPie");
    if (pie) drawPie(pie, 0.0);

    var spark = safeGet("weeklySpark");
    if (spark) drawSpark(spark, [0, 10, 12, 16, 18, 22, 28]);
  });
})();

// public/workers/render/cyclones.js
//
// Cyclone render module. Loaded by pointWorker.js via importScripts.
// Exposes drawCyclone() and drawCycloneForecast() on the worker global scope.
//
// Constraints (docs/constraints.md):
// - Plain JS, no imports from main codebase
// - Use the projection function passed in (handles globe + flat)
// - Z-test: only draw points where pt.z > 0
//
// WCAG 2.2 AA — Hard Rule 15. The eye pulse, the selection ring oscillation,
// and the forecast track dash animation all skip their time-based deltas
// when reducedMotion is true. The flag flows from the main thread via the
// frame message protocol — see GlobeVisualization.tsx (window.matchMedia
// "(prefers-reduced-motion: reduce)").
"use strict";

function drawCyclone(
  ctx,
  projFn,
  x,
  y,
  item,
  color,
  depthAlpha,
  t,
  isSelected,
  showForecast,
  showCone,
  showWindField,
  reducedMotion,
) {
  var d = item.data || {};
  var cat = d.saffirSimpson || 0;
  var baseSize = 2 + cat * 1.2; // TD/TS=2, HU5=8
  var s =
    baseSize *
    (typeof zoomScale === "function" ? zoomScale(item._zoom || 1) : 1);
  if (isSelected) s *= 1.5;

  // Outer pulsing glow — intensity scales with category. Flat under
  // prefers-reduced-motion.
  var pulse = reducedMotion ? 1 : 1 + Math.sin(t * 1.5) * 0.15;
  var gr = s * 3 * pulse;
  var glow = ctx.createRadialGradient(x, y, 0, x, y, gr);
  glow.addColorStop(0, color + "60");
  glow.addColorStop(0.5, color + "30");
  glow.addColorStop(1, color + "00");
  ctx.fillStyle = glow;
  ctx.globalAlpha = depthAlpha * 0.7;
  ctx.beginPath();
  ctx.arc(x, y, gr, 0, Math.PI * 2);
  ctx.fill();

  // Observed past track (genesis → now), under the eye. Tied to the track toggle.
  if (showForecast) {
    drawPastTrack(ctx, projFn, x, y, item, color, depthAlpha);
  }

  // Eye dot
  ctx.fillStyle = color;
  ctx.globalAlpha = depthAlpha;
  ctx.beginPath();
  ctx.arc(x, y, s, 0, Math.PI * 2);
  ctx.fill();

  // Current-position marker: hollow ring + bright centre pip so the live eye is
  // the obvious click target for current data — distinct from the genesis X and
  // the small past-trail / forecast dots, which both lead the eye to here.
  ctx.strokeStyle = color;
  ctx.globalAlpha = depthAlpha * 0.95;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, s + 3.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = depthAlpha;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(1, s * 0.35), 0, Math.PI * 2);
  ctx.fill();

  // Forecast track + cone (official KMZ-derived if present, synthesized
  // error-radius circles otherwise).
  if (showForecast && d.forecast && d.forecast.length > 0) {
    drawCycloneForecast(
      ctx,
      projFn,
      x,
      y,
      item,
      color,
      depthAlpha,
      showCone,
      reducedMotion,
    );
  }

  // Real 34/50/64-kt wind radii (ATCF b-deck) — translucent quadrant wedges
  // showing actual storm size. Its own toggle; independent of the track/cone.
  if (showWindField) {
    drawWindRadii(ctx, projFn, x, y, item, depthAlpha);
  }

  // Selection ring — fixed radius under reduced motion (no oscillation)
  if (isSelected) {
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    var ringDelta = reducedMotion ? 0 : Math.sin(t * 2) * 2;
    ctx.arc(x, y, s * 2.5 + ringDelta, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// Quadrant wind radii. wr.kt34/50/64 are nautical miles per quadrant
// [NE, SE, SW, NW]. Drawing four hard pie-wedges leaves unreal straight
// N/S/E/W edges — a one-sided storm renders as a perfect cardinal-bounded
// semicircle. Instead each band is ONE smooth closed curve: the per-quadrant
// radius is anchored at its centre bearing (45/135/225/315°) and smoothstep-
// interpolated around the eye, so a missing quadrant tapers to the centre
// rather than a flat wall. nm→px uses 60 nm = 1° latitude.
var WR_QUAD_CENTER = [45, 135, 225, 315]; // NE, SE, SW, NW (compass degrees)
var WR_STEPS = 64;

// Smoothstep-interpolated radius (nm) at a compass bearing, from the four
// quadrant-centre values.
function wrRadiusAt(q, bearing) {
  for (var i = 0; i < 4; i++) {
    var d = (((bearing - WR_QUAD_CENTER[i]) % 360) + 360) % 360;
    if (d <= 90) {
      var v0 = q[i] > 0 ? q[i] : 0;
      var v1 = q[(i + 1) % 4] > 0 ? q[(i + 1) % 4] : 0;
      var tt = d / 90;
      return v0 + (v1 - v0) * (tt * tt * (3 - 2 * tt));
    }
  }
  return 0;
}

function drawWindRadii(ctx, projFn, x, y, item, depthAlpha) {
  var wr = item.data && item.data.windRadii;
  if (!wr) return;
  var north = projFn(item.lat + 1, item.lon);
  if (north.z <= 0) return;
  var pxPerNm = Math.hypot(north.x - x, north.y - y) / 60;
  if (!(pxPerNm > 0)) return;

  var BANDS = [
    [wr.kt34, "#ffd24a", 0.12],
    [wr.kt50, "#ff8c42", 0.16],
    [wr.kt64, "#ff5d5d", 0.2],
  ];
  for (var b = 0; b < BANDS.length; b++) {
    var q = BANDS[b][0];
    if (!q || !(q[0] > 0 || q[1] > 0 || q[2] > 0 || q[3] > 0)) continue;
    ctx.fillStyle = BANDS[b][1];
    ctx.globalAlpha = depthAlpha * BANDS[b][2];
    ctx.beginPath();
    for (var i = 0; i <= WR_STEPS; i++) {
      var bearing = (i / WR_STEPS) * 360;
      var r = wrRadiusAt(q, bearing) * pxPerNm;
      // compass bearing → canvas angle (0 = east, clockwise, y-down)
      var a = ((bearing - 90) * Math.PI) / 180;
      var px = x + Math.cos(a) * r;
      var py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Observed best-track history: a solid trail from genesis (X marker) through
// each analyzed past position to the current eye — distinct from the dashed
// forecast track ahead. Data is the ATCF b-deck (item.data.pastTrack).
function drawPastTrack(ctx, projFn, eyeX, eyeY, item, color, depthAlpha) {
  var track = item.data && item.data.pastTrack;
  if (!track || track.length < 2) return;
  var pts = [];
  for (var i = 0; i < track.length; i++) {
    var p = projFn(track[i].lat, track[i].lon);
    if (p.z > 0) pts.push(p);
  }
  if (pts.length < 2) return;

  // solid trail genesis → eye
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.25;
  ctx.globalAlpha = depthAlpha * 0.45;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y);
  ctx.lineTo(eyeX, eyeY);
  ctx.stroke();

  // past-position dots
  ctx.fillStyle = color;
  ctx.globalAlpha = depthAlpha * 0.55;
  for (var k = 1; k < pts.length; k++) {
    ctx.beginPath();
    ctx.arc(pts[k].x, pts[k].y, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // genesis "X" at the first analyzed position
  var g = pts[0];
  var xs = 4;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = depthAlpha * 0.9;
  ctx.beginPath();
  ctx.moveTo(g.x - xs, g.y - xs);
  ctx.lineTo(g.x + xs, g.y + xs);
  ctx.moveTo(g.x - xs, g.y + xs);
  ctx.lineTo(g.x + xs, g.y - xs);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// Cone of uncertainty as time-step segments. Each segment is a tapered band
// between two forecast points, its half-width = the real NHC average track-error
// radius at that lead time (errorRadiusNm). It starts from a point at the eye
// (r=0) so there's no bulbous base, shades fainter the further out the forecast,
// and strokes a divider at each forecast hour so the day-out structure reads.
function drawSegmentedCone(ctx, projFn, eyeX, eyeY, fp, color, baseAlpha) {
  var pts = [{ x: eyeX, y: eyeY, r: 0, h: 0 }];
  for (var k = 0; k < fp.length; k++) {
    var fc = fp[k];
    var nb = projFn(fc.lat + 1, fc.lon);
    if (nb.z <= 0) continue;
    var pxPerDeg = Math.hypot(nb.x - fc.x, nb.y - fc.y);
    pts.push({
      x: fc.x,
      y: fc.y,
      r: (fc.errorRadiusNm / 60) * pxPerDeg,
      h: fc.fcstHour,
    });
  }
  if (pts.length < 2) return;
  var maxH = pts[pts.length - 1].h || 1;

  for (var i = 0; i < pts.length - 1; i++) {
    var A = pts[i];
    var B = pts[i + 1];
    var dx = B.x - A.x;
    var dy = B.y - A.y;
    var len = Math.hypot(dx, dy) || 1;
    var nx = -dy / len;
    var ny = dx / len;
    var t = B.h / maxH; // 0 (near) → 1 (far)

    var ax1 = A.x + nx * A.r;
    var ay1 = A.y + ny * A.r;
    var bx1 = B.x + nx * B.r;
    var by1 = B.y + ny * B.r;
    var bx2 = B.x - nx * B.r;
    var by2 = B.y - ny * B.r;
    var ax2 = A.x - nx * A.r;
    var ay2 = A.y - ny * A.r;

    ctx.beginPath();
    ctx.moveTo(ax1, ay1);
    ctx.lineTo(bx1, by1);
    ctx.lineTo(bx2, by2);
    ctx.lineTo(ax2, ay2);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = baseAlpha * (0.26 - 0.18 * t);
    ctx.fill();

    // cone rim edges
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.25;
    ctx.globalAlpha = baseAlpha * (0.6 - 0.35 * t);
    ctx.beginPath();
    ctx.moveTo(ax1, ay1);
    ctx.lineTo(bx1, by1);
    ctx.moveTo(ax2, ay2);
    ctx.lineTo(bx2, by2);
    ctx.stroke();

    // time-step divider at the forecast hour
    ctx.lineWidth = 1;
    ctx.globalAlpha = baseAlpha * (0.5 - 0.3 * t);
    ctx.beginPath();
    ctx.moveTo(bx1, by1);
    ctx.lineTo(bx2, by2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawCycloneForecast(
  ctx,
  projFn,
  eyeX,
  eyeY,
  item,
  color,
  baseAlpha,
  showCone,
  // reducedMotion is reserved for future motion-sensitive details
  // (e.g. animated dash advance). Currently the dashed polyline is
  // static, so the flag has no observable effect here — pass-through.
  // eslint-disable-next-line no-unused-vars
  reducedMotion,
) {
  var d = item.data || {};
  var forecast = d.forecast || [];
  // Project all forecast points
  var fp = [];
  for (var j = 0; j < forecast.length; j++) {
    var f = forecast[j];
    var p = projFn(f.lat, f.lon);
    if (p.z > 0) {
      fp.push({
        x: p.x,
        y: p.y,
        z: p.z,
        errorRadiusNm: f.errorRadiusNm,
        fcstHour: f.fcstHour,
        lat: f.lat,
        lon: f.lon,
      });
    }
  }
  if (fp.length === 0) return;

  // Cone render: official KMZ-derived GeoJSON Polygon when present
  // (server proxies /api/cyclones/:stormId/cone), synthesized error-
  // radius circles otherwise. Both branches respect the showCone flag.
  if (showCone) {
    drawSegmentedCone(ctx, projFn, eyeX, eyeY, fp, color, baseAlpha);
  }

  // Forecast track polyline — eye → forecast points (dashed). The
  // per-point dots that used to live here moved out to
  // drawCycloneForecastPoint(), called from the main points loop, so
  // forecast points participate in the standard hit-test/selection
  // pipeline (synthetic "cyclones-forecast" DataPoints).
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.globalAlpha = baseAlpha * 0.7;
  ctx.beginPath();
  ctx.moveTo(eyeX, eyeY);
  for (var l = 0; l < fp.length; l++) ctx.lineTo(fp[l].x, fp[l].y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

// One forecast-point dot. Called from pointWorker's points loop for
// each "cyclones-forecast" DataPoint. Fade ramps with fcstHour so the
// 5-day point is visibly fainter than the 12-hour point. Selection
// ring matches the cyclones convention. `motion` packs animation/
// selection state so the function stays under the 7-arg cap.
//   motion: { isSelected, t, reducedMotion }
function drawCycloneForecastPoint(ctx, x, y, fcstHour, color, depthAlpha, motion) {
  var fade = 1 - Math.min(1, Math.max(0, fcstHour / 144));
  var s = 2;
  if (motion.isSelected) s = 4;
  ctx.fillStyle = color;
  ctx.globalAlpha = depthAlpha * fade;
  ctx.beginPath();
  ctx.arc(x, y, s, 0, Math.PI * 2);
  ctx.fill();

  if (motion.isSelected) {
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    var ringDelta = motion.reducedMotion ? 0 : Math.sin(motion.t * 2) * 2;
    ctx.beginPath();
    ctx.arc(x, y, s * 2.5 + ringDelta, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

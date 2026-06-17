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

  // Eye dot
  ctx.fillStyle = color;
  ctx.globalAlpha = depthAlpha;
  ctx.beginPath();
  ctx.arc(x, y, s, 0, Math.PI * 2);
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
// [NE, SE, SW, NW]; each is drawn as a filled wedge from the eye. Outer→inner
// (34→64) with an intensity ramp so the strongest band reads on top. nm→px
// uses 60 nm = 1° latitude (same approximation as the synthesized cone).
function drawWindRadii(ctx, projFn, x, y, item, depthAlpha) {
  var wr = item.data && item.data.windRadii;
  if (!wr) return;
  var north = projFn(item.lat + 1, item.lon);
  if (north.z <= 0) return;
  var pxPerNm = Math.hypot(north.x - x, north.y - y) / 60;
  if (!(pxPerNm > 0)) return;

  // canvas angle: 0 = east, positive = clockwise (y-down). NE, SE, SW, NW.
  var QUAD = [
    [-Math.PI / 2, 0],
    [0, Math.PI / 2],
    [Math.PI / 2, Math.PI],
    [Math.PI, (3 * Math.PI) / 2],
  ];
  var BANDS = [
    [wr.kt34, "#ffd24a", 0.1],
    [wr.kt50, "#ff8c42", 0.13],
    [wr.kt64, "#ff5d5d", 0.17],
  ];
  for (var b = 0; b < BANDS.length; b++) {
    var q = BANDS[b][0];
    if (!q) continue;
    ctx.fillStyle = BANDS[b][1];
    ctx.globalAlpha = depthAlpha * BANDS[b][2];
    for (var k = 0; k < 4; k++) {
      var nm = q[k];
      if (!nm || nm <= 0) continue;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, nm * pxPerNm, QUAD[k][0], QUAD[k][1]);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function hasOfficialCone(d) {
  var c = d.officialCone;
  return !!(c?.coordinates?.[0] && c.coordinates[0].length >= 4);
}

function drawOfficialCone(ctx, projFn, cone, color, baseAlpha) {
  var ring = cone.coordinates[0];
  ctx.beginPath();
  var moved = false;
  for (var ri = 0; ri < ring.length; ri++) {
    var pt = ring[ri];
    var rp = projFn(pt[1], pt[0]);
    if (rp.z <= 0) continue;
    if (moved) {
      ctx.lineTo(rp.x, rp.y);
    } else {
      ctx.moveTo(rp.x, rp.y);
      moved = true;
    }
  }
  if (!moved) return;
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = baseAlpha * 0.15;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.globalAlpha = baseAlpha * 0.6;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawSynthesizedCone(ctx, projFn, fp, color, baseAlpha) {
  for (var k = 0; k < fp.length; k++) {
    var fc = fp[k];
    var nearby = projFn(fc.lat + 1, fc.lon);
    if (nearby.z <= 0) continue;
    var pxPerDeg = Math.hypot(nearby.x - fc.x, nearby.y - fc.y);
    var radiusPx = (fc.errorRadiusNm / 60) * pxPerDeg;
    var fadeC = 1 - fc.fcstHour / 144;
    ctx.fillStyle = color;
    ctx.globalAlpha = baseAlpha * 0.12 * fadeC;
    ctx.beginPath();
    ctx.arc(fc.x, fc.y, radiusPx, 0, Math.PI * 2);
    ctx.fill();
  }
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
    if (hasOfficialCone(d)) {
      drawOfficialCone(ctx, projFn, d.officialCone, color, baseAlpha);
    } else {
      drawSynthesizedCone(ctx, projFn, fp, color, baseAlpha);
    }
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

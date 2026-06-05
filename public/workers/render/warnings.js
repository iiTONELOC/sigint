// public/workers/render/warnings.js
//
// Tropical watch/warning area renderer. Loaded by pointWorker.js via
// importScripts. Draws NWS Alerts polygons (Polygon / MultiPolygon, in
// [lon, lat]) as translucent filled regions on the globe / flat map.
//
// Reuses the worker's existing polygon primitives so the clip + fill match
// the coastline exactly:
//   - drawClippedPoly(ctx, pts, gcx, gcy, gr, fill, stroke, alpha)  [globe]
//   - simpleDraw(ctx, pts, fill, stroke, alpha)                      [flat /
//     fully-visible globe ring]
// projFn(lat, lon) -> { x, y, z } is passed in (handles both projections).
//
// Warnings render UNDER the storm marker/cone (called before the point loop
// finishes) so the eye + track stay legible on top.
"use strict";

// Walk one GeoJSON ring ([[lon,lat],...]) into projected screen points.
function projectRing(ring, projFn) {
  var pts = [];
  for (var i = 0; i < ring.length; i++) {
    var c = ring[i];
    if (!c || c.length < 2) continue;
    var lon = c[0],
      lat = c[1];
    if (typeof lat !== "number" || typeof lon !== "number") continue;
    pts.push(projFn(lat, lon));
  }
  return pts;
}

// Draw a single projected ring with globe-aware clipping (mirrors drawLand).
function drawRing(ctx, pts, isFlat, gcx, gcy, gr, fill, stroke, alpha) {
  if (pts.length < 3) return;
  if (isFlat) {
    simpleDraw(ctx, pts, fill, stroke, alpha);
    return;
  }
  var anyVis = false,
    allVis = true;
  for (var i = 0; i < pts.length; i++) {
    if (pts[i].z > 0) anyVis = true;
    else allVis = false;
  }
  if (!anyVis) return;
  if (allVis) simpleDraw(ctx, pts, fill, stroke, alpha);
  else drawClippedPoly(ctx, pts, gcx, gcy, gr, fill, stroke, alpha);
}

// geometry: GeoJSON Polygon or MultiPolygon. Renders the OUTER ring of each
// polygon (holes are rare for these areas and add cost for no visible gain).
function drawWarningGeometry(ctx, geometry, projFn, isFlat, gcx, gcy, gr, fill, stroke, alpha) {
  if (!geometry || typeof geometry !== "object") return;
  var type = geometry.type;
  var coords = geometry.coordinates;
  if (!coords) return;
  if (type === "Polygon") {
    var outer = coords[0];
    if (outer) drawRing(ctx, projectRing(outer, projFn), isFlat, gcx, gcy, gr, fill, stroke, alpha);
  } else if (type === "MultiPolygon") {
    for (var p = 0; p < coords.length; p++) {
      var poly = coords[p];
      if (poly && poly[0]) {
        drawRing(ctx, projectRing(poly[0], projFn), isFlat, gcx, gcy, gr, fill, stroke, alpha);
      }
    }
  }
}

// Public entry: draw all warning/watch features. `features` is the array from
// the "warnings" message; warnColor/watchColor come from the theme.
function drawWarnings(ctx, projFn, features, isFlat, gcx, gcy, gr, warnColor, watchColor) {
  if (!features || features.length === 0) return;
  for (var i = 0; i < features.length; i++) {
    var f = features[i];
    if (!f) continue;
    var isWarn = f.kind === "warning";
    var fill = isWarn ? warnColor : watchColor;
    // Warnings read stronger than watches; both stay translucent so land +
    // the storm track remain visible through them.
    var alpha = isWarn ? 0.22 : 0.14;
    drawWarningGeometry(
      ctx,
      f.geometry,
      projFn,
      isFlat,
      gcx,
      gcy,
      gr,
      fill,
      fill,
      alpha,
    );
  }
}

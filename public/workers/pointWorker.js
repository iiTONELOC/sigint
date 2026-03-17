// ── Complete Rendering Web Worker ──────────────────────────────────────
// Owns an OffscreenCanvas. Renders EVERYTHING: land, ocean, grid, glow,
// rim, points, trails. Main thread only composites the finished bitmap.
// Fetches land data directly from /data/ne_50m_land.json on init.
"use strict";

// ── Projection ──────────────────────────────────────────────────────

function projGlobe(lat, lon, cx, cy, r, ry, rx) {
  var phi = ((90 - lat) * Math.PI) / 180;
  var theta = ((lon + 180) * Math.PI) / 180 + ry;
  var sp = Math.sin(phi),
    cp = Math.cos(phi);
  var st = Math.sin(theta),
    ct = Math.cos(theta);
  var x = -sp * ct,
    y = cp,
    z = sp * st;
  var cX = Math.cos(rx),
    sX = Math.sin(rx);
  return { x: cx + x * r, y: cy - (y * cX - z * sX) * r, z: y * sX + z * cX };
}

function projFlat(lat, lon, cx, cy, w, h) {
  return { x: cx + (lon / 180) * (w / 2), y: cy - (lat / 90) * (h / 2), z: 1 };
}

function getFlatMetrics(W, H, zoom, panX, panY) {
  var mW = W * 0.92 * zoom,
    mH = H * 0.84 * zoom;
  return {
    mW: mW,
    mH: mH,
    mx: (W - mW) / 2 + panX,
    my: (H - mH) / 2 + panY,
    cx: W / 2 + panX,
    cy: H / 2 + panY,
  };
}

// ── Interpolation ───────────────────────────────────────────────────

var DEG = Math.PI / 180;
var EARTH_R = 6371000;
var trailMap = new Map();

function getInterp(id) {
  var e = trailMap.get(id);
  if (!e || e.speedMps <= 0) return null;
  var elapsed = (Date.now() - e.ts) / 1000;
  if (elapsed > 600 || elapsed < 1) return null;
  var hdg = e.heading * DEG;
  var dist = e.speedMps * elapsed;
  var dLat = (dist * Math.cos(hdg)) / EARTH_R / DEG;
  var dLon = (dist * Math.sin(hdg)) / (EARTH_R * Math.cos(e.lat * DEG)) / DEG;
  return { lat: e.lat + dLat, lon: e.lon + dLon };
}

// ── Age/size helpers ────────────────────────────────────────────────

var HR = 3600000,
  DY = 86400000;

function quakeAgeFactor(ts) {
  if (!ts) return 0.5;
  var a = Date.now() - new Date(ts).getTime();
  return a < HR ? 1.0 : a < 6 * HR ? 0.9 : a < DY ? 0.8 : a < 3 * DY ? 0.65 : 0.5;
}
function quakeColor(af, base) {
  return af >= 0.9 ? base : af >= 0.8 ? "#44dd33" : af >= 0.65 ? "#33aa33" : "#2d8835";
}
function quakeSize(m) {
  return m < 1 ? 2 : m < 2 ? 2.5 : m < 3 ? 3.5 : m < 4 ? 5 : m < 5 ? 7 : m < 6 ? 9.5 : m < 7 ? 12 : 15;
}
function eventAgeFactor(ts) {
  if (!ts) return 0.5;
  var a = Date.now() - new Date(ts).getTime();
  return a < HR ? 1.0 : a < 6 * HR ? 0.9 : a < DY ? 0.75 : a < 3 * DY ? 0.6 : 0.45;
}
function eventColor(af, base) {
  return af >= 0.9 ? base : af >= 0.75 ? "#bb3399" : af >= 0.6 ? "#993377" : "#772860";
}
function eventSize(s) {
  return s <= 1 ? 2.5 : s <= 2 ? 3.5 : s <= 3 ? 5 : s <= 4 ? 7 : 9.5;
}

// ── Fire age/size helpers ───────────────────────────────────────────

function fireAgeFactor(ts) {
  if (!ts) return 0.5;
  var a = Date.now() - new Date(ts).getTime();
  return a < HR ? 1.0 : a < 3 * HR ? 0.9 : a < 6 * HR ? 0.8 : a < 12 * HR ? 0.65 : 0.5;
}
function fireColor(af, base) {
  return af >= 0.9 ? base : af >= 0.8 ? "#dd6622" : af >= 0.65 ? "#aa4420" : "#883318";
}
function fireSize(frp) {
  return frp < 1 ? 2 : frp < 5 ? 2.5 : frp < 10 ? 3.5 : frp < 25 ? 5 : frp < 50 ? 7 : frp < 100 ? 9.5 : 12;
}

// ── Weather severity helpers ────────────────────────────────────

var WEATHER_SEV_RANK = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1, Unknown: 0 };
function weatherSize(sev) {
  var r = WEATHER_SEV_RANK[sev] || 0;
  return r >= 4 ? 10 : r >= 3 ? 7 : r >= 2 ? 5 : r >= 1 ? 3.5 : 2.5;
}
function weatherAlpha(sev) {
  var r = WEATHER_SEV_RANK[sev] || 0;
  return r >= 4 ? 1.0 : r >= 3 ? 0.9 : r >= 2 ? 0.75 : 0.6;
}

// ── Aircraft filter ─────────────────────────────────────────────────

function matchesAF(d, f) {
  if (!f.enabled) return false;
  var onGround = d.onGround === true;
  if (!f.showAirborne && !onGround) return false;
  if (!f.showGround && onGround) return false;
  if (f.squawks.length > 0) {
    var sq = d.squawk || "";
    var bucket =
      sq === "7700" ? "7700" : sq === "7600" ? "7600" : sq === "7500" ? "7500" : "other";
    if (f.squawks.indexOf(bucket) === -1) return false;
  }
  if (f.countries.length > 0) {
    if (f.countries.indexOf(d.originCountry || "") === -1) return false;
  }
  return true;
}

// ── Land data ───────────────────────────────────────────────────────

var landPolygons = [];

function parseLandGeoJSON(geojson) {
  var polys = [];
  for (var i = 0; i < geojson.features.length; i++) {
    var geom = geojson.features[i].geometry;
    var rings =
      geom.type === "Polygon"
        ? geom.coordinates
        : geom.type === "MultiPolygon"
          ? geom.coordinates.flat()
          : [];
    for (var j = 0; j < rings.length; j++) {
      var ring = rings[j];
      var converted = [];
      for (var k = 0; k < ring.length; k++) {
        var c = ring[k];
        if (c.length >= 2 && typeof c[0] === "number" && typeof c[1] === "number") {
          converted.push([Math.round(c[1] * 100) / 100, Math.round(c[0] * 100) / 100]);
        }
      }
      if (converted.length >= 3) polys.push(converted);
    }
  }
  return polys;
}

function fetchLandData() {
  fetch("/data/ne_50m_land.json")
    .then(function (res) { return res.json(); })
    .then(function (geojson) { landPolygons = parseLandGeoJSON(geojson); })
    .catch(function (err) { /* Silent fail */ });
}

// ── Land renderer (inlined from landRenderer.ts) ────────────────────

function edgeLerp(a, b) {
  var t = a.z / (a.z - b.z);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function arcPts(cx, cy, r, a1, a2, n) {
  if (!n) n = 12;
  var diff = a2 - a1;
  if (diff > Math.PI) diff -= 2 * Math.PI;
  if (diff < -Math.PI) diff += 2 * Math.PI;
  var out = [];
  for (var i = 1; i <= n; i++) {
    var a = a1 + (diff * i) / n;
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
}

function findReentryPoint(pts, startIndex) {
  var n = pts.length;
  for (var j = 1; j < n; j++) {
    var pi = (startIndex + j) % n;
    var ni = (startIndex + j + 1) % n;
    if (pts[pi].z <= 0 && pts[ni].z > 0) {
      return edgeLerp(pts[pi], pts[ni]);
    }
  }
  return null;
}

function drawClippedPoly(ctx, pts, gcx, gcy, gr, fillColor, strokeColor) {
  var n = pts.length;
  var path = [];
  for (var i = 0; i < n; i++) {
    var curr = pts[i];
    var next = pts[(i + 1) % n];
    var cVis = curr.z > 0;
    var nVis = next.z > 0;
    if (cVis) path.push({ x: curr.x, y: curr.y });
    if (cVis === nVis) continue;
    if (cVis) {
      var exit = edgeLerp(curr, next);
      path.push(exit);
      var reentry = findReentryPoint(pts, i);
      if (reentry) {
        var ea = Math.atan2(exit.y - gcy, exit.x - gcx);
        var ra = Math.atan2(reentry.y - gcy, reentry.x - gcx);
        var arcs = arcPts(gcx, gcy, gr, ea, ra);
        for (var k = 0; k < arcs.length; k++) path.push(arcs[k]);
        path.push(reentry);
      }
    } else {
      var re = edgeLerp(curr, next);
      var last = path.length > 0 ? path[path.length - 1] : null;
      if (!last || Math.abs(last.x - re.x) > 1 || Math.abs(last.y - re.y) > 1) {
        path.push(re);
      }
    }
  }
  if (path.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (var i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.globalAlpha = 0.7;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 0.7;
  ctx.globalAlpha = 0.8;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function simpleDraw(ctx, pts, fillColor, strokeColor) {
  if (pts.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.globalAlpha = 0.7;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 0.7;
  ctx.globalAlpha = 0.8;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawLand(ctx, projFn, colors, isFlat, gcx, gcy, gr) {
  for (var pi = 0; pi < landPolygons.length; pi++) {
    var poly = landPolygons[pi];
    var pts = [];
    for (var i = 0; i < poly.length; i++) {
      var lat = poly[i][0], lon = poly[i][1];
      if (typeof lat === "number" && typeof lon === "number") {
        pts.push(projFn(lat, lon));
      }
    }
    if (pts.length < 3) continue;
    if (isFlat) {
      var segments = [];
      var seg = [];
      for (var i = 0; i < poly.length; i++) {
        var lat = poly[i][0], lon = poly[i][1];
        if (typeof lat !== "number" || typeof lon !== "number") continue;
        if (i > 0) {
          var prevLon = poly[i - 1][1];
          if (typeof prevLon === "number" && Math.abs(lon - prevLon) > 120) {
            if (seg.length >= 3) segments.push(seg);
            seg = [];
          }
        }
        seg.push(projFn(lat, lon));
      }
      if (seg.length >= 3) segments.push(seg);
      for (var s = 0; s < segments.length; s++) {
        simpleDraw(ctx, segments[s], colors.coastFill, colors.coast);
      }
      continue;
    }
    var anyVis = false, allVis = true;
    for (var i = 0; i < pts.length; i++) {
      if (pts[i].z > 0) anyVis = true;
      else allVis = false;
    }
    if (!anyVis) continue;
    if (allVis) { simpleDraw(ctx, pts, colors.coastFill, colors.coast); continue; }
    drawClippedPoly(ctx, pts, gcx, gcy, gr, colors.coastFill, colors.coast);
  }
}

// ── Grid renderer (inlined from gridRenderer.ts) ────────────────────

function drawGrid(ctx, projFn, cfg) {
  ctx.strokeStyle = cfg.accentColor || "#000";
  ctx.globalAlpha = 0.11;
  ctx.lineWidth = 0.4;
  if (cfg.isFlat) {
    var cx = cfg.cx, cy = cfg.cy, mW = cfg.mW, mH = cfg.mH, mx = cfg.mx, my = cfg.my;
    for (var lat = -80; lat <= 80; lat += 20) {
      var y = cy - (lat / 90) * (mH / 2);
      ctx.beginPath(); ctx.moveTo(mx, y); ctx.lineTo(mx + mW, y); ctx.stroke();
    }
    for (var lon = -180; lon < 180; lon += 30) {
      var x = cx + (lon / 180) * (mW / 2);
      ctx.beginPath(); ctx.moveTo(x, my); ctx.lineTo(x, my + mH); ctx.stroke();
    }
  } else {
    for (var lat = -80; lat <= 80; lat += 20) {
      ctx.beginPath();
      var on = false;
      for (var lon = -180; lon <= 180; lon += 3) {
        var p = projFn(lat, lon);
        if (p.z > 0) { if (!on) { ctx.moveTo(p.x, p.y); on = true; } else ctx.lineTo(p.x, p.y); }
        else on = false;
      }
      ctx.stroke();
    }
    for (var lon = -180; lon < 180; lon += 30) {
      ctx.beginPath();
      var on = false;
      for (var lat = -90; lat <= 90; lat += 3) {
        var p = projFn(lat, lon);
        if (p.z > 0) { if (!on) { ctx.moveTo(p.x, p.y); on = true; } else ctx.lineTo(p.x, p.y); }
        else on = false;
      }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

// ── Trail drawing ───────────────────────────────────────────────────

function drawTrail(ctx, projFn, selectedItem, colors, t) {
  if (!selectedItem) return [];
  var trail = selectedItem._trail;
  if (!trail || trail.length < 1) return [];
  var coords = [];
  for (var i = 0; i < trail.length; i++) {
    coords.push({ lat: trail[i].lat, lon: trail[i].lon, point: trail[i] });
  }
  var interp = getInterp(selectedItem.id);
  if (interp) {
    coords.push({ lat: interp.lat, lon: interp.lon, point: { lat: interp.lat, lon: interp.lon, ts: Date.now() } });
  }
  if (coords.length < 2) return [];
  var projected = [];
  for (var i = 0; i < coords.length; i++) {
    var p = projFn(coords[i].lat, coords[i].lon);
    if (p.z > 0) projected.push({ x: p.x, y: p.y, z: p.z, point: coords[i].point });
  }
  if (projected.length < 2) return [];
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = 6;
  for (var i = 1; i < projected.length; i++) {
    var prev = projected[i - 1], curr = projected[i];
    var age = i / projected.length;
    ctx.globalAlpha = 0.05 + age * 0.15;
    ctx.strokeStyle = colors.accent;
    ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(curr.x, curr.y); ctx.stroke();
  }
  ctx.lineWidth = 2.5;
  for (var i = 1; i < projected.length; i++) {
    var prev = projected[i - 1], curr = projected[i];
    var age = i / projected.length;
    ctx.globalAlpha = 0.3 + age * 0.7;
    ctx.strokeStyle = colors.accent;
    ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(curr.x, curr.y); ctx.stroke();
  }
  var hitTargets = [];
  for (var i = 0; i < projected.length - 1; i++) {
    var p = projected[i];
    var age = i / projected.length;
    ctx.globalAlpha = 0.4 + age * 0.6;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
    hitTargets.push({ x: p.x, y: p.y, point: p.point });
  }
  ctx.restore();
  return hitTargets;
}

// ── Canvas + state ──────────────────────────────────────────────────

var canvas = null;
var ctx = null;
var _data = null;
var _colors = null;
var _pendingFrame = null;
var _frameScheduled = false;

// ── Message handler ─────────────────────────────────────────────────

self.onmessage = function (e) {
  var msg = e.data;
  if (msg.type === "init") {
    canvas = msg.canvas;
    ctx = canvas.getContext("2d");
    fetchLandData();
    return;
  }
  if (msg.type === "trails") {
    trailMap = new Map(msg.entries);
    return;
  }
  if (msg.type === "data") {
    _data = msg.payload.data;
    _colors = msg.payload.colors;
    return;
  }
  if (msg.type === "frame") {
    _pendingFrame = msg.payload;
    if (!_frameScheduled) {
      _frameScheduled = true;
      requestAnimationFrame(renderFrame);
    }
    return;
  }
};

// ── Render everything ───────────────────────────────────────────────

function renderFrame() {
  _frameScheduled = false;
  if (!canvas || !ctx || !_data || !_colors || !_pendingFrame) return;

  var p = _pendingFrame;
  _pendingFrame = null;

  var W = p.W, H = p.H, dpr = p.dpr, isFlat = p.isFlat, cam = p.cam;
  var t = p.t;
  var selId = p.selectedId, isoId = p.isolatedId, isoMode = p.isolateMode;
  var layers = p.layers, af = p.aircraftFilter;
  var colors = _colors;
  var data = _data;
  var searchIds = p.searchMatchIds;
  var selectedItem = p.selectedItem;

  var cw = Math.round(W * dpr), ch = Math.round(H * dpr);
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  var cx = W / 2, cy = H / 2;
  var colorMap = {
    ships: colors.ships,
    aircraft: colors.aircraft,
    events: colors.events,
    quakes: colors.quakes,
    fires: colors.fires || "#ff6600",
    weather: colors.weather || "#aa66ff",
  };

  var projFn;
  var fm;
  if (isFlat) {
    fm = getFlatMetrics(W, H, cam.zoomFlat, cam.panX, cam.panY);
    projFn = function (lat, lon) { return projFlat(lat, lon, fm.cx, fm.cy, fm.mW, fm.mH); };
  } else {
    var r = Math.min(W, H) * 0.4 * cam.zoomGlobe;
    projFn = function (lat, lon) { return projGlobe(lat, lon, cx, cy, r, cam.rotY, cam.rotX); };
  }

  // ── Draw static layer ─────────────────────────────────────────
  if (!isFlat) {
    var r = Math.min(W, H) * 0.4 * cam.zoomGlobe;
    var glow = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 1.4);
    glow.addColorStop(0, colors.accent + "0d");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    var bg = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, 0, cx, cy, r);
    bg.addColorStop(0, "#0e1825");
    bg.addColorStop(1, "#060c16");
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = bg; ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2); ctx.clip();
    drawLand(ctx, projFn, colors, false, cx, cy, r - 0.5);
    drawGrid(ctx, projFn, { isFlat: false, accentColor: colors.accent });
  } else {
    ctx.fillStyle = "#081018";
    ctx.fillRect(fm.mx, fm.my, fm.mW, fm.mH);
    ctx.save();
    ctx.beginPath(); ctx.rect(fm.mx, fm.my, fm.mW, fm.mH); ctx.clip();
    drawLand(ctx, projFn, colors, true, 0, 0, 0);
    drawGrid(ctx, projFn, { isFlat: true, cx: cx, cy: cy, mW: fm.mW, mH: fm.mH, mx: fm.mx, my: fm.my, accentColor: colors.accent });
  }

  // ── Project + filter points ───────────────────────────────────
  var isolatedType = null;
  if (isoId && selId) {
    for (var i = 0; i < data.length; i++) {
      if (data[i].id === isoId) { isolatedType = data[i].type; break; }
    }
  }

  var searchSet = searchIds ? new Set(searchIds) : null;
  var pts = [];

  for (var i = 0; i < data.length; i++) {
    var item = data[i];
    if (searchSet && !searchSet.has(item.id)) continue;
    if (isoMode === "solo") { if (item.id !== isoId) continue; }
    else if (isoMode === "focus") { if (isolatedType && item.type !== isolatedType) continue; }

    if (item.type === "aircraft") { if (!matchesAF(item.data, af)) continue; }
    else { if (layers[item.type] === false) continue; }

    var lat = item.lat, lon = item.lon;
    if (item.type === "aircraft" || item.type === "ships") {
      var interp = getInterp(item.id);
      if (interp) { lat = interp.lat; lon = interp.lon; }
    }

    var pt = projFn(lat, lon);
    if (pt.z <= 0) continue;
    pts.push({ x: pt.x, y: pt.y, z: pt.z, item: item });
  }

  if (pts.length > 1 && pts[0].z !== 1) {
    pts.sort(function (a, b) { return a.z - b.z; });
  }

  // ── Draw trail ────────────────────────────────────────────────
  var hitTargets = drawTrail(ctx, projFn, selectedItem, colors, t);
  ctx.globalAlpha = 1;

  // ── Draw points ───────────────────────────────────────────────
  for (var i = 0; i < pts.length; i++) {
    var pt = pts[i];
    var x = pt.x, y = pt.y, z = pt.z, item = pt.item;
    var baseColor = colorMap[item.type] || colors.accent;
    var depthAlpha = 0.4 + z * 0.6;
    var isSel = item.id === selId;

    if (item.type === "quakes") {
      var mag = (item.data && item.data.magnitude) || 0;
      var af2 = quakeAgeFactor(item.timestamp);
      var qc = quakeColor(af2, baseColor);
      var s = quakeSize(mag);
      if (isSel) s *= 1.8;
      if (mag > 2.5) {
        var pi = Math.min(1, (mag - 2.5) / 4.5);
        var pulse = 1 + Math.sin(t + (parseInt(item.id.slice(1), 36) || 0) * 0.7) * (0.15 + pi * 0.35);
        var gr = s * (3 + pi * 2) * pulse;
        var g = ctx.createRadialGradient(x, y, 0, x, y, gr);
        g.addColorStop(0, qc + "50"); g.addColorStop(1, qc + "00");
        ctx.fillStyle = g; ctx.globalAlpha = depthAlpha * af2 * 0.7;
        ctx.beginPath(); ctx.arc(x, y, gr, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = depthAlpha * af2; ctx.fillStyle = qc;
      ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
      if (isSel) {
        ctx.globalAlpha = 0.85; ctx.strokeStyle = qc; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, s * 2.5 + Math.sin(t * 2) * 2, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1; continue;
    }

    if (item.type === "events") {
      var sev = (item.data && item.data.severity) || 1;
      var af2 = eventAgeFactor(item.timestamp);
      var ec = eventColor(af2, baseColor);
      var s = eventSize(sev);
      if (isSel) s *= 1.8;
      if (sev >= 3) {
        var pi = Math.min(1, (sev - 2) / 3);
        var pulse = 1 + Math.sin(t + (parseInt(item.id.slice(2), 36) || 0) * 0.5) * (0.15 + pi * 0.3);
        var gr = s * (3 + pi * 1.5) * pulse;
        var g = ctx.createRadialGradient(x, y, 0, x, y, gr);
        g.addColorStop(0, ec + "40"); g.addColorStop(1, ec + "00");
        ctx.fillStyle = g; ctx.globalAlpha = depthAlpha * af2 * 0.6;
        ctx.beginPath(); ctx.arc(x, y, gr, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = depthAlpha * af2; ctx.fillStyle = ec;
      ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
      if (isSel) {
        ctx.globalAlpha = 0.85; ctx.strokeStyle = ec; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, s * 2.5 + Math.sin(t * 2) * 2, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1; continue;
    }

    if (item.type === "fires") {
      var frp = (item.data && item.data.frp) || 0;
      var af2 = fireAgeFactor(item.timestamp);
      var fc = fireColor(af2, baseColor);
      var s = fireSize(frp);
      if (isSel) s *= 1.8;
      if (frp > 10) {
        var pi = Math.min(1, (frp - 10) / 90);
        var pulse = 1 + Math.sin(t + (parseInt(item.id.slice(2), 36) || 0) * 0.6) * (0.15 + pi * 0.35);
        var gr = s * (3 + pi * 2) * pulse;
        var g = ctx.createRadialGradient(x, y, 0, x, y, gr);
        g.addColorStop(0, fc + "50"); g.addColorStop(1, fc + "00");
        ctx.fillStyle = g; ctx.globalAlpha = depthAlpha * af2 * 0.7;
        ctx.beginPath(); ctx.arc(x, y, gr, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = depthAlpha * af2; ctx.fillStyle = fc;
      ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
      if (isSel) {
        ctx.globalAlpha = 0.85; ctx.strokeStyle = fc; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, s * 2.5 + Math.sin(t * 2) * 2, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1; continue;
    }

    if (item.type === "weather") {
      var wsev = (item.data && item.data.severity) || "Unknown";
      var walpha = weatherAlpha(wsev);
      var s = weatherSize(wsev);
      if (isSel) s *= 1.8;
      var wrank = WEATHER_SEV_RANK[wsev] || 0;
      if (wrank >= 3) {
        var pi = Math.min(1, (wrank - 2) / 2);
        var pulse = 1 + Math.sin(t + (parseInt(item.id.slice(2), 36) || 0) * 0.5) * (0.15 + pi * 0.35);
        var gr = s * (3 + pi * 2) * pulse;
        var g = ctx.createRadialGradient(x, y, 0, x, y, gr);
        g.addColorStop(0, baseColor + "50"); g.addColorStop(1, baseColor + "00");
        ctx.fillStyle = g; ctx.globalAlpha = depthAlpha * walpha * 0.7;
        ctx.beginPath(); ctx.arc(x, y, gr, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = depthAlpha * walpha; ctx.fillStyle = baseColor;
      ctx.beginPath();
      ctx.moveTo(x, y - s * 1.2); ctx.lineTo(x + s * 0.8, y);
      ctx.lineTo(x, y + s * 1.2); ctx.lineTo(x - s * 0.8, y);
      ctx.closePath(); ctx.fill();
      if (isSel) {
        ctx.globalAlpha = 0.85; ctx.strokeStyle = baseColor; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, s * 2.5 + Math.sin(t * 2) * 2, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1; continue;
    }

    if (item.type === "ships") {
      var s = 3.5;
      if (isSel) s *= 1.8;
      ctx.globalAlpha = depthAlpha; ctx.fillStyle = baseColor;
      var a = (((item.data && item.data.heading) || 0) * Math.PI) / 180;
      var hw = s * 0.7;
      ctx.beginPath();
      ctx.moveTo(x + Math.sin(a) * s * 1.4, y - Math.cos(a) * s * 1.4);
      ctx.lineTo(x + Math.sin(a + Math.PI / 2) * hw, y - Math.cos(a + Math.PI / 2) * hw);
      ctx.lineTo(x + Math.sin(a + Math.PI) * s * 0.8, y - Math.cos(a + Math.PI) * s * 0.8);
      ctx.lineTo(x + Math.sin(a - Math.PI / 2) * hw, y - Math.cos(a - Math.PI / 2) * hw);
      ctx.closePath(); ctx.fill();
      if (isSel) {
        ctx.globalAlpha = 0.85; ctx.strokeStyle = baseColor; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, s * 2.5 + Math.sin(t * 2) * 2, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1; continue;
    }

    // Aircraft
    var s = 4;
    if (isSel) s *= 1.8;
    ctx.globalAlpha = depthAlpha;
    var status = item.data && item.data.squawkStatus;
    ctx.fillStyle = status === "emergency" ? "#ff3333" : status === "radio_failure" ? "#ff8800" : status === "hijack" ? "#cc44ff" : baseColor;
    var a = (((item.data && item.data.heading) || 0) * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(x + Math.sin(a) * s * 1.6, y - Math.cos(a) * s * 1.6);
    ctx.lineTo(x + Math.sin(a + 2.4) * s, y - Math.cos(a + 2.4) * s);
    ctx.lineTo(x + Math.sin(a - 2.4) * s, y - Math.cos(a - 2.4) * s);
    ctx.closePath(); ctx.fill();
    if (isSel) {
      ctx.globalAlpha = 0.85; ctx.strokeStyle = baseColor; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, s * 2.5 + Math.sin(t * 2) * 2, 0, Math.PI * 2); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // ── Restore clip and draw rim/border ──────────────────────────
  ctx.restore();

  if (!isFlat) {
    var r = Math.min(W, H) * 0.4 * cam.zoomGlobe;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = colors.accent + "1f"; ctx.lineWidth = 1.5; ctx.stroke();
  } else {
    ctx.strokeStyle = colors.accent + "1a"; ctx.lineWidth = 1;
    ctx.strokeRect(fm.mx, fm.my, fm.mW, fm.mH);
    ctx.globalAlpha = 1; ctx.fillStyle = colors.dim;
    var baseFontSize = Math.max(8, Math.min(W, H) * 0.015);
    ctx.font = baseFontSize + "px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    for (var lon = -120; lon <= 120; lon += 60) {
      ctx.fillText(Math.abs(lon) + "\u00B0" + (lon >= 0 ? "E" : "W"), fm.cx + (lon / 180) * (fm.mW / 2), fm.my + fm.mH + 13);
    }
    ctx.textAlign = "right";
    for (var lat = -60; lat <= 60; lat += 30) {
      ctx.fillText(Math.abs(lat) + "\u00B0" + (lat >= 0 ? "N" : "S"), fm.mx - 5, fm.cy - (lat / 90) * (fm.mH / 2) + 3);
    }
  }

  var bitmap = canvas.transferToImageBitmap();
  self.postMessage({ type: "frame", bitmap: bitmap, hitTargets: hitTargets }, [bitmap]);
}

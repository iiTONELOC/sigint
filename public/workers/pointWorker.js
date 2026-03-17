// ── Point Rendering Web Worker ─────────────────────────────────────────
// Owns an OffscreenCanvas. Main thread sends data + camera state.
// Worker projects, filters, sorts, draws, transfers bitmap back.
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
  return a < HR
    ? 1.0
    : a < 6 * HR
      ? 0.9
      : a < DY
        ? 0.8
        : a < 3 * DY
          ? 0.65
          : 0.5;
}

function quakeColor(af, base) {
  return af >= 0.9
    ? base
    : af >= 0.8
      ? "#44dd33"
      : af >= 0.65
        ? "#33aa33"
        : "#2d8835";
}

function quakeSize(m) {
  return m < 1
    ? 2
    : m < 2
      ? 2.5
      : m < 3
        ? 3.5
        : m < 4
          ? 5
          : m < 5
            ? 7
            : m < 6
              ? 9.5
              : m < 7
                ? 12
                : 15;
}

function eventAgeFactor(ts) {
  if (!ts) return 0.5;
  var a = Date.now() - new Date(ts).getTime();
  return a < HR
    ? 1.0
    : a < 6 * HR
      ? 0.9
      : a < DY
        ? 0.75
        : a < 3 * DY
          ? 0.6
          : 0.45;
}

function eventColor(af, base) {
  return af >= 0.9
    ? base
    : af >= 0.75
      ? "#dd8833"
      : af >= 0.6
        ? "#aa6633"
        : "#885530";
}

function eventSize(s) {
  return s <= 1 ? 2.5 : s <= 2 ? 3.5 : s <= 3 ? 5 : s <= 4 ? 7 : 9.5;
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
      sq === "7700"
        ? "7700"
        : sq === "7600"
          ? "7600"
          : sq === "7500"
            ? "7500"
            : "other";
    if (f.squawks.indexOf(bucket) === -1) return false;
  }
  if (f.countries.length > 0) {
    if (f.countries.indexOf(d.originCountry || "") === -1) return false;
  }
  return true;
}

// ── Canvas state ────────────────────────────────────────────────────

var canvas = null;
var ctx = null;

// ── Stored state from "data" messages ───────────────────────────────
var _data = null;
var _layers = null;
var _af = null;
var _selId = null;
var _isoId = null;
var _isoMode = null;
var _searchIds = null;
var _selectedItem = null;
var _colors = null;

// ── Trail drawing ───────────────────────────────────────────────────

function drawTrail(projFn, selectedItem, colors, t) {
  if (!selectedItem || !ctx) return;
  var trail = selectedItem._trail;
  if (!trail || trail.length < 1) return;

  var coords = [];
  for (var i = 0; i < trail.length; i++) {
    coords.push({ lat: trail[i].lat, lon: trail[i].lon, point: trail[i] });
  }

  // Add interpolated current position
  var interp = getInterp(selectedItem.id);
  if (interp) {
    coords.push({
      lat: interp.lat,
      lon: interp.lon,
      point: { lat: interp.lat, lon: interp.lon, ts: Date.now() },
    });
  }

  if (coords.length < 2) return;

  var projected = [];
  for (var i = 0; i < coords.length; i++) {
    var p = projFn(coords[i].lat, coords[i].lon);
    if (p.z > 0)
      projected.push({ x: p.x, y: p.y, z: p.z, point: coords[i].point });
  }

  if (projected.length < 2) return;

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Glow pass
  ctx.lineWidth = 6;
  for (var i = 1; i < projected.length; i++) {
    var prev = projected[i - 1];
    var curr = projected[i];
    var age = i / projected.length;
    ctx.globalAlpha = 0.05 + age * 0.15;
    ctx.strokeStyle = colors.accent;
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(curr.x, curr.y);
    ctx.stroke();
  }

  // Main line
  ctx.lineWidth = 2.5;
  for (var i = 1; i < projected.length; i++) {
    var prev = projected[i - 1];
    var curr = projected[i];
    var age = i / projected.length;
    ctx.globalAlpha = 0.3 + age * 0.7;
    ctx.strokeStyle = colors.accent;
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(curr.x, curr.y);
    ctx.stroke();
  }

  // Waypoint dots
  var hitTargets = [];
  for (var i = 0; i < projected.length - 1; i++) {
    var p = projected[i];
    var age = i / projected.length;
    ctx.globalAlpha = 0.4 + age * 0.6;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
    hitTargets.push({ x: p.x, y: p.y, point: p.point });
  }

  ctx.restore();

  // Send hit targets back for click detection on main thread
  return hitTargets;
}

// ── Message handler ─────────────────────────────────────────────────

self.onmessage = function (e) {
  var msg = e.data;

  if (msg.type === "init") {
    canvas = msg.canvas;
    ctx = canvas.getContext("2d");
    return;
  }

  if (msg.type === "trails") {
    trailMap = new Map(msg.entries);
    return;
  }

  // ── Heavy data update — stored, not rendered immediately ──────
  if (msg.type === "data") {
    var dp = msg.payload;
    _data = dp.data;
    _layers = dp.layers;
    _af = dp.aircraftFilter;
    _selId = dp.selectedId;
    _isoId = dp.isolatedId;
    _isoMode = dp.isolateMode;
    _searchIds = dp.searchMatchIds;
    _selectedItem = dp.selectedItem;
    _colors = dp.colors;
    return;
  }

  // ── Light frame update — camera + timing, renders using stored data ──
  if (msg.type === "frame") {
    if (!canvas || !ctx || !_data || !_colors) return;

    var p = msg.payload;
    var W = p.W,
      H = p.H,
      dpr = p.dpr,
      isFlat = p.isFlat,
      cam = p.cam;
    var t = p.t;
    var selId = _selId,
      isoId = _isoId,
      isoMode = _isoMode;
    var layers = _layers,
      af = _af,
      colors = _colors;
    var data = _data,
      searchIds = _searchIds;
    var selectedItem = _selectedItem;

    // Resize if needed
    var cw = Math.round(W * dpr),
      ch = Math.round(H * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    var colorMap = {
      ships: colors.ships,
      aircraft: colors.aircraft,
      events: colors.events,
      quakes: colors.quakes,
    };

    // Determine isolated type
    var isolatedType = null;
    if (isoId && selId) {
      for (var i = 0; i < data.length; i++) {
        if (data[i].id === isoId) {
          isolatedType = data[i].type;
          break;
        }
      }
    }

    var searchSet = searchIds ? new Set(searchIds) : null;

    // Build projection function
    var cx = W / 2,
      cy = H / 2;
    var projFn;
    if (isFlat) {
      var fm = getFlatMetrics(W, H, cam.zoomFlat, cam.panX, cam.panY);
      projFn = function (lat, lon) {
        return projFlat(lat, lon, fm.cx, fm.cy, fm.mW, fm.mH);
      };
    } else {
      var r = Math.min(W, H) * 0.4 * cam.zoomGlobe;
      projFn = function (lat, lon) {
        return projGlobe(lat, lon, cx, cy, r, cam.rotY, cam.rotX);
      };
    }

    // ── Project + filter ────────────────────────────────────────
    var pts = [];

    for (var i = 0; i < data.length; i++) {
      var item = data[i];
      if (searchSet && !searchSet.has(item.id)) continue;

      if (isoMode === "solo") {
        if (item.id !== isoId) continue;
      } else if (isoMode === "focus") {
        if (isolatedType && item.type !== isolatedType) continue;
      }

      if (item.type === "aircraft") {
        if (!matchesAF(item.data, af)) continue;
      } else {
        if (layers[item.type] === false) continue;
      }

      var lat = item.lat;
      var lon = item.lon;
      if (item.type === "aircraft" || item.type === "ships") {
        var interp = getInterp(item.id);
        if (interp) {
          lat = interp.lat;
          lon = interp.lon;
        }
      }

      var pt = projFn(lat, lon);
      if (pt.z <= 0) continue;
      pts.push({ x: pt.x, y: pt.y, z: pt.z, item: item });
    }

    // Sort in globe mode only
    if (pts.length > 1 && pts[0].z !== 1) {
      pts.sort(function (a, b) {
        return a.z - b.z;
      });
    }

    // ── Apply clip region ─────────────────────────────────────────
    var clip = p.clip;
    if (clip) {
      ctx.save();
      ctx.beginPath();
      if (clip.type === "globe") {
        ctx.arc(clip.cx, clip.cy, clip.r, 0, Math.PI * 2);
      } else {
        ctx.rect(clip.mx, clip.my, clip.mW, clip.mH);
      }
      ctx.clip();
    }

    // ── Draw trail ──────────────────────────────────────────────
    var hitTargets = drawTrail(projFn, selectedItem, colors, t) || [];

    ctx.globalAlpha = 1;

    // ── Draw points ─────────────────────────────────────────────
    for (var i = 0; i < pts.length; i++) {
      var pt = pts[i];
      var x = pt.x,
        y = pt.y,
        z = pt.z,
        item = pt.item;
      var baseColor = colorMap[item.type] || colors.accent;
      var depthAlpha = 0.4 + z * 0.6;
      var isSel = item.id === selId;

      // ── Quakes ────────────────────────────────────────────
      if (item.type === "quakes") {
        var mag = (item.data && item.data.magnitude) || 0;
        var af2 = quakeAgeFactor(item.timestamp);
        var qc = quakeColor(af2, baseColor);
        var s = quakeSize(mag);
        if (isSel) s *= 1.8;

        if (mag > 2.5) {
          var pi = Math.min(1, (mag - 2.5) / 4.5);
          var pulse =
            1 +
            Math.sin(t + (parseInt(item.id.slice(1), 36) || 0) * 0.7) *
              (0.15 + pi * 0.35);
          var gr = s * (3 + pi * 2) * pulse;
          var g = ctx.createRadialGradient(x, y, 0, x, y, gr);
          g.addColorStop(0, qc + "50");
          g.addColorStop(1, qc + "00");
          ctx.fillStyle = g;
          ctx.globalAlpha = depthAlpha * af2 * 0.7;
          ctx.beginPath();
          ctx.arc(x, y, gr, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.globalAlpha = depthAlpha * af2;
        ctx.fillStyle = qc;
        ctx.beginPath();
        ctx.arc(x, y, s, 0, Math.PI * 2);
        ctx.fill();

        if (isSel) {
          ctx.globalAlpha = 0.85;
          ctx.strokeStyle = qc;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, y, s * 2.5 + Math.sin(t * 2) * 2, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        continue;
      }

      // ── Events ────────────────────────────────────────────
      if (item.type === "events") {
        var sev = (item.data && item.data.severity) || 1;
        var af2 = eventAgeFactor(item.timestamp);
        var ec = eventColor(af2, baseColor);
        var s = eventSize(sev);
        if (isSel) s *= 1.8;

        if (sev >= 3) {
          var pi = Math.min(1, (sev - 2) / 3);
          var pulse =
            1 +
            Math.sin(t + (parseInt(item.id.slice(2), 36) || 0) * 0.5) *
              (0.15 + pi * 0.3);
          var gr = s * (3 + pi * 1.5) * pulse;
          var g = ctx.createRadialGradient(x, y, 0, x, y, gr);
          g.addColorStop(0, ec + "40");
          g.addColorStop(1, ec + "00");
          ctx.fillStyle = g;
          ctx.globalAlpha = depthAlpha * af2 * 0.6;
          ctx.beginPath();
          ctx.arc(x, y, gr, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.globalAlpha = depthAlpha * af2;
        ctx.fillStyle = ec;
        ctx.beginPath();
        ctx.arc(x, y, s, 0, Math.PI * 2);
        ctx.fill();

        if (isSel) {
          ctx.globalAlpha = 0.85;
          ctx.strokeStyle = ec;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, y, s * 2.5 + Math.sin(t * 2) * 2, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        continue;
      }

      // ── Ships ─────────────────────────────────────────────
      if (item.type === "ships") {
        var s = 3.5;
        if (isSel) s *= 1.8;

        ctx.globalAlpha = depthAlpha;
        ctx.fillStyle = baseColor;

        var a = (((item.data && item.data.heading) || 0) * Math.PI) / 180;
        var hw = s * 0.7;
        ctx.beginPath();
        ctx.moveTo(x + Math.sin(a) * s * 1.4, y - Math.cos(a) * s * 1.4);
        ctx.lineTo(
          x + Math.sin(a + Math.PI / 2) * hw,
          y - Math.cos(a + Math.PI / 2) * hw,
        );
        ctx.lineTo(
          x + Math.sin(a + Math.PI) * s * 0.8,
          y - Math.cos(a + Math.PI) * s * 0.8,
        );
        ctx.lineTo(
          x + Math.sin(a - Math.PI / 2) * hw,
          y - Math.cos(a - Math.PI / 2) * hw,
        );
        ctx.closePath();
        ctx.fill();

        if (isSel) {
          ctx.globalAlpha = 0.85;
          ctx.strokeStyle = baseColor;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, y, s * 2.5 + Math.sin(t * 2) * 2, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        continue;
      }

      // ── Aircraft ──────────────────────────────────────────
      var s = 4;
      if (isSel) s *= 1.8;

      ctx.globalAlpha = depthAlpha;
      var status = item.data && item.data.squawkStatus;
      ctx.fillStyle =
        status === "emergency"
          ? "#ff3333"
          : status === "radio_failure"
            ? "#ff8800"
            : status === "hijack"
              ? "#cc44ff"
              : baseColor;

      var a = (((item.data && item.data.heading) || 0) * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(x + Math.sin(a) * s * 1.6, y - Math.cos(a) * s * 1.6);
      ctx.lineTo(x + Math.sin(a + 2.4) * s, y - Math.cos(a + 2.4) * s);
      ctx.lineTo(x + Math.sin(a - 2.4) * s, y - Math.cos(a - 2.4) * s);
      ctx.closePath();
      ctx.fill();

      if (isSel) {
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = baseColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, s * 2.5 + Math.sin(t * 2) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // Restore clip
    if (clip) {
      ctx.restore();
    }

    // Transfer bitmap to main thread
    var bitmap = canvas.transferToImageBitmap();
    self.postMessage(
      { type: "frame", bitmap: bitmap, hitTargets: hitTargets },
      [bitmap],
    );
  }
};

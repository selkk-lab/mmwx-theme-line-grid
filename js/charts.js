(function (global) {
  function n(v) { return Number.isFinite(v) ? v : 0; }

  function token(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function parseColor(v) {
    v = String(v || "").trim();
    const rgb = v.match(/rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/i);
    if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    let hex = v.replace("#", "");
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (/^[0-9a-f]{6}$/i.test(hex)) {
      const n = parseInt(hex, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    return null;
  }

  function isLight() {
    return document.documentElement.getAttribute("data-theme") === "light";
  }

  function inkRgba(a) {
    const p = parseColor(token("--ink", "#d5d0c4"));
    if (!p) return "rgba(213,208,196," + a + ")";
    return "rgba(" + p[0] + "," + p[1] + "," + p[2] + "," + a + ")";
  }

  function gold() { return token("--gold", "#c4a56a"); }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function spark(values, opt) {
    opt = opt || {};
    const w = opt.w || 240;
    const h = opt.h || 40;
    const raw = values || [];
    const pts = raw.map(function (v) { return typeof v === "object" && v ? n(v.v) : n(v); });
    if (!pts.length) return "";
    const usable = pts.filter(function (v) { return v >= 0; });
    const dataMax = Math.max.apply(null, usable.length ? usable : [0]);
    function niceMax(m) {
      if (m <= 50) return 50;
      if (m <= 100) return 100;
      if (m <= 200) return 200;
      if (m <= 500) return 500;
      return Math.ceil(m / 100) * 100;
    }
    const min = Number.isFinite(opt.min) ? opt.min : 0;
    const max = Number.isFinite(opt.max) && opt.max > min ? opt.max : niceMax(dataMax);
    const span = Math.max(1, max - min);
    const padX = 2;
    const padY = 6;
    const step = pts.length === 1 ? 0 : (w - padX * 2) / (pts.length - 1);
    const coords = pts.map(function (v, i) {
      const x = padX + i * step;
      const y = h - padY - ((v < 0 ? min : v) - min) / span * (h - padY * 2);
      return [x, y];
    });
    const runs = (global.ProbeAdapt && ProbeAdapt.sparkRuns)
      ? ProbeAdapt.sparkRuns(pts)
      : (usable.length ? [[0, pts.length - 1]] : []);
    let d = "";
    let area = "";
    const baseY = (h - padY).toFixed(2);
    runs.forEach(function (run) {
      let seg = "";
      for (let i = run[0]; i <= run[1]; i += 1) {
        const p = coords[i];
        seg += (i === run[0] ? "M " : " L ") + p[0].toFixed(2) + " " + p[1].toFixed(2);
      }
      if (!seg) return;
      d += (d ? " " : "") + seg;
      const first = coords[run[0]];
      const lastPt = coords[run[1]];
      area += '<path class="spark-fill" d="' + seg + " L " + lastPt[0].toFixed(2) + " " + baseY + " L " + first[0].toFixed(2) + " " + baseY + ' Z" fill="' + inkRgba(0.08) + '" stroke="none"/>';
    });
    const lastRun = runs[runs.length - 1];
    const last = lastRun ? coords[lastRun[1]] : coords[coords.length - 1];
    const color = opt.color || token("--ink", "#d5d0c4");
    const hitW = Math.max(6, step || w);
    const hits = coords.map(function (p, i) {
      const tip = (opt.tips && opt.tips[i]) || (pts[i] < 0 ? "无数据" : pts[i] + " ms");
      return '<rect class="chart-hit" data-tip="' + esc(tip) + '" x="' + (p[0] - hitW / 2).toFixed(2) + '" y="0" width="' + hitW.toFixed(2) + '" height="' + h + '" fill="transparent"/>';
    }).join("");
    const innerH = h - padY * 2;
    let grid = "";
    [0, 0.5, 1].forEach(function (t) {
      const y = (h - padY - t * innerH).toFixed(2);
      grid += '<line class="spark-grid" x1="' + padX + '" y1="' + y + '" x2="' + (w - padX) + '" y2="' + y + '" stroke="' + inkRgba(t === 0 ? 0.16 : 0.08) + '" stroke-width="0.6"/>';
    });
    const packed = coords.map(function (p, i) {
      return p[0].toFixed(2) + "," + p[1].toFixed(2) + "," + pts[i];
    }).join(";");
    const dot = last && usable.length
      ? '<circle cx="' + last[0].toFixed(2) + '" cy="' + last[1].toFixed(2) + '" r="1.7" fill="' + color + '"/>'
      : "";
    return (
      '<svg class="spark" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" data-pts="' + packed + '">' +
        grid + area +
        (d ? '<path class="spark-line" d="' + d + '" fill="none" stroke="' + color + '" stroke-width="1.25" vector-effect="non-scaling-stroke"/>' : "") +
        dot +
        '<g class="scope-cur" hidden>' +
          '<line class="scope-v" x1="0" y1="0" x2="0" y2="' + h + '" stroke="' + color + '" stroke-width="0.8" opacity="0.55"/>' +
          '<circle class="scope-dot" cx="0" cy="0" r="2.4" fill="none" stroke="' + color + '" stroke-width="1"/>' +
        "</g>" +
        hits +
      "</svg>"
    );
  }

  function bars(items, opt) {
    opt = opt || {};
    const w = opt.w || 240;
    const h = opt.h || 56;
    const list = items || [];
    const vals = list.map(function (it) { return typeof it === "number" ? it : n(it.total); });
    const max = Math.max.apply(null, vals.concat([1]));
    const gap = 6;
    const bw = (w - gap * (vals.length + 1)) / Math.max(vals.length, 1);
    const color = opt.color || inkRgba(isLight() ? 0.58 : 0.4);
    const last = gold();
    const rects = vals.map(function (v, i) {
      const bh = Math.max(2, (v / max) * (h - 8));
      const x = gap + i * (bw + gap);
      const y = h - bh;
      const fill = i === vals.length - 1 ? last : color;
      const tip = (opt.tips && opt.tips[i]) || (list[i] && list[i].tip) || String(v);
      return '<rect class="chart-hit" data-tip="' + esc(tip) + '" x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + Math.max(2, bw).toFixed(2) + '" height="' + bh.toFixed(2) + '" fill="' + fill + '"/>';
    }).join("");
    return '<svg class="bars" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none">' + rects + "</svg>";
  }

  function wave(opt) {
    opt = opt || {};
    const w = opt.w || 420;
    const h = opt.h || 72;
    const mid = h / 2;
    let d = "M 0 " + mid;
    const cycles = 2.15;
    for (let x = 0; x <= w; x += 2) {
      const t = x / w;
      const env = t > 0.58 && t < 0.86 ? Math.sin((t - 0.58) / 0.28 * Math.PI) : 0;
      const y = mid - Math.sin(t * Math.PI * 2 * cycles) * 18 * env;
      d += " L " + x + " " + y.toFixed(2);
    }
    return (
      '<svg class="wave" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" aria-hidden="true">' +
        '<path d="' + d + '" fill="none" stroke="' + inkRgba(0.4) + '" stroke-width="1.1"/>' +
      "</svg>"
    );
  }

  function stacked(items, opt) {
    opt = opt || {};
    const w = opt.w || 320;
    const h = opt.h || 80;
    const list = items || [];
    const downs = list.map(function (it) { return n(it.downlink || it.total); });
    const ups = list.map(function (it) { return n(it.uplink); });
    const max = Math.max.apply(null, downs.map(function (d, i) { return d + ups[i]; }).concat([1]));
    const slot = w / Math.max(downs.length, 1);
    const bw = Math.max(2, Math.min(slot * 0.56, 64));
    const base = h - 1;
    let grid = "";
    [0.5, 1].forEach(function (t) {
      const y = (base - t * (base - 8)).toFixed(2);
      grid += '<line x1="0" y1="' + y + '" x2="' + w + '" y2="' + y + '" stroke="' + inkRgba(0.07) + '" stroke-width="1" vector-effect="non-scaling-stroke"/>';
    });
    return '<svg class="bars" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none">' + grid + downs.map(function (d, i) {
      const up = ups[i];
      const bhD = Math.max(1, (d / max) * (base - 8));
      const bhU = up > 0 ? Math.max(1, (up / max) * (base - 8)) : 0;
      const x = i * slot + (slot - bw) / 2;
      const tip = (opt.tips && opt.tips[i]) || "";
      return '<rect class="chart-hit" data-tip="' + esc(tip) + '" x="' + x.toFixed(2) + '" y="' + (base - bhD).toFixed(2) + '" width="' + bw.toFixed(2) + '" height="' + bhD.toFixed(2) + '" fill="' + inkRgba(isLight() ? 0.34 : 0.3) + '"/>' +
        '<rect class="chart-hit" data-tip="' + esc(tip) + '" x="' + x.toFixed(2) + '" y="' + (base - bhD - bhU).toFixed(2) + '" width="' + bw.toFixed(2) + '" height="' + bhU.toFixed(2) + '" fill="' + gold() + '" fill-opacity=".85"/>';
    }).join("") + '<line x1="0" y1="' + base + '" x2="' + w + '" y2="' + base + '" stroke="' + inkRgba(0.22) + '" stroke-width="1" vector-effect="non-scaling-stroke"/></svg>';
  }

  // Daily bars share the hit-strip's equal columns; the curve is the month-to-date running total.
  function ruler(today, daysInMonth, opt) {
    opt = opt || {};
    const heights = opt.heights || [];
    const selected = opt.selected || today;
    const half = opt.halfDay;
    const count = Math.max(1, daysInMonth);
    const w = 1000, h = 100, top = 8, base = 96;
    const slot = w / count;
    const maxH = Math.max.apply(null, heights.slice(0, today).concat([1]));
    const total = heights.slice(0, today).reduce(function (a, b) { return a + (b || 0); }, 0);
    let grid = "", bars = "", line = "", acc = 0;
    [0, 0.5, 1].forEach(function (t) {
      const y = (base - t * (base - top)).toFixed(1);
      grid += '<line x1="0" y1="' + y + '" x2="' + w + '" y2="' + y + '" stroke="' + inkRgba(t ? 0.07 : 0.18) + '" stroke-width="1" vector-effect="non-scaling-stroke"/>';
    });
    for (let d = 1; d <= count; d += 1) {
      const cx = (d - 0.5) * slot, bw = Math.max(2, slot * 0.56), v = n(heights[d - 1]);
      const future = d > today;
      const bh = future ? 2 : Math.max(v ? 3 : 1, v / maxH * (base - top) * 0.9);
      const fill = d === selected ? gold() : future ? inkRgba(0.07) : inkRgba(isLight() ? 0.3 : 0.26);
      bars += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + (base - bh).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" fill="' + fill + '"/>';
      if (!future && total > 0) {
        acc += v;
        line += (line ? " L " : "M ") + cx.toFixed(1) + " " + (base - acc / total * (base - top)).toFixed(1);
      }
    }
    const tx = ((Math.min(today, count) - 0.5) * slot).toFixed(1);
    const todayMark = '<line x1="' + tx + '" y1="0" x2="' + tx + '" y2="' + base + '" stroke="' + inkRgba(0.28) + '" stroke-width="1" stroke-dasharray="2 3" vector-effect="non-scaling-stroke"/>';
    const hx = half ? ((half - 0.5) * slot).toFixed(1) : null;
    const halfMark = hx ? '<line x1="' + hx + '" y1="' + ((base + top) / 2 - 7).toFixed(1) + '" x2="' + hx + '" y2="' + ((base + top) / 2 + 7).toFixed(1) + '" stroke="' + token("--live", "#8fa676") + '" stroke-width="2" vector-effect="non-scaling-stroke"/>' : "";
    const curve = line ? '<path d="' + line + '" fill="none" stroke="' + token("--live", "#8fa676") + '" stroke-width="1.4" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>' : "";
    return '<svg class="ruler-svg" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" aria-hidden="true">' + grid + bars + todayMark + curve + halfMark + "</svg>";
  }

  global.ProbeCharts = { spark: spark, bars: bars, stacked: stacked, wave: wave, ruler: ruler };
})(window);

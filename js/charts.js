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
  function voidFill() { return token("--void", "#0c0c0c"); }

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
    const min = 0;
    const max = niceMax(dataMax);
    const span = Math.max(1, max - min);
    const padX = 2;
    const padY = 6;
    const step = pts.length === 1 ? 0 : (w - padX * 2) / (pts.length - 1);
    const coords = pts.map(function (v, i) {
      const x = padX + i * step;
      const y = h - padY - ((v < 0 ? min : v) - min) / span * (h - padY * 2);
      return [x, y];
    });
    let d = "";
    coords.forEach(function (p, i) {
      d += (i ? " L " : "M ") + p[0].toFixed(2) + " " + p[1].toFixed(2);
    });
    const last = coords[coords.length - 1];
    const first = coords[0];
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
    const area = d
      ? '<path class="spark-fill" d="' + d + " L " + last[0].toFixed(2) + " " + (h - padY).toFixed(2) + " L " + first[0].toFixed(2) + " " + (h - padY).toFixed(2) + ' Z" fill="' + inkRgba(0.08) + '" stroke="none"/>'
      : "";
    const packed = coords.map(function (p, i) {
      return p[0].toFixed(2) + "," + p[1].toFixed(2) + "," + pts[i];
    }).join(";");
    return (
      '<svg class="spark" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" data-pts="' + packed + '">' +
        grid + area +
        '<path class="spark-line" d="' + d + '" fill="none" stroke="' + color + '" stroke-width="1.25" vector-effect="non-scaling-stroke"/>' +
        '<circle cx="' + last[0].toFixed(2) + '" cy="' + last[1].toFixed(2) + '" r="1.7" fill="' + color + '"/>' +
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
    const gap = 7;
    const bw = (w - gap * (downs.length + 1)) / Math.max(downs.length, 1);
    return '<svg class="bars" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none">' + downs.map(function (d, i) {
      const up = ups[i];
      const bhD = Math.max(1, (d / max) * (h - 8));
      const bhU = Math.max(1, (up / max) * (h - 8));
      const x = gap + i * (bw + gap);
      const tip = (opt.tips && opt.tips[i]) || "";
      return '<rect class="chart-hit" data-tip="' + esc(tip) + '" x="' + x.toFixed(2) + '" y="' + (h - bhD).toFixed(2) + '" width="' + Math.max(2, bw).toFixed(2) + '" height="' + bhD.toFixed(2) + '" fill="' + inkRgba(0.4) + '"/>' +
        '<rect class="chart-hit" data-tip="' + esc(tip) + '" x="' + x.toFixed(2) + '" y="' + (h - bhD - bhU).toFixed(2) + '" width="' + Math.max(2, bw).toFixed(2) + '" height="' + bhU.toFixed(2) + '" fill="' + gold() + '"/>';
    }).join("") + "</svg>";
  }

  function ruler(today, daysInMonth, opt) {
    opt = opt || {};
    const heights = opt.heights || [];
    const selected = opt.selected || today;
    const half = opt.halfDay;
    const w = 1000;
    const h = 48;
    const maxH = Math.max.apply(null, heights.concat([1]));
    let ticks = "";
    let labels = "";
    for (let d = 1; d <= daysInMonth; d += 1) {
      const x = ((d - 1) / Math.max(1, daysInMonth - 1)) * (w - 8) + 4;
      const future = d > today;
      const amp = heights[d - 1] != null ? 8 + (heights[d - 1] / maxH) * 18 : 8;
      const y2 = 26;
      const y1 = y2 - (future ? 6 : amp);
      const color = d === selected ? gold() : (future ? inkRgba(0.12) : inkRgba(0.28));
      ticks += '<line x1="' + x.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x.toFixed(1) + '" y2="' + y2 + '" stroke="' + color + '" stroke-width="' + (d === selected ? 1.6 : 1) + '"/>';
      const major = d === 1 || d === 5 || d === 10 || d === 15 || d === 20 || d === 30 || d === daysInMonth;
      if (major) {
        labels += '<text x="' + x.toFixed(1) + '" y="44" text-anchor="middle" fill="' + inkRgba(0.28) + '" font-size="11" font-family="IBM Plex Mono, monospace">' + String(d).padStart(2, "0") + "</text>";
      }
    }
    const cx = ((selected - 1) / Math.max(1, daysInMonth - 1)) * (w - 8) + 4;
    const mark =
      '<line x1="' + cx.toFixed(1) + '" y1="2" x2="' + cx.toFixed(1) + '" y2="26" stroke="' + gold() + '" stroke-width="1.2"/>' +
      '<circle cx="' + cx.toFixed(1) + '" cy="30" r="7" fill="' + voidFill() + '" stroke="' + gold() + '"/>' +
      '<text x="' + cx.toFixed(1) + '" y="33.5" text-anchor="middle" fill="' + token("--ink", "#d5d0c4") + '" font-size="8" font-family="IBM Plex Mono, monospace">' + selected + "</text>";
    let extra = "";
    if (half && half !== selected) {
      const hx = ((half - 1) / Math.max(1, daysInMonth - 1)) * (w - 8) + 4;
      extra = '<circle cx="' + hx.toFixed(1) + '" cy="30" r="3" fill="none" stroke="' + inkRgba(0.4) + '"/>';
    }
    return '<svg class="ruler-svg" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" aria-hidden="true">' + ticks + labels + extra + mark + "</svg>";
  }

  global.ProbeCharts = { spark: spark, bars: bars, stacked: stacked, wave: wave, ruler: ruler };
})(window);

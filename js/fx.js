(function (global) {
  const KEY = "mmwx-fx";
  const DEFAULTS = {
    grain: "1",
    count: "1",
    expose: "1",
  };
  const TONE_KEY = "mmwx-fx-tone";
  const GRAIN_KEY = "mmwx-fx-grain-depth";
  const TINT_KEY = "mmwx-fx-globe-tint";
  const TINT_DEFAULT = 0.15;
  const TONE = {
    night: { hex: "#15130f", h: 40, s: 17, l0: 3, l1: 22 },
    day: { hex: "#d4c096", h: 40, s: 42, l0: 58, l1: 88 },
  };
  const GRAIN_DEFAULT = { night: 0.22, day: 0.09 };
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  let flags = load();
  let tones = loadTones();
  let grainDepth = loadGrain();
  let globeTint = loadTint();
  let counted = false;

  function load() {
    const out = Object.assign({}, DEFAULTS);
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return out;
      const parsed = JSON.parse(raw);
      Object.keys(DEFAULTS).forEach(function (k) {
        if (parsed[k] === "0" || parsed[k] === "1" || parsed[k] === "auto" || parsed[k] === "on" || parsed[k] === "off") {
          out[k] = String(parsed[k]);
        }
      });
    } catch (e) {}
    return out;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(flags)); } catch (e) {}
  }

  function on(name) {
    return flags[name] === "1";
  }

  function loadTones() {
    const out = { night: TONE.night.hex, day: TONE.day.hex };
    try {
      const parsed = JSON.parse(localStorage.getItem(TONE_KEY) || "{}");
      if (/^#[0-9a-f]{6}$/i.test(parsed.night || "")) out.night = parsed.night.toLowerCase();
      if (/^#[0-9a-f]{6}$/i.test(parsed.day || "")) out.day = parsed.day.toLowerCase();
    } catch (e) {}
    return out;
  }

  function saveTones() {
    try { localStorage.setItem(TONE_KEY, JSON.stringify(tones)); } catch (e) {}
  }

  function hexToRgb(hex) {
    const n = parseInt(String(hex).replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbToHex(r, g, b) {
    function byte(v) {
      return ("0" + Math.round(Math.max(0, Math.min(255, v))).toString(16)).slice(-2);
    }
    return "#" + byte(r) + byte(g) + byte(b);
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    s = s / 100;
    l = l / 100;
    if (s === 0) {
      const v = l * 255;
      return [v, v, v];
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    function hue(t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    return [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255];
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l: l * 100 };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return { h: h * 60, s: s * 100, l: l * 100 };
  }

  function hexAtLight(kind, l) {
    const spec = TONE[kind];
    const rgb = hslToRgb(spec.h, spec.s, l);
    return rgbToHex(rgb[0], rgb[1], rgb[2]);
  }

  function lightOf(hex, kind) {
    const rgb = hexToRgb(hex);
    const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    const spec = TONE[kind];
    return Math.max(spec.l0, Math.min(spec.l1, hsl.l));
  }

  function currentKind() {
    return document.documentElement.getAttribute("data-theme") === "light" ? "day" : "night";
  }

  function loadGrain() {
    const out = { night: GRAIN_DEFAULT.night, day: GRAIN_DEFAULT.day };
    try {
      const parsed = JSON.parse(localStorage.getItem(GRAIN_KEY) || "{}");
      if (Number.isFinite(Number(parsed.night))) out.night = clampGrain(Number(parsed.night));
      if (Number.isFinite(Number(parsed.day))) out.day = clampGrain(Number(parsed.day));
    } catch (e) {}
    return out;
  }

  function saveGrain() {
    try { localStorage.setItem(GRAIN_KEY, JSON.stringify(grainDepth)); } catch (e) {}
  }

  function clampGrain(v) {
    return Math.max(0, Math.min(0.4, v));
  }

  function loadTint() {
    const raw = localStorage.getItem(TINT_KEY);
    if (raw == null || raw === "") return TINT_DEFAULT;
    const v = Number(raw);
    if (v === 0.16) return TINT_DEFAULT;
    return Number.isFinite(v) ? Math.max(0, Math.min(0.45, v)) : TINT_DEFAULT;
  }

  function saveTint() {
    try { localStorage.setItem(TINT_KEY, String(globeTint)); } catch (e) {}
  }

  function applyTint() {
    document.documentElement.style.setProperty("--globe-tint", String(globeTint));
  }

  function applyTone() {
    const root = document.documentElement;
    const hex = tones[currentKind()];
    if (!hex) return;
    root.style.setProperty("--void", hex);
    root.style.setProperty("--void-2", hex);
  }

  function applyGrain() {
    const root = document.documentElement;
    const depth = grainDepth[currentKind()];
    root.style.setProperty("--fx-grain-depth", String(depth));
  }

  function apply() {
    const root = document.documentElement;
    root.setAttribute("data-fx-grain", flags.grain);
    root.setAttribute("data-fx-count", flags.count);
    root.setAttribute("data-fx-expose", flags.expose);
    applyTone();
    applyGrain();
    applyTint();
    syncGrainSlider(document.getElementById("fx-panel"));
  }

  function set(name, value) {
    flags[name] = String(value);
    save();
    apply();
    document.dispatchEvent(new CustomEvent("mmwx-fx", { detail: name }));
    if (name === "count" && flags.count === "1") {
      counted = false;
      tickCounts(document.getElementById("main"));
    }
  }

  function tickCounts(root) {
    if (!root || counted || !on("count") || reduce.matches) return;
    const vals = root.querySelectorAll(".fleet .val");
    if (!vals.length) return;
    counted = true;
    Array.prototype.forEach.call(vals, function (el) {
      const text = (el.textContent || "").trim();
      const m = text.match(/^(-?[\d,.]+)\s*(.*)$/);
      if (!m) return;
      const target = parseFloat(m[1].replace(/,/g, ""));
      if (!isFinite(target)) return;
      const rest = m[2] || "";
      const decimals = (m[1].split(".")[1] || "").length;
      const t0 = performance.now();
      const dur = 740;
      function step(now) {
        const p = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        const n = target * e;
        el.textContent = n.toFixed(decimals) + (rest ? " " + rest : "");
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = text;
      }
      el.textContent = (0).toFixed(decimals) + (rest ? " " + rest : "");
      requestAnimationFrame(step);
    });
  }

  function expose(run) {
    run();
  }

  function localHost() {
    return /^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
  }

  function mountPanel() {
    if (!localHost()) return;
    if (document.getElementById("fx-panel")) return;
    const box = document.createElement("aside");
    box.id = "fx-panel";
    box.setAttribute("aria-label", "本地试效果");
    box.innerHTML =
      '<header><span>本地试效果</span><button type="button" class="fx-min" aria-label="收起">–</button></header>' +
      '<div class="fx-body">' +
        row("grain", "纸纹", flags.grain === "1") +
        row("count", "数字进场", flags.count === "1") +
        row("expose", "日夜间曝光", flags.expose === "1") +
        toneRow("night", "夜间底") +
        toneRow("day", "日间底") +
        grainRow() +
        tintRow() +
        '<button type="button" class="fx-reset">亮度重置</button>' +
      "</div>";
    document.body.appendChild(box);
    box.addEventListener("change", function (ev) {
      const el = ev.target;
      const name = el.getAttribute("data-fx");
      if (!name) return;
      if (el.tagName === "SELECT") set(name, el.value);
      else set(name, el.checked ? "1" : "0");
    });
    box.addEventListener("input", function (ev) {
      const el = ev.target;
      if (el.getAttribute("data-tint") === "globe") {
        const pct = Number(el.value);
        globeTint = Math.max(0, Math.min(0.45, pct / 100));
        const label = box.querySelector("[data-tint-hex]");
        if (label) label.textContent = pct.toFixed(1).replace(/\.0$/, "") + "%";
        saveTint();
        applyTint();
        return;
      }
      if (el.getAttribute("data-grain") === "depth") {
        const pct = Number(el.value);
        grainDepth[currentKind()] = clampGrain(pct / 100);
        const label = box.querySelector("[data-grain-hex]");
        if (label) label.textContent = pct.toFixed(1).replace(/\.0$/, "") + "%";
        saveGrain();
        applyGrain();
        return;
      }
      const kind = el.getAttribute("data-tone");
      if (!kind) return;
      const hex = hexAtLight(kind, Number(el.value));
      tones[kind] = hex;
      const code = box.querySelector("[data-tone-hex=" + kind + "]");
      if (code) code.textContent = hex;
      saveTones();
      const root = document.documentElement;
      const prev = root.style.transition;
      root.style.transition = "none";
      if (currentKind() === kind) applyTone();
      requestAnimationFrame(function () { root.style.transition = prev; });
    });
    box.querySelector(".fx-min").addEventListener("click", function () {
      box.classList.toggle("is-min");
    });
    box.querySelector(".fx-reset").addEventListener("click", function () {
      tones.night = TONE.night.hex;
      tones.day = TONE.day.hex;
      saveTones();
      const night = box.querySelector("[data-tone=night]");
      const day = box.querySelector("[data-tone=day]");
      if (night) night.value = String(Math.round(lightOf(tones.night, "night")));
      if (day) day.value = String(Math.round(lightOf(tones.day, "day")));
      const nh = box.querySelector("[data-tone-hex=night]");
      const dh = box.querySelector("[data-tone-hex=day]");
      if (nh) nh.textContent = tones.night;
      if (dh) dh.textContent = tones.day;
      applyTone();
    });
  }

  function tintRow() {
    const pct = Math.round(globeTint * 1000) / 10;
    return (
      '<label class="fx-tone">' +
        '<span>地球水色 <code data-tint-hex>' + String(pct).replace(/\.0$/, "") + "%</code></span>" +
        '<input type="range" min="0" max="40" step="0.5" value="' + pct + '" data-tint="globe">' +
      "</label>"
    );
  }

  function grainRow() {
    const pct = Math.round(grainDepth[currentKind()] * 1000) / 10;
    return (
      '<label class="fx-tone">' +
        '<span>纸纹深度 <code data-grain-hex>' + String(pct).replace(/\.0$/, "") + "%</code></span>" +
        '<input type="range" min="0" max="40" step="0.5" value="' + pct + '" data-grain="depth">' +
      "</label>"
    );
  }

  function syncGrainSlider(box) {
    if (!box) return;
    const pct = Math.round(grainDepth[currentKind()] * 1000) / 10;
    const input = box.querySelector("[data-grain=depth]");
    const label = box.querySelector("[data-grain-hex]");
    if (input) input.value = String(pct);
    if (label) label.textContent = String(pct).replace(/\.0$/, "") + "%";
  }

  function toneRow(kind, label) {
    const spec = TONE[kind];
    const hex = tones[kind];
    const l = Math.round(lightOf(hex, kind));
    return (
      '<label class="fx-tone">' +
        '<span>' + label + ' <code data-tone-hex="' + kind + '">' + hex + "</code></span>" +
        '<input type="range" min="' + spec.l0 + '" max="' + spec.l1 + '" step="0.5" value="' + l + '" data-tone="' + kind + '">' +
      "</label>"
    );
  }

  function row(name, label, onOff) {
    return '<label class="fx-row"><span>' + label + '</span><input type="checkbox" data-fx="' + name + '"' + (onOff ? " checked" : "") + "></label>";
  }

  apply();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountPanel);
  } else {
    mountPanel();
  }

  global.ProbeFX = {
    on: on,
    apply: apply,
    set: set,
    tickCounts: tickCounts,
    expose: expose,
    flags: flags,
    tones: tones,
    grainDepth: grainDepth,
    globeTint: function () { return globeTint; },
  };
})(window);

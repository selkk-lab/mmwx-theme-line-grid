(function (global) {
  const KEY = "mmwx-fx";
  const DEFAULTS = {
    grain: "1",
    count: "1",
    expose: "1",
    grid: "0",
    pulse: "1",
    flow: "1",
    hover: "1",
    frame: "1",
    glow: "1",
    entrance: "1",
    rotate: "1",
    sweep: "0",
    trace: "1",
    rise: "1",
    scan: "1",
    depth: "1",
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
  let entranceKey = "";
  let entranceAnimations = [];

  function load() {
    const out = Object.assign({}, DEFAULTS);
    // Public pages use the approved release preset; local experiments stay local.
    if (!localHost()) return out;
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
      if (/^#[0-9a-f]{6}$/i.test(parsed.day || "") && parsed.day.toLowerCase() !== "#f1eee6") out.day = parsed.day.toLowerCase();
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
    Object.keys(flags).forEach(function (key) { root.setAttribute("data-fx-" + key, flags[key]); });
    applyTone();
    applyGrain();
    applyTint();
    syncGrainSlider(document.getElementById("fx-panel"));
    document.querySelectorAll("#fx-panel [data-fx]").forEach(function (el) { el.checked = on(el.dataset.fx); });
    const total = Object.keys(flags).filter(on).length;
    const counter = document.getElementById("fx-counter");
    if (counter) counter.textContent = total + " / " + Object.keys(flags).length;
    if (!on("entrance")) { entranceAnimations.forEach(function (a) { a.cancel(); }); entranceAnimations = []; }
  }

  function set(name, value) {
    flags[name] = String(value);
    save();
    apply();
    document.dispatchEvent(new CustomEvent("mmwx-fx", { detail: name }));
    if (name === "entrance" && on("entrance")) { entranceKey = ""; enter(document.getElementById("main"), "preview"); }
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
        if (!el.isConnected) return;
        if (!on("count") || reduce.matches) { el.textContent = text; return; }
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

  function enter(root, key) {
    if (!root || !on("entrance") || reduce.matches || document.hidden) return;
    if (entranceKey === key) return;
    entranceKey = key;
    entranceAnimations.forEach(function (a) { a.cancel(); });
    entranceAnimations = Array.from(root.children).slice(0, 8).map(function (el, i) {
      return el.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 520, delay: i * 55, easing: "cubic-bezier(.22,1,.36,1)", fill: "backwards" });
    });
  }

  let hoverCell = null;
  let hoverFrame = 0;
  document.addEventListener("pointermove", function (ev) {
    if (!on("hover") || ev.pointerType === "touch") return;
    const cell = ev.target.closest && ev.target.closest(".row:not(.row-h), .cell, .slab, .fleet article");
    if (hoverCell && hoverCell !== cell) hoverCell.classList.remove("fx-hovering");
    hoverCell = cell;
    cancelAnimationFrame(hoverFrame);
    if (!cell) return;
    hoverFrame = requestAnimationFrame(function () {
      if (!cell.isConnected) return;
      const rect = cell.getBoundingClientRect();
      cell.style.setProperty("--fx-x", (ev.clientX - rect.left) + "px");
      cell.style.setProperty("--fx-y", (ev.clientY - rect.top) + "px");
      cell.classList.add("fx-hovering");
    });
  }, { passive: true });
  document.addEventListener("pointerout", function (ev) { if (!ev.relatedTarget && hoverCell) { hoverCell.classList.remove("fx-hovering"); cancelAnimationFrame(hoverFrame); } });
  document.addEventListener("visibilitychange", function () { document.documentElement.toggleAttribute("data-fx-paused", document.hidden); });
  reduce.addEventListener("change", function () { if (reduce.matches) entranceAnimations.forEach(function (a) { a.cancel(); }); });

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
    box.setAttribute("aria-label", "临时效果面板");
    box.hidden = new URLSearchParams(location.search).get("fx") !== "1";
    const launcher = document.createElement("button");
    launcher.id = "fx-launcher";
    launcher.type = "button";
    launcher.setAttribute("aria-controls", "fx-panel");
    launcher.setAttribute("aria-expanded", String(!box.hidden));
    launcher.innerHTML = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3 4h12M3 9h12M3 14h12"/><circle cx="6" cy="4" r="2"/><circle cx="12" cy="9" r="2"/><circle cx="7" cy="14" r="2"/></svg><span>效果试验</span><small>临时</small>';
    document.body.appendChild(launcher);
    function toggle(open) { box.hidden = !open; launcher.setAttribute("aria-expanded", String(open)); }
    launcher.addEventListener("click", function () { toggle(box.hidden); });
    box.innerHTML =
      '<header><span>效果试验 <small id="fx-counter"></small></span><button type="button" class="fx-min" aria-label="收起效果面板">×</button></header>' +
      '<div class="fx-body"><div class="fx-presets"><button type="button" data-preset="recommended">推荐</button><button type="button" data-preset="all">全开</button><button type="button" data-preset="none">全关</button></div>' +
      '<p class="fx-section">材质 / 线条</p>' +
      row("grain", "纸张颗粒", on("grain")) + row("grid", "细线网格", on("grid")) +
      row("frame", "刻度边角", on("frame")) + row("hover", "悬停微光", on("hover")) + row("glow", "曲线微光", on("glow")) +
      '<p class="fx-section">地球 / 动态</p>' +
      row("rotate", "地球自转", on("rotate")) + row("sweep", "经线扫描", on("sweep")) + row("flow", "连线流动", on("flow")) +
      row("pulse", "节点呼吸", on("pulse")) + row("entrance", "轻量入场", on("entrance")) + row("count", "数字进场", on("count")) + row("expose", "日夜渐变", on("expose")) +
      '<p class="fx-section">观测工作台 / 新增</p>' + row("trace", "曲线描绘", on("trace")) + row("rise", "容量展开", on("rise")) + row("scan", "信号扫描", on("scan")) + row("depth", "立体悬停", on("depth")) +
      '<details class="fx-tuning"><summary>强度与底色</summary>' + toneRow("night", "夜间底") + toneRow("day", "日间底") + grainRow() + tintRow() + '<button type="button" class="fx-reset">恢复原版底色</button></details>' +
      '<p class="fx-local-note">仅本机试效果，选择自动记住。</p></div>';
    document.body.appendChild(box);
    apply();
    box.addEventListener("click", function (ev) {
      const preset = ev.target.closest("[data-preset]");
      if (!preset) return;
      Object.keys(flags).forEach(function (key) { flags[key] = preset.dataset.preset === "all" ? "1" : preset.dataset.preset === "none" ? "0" : DEFAULTS[key]; });
      counted = false;
      entranceKey = "";
      save(); apply();
      document.dispatchEvent(new CustomEvent("mmwx-fx"));
      tickCounts(document.getElementById("main"));
      enter(document.getElementById("main"), "preview");
    });
    box.addEventListener("keydown", function (ev) { if (ev.key === "Escape") { ev.stopPropagation(); toggle(false); launcher.focus(); } });
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
      toggle(false);
      launcher.focus();
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
    enter: enter,
    expose: expose,
    flags: flags,
    tones: tones,
    grainDepth: grainDepth,
    globeTint: function () { return globeTint; },
  };
})(window);

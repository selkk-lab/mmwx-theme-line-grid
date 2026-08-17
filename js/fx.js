(function (global) {
  const KEY = "mmwx-fx";
  const DEFAULTS = {
    grain: "1",
    count: "1",
    expose: "1",
  };
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  let flags = load();
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

  function apply() {
    const root = document.documentElement;
    root.setAttribute("data-fx-grain", flags.grain);
    root.setAttribute("data-fx-count", flags.count);
    root.setAttribute("data-fx-expose", flags.expose);
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
      "</div>";
    document.body.appendChild(box);
    box.addEventListener("change", function (ev) {
      const el = ev.target;
      const name = el.getAttribute("data-fx");
      if (!name) return;
      if (el.tagName === "SELECT") set(name, el.value);
      else set(name, el.checked ? "1" : "0");
    });
    box.querySelector(".fx-min").addEventListener("click", function () {
      box.classList.toggle("is-min");
    });
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
  };
})(window);

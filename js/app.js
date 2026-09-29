(function () {
  const U = ProbeDemo.units;
  const main = document.getElementById("main");
  const foot = document.getElementById("foot");
  const titleEl = document.getElementById("page-title");
  const overlay = document.getElementById("overlay");
  const winBody = document.getElementById("win-body");
  const winTitle = document.getElementById("win-title");
  const winKicker = document.getElementById("win-kicker");

  function forcedDemo() {
    const q = new URLSearchParams(location.search);
    return q.get("demo") === "1" || location.protocol === "file:";
  }

  let state = forcedDemo()
    ? ProbeAdapt.normalizePayload(ProbeDemo.snapshot())
    : { enabled: true, servers: [], title: "" };
  let range = "1h";
  let targetKey = "";
  let lastFocus = null;
  // Apply the new home default once; subsequent explicit choices still persist.
  if (localStorage.getItem("mmwx-view-default") !== "detail-v1") {
    localStorage.setItem("mmwx-view", "column");
    localStorage.setItem("mmwx-view-default", "detail-v1");
  }
  let lastView = ["grid", "column", "list"].includes(localStorage.getItem("mmwx-view")) ? localStorage.getItem("mmwx-view") : "column";
  let fastestLineI = -1;
  let fastestLandI = -1;
  let sortKey = "name";
  let sortDir = 1;
  let findQ = "";
  let statusFilter = "all";
  let regionFilter = "";
  let loadState = forcedDemo() ? "ready" : "loading";
  let lastUpdated = forcedDemo() ? new Date() : null;
  let refreshPending = false;
  let streamStarted = false;
  let composing = false;
  let renderPending = false;

  function needsAttention(s) {
    return !s.online || (s.cpu_pct != null && s.cpu_pct >= 85)
      || (s.traffic_limit > 0 && pct(s.traffic_used, s.traffic_limit) >= 90)
      || (pingLoss(s) != null && pingLoss(s) >= 2);
  }

  function paintConnection() {
    const el = document.getElementById("connection-status");
    if (!el) return;
    const stale = lastUpdated && Date.now() - lastUpdated.getTime() > 45000;
    const text = forcedDemo() ? "本地演示 · 非真实数据" : loadState === "loading" ? "正在连接" : loadState === "error" ? "连接失败" : state.enabled === false ? "探针未开启" : stale ? "数据待更新" : "数据已同步";
    if (el.textContent !== text) el.textContent = text;
    el.dataset.tone = forcedDemo() ? "demo" : (stale || loadState === "error") ? "warn" : "ok";
    const btn = document.getElementById("refresh-data");
    const label = refreshPending ? "刷新中…" : "↻ 刷新";
    if (btn) { btn.disabled = refreshPending; if (btn.textContent !== label) btn.textContent = label; }
  }

  // Snapshots patch the live DOM instead of replacing it, so hover, focus, text selection and
  // running animations survive the 5-second refresh. The globe canvas subtree is never patched.
  const scratch = document.createElement("template");
  function morph(target, html) {
    scratch.innerHTML = html;
    patchChildren(target, scratch.content);
    scratch.innerHTML = "";
  }

  function isAtlas(node) {
    return node.nodeType === 1 && node.hasAttribute("data-canvas-ready");
  }

  function patchChildren(parent, next) {
    let a = parent.firstChild;
    let b = next.firstChild;
    while (b) {
      const following = b.nextSibling;
      if (!a) parent.appendChild(b);
      else if (a.nodeType === b.nodeType && a.nodeName === b.nodeName && isAtlas(a) === isAtlas(b)) {
        patchNode(a, b);
        a = a.nextSibling;
      } else {
        const stale = a;
        a = a.nextSibling;
        parent.replaceChild(b, stale);
      }
      b = following;
    }
    while (a) {
      const stale = a;
      a = a.nextSibling;
      parent.removeChild(stale);
    }
  }

  // Readings whose text changed because of a pushed snapshot flash briefly (the "数字进场" effect).
  const TICK = ".val, .ni-latency b, .ni-speeds b, .micro-meter b, .console-stat > strong, .channel-node > b, .target-readout strong, .matrix-cell b, .region-reading, .hotspot-list b, .quota-read b, .trend-card strong";
  let ticking = false;
  const ticked = [];

  function flashTicks() {
    const list = ticked.splice(0);
    if (!list.length || !window.ProbeFX || !ProbeFX.on("count") || matchMedia("(prefers-reduced-motion: reduce)").matches || document.hidden) return;
    const gold = cssVar("--gold", "#c4a56a");
    const seen = new Set();
    list.forEach(function (el) {
      const target = el.closest && el.closest(TICK);
      if (!target || seen.has(target) || !target.isConnected) return;
      seen.add(target);
      target.animate([{ color: gold, textShadow: "0 0 12px " + hexToRgba(gold, 0.35) }], { duration: 1100, easing: "cubic-bezier(.2,.7,.2,1)" });
    });
  }

  function patchNode(a, b) {
    if (a.nodeType !== 1) {
      if (a.nodeValue !== b.nodeValue) {
        a.nodeValue = b.nodeValue;
        if (ticking && a.parentNode) ticked.push(a.parentNode);
      }
      return;
    }
    if (isAtlas(a) || a.isEqualNode(b)) return;
    const hovering = a.classList.contains("fx-hovering");
    const hoverStyle = hovering ? a.getAttribute("style") : null;
    const chosen = a.tagName === "SELECT" ? b.querySelector("option[selected]") : null;
    for (let i = a.attributes.length - 1; i >= 0; i -= 1) {
      const name = a.attributes[i].name;
      if (!b.hasAttribute(name)) a.removeAttribute(name);
    }
    for (let i = 0; i < b.attributes.length; i += 1) {
      const attr = b.attributes[i];
      if (a.getAttribute(attr.name) !== attr.value) a.setAttribute(attr.name, attr.value);
    }
    if (hovering) {
      a.classList.add("fx-hovering");
      if (hoverStyle != null) a.setAttribute("style", hoverStyle);
    }
    patchChildren(a, b);
    if (a.tagName === "INPUT" && a !== document.activeElement) a.value = b.getAttribute("value") || "";
    if (chosen) a.value = chosen.value;
  }

  function refreshData() {
    if (refreshPending) return;
    if (forcedDemo()) { tickDemo(); return; }
    refreshPending = true;
    if (!lastUpdated) loadState = "loading";
    render();
    return ProbeAPI.fetchServers().then(function (payload) {
      if (payload && (Array.isArray(payload.servers) || payload.enabled === false)) {
        applyLive(payload);
        if (payload.enabled !== false && !streamStarted) {
          streamStarted = true;
          ProbeAPI.connectWS(applyLive);
        }
      } else { loadState = "error"; }
    }).catch(function () { loadState = "error"; }).finally(function () {
      refreshPending = false;
      render();
    });
  }
  let home = "nodes";
  let showGlobe = localStorage.getItem("mmwx-globe") == null ? !matchMedia("(max-width: 720px)").matches : localStorage.getItem("mmwx-globe") !== "0";
  let netIndex = 0;
  let netTarget = "all";
  let pulseDay = new Date().getDate();
  let pulsePicked = false;
  let shownHome = null;
  let pulse = ProbeDemo.monthPulse();
  let liveMode = false;
  let seriesCache = {};
  let flow = [];
  let sysRange = "1h";
  const sysCache = {};
  const sysPending = {};
  let lastFocusEl = null;

  function cssVar(name, fallback) {
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

  function hexToRgba(color, a) {
    const p = parseColor(color);
    if (!p) return "rgba(213,208,196," + a + ")";
    return "rgba(" + p[0] + "," + p[1] + "," + p[2] + "," + a + ")";
  }

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function iconSun() {
    return '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.3 3.3l1.3 1.3M11.4 11.4l1.3 1.3M3.3 12.7l1.3-1.3M11.4 4.6l1.3-1.3"/></svg>';
  }

  function iconMoon() {
    return '<svg viewBox="0 0 16 16"><path d="M10.4 2.6a5.7 5.7 0 1 0 2.9 7.6 4.5 4.5 0 0 1-2.9-7.6z"/></svg>';
  }

  function paintTheme(next) {
    document.documentElement.setAttribute("data-theme", next);
    document.documentElement.style.colorScheme = next;
    localStorage.setItem("mmwx-theme", next);
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;
    btn.innerHTML = next === "light" ? iconMoon() : iconSun();
    btn.setAttribute("aria-pressed", next === "light" ? "true" : "false");
    btn.setAttribute("aria-label", next === "light" ? "切换夜间模式" : "切换日间模式");
    btn.title = next === "light" ? "夜间" : "日间";
    if (window.ProbeFX) ProbeFX.apply();
  }

  function setTheme(mode, opts) {
    const next = mode === "light" ? "light" : "dark";
    paintTheme(next);
    if (opts && opts.after) opts.after();
  }
  const PAGES = ["overview", "ping", "traffic", "routes", "system"];
  const PAGE_LABEL = { overview: "Overview", ping: "Latency", traffic: "Traffic", routes: "Return", system: "System" };
  const HOMES = ["nodes", "network", "resource"];
  const CARRIER = { telecom: "电信", unicom: "联通", mobile: "移动" };
  const CYCLE = { month: "月", quarter: "季", half_year: "半年", year: "年" };

  function pad(n) { return String(n).padStart(2, "0"); }

  function fmtBytes(bytes, digits) {
    if (bytes == null) return "—";
    const abs = Math.abs(bytes);
    const units = [
      [U.TB, "TB"],
      [U.GB, "GB"],
      [U.MB, "MB"],
      [U.KB, "KB"],
      [1, "B"],
    ];
    for (let i = 0; i < units.length; i += 1) {
      if (abs >= units[i][0] || units[i][1] === "B") {
        const v = bytes / units[i][0];
        let d = digits;
        if (d == null) d = v >= 100 ? 0 : v >= 10 ? 1 : 2;
        if (Math.abs(v - Math.round(v)) < 0.005 && units[i][1] !== "TB") d = 0;
        return v.toFixed(d) + " " + units[i][1];
      }
    }
    return "0 B";
  }

  function fmtSpeed(bps) {
    if (bps == null) return "—";
    return fmtBytes(bps, 1) + "/s";
  }

  function fmtDays(sec) {
    if (sec == null) return "—";
    return Math.floor(sec / U.DAY) + " 天";
  }

  function pct(used, total) {
    if (!total) return 0;
    return Math.max(0, Math.min(100, (used / total) * 100));
  }

  function primaryPing(server, role) {
    return ProbeAdapt.primaryPing(server, role);
  }

  function roleOf(server) {
    return ProbeAdapt.serverRole(server);
  }

  function ccText(server) {
    return (server && server.region_country) || "—";
  }

  function lamp(server) {
    const on = !!(server && server.online);
    return '<span class="dot' + (on ? "" : " is-off") + '" title="' + (on ? "在线" : "离线") + '" aria-label="' + (on ? "在线" : "离线") + '"></span>';
  }

  function nameCell(server, i) {
    return (
      '<span class="name">' +
        lamp(server) +
        '<span class="identity-text"><span class="name-t">' + escAttr(server.name || "未命名") + '</span><span class="node-place">' + escAttr(server.region_label || server.region_country || "") + "</span></span>" +
        nodeTags(server, i) +
      "</span>"
    );
  }

  function pingMs(server, role) {
    const p = primaryPing(server, role);
    return p && p.current_ms >= 0 ? p.current_ms : -1;
  }

  function pingLoss(server) {
    const p = primaryPing(server);
    if (!p || p.loss_pct == null || p.loss_pct < 0) return null;
    return p.loss_pct;
  }

  function pingBand(server) {
    if (!server || !server.online) return "down";
    const ms = pingMs(server);
    if (ms < 0) return "down";
    if (ms > 180) return "bad";
    if (ms >= 120) return "hot";
    if (ms >= 80) return "ok";
    return "fast";
  }

  function lossBand(server) {
    if (!server || !server.online) return "down";
    const l = pingLoss(server);
    if (l == null || !isFinite(l)) return "ok";
    if (l >= 1) return "bad";
    if (l >= 0.3) return "hot";
    return "ok";
  }

  function pingColor(server) {
    const b = pingBand(server);
    if (b === "fast") return cssVar("--live", "#8fa676");
    if (b === "hot") return cssVar("--gold", "#c4a56a");
    if (b === "bad" || b === "down") return cssVar("--down", "#b06d52");
    return cssVar("--ink", "#d5d0c4");
  }

  function fmtLoss(server) {
    if (!server || !server.online) return "—";
    const l = pingLoss(server);
    if (l == null || !isFinite(l) || l < 0) return "—";
    if (l < 0.005) return "0%";
    if (l < 1) return l.toFixed(2) + "%";
    return l.toFixed(1) + "%";
  }

  function fmtPingLoss(ping) {
    const l = ping ? Number(ping.loss_pct) : NaN;
    if (!Number.isFinite(l) || l < 0) return "—";
    if (l < 0.005) return "0%";
    if (l < 1) return l.toFixed(2) + "%";
    return l.toFixed(1) + "%";
  }

  function pingReadout(server) {
    const ms = pingMs(server);
    const msTxt = ms < 0 ? "—" : ms + " ms";
    return '<span class="ping-read"><b class="is-' + pingBand(server) + '">' + msTxt + '</b><i class="is-' + lossBand(server) + '">' + fmtLoss(server) + "</i></span>";
  }

  function daysUntil(iso) {
    if (!iso) return null;
    const t = new Date(iso + "T00:00:00").getTime();
    if (!isFinite(t)) return null;
    return Math.round((t - Date.now()) / 86400000);
  }

  function monthCost() {
    return (state.servers || []).reduce(function (a, s) {
      const c = s.renewal_price_cny || 0;
      if (s.renewal_cycle === "year") return a + c / 12;
      if (s.renewal_cycle === "quarter") return a + c / 3;
      if (s.renewal_cycle === "half_year") return a + c / 6;
      return a + c;
    }, 0);
  }

  function refreshMarks() {
    fastestLineI = -1;
    fastestLandI = -1;
    let bestLine = Infinity;
    let bestLand = Infinity;
    (state.servers || []).forEach(function (s, i) {
      if (!s.online) return;
      const role = roleOf(s);
      const ms = pingMs(s, role === "mixed" ? "line" : role);
      if (ms < 0) return;
      if (role === "land") {
        if (ms < bestLand) { bestLand = ms; fastestLandI = i; }
      } else if (role === "line" || role === "mixed") {
        if (ms < bestLine) { bestLine = ms; fastestLineI = i; }
      }
    });
  }

  function nodeTags(server, i) {
    let html = "";
    const role = roleOf(server);
    const label = ProbeAdapt.roleLabel(role);
    if (label) html += '<span class="mark">' + label + "</span>";
    if (role === "land" && i === fastestLandI && server.online) html += '<span class="mark mark-fast">最快</span>';
    if ((role === "line" || role === "mixed") && i === fastestLineI && server.online) html += '<span class="mark mark-fast">最快</span>';
    const d = daysUntil(server.expires_at);
    if (d != null && d <= 14) html += '<span class="mark mark-due">' + (d < 0 ? "到期" : d + "天") + "</span>";
    return html;
  }

  function loadBand(p) {
    if (p >= 90) return " is-bad";
    if (p >= 70) return " is-hot";
    return "";
  }

  function dailyStats(server) {
    const rows = ProbeAdapt.lastDays(server.daily_traffic, 7);
    const vals = rows.map(function (r) { return r.total; });
    if (!vals.length) return { high: 0, low: 0, avg: 0 };
    const high = Math.max.apply(null, vals);
    const low = Math.min.apply(null, vals);
    const avg = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    return { high: high, low: low, avg: avg };
  }

  function totals() {
    const servers = state.servers || [];
    let used = 0;
    let limit = 0;
    let online = 0;
    servers.forEach(function (s) {
      used += s.traffic_used || 0;
      limit += s.traffic_limit || 0;
      if (s.online) online += 1;
    });
    return { used: used, limit: limit, online: online, all: servers.length };
  }

  function clock(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "  " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }

  function route() {
    const raw = (location.hash || "#/").replace(/^#/, "") || "/";
    const parts = raw.split("/").filter(Boolean);
    let view = lastView || "column";
    let node = null;
    let page = "overview";
    let section = "nodes";
    if (parts[0] === "network" || parts[0] === "resource") {
      section = parts[0];
      if (parts[1] === "node" && parts[2] != null) {
        node = Number(parts[2]);
        if (PAGES.indexOf(parts[3]) >= 0) page = parts[3];
      }
      home = section;
      return { view: view, node: node, page: page, home: section };
    }
    if (parts[0] === "column" || parts[0] === "list" || parts[0] === "grid") {
      view = parts[0];
      if (parts[1] === "node" && parts[2] != null) {
        node = Number(parts[2]);
        if (PAGES.indexOf(parts[3]) >= 0) page = parts[3];
      }
    } else if (parts[0] === "node" && parts[1] != null) {
      node = Number(parts[1]);
      if (PAGES.indexOf(parts[2]) >= 0) page = parts[2];
    } else if (parts[0] === "globe") {
      showGlobe = true;
      if (parts[1] === "node" && parts[2] != null) {
        node = Number(parts[2]);
        if (PAGES.indexOf(parts[3]) >= 0) page = parts[3];
      }
    }
    if (view === "grid" || view === "column" || view === "list") lastView = view;
    home = "nodes";
    return { view: view, node: node, page: page, home: "nodes" };
  }

  function viewHash(view, node, page, section) {
    const sec = section || home || "nodes";
    if (sec === "network" || sec === "resource") {
      if (node == null) return "#/" + sec;
      return "#/" + sec + "/node/" + node + (page && page !== "overview" ? "/" + page : "");
    }
    const v = view || lastView || "column";
    const base = "/" + v;
    if (node == null) return "#" + base;
    const rest = page && page !== "overview" ? "/" + page : "";
    return "#" + base + "/node/" + node + rest;
  }

  function go(hash, ev) {
    if (ev) ev.preventDefault();
    location.hash = hash;
  }

  function iconGrid() {
    return '<svg viewBox="0 0 16 16"><rect x="1.5" y="1.5" width="5" height="5"/><rect x="9.5" y="1.5" width="5" height="5"/><rect x="1.5" y="9.5" width="5" height="5"/><rect x="9.5" y="9.5" width="5" height="5"/></svg>';
  }

  function iconColumn() {
    return '<svg viewBox="0 0 16 16"><rect x="2" y="1.5" width="12" height="3.2"/><rect x="2" y="6.4" width="12" height="3.2"/><rect x="2" y="11.3" width="12" height="3.2"/></svg>';
  }

  function iconList() {
    return '<svg viewBox="0 0 16 16"><path d="M2 3.5h12M2 8h12M2 12.5h12"/></svg>';
  }

  function iconGlobe() {
    return '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2.2 2.2 2.2 9.8 0 12M8 2C5.8 4.2 5.8 11.8 8 14"/></svg>';
  }

  function pingTips(values, stepMin) {
    const n = (values || []).length;
    const step = stepMin || 5;
    return (values || []).map(function (v, i) {
      const t = new Date(Date.now() - (n - 1 - i) * step * 60000);
      const clock = pad(t.getHours()) + ":" + pad(t.getMinutes());
      return clock + "  " + (v < 0 ? "无数据" : v + " ms");
    });
  }

  function trafficTips(rows) {
    return (rows || []).map(function (d) {
      const day = (d.date || "").slice(5) || "当日";
      return day + "  合计 " + fmtBytes(d.total, 1) + "  ↑ " + fmtBytes(d.uplink, 1) + "  ↓ " + fmtBytes(d.downlink, 1);
    });
  }

  function sparkOf(server, tall, hideRead) {
    const p = primaryPing(server);
    const vals = p && p.buckets ? p.buckets.map(function (b) { return b.ms; }) : [];
    return (
      '<div class="spark-wrap">' +
        ProbeCharts.spark(vals, { w: tall ? 420 : 240, h: tall ? 64 : 40, color: pingColor(server), tips: pingTips(vals, 5) }) +
        (tall || hideRead ? "" : pingReadout(server)) +
      "</div>"
    );
  }

  function quotaTone(p) {
    return p >= 85 ? " is-full" : p >= 60 ? " is-hot" : "";
  }

  function quotaBar(server) {
    const used = server.traffic_used || 0;
    const limit = server.traffic_limit || 0;
    const p = pct(used, limit);
    const remain = limit ? Math.max(0, limit - used) : 0;
    const tip = limit ? ("已用 " + p.toFixed(1) + "%") : "无限额";
    return (
      '<div class="quota">' +
        '<div class="quota-h">' +
          "<span>已用 <b>" + fmtBytes(used, 1) + "</b>" + (limit ? " / " + fmtBytes(limit, 2) : "") + "</span>" +
          "<span>" + (limit ? "剩余 <b>" + fmtBytes(remain, 1) + "</b>" : "无限额") + "</span>" +
        "</div>" +
        '<div class="quota-bar' + quotaTone(p) + '" style="--p:' + (limit ? p : 0) + '%" data-tip="' + tip + '"><i></i></div>' +
      "</div>"
    );
  }

  function quotaMini(server) {
    const used = server.traffic_used || 0;
    const limit = server.traffic_limit || 0;
    const p = pct(used, limit);
    return (
      '<span class="quota-cell hide-sm" title="' + (limit ? ("已用 " + p.toFixed(1) + "%") : "无限额") + '">' +
        '<span class="quota-cell-n">' + fmtBytes(used, 1) + (limit ? " / " + fmtBytes(limit, 2) : "") + "</span>" +
        '<span class="quota-mini' + quotaTone(p) + '" style="--p:' + (limit ? p : 0) + '%"><i></i></span>' +
      "</span>"
    );
  }

  function meters(server) {
    const mem = pct(server.mem_used, server.mem_total);
    const disk = pct(server.disk_used, server.disk_total);
    const cpu = server.cpu_pct == null ? 0 : server.cpu_pct;
    return (
      '<div class="meters">' +
        '<div class="meter' + loadBand(cpu) + '"><span>CPU ' + Math.round(cpu) + '%</span><i style="--p:' + cpu + '%"></i></div>' +
        '<div class="meter' + loadBand(mem) + '"><span>内存 ' + Math.round(mem) + '%</span><i style="--p:' + mem + '%"></i></div>' +
        '<div class="meter' + loadBand(disk) + '"><span>硬盘 ' + Math.round(disk) + '%</span><i style="--p:' + disk + '%"></i></div>' +
      "</div>"
    );
  }

  function cardTone(server) {
    const b = pingBand(server);
    if (b === "down" || b === "bad") return " is-bad";
    if (b === "hot") return " is-hot";
    if (b === "fast") return " is-fast";
    return " is-ok";
  }

  function card(server, i) { return ProbeConsole.node(server, i, false); }

  function row(server, i) {
    return (
      '<button class="row' + cardTone(server) + '" data-index="' + i + '" type="button">' +
        '<span class="cc">' + ccText(server) + "</span>" +
        nameCell(server, i) +
        '<span class="speeds">↓ <b>' + fmtSpeed(server.download_speed) + "</b>　↑ <b>" + fmtSpeed(server.upload_speed) + "</b></span>" +
        pingReadout(server) +
        sparkOf(server, false, true) +
        '<span class="hide-sm">' + Math.round(server.cpu_pct || 0) + "%</span>" +
        '<span class="hide-sm">' + Math.round(pct(server.mem_used, server.mem_total)) + "%</span>" +
        '<span class="hide-sm">' + Math.round(pct(server.disk_used, server.disk_total)) + "%</span>" +
        quotaMini(server) +
        '<span class="hide-sm">' + fmtDays(server.uptime) + "</span>" +
      "</button>"
    );
  }

  function listHead() {
    return (
      '<div class="row row-h" aria-hidden="true">' +
        sortHead("cc", "地区") + sortHead("name", "名称") + sortHead("up", "实时网速") +
        sortHead("ms", "延迟") + "<span>曲线</span>" +
        sortHead("cpu", "CPU") + sortHead("mem", "内存") + sortHead("disk", "硬盘") +
        sortHead("traffic", "流量") + sortHead("days", "在线") +
      "</div>"
    );
  }

  function slab(server, i) { return ProbeConsole.node(server, i, true); }

  function pulseInfo(day) {
    return pulse.find(function (p) { return p.day === day; }) || pulse[0];
  }

  function cycleBlock() {
    const today = new Date().getDate();
    const days = pulse.length || 31;
    const heights = pulse.map(function (p) { return p.total; });
    const past = pulse.filter(function (p) { return p.day <= today; });
    const usedToNow = past.reduce(function (a, b) { return a + b.total; }, 0);
    const active = past.filter(function (p) { return p.total > 0; });
    const busiest = active.slice().sort(function (a, b) { return b.total - a.total; })[0];
    const half = usedToNow ? pulse.find(function (p) { return p.acc >= usedToNow * 0.5 && p.day <= today; }) : null;
    const info = pulseInfo(pulseDay);
    const hits = pulse.map(function (p) {
      return '<button type="button" data-day="' + p.day + '" aria-label="' + p.date + " · " + fmtBytes(p.total, 1) + '" aria-pressed="' + (p.day === pulseDay) + '"></button>';
    }).join("");
    const marks = pulse.map(function (p) {
      const major = p.day === 1 || p.day % 5 === 0 || p.day === days;
      return "<span" + (p.day === today ? ' class="is-today"' : "") + ">" + (major || p.day === today ? pad(p.day) : "") + "</span>";
    }).join("");
    const cell = function (label, value) { return "<div><dt>" + label + "</dt><dd>" + value + "</dd></div>"; };
    return (
      '<section class="cycle instrument-panel" aria-label="本月脉搏">' +
        '<header class="console-heading"><h2><span>03</span>本月脉搏 <em>全网每日流量</em></h2><span class="cycle-legend"><i class="lg-bar"></i>当日<i class="lg-line"></i>月内累计<i class="lg-half"></i>过半</span></header>' +
        '<div class="cycle-body">' +
          '<div class="cycle-read">' +
            '<span class="instrument-label">SELECTED DAY</span><strong>' + info.date.slice(5) + "</strong>" +
            "<dl>" + cell("全网", fmtBytes(info.total, 1)) + cell("最忙节点", info.total ? escAttr(info.peak) : "—") + cell("占本月", info.total && usedToNow ? Math.round(info.total / usedToNow * 100) + "%" : "—") + "</dl>" +
            (info.offline ? '<p class="tone-danger">当日曾掉线</p>' : "") +
            (info.loss >= 1 ? '<p class="tone-warn">当日丢包 ' + info.loss + "%</p>" : "") +
          "</div>" +
          '<div class="cycle-chart">' +
            '<div class="ruler">' + ProbeCharts.ruler(today, days, { heights: heights, selected: pulseDay, halfDay: half ? half.day : 0 }) + '<div class="ruler-hit">' + hits + "</div></div>" +
            '<div class="cycle-days" aria-hidden="true" style="--days:' + days + '">' + marks + "</div>" +
            '<div class="cycle-foot"><span>已过 <b>' + Math.min(today, days) + " / " + days + "</b> 天</span><span>本月累计 <b>" + fmtBytes(usedToNow, 1) + "</b></span><span>有记录日均 <b>" + fmtBytes(active.length ? usedToNow / active.length : 0, 1) + "</b></span>" + (busiest ? "<span>峰值 <b>" + busiest.date.slice(5) + " · " + fmtBytes(busiest.total, 1) + "</b></span>" : "") + "</div>" +
          "</div>" +
        "</div>" +
      "</section>"
    );
  }

  function fleetFlow() {
    const servers = state.servers || [];
    const sum = function (k) { return servers.reduce(function (a, s) { return a + (s.online && s[k] > 0 ? s[k] : 0); }, 0); };
    flow.push({ down: sum("download_speed"), up: sum("upload_speed") });
    if (flow.length > 120) flow.shift();
  }

  function flowLine() {
    if (flow.length < 2) return "";
    const top = Math.max(1, ...flow.map(function (f) { return f.down; }));
    const step = 160 / (flow.length - 1);
    const d = flow.map(function (f, i) { return (i ? "L" : "M") + (i * step).toFixed(1) + " " + (20 - f.down / top * 18).toFixed(1); }).join(" ");
    return '<svg class="fleet-flow" viewBox="0 0 160 22" preserveAspectRatio="none" role="img" aria-label="本页打开后的全网下行合计走势"><path d="' + d + '"/></svg>';
  }

  function meter(ratio, tone) {
    return '<i class="fleet-meter' + (tone ? " " + tone : "") + '"><i style="width:' + Math.max(0, Math.min(100, ratio * 100)).toFixed(1) + '%"></i></i>';
  }

  function fleetStrip() {
    const t = totals();
    const servers = state.servers || [];
    const regions = {};
    servers.forEach(function (s) {
      const k = s.region_country || "—";
      regions[k] = (regions[k] || 0) + 1;
    });
    const down = servers.reduce(function (a, s) { return a + (s.download_speed || 0); }, 0);
    const up = servers.reduce(function (a, s) { return a + (s.upload_speed || 0); }, 0);
    const limited = servers.filter(function (s) { return s.traffic_limit > 0; });
    const lUsed = limited.reduce(function (a, s) { return a + (s.traffic_used || 0); }, 0);
    const lLimit = limited.reduce(function (a, s) { return a + s.traffic_limit; }, 0);
    const ratio = lLimit ? lUsed / lLimit : 0;
    const cost = monthCost();
    return (
      '<section class="fleet" aria-label="集群概览">' +
        "<article title='在线：最近一次快照中上报了心跳的节点'><div class='lbl'>节点</div><div class='val'>" + t.all + "</div><div class='sub'>在线 " + t.online + " · 离线 " + (t.all - t.online) + "</div>" + meter(t.all ? t.online / t.all : 0, t.online < t.all ? "warn" : "") + "</article>" +
        "<article><div class='lbl'>地区</div><div class='val'>" + Object.keys(regions).length + "</div><div class='sub'>独立地域</div></article>" +
        "<article title='所有节点当前下行速度之和；走势线从打开本页开始记录'><div class='lbl'>下行合计</div><div class='val'>" + fmtSpeed(down) + "</div><div class='sub'>上行 " + fmtSpeed(up) + "</div>" + flowLine() + "</article>" +
        "<article title='进度条只统计设置了流量限额的节点'><div class='lbl'>周期流量</div><div class='val'>" + fmtBytes(t.used, 1) + "</div><div class='sub'>限额 " + fmtBytes(t.limit, 2) + (lLimit ? " · 已用 " + Math.round(ratio * 100) + "%" : "") + "</div>" + (lLimit ? meter(ratio, ratio >= 0.9 ? "danger" : ratio >= 0.7 ? "warn" : "") : "") + "</article>" +
        "<article title='年付、季付等按月折算后的合计'><div class='lbl'>月均成本</div><div class='val'>" + ProbeInsight.money(cost) + "</div><div class='sub'>年化 " + ProbeInsight.money(cost * 12) + " · 按续费折算</div></article>" +
      "</section>"
    );
  }

  function digestBlock() {
    const servers = state.servers || [];
    const items = ProbeInsight.attention(servers);
    const online = servers.filter(function (s) { return s.online; }).length;
    if (!items.length) {
      return '<section class="digest is-clear" aria-label="需要留意"><span class="digest-lamp" aria-hidden="true"></span><strong>一切正常</strong><span>' + online + " 台在线，没有离线、超额、丢包或临近续费的节点。</span></section>";
    }
    return '<section class="digest" aria-label="需要留意"><header><span class="instrument-label">ATTENTION</span><strong>需要留意</strong><b>' + items.length + "</b><small>点击直接查看节点</small></header>" +
      '<div class="digest-items">' + items.map(function (x) {
        return '<button type="button" class="digest-item tone-' + x.tone + '" data-index="' + x.i + '"><span class="digest-kind">' + x.kind + "</span><strong>" + escAttr(x.s.name || "未命名") + "</strong><small>" + escAttr(x.text) + "</small></button>";
      }).join("") + "</div></section>";
  }

  function empty(title, text, opts) {
    const o = opts || {};
    morph(main,
      '<section class="state"' + (o.status ? ' role="status" aria-busy="' + (o.busy ? "true" : "false") + '"' : "") + ">" +
        ProbeCharts.wave({ w: 280, h: 64 }) +
        "<h2>" + title + "</h2>" +
        "<p>" + text + "</p>" +
        (o.retry ? '<button class="action-btn" type="button" data-retry>重新连接</button>' : "") +
      "</section>");
  }

  function renderChrome(r) {
    const titles = { nodes: state.title || "节点状态", network: "网络状况", resource: "资源概况" };
    titleEl.textContent = titles[r.home] || titles.nodes;
    titleEl.hidden = false;
    titleEl.dataset.desk = { nodes: "00", network: "01", resource: "02" }[r.home] || "00";
    const summaryEl = document.getElementById("page-summary");
    if (summaryEl) {
      const html = (liveMode || forcedDemo()) && state.enabled !== false ? ProbeInsight.summary(r.home, state.servers) : "";
      morph(summaryEl, html);
      summaryEl.hidden = !html;
    }
    Array.prototype.forEach.call(document.querySelectorAll("#site-nav [data-home]"), function (btn) {
      btn.classList.toggle("is-on", btn.getAttribute("data-home") === r.home);
    });
    const bar = document.getElementById("views");
    if (bar) {
      Array.prototype.forEach.call(bar.querySelectorAll("[data-view]"), function (el) {
        const on = r.view === el.getAttribute("data-view");
        el.classList.toggle("is-on", on);
        el.setAttribute("aria-pressed", on ? "true" : "false");
      });
      const g = bar.querySelector("[data-globe]");
      if (g) {
        g.classList.toggle("is-on", showGlobe);
        g.setAttribute("aria-pressed", showGlobe ? "true" : "false");
      }
    }
  }

  function escAttr(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function cmpServer(a, b, key) {
    function num(v) { return v == null || v < 0 ? 1e9 : v; }
    if (key === "ms") return num(pingMs(a)) - num(pingMs(b));
    if (key === "loss") return (pingLoss(a) || 0) - (pingLoss(b) || 0);
    if (key === "cpu") return (a.cpu_pct || 0) - (b.cpu_pct || 0);
    if (key === "mem") return pct(a.mem_used, a.mem_total) - pct(b.mem_used, b.mem_total);
    if (key === "disk") return pct(a.disk_used, a.disk_total) - pct(b.disk_used, b.disk_total);
    if (key === "traffic") return pct(a.traffic_used, a.traffic_limit) - pct(b.traffic_used, b.traffic_limit);
    if (key === "up") return (a.download_speed || 0) - (b.download_speed || 0);
    if (key === "days") return (a.uptime || 0) - (b.uptime || 0);
    if (key === "name") return (a.name || "").localeCompare(b.name || "", "zh");
    if (key === "cc") return (a.region_country || "").localeCompare(b.region_country || "");
    return 0;
  }

  function listedServers() {
    let items = (state.servers || []).map(function (s, i) { return { s: s, i: i }; });
    if (findQ) {
      const q = findQ.trim().toLowerCase();
      items = items.filter(function (it) {
        const s = it.s;
        return ((s.name || "").toLowerCase().indexOf(q) >= 0)
          || ((s.region_country || "").toLowerCase().indexOf(q) >= 0)
          || ((s.region_city || "").toLowerCase().indexOf(q) >= 0)
          || ((s.region_name || "").toLowerCase().indexOf(q) >= 0)
          || ((s.region_label || "").toLowerCase().indexOf(q) >= 0);
      });
    }
    items = items.filter(function (it) {
      return statusFilter === "all" || (statusFilter === "online" && it.s.online)
        || (statusFilter === "offline" && !it.s.online) || (statusFilter === "attention" && needsAttention(it.s));
    });
    if (regionFilter) items = items.filter(it => it.s.region_country === regionFilter);
    const dir = sortDir;
    const key = sortKey;
    items.sort(function (a, b) { return cmpServer(a.s, b.s, key) * dir; });
    return items;
  }

  function sortHead(key, label) {
    const on = sortKey === key;
    return '<button type="button" class="sort' + (on ? " is-on" : "") + '" data-sort="' + key + '">' + label + (on ? (sortDir > 0 ? " ↑" : " ↓") : "") + "</button>";
  }

  function listToolbar(r) {
    const servers = state.servers || [];
    const filters = [["all", "全部", servers.length], ["online", "在线", servers.filter(s => s.online).length], ["offline", "离线", servers.filter(s => !s.online).length], ["attention", "需关注", servers.filter(needsAttention).length]];
    return '<section class="node-toolbar" aria-label="节点筛选">' +
      '<div class="list-bar" id="views"><div class="list-bar-left"><h2 class="list-bar-k">节点清单</h2><span class="result-count" role="status">' + listedServers().length + ' / ' + servers.length + ' 台</span>' + (regionFilter ? '<button type="button" class="region-clear" data-region="' + escAttr(regionFilter) + '">' + escAttr(regionFilter) + ' ×</button>' : '') + '</div>' +
      '<div class="views">' + [["grid", "卡片", iconGrid()], ["column", "详细", iconColumn()], ["list", "列表", iconList()]].map(function (v) {
        return '<button class="view-btn' + (r.view === v[0] ? ' is-on' : '') + '" data-view="' + v[0] + '" type="button" aria-pressed="' + (r.view === v[0]) + '">' + v[2] + '<span>' + v[1] + '</span></button>';
      }).join('') + '<button class="view-btn globe-toggle' + (showGlobe ? ' is-on' : '') + '" data-globe type="button" aria-pressed="' + showGlobe + '">' + iconGlobe() + '<span>地球</span></button></div></div>' +
      '<div class="filter-row"><div class="status-filters" aria-label="节点状态">' + filters.map(function (f) {
        return '<button type="button" data-status="' + f[0] + '" class="filter-chip' + (statusFilter === f[0] ? ' is-on' : '') + '" aria-pressed="' + (statusFilter === f[0]) + '"' + (f[0] === 'attention' ? ' title="离线、CPU ≥ 85%、流量 ≥ 90% 或丢包 ≥ 2%"' : '') + '>' + f[1] + ' <span>' + f[2] + '</span></button>';
      }).join('') + '</div><div class="filter-tools"><label class="search-box"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg><input class="find" data-find type="search" aria-label="搜索节点名称或地区" placeholder="搜索名称、地区…" value="' + escAttr(findQ) + '" autocomplete="off" spellcheck="false"><kbd>/</kbd></label>' +
      '<select class="sort-select" data-order aria-label="节点排序">' + [["name", "名称"], ["cc", "地区"], ["ms", "延迟"], ["cpu", "CPU"], ["mem", "内存"], ["disk", "硬盘"], ["traffic", "流量占比"], ["up", "下行网速"], ["days", "在线时长"]].map(function (v) { return '<option value="' + v[0] + '"' + (sortKey === v[0] ? ' selected' : '') + '>按' + v[1] + '</option>'; }).join('') + '</select><button class="order-dir" type="button" data-sort="' + sortKey + '" aria-label="切换排序方向" title="' + (sortDir > 0 ? '当前升序' : '当前降序') + '">' + (sortDir > 0 ? '↑' : '↓') + '</button></div></div>' +
      '<div class="list-help"><span>' + (statusFilter === 'attention' ? '关注条件：离线 · CPU ≥ 85% · 流量 ≥ 90% · 丢包 ≥ 2%' : '点击节点查看详情 · 支持名称、地区搜索') + '</span>' + ((findQ || statusFilter !== 'all' || regionFilter) ? '<button data-reset type="button">清除筛选 ×</button>' : '<span>线路 / 落地延迟分别展示</span>') + '</div></section>';
  }

  function renderFoot() {
    paintConnection();
    if (!lastUpdated || state.enabled === false) { foot.innerHTML = ""; return; }
    const t = totals();
    morph(foot,
      "<div>总使用流量　<b>" + fmtBytes(t.used, 2) + " / " + fmtBytes(t.limit, 2) + "</b></div>" +
      "<div>在线服务器　<b>" + t.online + " / " + t.all + "</b></div>" +
      "<div>最后更新　<b>" + clock(lastUpdated) + "</b>　" + ProbeInsight.ago(lastUpdated) + "　·　" + (liveMode ? (state._source === "komari" ? "Komari 接口" : "官方接口") + (ProbeAPI.streamLive() ? " · 实时推送" : " · 定时刷新") : "演示数据") + "</div>");
  }

  function listEmpty() {
    return '<section class="state search-empty"><span class="empty-mark">⌕</span><h2>没有匹配的节点</h2><p>试试其他名称、地区，或清除当前筛选条件。</p><button class="action-btn" type="button" data-reset>清除筛选</button></section>';
  }

  function renderGrid(r) {
    refreshMarks();
    const items = listedServers();
    morph(main, fleetStrip() + digestBlock() + globePanel() + listToolbar(r) + (items.length
      ? '<section class="board" aria-label="网格排列">' + items.map(function (item) {
        return card(item.s, item.i);
      }).join("") + "</section>"
      : listEmpty()) + cycleBlock());
  }

  function renderColumn(r) {
    refreshMarks();
    const items = listedServers();
    morph(main, fleetStrip() + digestBlock() + globePanel() + listToolbar(r) + '<section class="stack" aria-label="列排列">' + items.map(function (item) {
      return slab(item.s, item.i);
    }).join("") + "</section>" + (items.length ? "" : listEmpty()) + cycleBlock());
  }

  function renderList(r) {
    refreshMarks();
    const items = listedServers();
    morph(main, fleetStrip() + digestBlock() + globePanel() + listToolbar(r) + '<section class="list" aria-label="横向排列">' + listHead() + items.map(function (item) {
      return row(item.s, item.i);
    }).join("") + "</section>" + (items.length ? "" : listEmpty()) + cycleBlock());
  }

  function nodeCtx(index) {
    const s = state.servers[index];
    if (!s) return null;
    const primary = ProbeAdapt.primaryPing(s);
    if (!targetKey && primary && primary.key) targetKey = primary.key;
    const ping = (s.ping || []).find(function (p) { return p.key === targetKey; }) || primary;
    const cacheKey = index + ":" + range + ":" + (targetKey || "avg");
    const cached = seriesCache[cacheKey];
    let sparkVals = [];
    if (cached && cached.length) sparkVals = cached;
    else if (range === "1h" && ping && ping.buckets) sparkVals = ping.buckets.map(function (b) { return b.ms; });
    else if (!liveMode && ping) {
      const hist = ProbeDemo.pingSeries(s, range, ping.key);
      sparkVals = (hist.series || []).map(function (p) { return p.value; });
    }
    return { s: s, ping: ping, sparkVals: sparkVals, st: dailyStats(s), last7: ProbeAdapt.lastDays(s.daily_traffic, 7), sys: systemState(index) };
  }

  function systemState(index) {
    const s = state.servers[index];
    if (!liveMode) return { range: sysRange, status: "ready", series: s ? ProbeDemo.systemSeries(s, sysRange).series : null };
    const cached = sysCache[index + ":" + sysRange];
    return { range: sysRange, status: cached ? "ready" : "loading", series: cached ? cached.series : null };
  }

  function ensureSystem(index) {
    const key = index + ":" + sysRange;
    const cached = sysCache[key];
    if (!liveMode || sysPending[key] || (cached && Date.now() - cached.at < 60000)) return;
    sysPending[key] = true;
    ProbeAPI.fetchSystem(index, sysRange).then(function (payload) {
      const series = payload && payload.series;
      sysCache[key] = { at: Date.now(), series: series && typeof series === "object" && !Array.isArray(series) && (series.cpu_pct || series.mem_used) ? series : null };
    }, function () {
      sysCache[key] = { at: Date.now(), series: null };
    }).then(function () {
      delete sysPending[key];
      if (route().node === index && ProbeConsole.tab === "system") renderWindow(index);
    });
  }

  function pageHTML(index) { const ctx = nodeCtx(index); return ctx ? ProbeConsole.detail(ctx) : ""; }

  function returnTarget() {
    return (lastFocusEl && lastFocusEl.isConnected && lastFocusEl) || (lastFocus && document.querySelector(lastFocus));
  }

  function closeWindow() {
    const r = route();
    go(viewHash(r.view || lastView));
    const el = returnTarget();
    if (el) el.focus();
  }

  function renderWindow(index, page) {
    document.getElementById("chart-tip").hidden = true;
    const opening = overlay.hidden;
    const scroll = winBody.scrollTop;
    const s = state.servers && state.servers[index];
    if (s == null) {
      overlay.hidden = true;
      document.body.classList.remove("is-locked");
      return;
    }
    if (window.ProbeWorkbench) ProbeWorkbench.detail(index);
    winTitle.textContent = s.name || "未命名";
    winKicker.textContent = ccText(s) + " / " + (ProbeAdapt.roleLabel(roleOf(s)) || "DETAIL");
    morph(winBody, pageHTML(index));
    overlay.hidden = false;
    document.body.classList.add("is-locked");
    document.documentElement.classList.add("is-locked");
    winBody.scrollTop = opening ? 0 : scroll;
    document.querySelector(".shell").inert = true;
    if (opening) document.getElementById("win-close").focus({ preventScroll: true });
    if (ProbeConsole.tab === "system") ensureSystem(index);
  }

  function globePanel() {
    if (!showGlobe) return "";
    const all = state.servers || [];
    const countries = new Set(all.map(s => s.region_country).filter(Boolean));
    function group(role, label) {
      const groups = {};
      all.forEach(function (s) {
        const r = roleOf(s);
        if (r !== role && r !== "mixed") return;
        const cc = s.region_country || "—";
        (groups[cc] = groups[cc] || []).push(s);
      });
      if (!Object.keys(groups).length) return '';
      return '<div class="atlas-group"><div class="lbl"><span>' + label + '</span><span>最低延迟</span></div>' + Object.keys(groups).sort().map(function (cc) {
        const list=groups[cc], valid=list.filter(s => s.online && pingMs(s,role)>=0).sort((a,b)=>pingMs(a,role)-pingMs(b,role));
        const ms=valid.length ? pingMs(valid[0],role) : -1;
        return '<button type="button" class="region-entry' + (regionFilter===cc?' is-on':'') + '" data-region="'+escAttr(cc)+'" aria-pressed="'+(regionFilter===cc)+'" aria-label="筛选 '+escAttr(cc)+' 节点"><span class="region-code">'+escAttr(cc)+'</span><span class="region-identity"><strong>'+escAttr(ProbeAdapt.COUNTRY_NAMES[cc]||'未知地区')+'</strong><small>'+list.length+' 个节点</small></span><span class="region-reading '+(ms>=0&&ms<80?'is-fast':'')+'">'+(ms<0?'—':ms)+'<small>'+(ms<0?'':'ms')+'</small></span><span class="region-track"><i style="width:'+(ms<0?0:Math.min(100,ms/2))+'%"></i></span></button>';
      }).join('')+'</div>';
    }
    return '<section class="home-globe observatory" aria-label="节点地球"><div class="atlas" data-canvas-ready="true"><div class="atlas-register" aria-hidden="true"><span>ORTHOGRAPHIC</span><span>01 / '+String(countries.size).padStart(2,'0')+'</span></div><canvas class="globe-canvas" tabindex="0" aria-label="节点地球，可使用方向键旋转，Enter 打开节点" aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Enter"></canvas><div class="atlas-bottom"><span class="globe-caption"></span><div class="globe-controls"><button type="button" data-globe-control="out" aria-label="缩小地球">−</button><button type="button" data-globe-control="reset" aria-label="复位地球">⟲</button><button type="button" data-globe-control="in" aria-label="放大地球">＋</button></div></div></div><aside class="atlas-side"><div class="regions-heading"><span class="instrument-label">REGIONS</span><strong>'+countries.size+'<small> 个地区</small></strong></div>'+group('line','线路')+group('land','落地')+'</aside></section>';
  }

  function hideWindow() {
    const wasOpen = !overlay.hidden;
    overlay.hidden = true;
    document.querySelector(".shell").inert = false;
    document.body.classList.remove("is-locked");
    document.documentElement.classList.remove("is-locked");
    winBody.innerHTML = "";
    if (wasOpen) { const el = returnTarget() || document.querySelector(".command-trigger"); if (el) el.focus({ preventScroll: true }); }
  }

  function renderNetwork() {
    const servers = state.servers || [];
    if (!servers.length) { morph(main, listEmpty()); return; }
    if (!servers[netIndex]) netIndex = 0;
    const s = servers[netIndex], targets = s.ping || [];
    if (netTarget !== "all" && !targets.some(p => p.key === netTarget)) netTarget = "all";
    const selected = netTarget === "all" ? targets : targets.filter(p => p.key === netTarget);
    const cacheKey = netIndex + ":" + range + ":" + (netTarget === "all" ? "avg" : netTarget);
    let vals = seriesCache[cacheKey] || [];
    if (!vals.length && (range === "1h" || !liveMode)) {
      const series = selected.map(p => !liveMode ? (ProbeDemo.pingSeries(s, range, p.key).series || []).map(v => v.value) : (p.buckets || []).map(b => b.ms));
      const length = Math.max(0, ...series.map(v => v.length));
      vals = Array.from({length}, (_,i) => {
        const available = series.map(v => v[i - length + v.length]).filter(v => typeof v === "number" && Number.isFinite(v) && v >= 0);
        return available.length ? Math.round(available.reduce((a,b)=>a+b,0)/available.length*10)/10 : -1;
      });
    }
    const chains = liveMode && state.show_forward === false ? [] : ProbeInsight.chains(state);
    morph(main, ProbeConsole.network({servers, index:netIndex, target:netTarget, range, values:vals, chains}));
  }

  function renderResource() {
    const servers = state.servers || [];
    morph(main, ProbeConsole.resource({servers, last7:ProbeAdapt.lastDaysAcross(servers,7), cost:monthCost(), settings:liveMode?state:{}}));
  }

  function renderBoard(r) {
    if (r.home === "network") renderNetwork();
    else if (r.home === "resource") renderResource();
    else if (r.view === "column") renderColumn(r);
    else if (r.view === "list") renderList(r);
    else renderGrid(r);
  }

  function render() {
    const persistentAtlas = main.querySelector(".atlas[data-canvas-ready]");
    const active = document.activeElement;
    const attrs = ["data-find", "data-order", "data-status", "data-sort", "data-view", "data-globe", "data-net", "data-nett", "data-range", "data-target", "data-index", "data-day", "data-resource-metric", "data-resource-order", "data-detail-tab", "data-matrix-node", "data-quick-compare", "data-scope-zoom", "data-scope-view", "data-sys-range"];
    const attr = active && attrs.find(k => active.hasAttribute(k));
    const value = attr ? active.getAttribute(attr) : null;
    const pos = active && active.selectionStart;
    const sample = attr === "data-scope-view" ? active.dataset.sample : undefined;
    renderContent();
    const newAtlas = main.querySelector(".atlas");
    if (newAtlas && window.ProbeGlobe) {
      if (persistentAtlas && newAtlas !== persistentAtlas) newAtlas.replaceWith(persistentAtlas);
      ProbeGlobe.update(persistentAtlas || newAtlas, state.servers, { onSelect: openNode });
      if (persistentAtlas && persistentAtlas.contains(active) && overlay.hidden && document.activeElement !== active) active.focus({ preventScroll: true });
    }
    if (window.ProbeWorkbench) ProbeWorkbench.sync({ servers: state.servers, openNode: openNode, fmtBytes: fmtBytes, fmtSpeed: fmtSpeed, pct: pct, primaryPing: primaryPing });
    if (attr && !active.isConnected) {
      const scope = overlay.hidden ? main : overlay;
      const next = Array.from(scope.querySelectorAll("[" + attr + "]")).find(el => el.tagName === active.tagName && el.getAttribute(attr) === value);
      if (next) { next.focus({ preventScroll: true }); if (attr === "data-scope-view") ProbeConsole.inspectSample(next, Number(sample || 0)); try { next.setSelectionRange(pos, pos); } catch (_) {} }
    } else if (sample != null) {
      ProbeConsole.inspectSample(active, Number(sample));
    }
    paintConnection();
    shownHome = route().home;
    if (window.ProbeFX) ProbeFX.enter(main, route().home + ":" + route().view);
    ProbeConsole.enhance(overlay.hidden ? main : overlay, location.hash + ":" + netIndex + ":" + netTarget + ":" + range + ":" + ProbeConsole.metric + ":" + (overlay.querySelector("[data-detail-content]")?.dataset.detailContent || ""));
  }

  function renderContent() {
    const r = route();
    const params = new URLSearchParams(location.search);
    const demo = params.get("state");
    renderChrome(r);

    if (!liveMode && !forcedDemo()) {
      const failed = loadState === "error";
      empty(failed ? "暂时无法连接探针" : "正在获取节点状态", failed ? "请检查网络连接，或稍后重试。" : "数据就绪后自动展示，请稍候。", { status: true, busy: loadState === "loading", retry: failed });
      foot.innerHTML = "";
      hideWindow();
      return;
    }
    if (demo === "error" || state.enabled === false) {
      empty("探针未开启", "当前没有可展示的公开探针数据。");
      foot.innerHTML = "";
      hideWindow();
      return;
    }
    if (demo === "empty" || !(state.servers && state.servers.length)) {
      empty("暂无节点", "还没有被选入探针站的服务器。");
      renderFoot();
      hideWindow();
      return;
    }

    renderBoard(r);
    renderFoot();

    if (r.node != null) renderWindow(r.node, r.page);
    else hideWindow();
    if (window.ProbeFX) ProbeFX.tickCounts(main);
  }

  function openNode(index, page) {
    ProbeConsole.resetDetail();
    lastFocus = 'button[data-index="' + index + '"]';
    lastFocusEl = null;
    targetKey = "";
    range = "1h";
    go(viewHash(route().view || lastView, index, page || "overview"));
    loadSeries(index).then(function () { if (route().node === index) renderWindow(index); });
  }

  function onMainClick(ev) {
    const matrix = ev.target.closest("[data-matrix-node]");
    if (matrix) { netIndex = Number(matrix.dataset.matrixNode); netTarget = matrix.dataset.matrixTarget; render(); loadSeries(netIndex, netTarget).then(render); return; }
    const region = ev.target.closest("[data-region]");
    if (region) {
      const cc = region.dataset.region;
      regionFilter = regionFilter === cc ? "" : cc;
      render();
      if (regionFilter && window.ProbeGlobe) ProbeGlobe.aim(ProbeAdapt.COUNTRY_LL[regionFilter]);
      return;
    }
    if (ev.target.closest("[data-retry]")) { refreshData(); return; }
    if (ev.target.closest("[data-reset]")) { findQ = ""; statusFilter = "all"; regionFilter = ""; render(); main.querySelector("[data-find]").focus({ preventScroll: true }); return; }
    const status = ev.target.closest("[data-status]");
    if (status) { statusFilter = status.dataset.status; render(); return; }
    const dayBtn = ev.target.closest("[data-day]");
    if (dayBtn) {
      pulseDay = Number(dayBtn.getAttribute("data-day"));
      pulsePicked = true;
      render();
      return;
    }
    const netBtn = ev.target.closest("[data-net]");
    if (netBtn) {
      netIndex = Number(netBtn.getAttribute("data-net"));
      netTarget = "all";
      loadSeries(netIndex, netTarget).then(render);
      return;
    }
    const nett = ev.target.closest("[data-nett]");
    if (nett) {
      netTarget = nett.getAttribute("data-nett");
      loadSeries(netIndex, netTarget).then(render);
      return;
    }
    const rangeBtn = ev.target.closest("[data-range]");
    if (rangeBtn) {
      range = rangeBtn.getAttribute("data-range");
      if (route().home === "network") {
        loadSeries(netIndex, netTarget).then(render);
      } else {
        render();
      }
      return;
    }
    const sortBtn = ev.target.closest("[data-sort]");
    if (sortBtn) {
      const k = sortBtn.getAttribute("data-sort");
      if (sortKey === k) sortDir = -sortDir;
      else {
        sortKey = k;
        sortDir = 1;
      }
      render();
      return;
    }
    const viewBtn = ev.target.closest("[data-view]");
    if (viewBtn) {
      localStorage.setItem("mmwx-view", viewBtn.getAttribute("data-view"));
      go(viewHash(viewBtn.getAttribute("data-view"), null, null, "nodes"));
      return;
    }
    const globeBtn = ev.target.closest("[data-globe]");
    if (globeBtn) {
      showGlobe = !showGlobe;
      localStorage.setItem("mmwx-globe", showGlobe ? "1" : "0");
      render();
      return;
    }
    const item = ev.target.closest("[data-index]");
    if (!item) return;
    openNode(Number(item.getAttribute("data-index")));
    lastFocusEl = item;
  }

  function onWindowClick(ev) {
    const pageBtn = ev.target.closest("[data-page]");
    if (pageBtn) {
      const r = route();
      go(viewHash(r.view || lastView, r.node, pageBtn.getAttribute("data-page")));
      return;
    }
    const sysBtn = ev.target.closest("[data-sys-range]");
    if (sysBtn) {
      sysRange = sysBtn.getAttribute("data-sys-range");
      renderWindow(route().node);
      return;
    }
    const rangeBtn = ev.target.closest("[data-range]");
    if (rangeBtn) {
      range = rangeBtn.getAttribute("data-range");
      loadSeries(route().node).then(function () { renderWindow(route().node); });
      return;
    }
    const targetBtn = ev.target.closest("[data-target]");
    if (targetBtn) {
      targetKey = targetBtn.getAttribute("data-target");
      loadSeries(route().node).then(function () { renderWindow(route().node); });
    }
  }

  function onKey(ev) {
    if (document.getElementById("workbench-dialog")?.open) return;
    if (ev.key === "Tab" && !overlay.hidden) {
      const els = Array.from(overlay.querySelectorAll('button:not([disabled]), a[href], input, select, [tabindex="0"]')).filter(el => el.getClientRects().length);
      const first = els[0], last = els[els.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
      return;
    }
    if (ev.key === "/" && overlay.hidden && !/INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)) {
      const input = main.querySelector("[data-find]");
      if (input) { ev.preventDefault(); input.focus(); }
      return;
    }
    if (ev.key === "Escape" && route().node != null) {
      closeWindow();
      return;
    }
    if (ev.target !== document.body && ev.target.tagName !== "BODY" && ev.target.tagName !== "BUTTON") return;
    if (ev.key === "g") go(viewHash("grid", route().node, route().page, "nodes"));
    if (ev.key === "c") go(viewHash("column", route().node, route().page, "nodes"));
    if (ev.key === "l") go(viewHash("list", route().node, route().page, "nodes"));
  }

  setTheme(currentTheme(), { instant: true });
  const themeBtn = document.getElementById("theme-toggle");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      setTheme(currentTheme() === "light" ? "dark" : "light", { after: render });
    });
  }

  document.getElementById("site-nav").addEventListener("click", function (ev) {
    const btn = ev.target.closest("[data-home]");
    if (!btn) return;
    const sec = btn.getAttribute("data-home");
    if (sec === "nodes") go(viewHash(lastView || "column", null, null, "nodes"));
    else go(viewHash(lastView, null, null, sec));
  });
  document.getElementById("win-close").addEventListener("click", closeWindow);
  document.getElementById("win-back").addEventListener("click", closeWindow);
  overlay.addEventListener("click", onWindowClick);
  main.addEventListener("click", onMainClick);
  main.addEventListener("change", function (ev) { if (ev.target.matches("[data-order]")) { sortKey = ev.target.value; sortDir = 1; render(); } });
  main.addEventListener("compositionstart", function () { composing = true; });
  main.addEventListener("compositionend", function (ev) { composing = false; ev.target.dispatchEvent(new Event("input", { bubbles: true })); });
  main.addEventListener("input", function (ev) {
    if (composing || !ev.target.closest("[data-find]")) return;
    findQ = ev.target.value;
    const pos = ev.target.selectionStart;
    render();
    const el = main.querySelector("[data-find]");
    if (el) {
      el.focus();
      try { el.setSelectionRange(pos, pos); } catch (e) {}
    }
  });
  window.addEventListener("hashchange", function () {
    const before = shownHome;
    render();
    if (before && before !== shownHome) window.scrollTo(0, 0);
  });
  window.addEventListener("keydown", onKey);
  function rebuildPulse() {
    const servers = state.servers || [];
    const byDate = {};
    servers.forEach(function (s) {
      (s.daily_traffic || []).forEach(function (d) {
        if (!d || !d.date) return;
        if (!byDate[d.date]) byDate[d.date] = { date: d.date, total: 0, peak: s.name, peakV: 0, loss: 0, offline: 0, acc: 0 };
        byDate[d.date].total += d.total || 0;
        if ((d.total || 0) > byDate[d.date].peakV) {
          byDate[d.date].peakV = d.total || 0;
          byDate[d.date].peak = s.name;
        }
      });
    });
    const first = servers[0];
    const now = new Date();
    const month = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-";
    const hasMonth = Object.keys(byDate).some(function (k) { return k.indexOf(month) === 0; });
    const start = hasMonth || !(first && first.period_start) ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(first.period_start + "T00:00:00");
    const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    const rows = [];
    let acc = 0;
    for (let d = 1; d <= daysInMonth; d += 1) {
      const date = start.getFullYear() + "-" + pad(start.getMonth() + 1) + "-" + pad(d);
      const hit = byDate[date];
      acc += hit ? hit.total : 0;
      rows.push({
        day: d,
        date: date,
        total: hit ? hit.total : 0,
        peak: hit ? hit.peak : "—",
        loss: 0,
        offline: 0,
        acc: acc,
      });
    }
    pulse = rows.length ? rows : ProbeDemo.monthPulse(servers);
    if (!pulsePicked) {
      const today = new Date().getDate();
      const latest = pulse.filter(function (p) { return p.day <= today && p.total > 0; }).pop();
      pulseDay = latest ? latest.day : today;
    }
  }

  function applyLive(payload) {
    if (!payload) return;
    var theme = payload.appearance && payload.appearance.theme;
    var builtin = { follow: 1, flat: 1, pixel: 1, anime: 1, premium: 1 };
    if (theme && builtin[theme] && location.pathname.indexOf("/line-grid") === 0) {
      location.replace("/");
      return;
    }
    state = ProbeAdapt.normalizePayload(payload);
    liveMode = true;
    loadState = "ready";
    lastUpdated = new Date();
    if (state.title) {
      document.title = state.title;
    }
    if (state.show_globe === false && localStorage.getItem("mmwx-globe") == null) {
      showGlobe = false;
    }
    fleetFlow();
    rebuildPulse();
    if ((window.ProbeGlobe && ProbeGlobe.dragging) || composing) return;
    if (document.hidden) { renderPending = true; return; }
    const y = window.scrollY;
    ticking = true;
    render();
    ticking = false;
    window.scrollTo(0, y);
    flashTicks();
  }

  function loadSeries(index, tgt) {
    if (!liveMode || index == null) return Promise.resolve();
    const t = tgt !== undefined ? tgt : targetKey;
    const key = index + ":" + range + ":" + (t && t !== "all" ? t : "avg");
    return ProbeAPI.fetchSeries(index, range, t && t !== "all" ? t : "").then(function (payload) {
      const vals = ProbeAPI.sparkFromSeries(payload);
      if (vals.length) seriesCache[key] = vals;
    });
  }

  function tickDemo() {
    if (!forcedDemo() || liveMode || document.hidden || (window.ProbeGlobe && ProbeGlobe.dragging) || composing) return;
    lastUpdated = new Date();
    (state.servers || []).forEach(function (s, i) {
      const src = ProbeDemo.payload.servers[i];
      if (!src || !s.online) return;
      const j = (Math.sin(Date.now() / 900 + i) + 1) / 2;
      s.download_speed = Math.round(src.download_speed * (0.92 + j * 0.12));
      s.upload_speed = Math.round(src.upload_speed * (0.9 + j * 0.14));
    });
    fleetFlow();
    const y = window.scrollY;
    ticking = true;
    render();
    ticking = false;
    window.scrollTo(0, y);
    flashTicks();
  }

  (function bindChartTip() {
    const tip = document.getElementById("chart-tip");
    if (!tip) return;
    let lastSvg = null;
    document.addEventListener("pointermove", function (ev) {
      const svg = ev.target.closest && ev.target.closest("svg.spark");
      if (lastSvg && lastSvg !== svg) {
        const prev = lastSvg.querySelector(".scope-cur");
        if (prev) prev.setAttribute("hidden", "");
      }
      lastSvg = svg;
      if (svg) {
        const pack = (svg.getAttribute("data-pts") || "").split(";").map(function (row) {
          const p = row.split(",");
          return { x: Number(p[0]), y: Number(p[1]), v: Number(p[2]) };
        }).filter(function (p) { return Number.isFinite(p.x); });
        const box = svg.getBoundingClientRect();
        const vb = svg.viewBox.baseVal;
        const x = ((ev.clientX - box.left) / Math.max(1, box.width)) * vb.width;
        let best = pack[0];
        let bestD = 1e9;
        pack.forEach(function (p) {
          const d = Math.abs(p.x - x);
          if (d < bestD) { bestD = d; best = p; }
        });
        const cur = svg.querySelector(".scope-cur");
        if (cur && best) {
          cur.removeAttribute("hidden");
          const line = cur.querySelector(".scope-v");
          const dot = cur.querySelector(".scope-dot");
          if (line) {
            line.setAttribute("x1", best.x);
            line.setAttribute("x2", best.x);
          }
          if (dot) {
            dot.setAttribute("cx", best.x);
            dot.setAttribute("cy", best.y);
          }
        }
      }
      const el = ev.target.closest && ev.target.closest("[data-tip]");
      if (!el) {
        tip.hidden = true;
        return;
      }
      tip.hidden = false;
      tip.textContent = el.getAttribute("data-tip") || "";
      const tx = Math.min(ev.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
      const ty = Math.min(ev.clientY + 12, window.innerHeight - tip.offsetHeight - 8);
      tip.style.left = tx + "px";
      tip.style.top = ty + "px";
    });
  })();

  setInterval(tickDemo, 5000);
  setInterval(function () { if (!document.hidden) renderFoot(); }, 1000);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) return;
    if (renderPending) {
      renderPending = false;
      const y = window.scrollY;
      render();
      window.scrollTo(0, y);
    }
    if (!forcedDemo() && (!lastUpdated || Date.now() - lastUpdated.getTime() > 25000)) refreshData();
  });

  ProbeConsole.configure({fmtBytes, fmtSpeed, fmtDays, trafficTips, cycles:CYCLE, carriers:CARRIER, range:()=>range, render, openNode});
  document.getElementById("refresh-data").addEventListener("click", refreshData);
  if (forcedDemo()) fleetFlow();
  render();
  if (forcedDemo()) return;
  refreshData();
  setInterval(function () { if (!document.hidden && !composing && (!lastUpdated || Date.now() - lastUpdated.getTime() > 25000)) refreshData(); }, 30000);
})();

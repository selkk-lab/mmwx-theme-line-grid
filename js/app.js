(function () {
  const U = ProbeDemo.units;
  const main = document.getElementById("main");
  const foot = document.getElementById("foot");
  const titleEl = document.getElementById("page-title");
  const overlay = document.getElementById("overlay");
  const winBody = document.getElementById("win-body");
  const winTitle = document.getElementById("win-title");
  const winKicker = document.getElementById("win-kicker");

  let state = ProbeDemo.snapshot();
  let range = "1h";
  let targetKey = "";
  let lastFocus = null;
  let lastView = "grid";
  let home = "nodes";
  let showGlobe = localStorage.getItem("mmwx-globe") !== "0";
  let globeLon = 80;
  let globeLat = 30;
  let globeDrag = null;
  let globeSkipClick = false;
  let globeLabelSide = {};
  let netIndex = 0;
  let netTarget = "all";
  let pulseDay = new Date().getDate();
  let pulse = ProbeDemo.monthPulse();
  let liveMode = false;
  let seriesCache = {};

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function hexToRgba(hex, a) {
    hex = String(hex || "").replace("#", "").trim();
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    const n = parseInt(hex, 16);
    if (!Number.isFinite(n)) return "rgba(213,208,196," + a + ")";
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
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

  function setTheme(mode) {
    const next = mode === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    document.documentElement.style.colorScheme = next;
    localStorage.setItem("mmwx-theme", next);
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;
    btn.innerHTML = next === "light" ? iconMoon() : iconSun();
    btn.setAttribute("aria-pressed", next === "light" ? "true" : "false");
    btn.setAttribute("aria-label", next === "light" ? "切换夜间模式" : "切换日间模式");
    btn.title = next === "light" ? "夜间" : "日间";
  }
  const PAGES = ["overview", "ping", "traffic", "routes", "system"];
  const PAGE_LABEL = { overview: "Overview", ping: "Latency", traffic: "Traffic", routes: "Return", system: "System" };
  const HOMES = ["nodes", "network", "resource"];
  const COUNTRY_LL = {
    HK: [114.2, 22.3], JP: [139.7, 35.7], DE: [8.7, 50.1], NL: [4.9, 52.4],
    US: [-118.2, 34.05], TW: [121.56, 25.03], AU: [151.21, -33.87], SG: [103.82, 1.35],
    KR: [126.98, 37.57], GB: [-0.13, 51.51], FR: [2.35, 48.86], CN: [121.47, 31.23],
  };

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

  function primaryPing(server) {
    return (server.ping && server.ping[0]) || null;
  }

  function pingMs(server) {
    const p = primaryPing(server);
    return p ? p.current_ms : -1;
  }

  function pingLoss(server) {
    const p = primaryPing(server);
    return p ? p.loss_pct : 0;
  }

  function dailyStats(server) {
    const rows = server.daily_traffic || [];
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
    let view = "grid";
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
    const base = !view || view === "grid" ? "" : "/" + view;
    if (node == null) return "#" + (base || "/");
    const rest = page && page !== "overview" ? "/" + page : "";
    return "#" + (base || "") + "/node/" + node + rest;
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

  function sparkOf(server, tall) {
    const p = primaryPing(server);
    const vals = p && p.buckets ? p.buckets.map(function (b) { return b.ms; }) : [20, 22, 21, 24, 23];
    const ms = pingMs(server);
    return (
      '<div class="spark-wrap">' +
        ProbeCharts.spark(vals, { w: tall ? 420 : 240, h: tall ? 64 : 40, color: ms >= 100 ? cssVar("--gold", "#c4a56a") : cssVar("--ink", "#d5d0c4"), tips: pingTips(vals, 5) }) +
        (tall ? "" : '<span class="ms' + (ms >= 100 ? " is-hot" : "") + '">' + (ms < 0 ? "—" : String(ms).padStart(3, "0") + " ms") + "</span>") +
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
        '<div class="meter"><span>CPU ' + Math.round(cpu) + '%</span><i style="--p:' + cpu + '%"></i></div>' +
        '<div class="meter"><span>内存 ' + Math.round(mem) + '%</span><i style="--p:' + mem + '%"></i></div>' +
        '<div class="meter"><span>硬盘 ' + Math.round(disk) + '%</span><i style="--p:' + disk + '%"></i></div>' +
      "</div>"
    );
  }

  function cardTone(server) {
    if (!server.online) return " is-down";
    const ms = pingMs(server);
    if (ms >= 150) return " is-bad";
    if (ms >= 100) return " is-hot";
    return " is-ok";
  }

  function card(server, i) {
    return (
      '<button class="cell' + cardTone(server) + '" data-index="' + i + '" type="button">' +
        '<div class="card">' +
          '<div class="card-face">' +
            '<div class="head">' +
              '<span class="cc">' + (server.region_country || "") + "</span>" +
              '<span class="name">' + (server.name || "未命名") + "</span>" +
              '<span class="dot' + (server.online ? "" : " is-off") + '"></span>' +
              '<span class="status">' + (server.online ? "在线" : "离线") + "</span>" +
            "</div>" +
            '<div class="speeds">' +
              '<span>实时网速　↓ <b>' + fmtSpeed(server.download_speed) + "</b>　↑ <b>" + fmtSpeed(server.upload_speed) + "</b></span>" +
            "</div>" +
            sparkOf(server) +
            meters(server) +
            quotaBar(server) +
            '<div class="meta">' +
              "<span>在线 " + fmtDays(server.uptime) + "</span>" +
            "</div>" +
          "</div>" +
        "</div>" +
      "</button>"
    );
  }

  function row(server, i) {
    const ms = pingMs(server);
    return (
      '<button class="row" data-index="' + i + '" type="button">' +
        '<span class="cc">' + (server.region_country || "") + "</span>" +
        '<span class="name">' + (server.name || "未命名") + "</span>" +
        '<span class="status">' + (server.online ? "在线" : "离线") + "</span>" +
        '<span class="speeds">↓ <b>' + fmtSpeed(server.download_speed) + "</b>　↑ <b>" + fmtSpeed(server.upload_speed) + "</b></span>" +
        '<span class="ms' + (ms >= 100 ? " is-hot" : "") + '">' + (ms < 0 ? "—" : ms + " ms") + "</span>" +
        sparkOf(server) +
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
        "<span>地区</span><span>名称</span><span>状态</span><span>实时网速</span><span>延迟</span><span>曲线</span>" +
        "<span>CPU</span><span>内存</span><span>硬盘</span><span>流量</span><span>在线</span>" +
      "</div>"
    );
  }

  function slab(server, i) {
    const ms = pingMs(server);
    const st = dailyStats(server);
    const last7 = (server.daily_traffic || []).slice(-7);
    const routes = (server.return_routes || []).map(function (rt) {
      return (CARRIER[rt.carrier] || rt.carrier) + " <b>" + (rt.route_type || "—") + "</b>";
    }).join("　");
    return (
      '<button class="slab" data-index="' + i + '" type="button">' +
        '<div class="slab-top">' +
          '<div class="head">' +
            '<span class="cc">' + (server.region_country || "") + "</span>" +
            '<span class="name">' + (server.name || "未命名") + "</span>" +
            '<span class="dot' + (server.online ? "" : " is-off") + '"></span>' +
            '<span class="status">' + (server.online ? "在线" : "离线") + " · " + (server.region_city || server.region_name || "") + "</span>" +
          "</div>" +
          '<span class="more">打开窗口 →</span>' +
        "</div>" +
        '<div class="slab-grid">' +
          "<div>" +
            '<div class="slab-ms' + (ms >= 100 ? " is-hot" : "") + '">' + (ms < 0 ? "—" : ms) + "<small>MS</small></div>" +
            '<div class="speeds">↓ <b>' + fmtSpeed(server.download_speed) + "</b>　↑ <b>" + fmtSpeed(server.upload_speed) + "</b></div>" +
            sparkOf(server, true) +
          "</div>" +
          "<div>" +
            meters(server) +
            '<div style="margin-top:14px">' + quotaBar(server) + "</div>" +
            '<div class="meta" style="margin-top:10px">' +
              "<span>在线 " + fmtDays(server.uptime) + "</span>" +
            "</div>" +
          "</div>" +
          "<div>" +
            '<div class="stat-col" style="margin-bottom:8px">近 7 日　均 ' + fmtBytes(st.avg, 1) + "　丢包 " + pingLoss(server).toFixed(2) + "%</div>" +
            ProbeCharts.bars(last7, { w: 280, h: 52, tips: trafficTips(last7) }) +
            '<div class="slab-routes">' + (routes || "暂无回程") + "</div>" +
          "</div>" +
        "</div>" +
      "</button>"
    );
  }

  function pulseInfo(day) {
    return pulse.find(function (p) { return p.day === day; }) || pulse[0];
  }

  function cycleBlock() {
    const today = new Date().getDate();
    const days = pulse.length || 31;
    const heights = pulse.map(function (p) { return p.total; });
    const usedToNow = pulse.filter(function (p) { return p.day <= today; }).reduce(function (a, b) { return a + b.total; }, 0);
    const half = pulse.find(function (p) { return p.acc >= usedToNow * 0.5 && p.day <= today; });
    const info = pulseInfo(pulseDay);
    const hits = pulse.map(function (p) {
      return '<button type="button" data-day="' + p.day + '" aria-label="' + p.date + '"></button>';
    }).join("");
    return (
      '<section class="cycle" aria-label="本月脉搏">' +
        '<div class="cycle-head">' +
          "<span>本月脉搏　<b>" + info.date.slice(5) + "</b>　全网 " + fmtBytes(info.total, 1) +
          (info.total ? "　最忙 " + info.peak : "") +
          (info.offline ? "　·　曾掉线" : "") +
          (info.loss >= 1 ? "　·　丢包 " + info.loss + "%" : "") +
          "</span>" +
          "<span>已过 " + today + "/" + days + "　累计 " + fmtBytes(usedToNow, 1) + "　空心点 = 过半</span>" +
        "</div>" +
        '<div class="ruler">' +
          ProbeCharts.ruler(today, days, { heights: heights, selected: pulseDay, halfDay: half ? half.day : 0 }) +
          '<div class="ruler-hit">' + hits + "</div>" +
        "</div>" +
      "</section>"
    );
  }

  function fleetStrip() {
    const t = totals();
    const regions = {};
    (state.servers || []).forEach(function (s) {
      const k = s.region_name || s.region_country || "—";
      regions[k] = (regions[k] || 0) + 1;
    });
    const down = (state.servers || []).reduce(function (a, s) { return a + (s.download_speed || 0); }, 0);
    const up = (state.servers || []).reduce(function (a, s) { return a + (s.upload_speed || 0); }, 0);
    return (
      '<section class="fleet" aria-label="集群概览">' +
        "<article><div class='lbl'>节点</div><div class='val'>" + t.all + "</div><div class='sub'>在线 " + t.online + " · 离线 " + (t.all - t.online) + "</div></article>" +
        "<article><div class='lbl'>地区</div><div class='val'>" + Object.keys(regions).length + "</div><div class='sub'>独立地域</div></article>" +
        "<article><div class='lbl'>下行合计</div><div class='val'>" + fmtSpeed(down) + "</div><div class='sub'>上行 " + fmtSpeed(up) + "</div></article>" +
        "<article><div class='lbl'>周期流量</div><div class='val'>" + fmtBytes(t.used, 1) + "</div><div class='sub'>限额 " + fmtBytes(t.limit, 2) + "</div></article>" +
      "</section>"
    );
  }

  function empty(title, text) {
    main.innerHTML =
      '<section class="state">' +
        ProbeCharts.wave({ w: 280, h: 64 }) +
        "<h2>" + title + "</h2>" +
        "<p>" + text + "</p>" +
      "</section>";
  }

  function renderChrome(r) {
    const titles = { nodes: state.title || "节点状态", network: "网络状况", resource: "资源概况" };
    titleEl.textContent = titles[r.home] || titles.nodes;
    titleEl.hidden = false;
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

  function listedServers() {
    return (state.servers || []).map(function (s, i) { return { s: s, i: i }; });
  }

  function listToolbar(r) {
    return (
      '<div class="list-bar" id="views">' +
        '<span class="list-bar-k">机器清单</span>' +
        '<div class="views">' +
          '<button class="icon-btn' + (r.view === "grid" ? " is-on" : "") + '" data-view="grid" type="button" aria-label="网格排列" title="网格">' + iconGrid() + "</button>" +
          '<button class="icon-btn' + (r.view === "column" ? " is-on" : "") + '" data-view="column" type="button" aria-label="列排列" title="列">' + iconColumn() + "</button>" +
          '<button class="icon-btn' + (r.view === "list" ? " is-on" : "") + '" data-view="list" type="button" aria-label="横向排列" title="横向">' + iconList() + "</button>" +
          '<button class="icon-btn' + (showGlobe ? " is-on" : "") + '" data-globe type="button" aria-label="显示地球" title="地球开/关">' + iconGlobe() + "</button>" +
        "</div>" +
      "</div>"
    );
  }

  function renderFoot() {
    const t = totals();
    foot.innerHTML =
      "<div>总使用流量　<b>" + fmtBytes(t.used, 2) + " / " + fmtBytes(t.limit, 2) + "</b></div>" +
      "<div>在线服务器　<b>" + t.online + " / " + t.all + "</b></div>" +
      "<div>最后更新　<b>" + clock(new Date()) + "</b>　·　" + (liveMode ? (state._source === "komari" ? "Komari 接口" : "官方接口") : "演示数据") + "</div>";
  }

  function listEmpty() {
    return '<section class="state"><h2>暂无节点</h2><p>官方接口还没有返回可展示的服务器。</p></section>';
  }

  function renderGrid(r) {
    const items = listedServers();
    main.innerHTML = fleetStrip() + globePanel() + listToolbar(r) + (items.length
      ? '<section class="board" aria-label="网格排列">' + items.map(function (item) {
        return card(item.s, item.i);
      }).join("") + "</section>"
      : listEmpty()) + cycleBlock();
  }

  function renderColumn(r) {
    const items = listedServers();
    main.innerHTML = fleetStrip() + globePanel() + listToolbar(r) + '<section class="stack" aria-label="列排列">' + items.map(function (item) {
      return slab(item.s, item.i);
    }).join("") + "</section>" + cycleBlock();
  }

  function renderList(r) {
    const items = listedServers();
    main.innerHTML = fleetStrip() + globePanel() + listToolbar(r) + '<section class="list" aria-label="横向排列">' + listHead() + items.map(function (item) {
      return row(item.s, item.i);
    }).join("") + "</section>" + cycleBlock();
  }

  function nodeCtx(index) {
    const s = state.servers[index];
    if (!s) return null;
    if (!targetKey && s.ping && s.ping[0]) targetKey = s.ping[0].key;
    const ping = (s.ping || []).find(function (p) { return p.key === targetKey; }) || (s.ping || [])[0];
    const cacheKey = index + ":" + range + ":" + (targetKey || "avg");
    const cached = seriesCache[cacheKey];
    let sparkVals = [];
    if (cached && cached.length) sparkVals = cached;
    else if (range === "1h" && ping && ping.buckets) sparkVals = ping.buckets.map(function (b) { return b.ms; });
    else if (!liveMode && ping) {
      const hist = ProbeDemo.pingSeries(s, range, ping.key);
      sparkVals = (hist.series || []).map(function (p) { return p.value; });
    }
    return { s: s, ping: ping, sparkVals: sparkVals, st: dailyStats(s), last7: (s.daily_traffic || []).slice(-7) };
  }

  function heroLine(s, ping) {
    const ms = ping ? ping.current_ms : -1;
    return (
      '<header class="hero">' +
        "<div>" +
          '<div class="hero-sub">' +
            (s.online ? "在线" : "离线") + " · " + (s.region_name || s.region_city || "") +
            (s.provider_name ? " · " + s.provider_name : "") +
            " · 在线 " + fmtDays(s.uptime) +
          "</div>" +
        "</div>" +
        '<div class="hero-pulse">' +
          '<div class="ms-xl">' + (ms < 0 ? "—" : ms) + "<small>MS</small></div>" +
        "</div>" +
      "</header>"
    );
  }

  function pageOverview(ctx) {
    const s = ctx.s;
    return (
      '<article class="page page-overview">' +
        heroLine(s, ctx.ping) +
        '<section class="kpi">' +
          '<article><div class="lbl">下行</div><div class="val">' + fmtSpeed(s.download_speed) + '</div><div class="sub">上行 ' + fmtSpeed(s.upload_speed) + "</div></article>" +
          '<article><div class="lbl">CPU</div><div class="val">' + Math.round(s.cpu_pct || 0) + '%</div><div class="sub">负载 ' + ((s.loadavg || "—").toString().trim().split(/\s+/).join(" · ")) + "</div></article>" +
          '<article><div class="lbl">内存</div><div class="val">' + Math.round(pct(s.mem_used, s.mem_total)) + '%</div><div class="sub">' + fmtBytes(s.mem_used, 1) + " / " + fmtBytes(s.mem_total, 0) + "</div></article>" +
          '<article><div class="lbl">硬盘</div><div class="val">' + Math.round(pct(s.disk_used, s.disk_total)) + '%</div><div class="sub">' + fmtBytes(s.disk_used, 0) + " / " + fmtBytes(s.disk_total, 0) + "</div></article>" +
          '<article><div class="lbl">周期流量</div><div class="val">' + fmtBytes(s.traffic_used, 1) + '</div><div class="sub">限额 ' + fmtBytes(s.traffic_limit, 2) + "</div></article>" +
        "</section>" +
        '<section class="panels" style="min-height:0;height:100%">' +
          '<div class="chart-fill"><div class="panel-h"><h3>延迟</h3><span class="hero-sub">丢包 ' + (ctx.ping ? ctx.ping.loss_pct.toFixed(2) : "0.00") + "%</span></div>" +
            ProbeCharts.spark(ctx.sparkVals, { w: 640, h: 180, color: cssVar("--ink", "#d5d0c4"), tips: pingTips(ctx.sparkVals, 5) }) +
          "</div>" +
          '<div class="chart-fill"><div class="panel-h"><h3>近 7 日</h3><span class="hero-sub">均 ' + fmtBytes(ctx.st.avg, 1) + "</span></div>" +
            ProbeCharts.bars(ctx.last7, { w: 360, h: 180 }) +
          "</div>" +
        "</section>" +
      "</article>"
    );
  }

  function pagePing(ctx) {
    const s = ctx.s;
    return (
      '<article class="page page-ping">' +
        '<div class="panel-h">' +
          "<div><h3 style='margin:0'>延迟 · 丢包 " + (ctx.ping ? ctx.ping.loss_pct.toFixed(2) : "0.00") + "%</h3></div>" +
          '<div class="seg">' +
            ["1h", "6h", "24h"].map(function (k) {
              return '<button type="button" data-range="' + k + '" class="' + (range === k ? "is-on" : "") + '">' + k + "</button>";
            }).join("") +
          "</div>" +
        "</div>" +
        '<div class="chart-fill">' +
          '<div class="targets">' +
            (s.ping || []).map(function (p) {
              return '<button type="button" class="chip' + (p.key === targetKey ? " is-on" : "") + '" data-target="' + p.key + '">' + p.label + " · " + p.current_ms + "ms</button>";
            }).join("") +
          "</div>" +
          ProbeCharts.spark(ctx.sparkVals, { w: 960, h: 260, color: cssVar("--ink", "#d5d0c4"), tips: pingTips(ctx.sparkVals, range === "24h" ? 30 : range === "6h" ? 10 : 5) }) +
        "</div>" +
        ProbeCharts.wave({ w: 960, h: 48 }) +
      "</article>"
    );
  }

  function pageTraffic(ctx) {
    const s = ctx.s;
    return (
      '<article class="page page-traffic">' +
        '<div style="margin:0 0 16px">' + quotaBar(s) + "</div>" +
        '<section class="kpi">' +
          '<article><div class="lbl">已用</div><div class="val">' + fmtBytes(s.traffic_used, 1) + '</div><div class="sub">限额 ' + fmtBytes(s.traffic_limit, 2) + "</div></article>" +
          '<article><div class="lbl">上行</div><div class="val">' + fmtBytes(s.traffic_used_up, 1) + '</div><div class="sub">本周期</div></article>' +
          '<article><div class="lbl">下行</div><div class="val">' + fmtBytes(s.traffic_used_down, 1) + '</div><div class="sub">本周期</div></article>' +
          '<article><div class="lbl">最高日</div><div class="val">' + fmtBytes(ctx.st.high, 1) + '</div><div class="sub">最低 ' + fmtBytes(ctx.st.low, 1) + "</div></article>" +
          '<article><div class="lbl">周期</div><div class="val">' + (s.period_start || "").slice(5) + '</div><div class="sub">至 ' + (s.period_end || "").slice(5) + "</div></article>" +
        "</section>" +
        '<div class="chart-fill"><div class="panel-h"><h3>近 7 日流量</h3><span class="hero-sub">日均 ' + fmtBytes(ctx.st.avg, 1) + "</span></div>" +
          ProbeCharts.bars(ctx.last7, { w: 960, h: 220 }) +
        "</div>" +
        '<section class="day-grid">' +
          ctx.last7.map(function (d) {
            return "<article><div class='lbl'>" + d.date.slice(5) + "</div><div class='val' style='font-size:16px'>" + fmtBytes(d.total, 1) + "</div><div class='hero-sub'>↑ " + fmtBytes(d.uplink, 1) + "　↓ " + fmtBytes(d.downlink, 1) + "</div></article>";
          }).join("") +
        "</section>" +
      "</article>"
    );
  }

  function pageRoutes(ctx) {
    const rows = ctx.s.return_routes || [];
    return (
      '<article class="page page-routes">' +
        '<div class="panel-h"><h3 style="margin:0">三网回程</h3><span class="hero-sub">最近一次探测</span></div>' +
        '<div class="route-cards">' +
          (rows.length ? rows.map(function (rt) {
            return '<article class="route-card"><div class="car">' + (CARRIER[rt.carrier] || rt.carrier) + "</div><div><h3>" + (rt.route_type || "—") + "</h3></div></article>";
          }).join("") : '<div class="hero-sub">此节点暂无回程数据</div>') +
        "</div>" +
      "</article>"
    );
  }

  function pageSystem(ctx) {
    const s = ctx.s;
    const cells = [
      ["系统", s.os || "—"],
      ["内核", s.kernel || "—"],
      ["架构", s.arch || "—"],
      ["处理器", (s.cpu_model || "—") + " · " + (s.cpu_cores || "—") + "C / " + (s.cpu_threads || "—") + "T"],
      ["负载", (s.loadavg || "—").toString().trim().split(/\s+/).join(" · ")],
      ["到期", s.expires_at || "—"],
      ["续费", (s.renewal_price_cny != null ? "¥" + s.renewal_price_cny : "—") + " / " + (CYCLE[s.renewal_cycle] || "")],
      ["周期", (s.period_start || "") + " → " + (s.period_end || "")],
    ];
    return (
      '<article class="page page-system">' +
        '<section class="spec">' +
          cells.map(function (c) {
            return "<article><div class='lbl'>" + c[0] + "</div><div class='val'>" + c[1] + "</div></article>";
          }).join("") +
        "</section>" +
      "</article>"
    );
  }

  function pageHTML(index) {
    const ctx = nodeCtx(index);
    if (!ctx) return "";
    const s = ctx.s;
    const routes = s.return_routes || [];
    return (
      '<article class="sheet">' +
        '<header class="sheet-head">' +
          '<div>' +
            '<div class="hero-sub">' + (s.online ? "在线" : "离线") + " · " + (s.region_name || "") + (s.provider_name ? " · " + s.provider_name : "") + " · " + fmtDays(s.uptime) + "</div>" +
          "</div>" +
          '<div class="ms-xl">' + (ctx.ping ? ctx.ping.current_ms : "—") + "<small>MS</small></div>" +
        "</header>" +
        ProbeCharts.wave({ w: 960, h: 36 }) +
        '<section class="kpi">' +
          '<article><div class="lbl">下行</div><div class="val">' + fmtSpeed(s.download_speed) + '</div><div class="sub">上行 ' + fmtSpeed(s.upload_speed) + "</div></article>" +
          '<article><div class="lbl">CPU</div><div class="val">' + Math.round(s.cpu_pct || 0) + '%</div><div class="sub">' + ((s.loadavg || "—").toString().trim().split(/\s+/).join(" · ")) + "</div></article>" +
          '<article><div class="lbl">内存</div><div class="val">' + Math.round(pct(s.mem_used, s.mem_total)) + '%</div><div class="sub">' + fmtBytes(s.mem_used, 1) + " / " + fmtBytes(s.mem_total, 0) + "</div></article>" +
          '<article><div class="lbl">硬盘</div><div class="val">' + Math.round(pct(s.disk_used, s.disk_total)) + '%</div><div class="sub">' + fmtBytes(s.disk_used, 0) + " / " + fmtBytes(s.disk_total, 0) + "</div></article>" +
          '<article><div class="lbl">流量</div><div class="val">' + fmtBytes(s.traffic_used, 1) + '</div><div class="sub">' + fmtBytes(s.traffic_limit, 2) + " · 丢包 " + (ctx.ping ? ctx.ping.loss_pct.toFixed(2) : "0") + "%</div></article>" +
        "</section>" +
        '<section class="sheet-mid">' +
          '<div class="panel tight">' +
            '<div class="panel-h"><h3>延迟</h3>' +
              '<div class="seg">' + ["1h", "6h", "24h"].map(function (k) {
                return '<button type="button" data-range="' + k + '" class="' + (range === k ? "is-on" : "") + '">' + k + "</button>";
              }).join("") + "</div>" +
            "</div>" +
            '<div class="targets">' +
              (s.ping || []).map(function (p) {
                return '<button type="button" class="chip' + (p.key === targetKey ? " is-on" : "") + '" data-target="' + p.key + '">' + p.label + " " + p.current_ms + "ms</button>";
              }).join("") +
            "</div>" +
            ProbeCharts.spark(ctx.sparkVals, { w: 520, h: 88, color: cssVar("--ink", "#d5d0c4"), tips: pingTips(ctx.sparkVals, range === "24h" ? 30 : range === "6h" ? 10 : 5) }) +
          "</div>" +
          '<div class="panel tight">' +
            '<div class="panel-h"><h3>近 7 日</h3><span class="hero-sub">均 ' + fmtBytes(ctx.st.avg, 1) + " · 高 " + fmtBytes(ctx.st.high, 1) + "</span></div>" +
            ProbeCharts.bars(ctx.last7, { w: 320, h: 88, tips: trafficTips(ctx.last7) }) +
            '<div class="day-inline">' + ctx.last7.map(function (d) {
              return "<span>" + d.date.slice(8) + " " + fmtBytes(d.total, 1) + "</span>";
            }).join("") + "</div>" +
          "</div>" +
        "</section>" +
        '<section class="sheet-bot">' +
          '<div class="panel tight">' +
            '<div class="panel-h"><h3>三网回程</h3></div>' +
            '<div class="routes compact">' +
              (routes.length ? routes.map(function (rt) {
                return '<div class="route"><span class="car">' + (CARRIER[rt.carrier] || rt.carrier) + "</span><span>" + (rt.route_type || "—") + "</span></div>";
              }).join("") : '<div class="hero-sub">暂无回程</div>') +
            "</div>" +
          "</div>" +
          '<div class="panel tight">' +
            '<div class="panel-h"><h3>系统</h3></div>' +
            '<div class="sys-grid">' +
              "<div>系统 <b>" + (s.os || "—") + "</b></div>" +
              "<div>内核 <b>" + (s.kernel || "—") + "</b></div>" +
              "<div>架构 <b>" + (s.arch || "—") + "</b></div>" +
              "<div>CPU <b>" + (s.cpu_model || "—") + " · " + (s.cpu_cores || "—") + "C/" + (s.cpu_threads || "—") + "T</b></div>" +
              "<div>到期 <b>" + (s.expires_at || "—") + "</b></div>" +
              "<div>续费 <b>¥" + (s.renewal_price_cny != null ? s.renewal_price_cny : "—") + " / " + (CYCLE[s.renewal_cycle] || "") + "</b></div>" +
            "</div>" +
          "</div>" +
        "</section>" +
      "</article>"
    );
  }

  function closeWindow() {
    const r = route();
    go(viewHash(r.view || lastView));
    if (lastFocus) {
      const el = document.querySelector(lastFocus);
      if (el) el.focus();
    }
  }

  function renderWindow(index, page) {
    const s = state.servers && state.servers[index];
    if (s == null) {
      overlay.hidden = true;
      document.body.classList.remove("is-locked");
      return;
    }
    winTitle.textContent = s.name || "未命名";
    winKicker.textContent = (s.region_country || "NODE") + " / " + (s.region_city || s.region_name || "DETAIL");
    winBody.innerHTML = pageHTML(index);
    overlay.hidden = false;
    document.body.classList.add("is-locked");
    document.documentElement.classList.add("is-locked");
    winBody.scrollTop = 0;
  }

  function wrapLon(lon) {
    return ((lon + 180) % 360 + 360) % 360 - 180;
  }

  function globeCaption() {
    const lon = Math.round(globeLon);
    const lat = Math.round(globeLat);
    return "ORTHOGRAPHIC · " + Math.abs(lon) + "°" + (lon >= 0 ? "E" : "W") + " " + Math.abs(lat) + "°" + (lat >= 0 ? "N" : "S");
  }

  function labelWidth(text) {
    let w = 0;
    for (let i = 0; i < text.length; i += 1) {
      w += text.charCodeAt(i) > 255 ? 8.6 : 5.05;
    }
    return w + 2;
  }

  function layoutGlobeLabels(cx, ortho) {
    const items = [];
    (state.servers || []).forEach(function (s, i) {
      const ll = COUNTRY_LL[s.region_country] || [80, 30];
      const p = ortho(ll[0], ll[1]);
      if (!p) return;
      const label = (s.region_country || "") + " · " + s.name;
      items.push({ i: i, s: s, px: p.x, py: p.y, label: label, w: labelWidth(label) });
    });

    const buckets = {};
    items.forEach(function (n) {
      const key = n.s.region_country || "?";
      (buckets[key] = buckets[key] || []).push(n);
    });
    Object.keys(buckets).forEach(function (key) {
      const g = buckets[key];
      if (g.length < 2) return;
      g.forEach(function (n, idx) {
        const a = (idx / g.length) * Math.PI * 2 - Math.PI / 2;
        n.px += Math.cos(a) * 4.2;
        n.py += Math.sin(a) * 4.2;
      });
    });

    const left = [];
    const right = [];
    items.forEach(function (n) {
      let side = n.px >= cx ? "R" : "L";
      if (globeLabelSide[n.i] && Math.abs(n.px - cx) < 22) side = globeLabelSide[n.i];
      if (side === "L" && n.w > 64) side = "R";
      (side === "L" ? left : right).push(n);
    });

    function stack(list, x, end) {
      list.sort(function (a, b) { return a.py - b.py || a.i - b.i; });
      if (!list.length) return;
      const gap = list.length > 14 ? 11 : 13;
      const mean = list.reduce(function (sum, n) { return sum + n.py; }, 0) / list.length;
      let y0 = mean - (list.length - 1) * gap / 2;
      if (y0 < 12) y0 = 12;
      const last = y0 + (list.length - 1) * gap;
      if (last > 204) y0 -= last - 204;
      if (y0 < 12) y0 = 12;
      list.forEach(function (n, idx) {
        n.lx = x;
        n.ly = y0 + idx * gap;
        n.end = end;
        globeLabelSide[n.i] = end ? "L" : "R";
      });
    }

    stack(left, 70, true);
    stack(right, 270, false);
    return items;
  }

  function globeMarkup() {
    const cx = 168;
    const cy = 112;
    const R = 92;
    const lon0 = globeLon * Math.PI / 180;
    const lat0 = globeLat * Math.PI / 180;
    const ink = hexToRgba(cssVar("--ink", "#d5d0c4"), 0.38);
    const dim = hexToRgba(cssVar("--ink", "#d5d0c4"), 0.14);
    function ortho(lonD, latD) {
      const lon = lonD * Math.PI / 180;
      const lat = latD * Math.PI / 180;
      const cosc = Math.sin(lat0) * Math.sin(lat) + Math.cos(lat0) * Math.cos(lat) * Math.cos(lon - lon0);
      if (cosc <= 0.02) return null;
      return {
        x: cx + R * Math.cos(lat) * Math.sin(lon - lon0),
        y: cy - R * (Math.cos(lat0) * Math.sin(lat) - Math.sin(lat0) * Math.cos(lat) * Math.cos(lon - lon0)),
        k: cosc,
      };
    }
    function curve(lonFixed, latFixed, from, to, step) {
      let d = "";
      let started = false;
      for (let a = from; a <= to; a += step) {
        const p = lonFixed != null ? ortho(lonFixed, a) : ortho(a, latFixed);
        if (!p) { started = false; continue; }
        d += (started ? " L " : "M ") + p.x.toFixed(2) + " " + p.y.toFixed(2);
        started = true;
      }
      return d ? '<path d="' + d + '" fill="none" stroke="' + dim + '" stroke-width="0.9"/>' : "";
    }
    let wire =
      '<defs><radialGradient id="globe-shade" cx="38%" cy="36%" r="68%">' +
        '<stop offset="0%" stop-color="' + cssVar("--ink", "#d5d0c4") + '" stop-opacity="0.05"/>' +
        '<stop offset="70%" stop-color="' + cssVar("--ink", "#d5d0c4") + '" stop-opacity="0"/>' +
        '<stop offset="100%" stop-color="' + cssVar("--void", "#0c0c0c") + '" stop-opacity="0.28"/>' +
      "</radialGradient></defs>" +
      '<circle class="globe-disk" cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="url(#globe-shade)" stroke="' + ink + '" stroke-width="1.05"/>';
    for (let lon = -180; lon < 180; lon += 30) wire += curve(lon, null, -80, 80, 4);
    for (let lat = -60; lat <= 60; lat += 30) wire += curve(null, lat, -180, 180, 4);
    wire += curve(null, 0, -180, 180, 3).replace('stroke-width="0.9"', 'stroke-width="1.15"');
    const sweepLon = ((Date.now() / 28) % 360) - 180;
    for (let k = 0; k < 6; k += 1) {
      const lon = sweepLon - k * 8;
      const sweep = curve(lon, null, -80, 80, 3);
      if (sweep) wire += sweep.replace('stroke-width="0.9"', 'stroke-width="' + (k === 0 ? 1.6 : 1.1) + '"').replace(dim, hexToRgba(cssVar("--ink", "#d5d0c4"), 0.42 - k * 0.06));
    }
    wire += '<line x1="48" y1="' + (cy + R + 16) + '" x2="288" y2="' + (cy + R + 16) + '" stroke="' + ink + '" stroke-width="1"/>';
    const laid = layoutGlobeLabels(cx, ortho);
    let links = "";
    const online = laid.filter(function (n) { return n.s.online; });
    online.forEach(function (a, i) {
      online.forEach(function (b, j) {
        if (j <= i) return;
        if ((a.s.region_country || "") === (b.s.region_country || "")) return;
        if ((a.i * 7 + b.i * 3) % 4 !== 1) return;
        const mx = (a.px + b.px) / 2;
        const my = (a.py + b.py) / 2;
        const qx = cx + (mx - cx) * 0.42;
        const qy = cy + (my - cy) * 0.42;
        links += '<path class="globe-link" d="M ' + a.px.toFixed(1) + " " + a.py.toFixed(1) + " Q " + qx.toFixed(1) + " " + qy.toFixed(1) + " " + b.px.toFixed(1) + " " + b.py.toFixed(1) + '" fill="none" stroke="' + ink + '" stroke-width="0.55" opacity="0.32"/>';
      });
    });
    const pins = laid.map(function (n) {
      const tx = n.end ? n.lx - 3 : n.lx + 3;
      return (
        '<g class="globe-node">' +
          '<path d="M ' + n.px.toFixed(1) + " " + n.py.toFixed(1) + " L " + n.lx.toFixed(1) + " " + n.ly.toFixed(1) + '" fill="none" stroke="' + ink + '" stroke-width="0.75"/>' +
          '<circle cx="' + n.px.toFixed(1) + '" cy="' + n.py.toFixed(1) + '" r="2.1" fill="none" stroke="' + (n.s.online ? ink : cssVar("--down", "#b06d52")) + '" stroke-width="1"/>' +
          '<text x="' + tx.toFixed(1) + '" y="' + (n.ly + 3).toFixed(1) + '" text-anchor="' + (n.end ? "end" : "start") + '" fill="' + cssVar("--ink-soft", "#b8b2a4") + '" font-size="8.5" font-family="IBM Plex Mono, monospace" stroke="' + cssVar("--void", "#0c0c0c") + '" stroke-width="3" paint-order="stroke" stroke-linejoin="round">' + n.label + "</text>" +
          '<circle class="hit" cx="' + n.px.toFixed(1) + '" cy="' + n.py.toFixed(1) + '" r="9" fill="transparent" data-index="' + n.i + '"/>' +
        "</g>"
      );
    }).join("");
    return wire + links + pins +
      '<text x="168" y="' + (cy + R + 28) + '" text-anchor="middle" fill="' + hexToRgba(cssVar("--ink", "#d5d0c4"), 0.28) + '" font-size="8" font-family="IBM Plex Mono, monospace" letter-spacing="1.4">' + globeCaption() + "</text>";
  }

  function globePanel() {
    if (!showGlobe) return "";
    const regions = {};
    (state.servers || []).forEach(function (s) {
      const k = (s.region_country || "") + " · " + (s.region_city || s.region_name || "");
      regions[k] = (regions[k] || 0) + 1;
    });
    const side = Object.keys(regions).map(function (k) {
      return '<div class="reg"><span>' + k + "</span><b>" + regions[k] + "</b></div>";
    }).join("");
    return (
      '<section class="home-globe" aria-label="节点地球">' +
        '<div class="atlas">' +
          '<svg viewBox="0 0 420 240" preserveAspectRatio="xMidYMid meet">' +
            globeMarkup() +
          "</svg>" +
        "</div>" +
        '<aside class="atlas-side"><div class="lbl">地区</div>' + side + "</aside>" +
      "</section>"
    );
  }

  function paintGlobe() {
    const svg = main.querySelector(".atlas svg");
    if (svg) svg.innerHTML = globeMarkup();
  }

  function onGlobeDown(ev) {
    const atlas = ev.target.closest(".atlas");
    if (!atlas || ev.button) return;
    globeDrag = {
      id: ev.pointerId,
      x: ev.clientX,
      y: ev.clientY,
      lon: globeLon,
      lat: globeLat,
      moved: false,
    };
    atlas.classList.add("is-drag");
    try { atlas.setPointerCapture(ev.pointerId); } catch (e) {}
  }

  function onGlobeMove(ev) {
    if (!globeDrag || ev.pointerId !== globeDrag.id) return;
    const dx = ev.clientX - globeDrag.x;
    const dy = ev.clientY - globeDrag.y;
    if (!globeDrag.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    globeDrag.moved = true;
    ev.preventDefault();
    globeLon = wrapLon(globeDrag.lon - dx * 0.48);
    globeLat = Math.max(-78, Math.min(78, globeDrag.lat + dy * 0.36));
    paintGlobe();
  }

  function onGlobeUp(ev) {
    if (!globeDrag || ev.pointerId !== globeDrag.id) return;
    const atlas = main.querySelector(".atlas");
    if (atlas) {
      atlas.classList.remove("is-drag");
      try { atlas.releasePointerCapture(ev.pointerId); } catch (e) {}
    }
    if (globeDrag.moved) globeSkipClick = true;
    globeDrag = null;
  }

  function hideWindow() {
    overlay.hidden = true;
    document.body.classList.remove("is-locked");
    document.documentElement.classList.remove("is-locked");
    winBody.innerHTML = "";
  }

  function renderNetwork() {
    const servers = state.servers || [];
    if (!servers.length) {
      main.innerHTML = listEmpty();
      return;
    }
    if (!servers[netIndex]) netIndex = 0;
    const s = servers[netIndex];
    const targets = s.ping || [];
    const chosen = netTarget === "all" ? null : targets.find(function (p) { return p.key === netTarget; });
    const avgMs = chosen ? chosen.current_ms : Math.round(targets.reduce(function (a, p) { return a + p.current_ms; }, 0) / Math.max(1, targets.length));
    const avgLoss = chosen ? chosen.loss_pct : targets.reduce(function (a, p) { return a + p.loss_pct; }, 0) / Math.max(1, targets.length);
    const sparkSrc = chosen || targets[0];
    const cacheKey = netIndex + ":" + range + ":" + (netTarget === "all" ? "avg" : netTarget);
    let vals = seriesCache[cacheKey] || [];
    if (!vals.length && range === "1h" && sparkSrc && sparkSrc.buckets) vals = sparkSrc.buckets.map(function (b) { return b.ms; });
    if (!vals.length && !liveMode && sparkSrc) {
      vals = (ProbeDemo.pingSeries(s, range, sparkSrc.key).series || []).map(function (p) { return p.value; });
    }
    const buckets = (sparkSrc && sparkSrc.buckets ? sparkSrc.buckets : vals.map(function (ms) { return { ms: ms, loss: 0 }; })).slice(-12);
    main.innerHTML =
      '<section class="subpage">' +
        "<p class='lead'>按服务器与探测目标查看延迟、丢包和时间桶。</p>" +
        '<div class="pick" style="margin-bottom:16px">' +
          servers.map(function (item, i) {
            return '<button type="button" class="chip' + (i === netIndex ? " is-on" : "") + '" data-net="' + i + '">' + item.name + "</button>";
          }).join("") +
        "</div>" +
        '<section class="kpi">' +
          "<article><div class='lbl'>平均延迟</div><div class='val'>" + avgMs + " ms</div><div class='sub'>" + s.name + "</div></article>" +
          "<article><div class='lbl'>平均丢包</div><div class='val'>" + avgLoss.toFixed(2) + "%</div><div class='sub'>所选目标</div></article>" +
          "<article><div class='lbl'>时间范围</div><div class='val'>" + range + "</div><div class='sub'>1h / 6h / 24h</div></article>" +
          "<article><div class='lbl'>探测目标</div><div class='val'>" + targets.length + "</div><div class='sub'>当前服务器配置</div></article>" +
        "</section>" +
        '<div class="panel-h" style="margin:16px 0 10px">' +
          '<div class="pick">' +
            '<button type="button" class="chip' + (netTarget === "all" ? " is-on" : "") + '" data-nett="all">全部平均</button>' +
            targets.map(function (p) {
              return '<button type="button" class="chip' + (netTarget === p.key ? " is-on" : "") + '" data-nett="' + p.key + '">' + p.label + " · " + p.isp + "</button>";
            }).join("") +
          "</div>" +
          '<div class="seg">' +
            ["1h", "6h", "24h"].map(function (k) {
              return '<button type="button" data-range="' + k + '" class="' + (range === k ? "is-on" : "") + '">' + k + "</button>";
            }).join("") +
          "</div>" +
        "</div>" +
        '<div class="chart-fill" style="height:220px">' + ProbeCharts.spark(vals, { w: 960, h: 200, color: cssVar("--ink", "#d5d0c4"), tips: pingTips(vals, range === "24h" ? 30 : range === "6h" ? 10 : 5) }) + "</div>" +
        '<div class="bucket-strip" style="margin-top:14px">' +
          buckets.map(function (b, i) {
            const label = b.t ? new Date(b.t * 1000).toTimeString().slice(0, 5) : String(i + 1);
            return "<article><div class='lbl'>" + label + "</div><div class='val' style='font-size:16px'>" + (b.ms < 0 ? "—" : b.ms + " ms") + "</div><div class='hero-sub'>丢包 " + (b.loss || 0).toFixed(1) + "%</div></article>";
          }).join("") +
        "</div>" +
      "</section>" + cycleBlock();
  }

  function renderResource() {
    const servers = state.servers || [];
    const last7 = [];
    for (let i = 0; i < 7; i += 1) {
      let up = 0;
      let down = 0;
      let date = "";
      servers.forEach(function (s) {
        const row = (s.daily_traffic || [])[i];
        if (!row) return;
        up += row.uplink;
        down += row.downlink;
        date = row.date;
      });
      last7.push({ date: date, uplink: up, downlink: down, total: up + down });
    }
    const monthCost = servers.reduce(function (a, s) {
      const c = s.renewal_price_cny || 0;
      if (s.renewal_cycle === "year") return a + c / 12;
      if (s.renewal_cycle === "quarter") return a + c / 3;
      if (s.renewal_cycle === "half_year") return a + c / 6;
      return a + c;
    }, 0);
    const ranked = servers.slice().sort(function (a, b) {
      return pct(b.traffic_used, b.traffic_limit) - pct(a.traffic_used, a.traffic_limit);
    });
    const heat = servers.slice().sort(function (a, b) { return (b.cpu_pct || 0) - (a.cpu_pct || 0); });
    const soon = servers.slice().sort(function (a, b) { return (a.expires_at || "9").localeCompare(b.expires_at || "9"); }).slice(0, 6);
    const t = totals();
    const on = function (key) { return !liveMode || state[key] !== false; };
    let body = '<section class="subpage"><p class="lead">' + t.online + "/" + t.all + " 台在线。</p>";
    body += '<section class="kpi">' +
      "<article><div class='lbl'>月均成本</div><div class='val'>¥" + monthCost.toFixed(0) + "</div><div class='sub'>按续费折算</div></article>" +
      "<article><div class='lbl'>年化预算</div><div class='val'>¥" + (monthCost * 12).toFixed(0) + "</div><div class='sub'>官方汇率</div></article>" +
      "<article><div class='lbl'>周期用量</div><div class='val'>" + fmtBytes(t.used, 1) + "</div><div class='sub'>限额 " + fmtBytes(t.limit, 2) + "</div></article>" +
      "<article><div class='lbl'>有限额</div><div class='val'>" + servers.filter(function (s) { return s.traffic_limit; }).length + "</div><div class='sub'>台服务器</div></article></section>";
    if (on("show_traffic_7d") || on("show_traffic_quota")) {
      body += '<section class="panels" style="margin-top:16px">';
      if (on("show_traffic_7d")) {
        body += '<div class="panel"><div class="panel-h"><h3>近 7 日上下行</h3><span class="hero-sub">金 = 上行　灰 = 下行</span></div>' +
          ProbeCharts.stacked(last7, { w: 520, h: 140, tips: trafficTips(last7) }) + "</div>";
      }
      if (on("show_traffic_quota")) {
        body += '<div class="panel"><div class="panel-h"><h3>额度使用率</h3></div>' +
          ranked.slice(0, 5).map(function (s) {
            const p = pct(s.traffic_used, s.traffic_limit);
            return '<div class="rank" style="margin:10px 0"><div class="reg"><span>' + s.name + "</span><b>" + Math.round(p) + "%</b></div><i style='--p:" + p + "%'></i></div>";
          }).join("") + "</div>";
      }
      body += "</section>";
    }
    if (on("show_resource_heatmap")) {
      body += '<div class="panel" style="margin-top:16px"><div class="panel-h"><h3>资源压力</h3><span class="hero-sub">CPU · 内存 · 硬盘</span></div>' +
        '<table class="heat"><thead><tr><th>服务器</th><th>CPU</th><th>内存</th><th>硬盘</th></tr></thead><tbody>' +
        heat.map(function (s) {
          return "<tr><td>" + s.name + "</td><td>" + Math.round(s.cpu_pct || 0) + "%<i class='bar'><i style='width:" + (s.cpu_pct || 0) + "%'></i></i></td><td>" +
            Math.round(pct(s.mem_used, s.mem_total)) + "%</td><td>" + Math.round(pct(s.disk_used, s.disk_total)) + "%</td></tr>";
        }).join("") + "</tbody></table></div>";
    }
    if (on("show_renewal_timeline")) {
      body += '<div class="panel" style="margin-top:16px"><div class="panel-h"><h3>续费与到期</h3><span class="hero-sub">按到期日</span></div><div class="timeline">' +
        soon.map(function (s) {
          const days = s.expires_at ? Math.max(0, Math.round((new Date(s.expires_at) - new Date()) / 86400000)) : "—";
          return "<article><div>" + (s.expires_at || "—") + "</div><b>" + s.name + "</b>" + days + " 天后　¥" + (s.renewal_price_cny || 0) + "</article>";
        }).join("") + "</div></div>";
    }
    main.innerHTML = body + "</section>" + cycleBlock();
  }

  function renderBoard(r) {
    if (r.home === "network") renderNetwork();
    else if (r.home === "resource") renderResource();
    else if (r.view === "column") renderColumn(r);
    else if (r.view === "list") renderList(r);
    else renderGrid(r);
  }

  function render() {
    const r = route();
    const params = new URLSearchParams(location.search);
    const demo = params.get("state");
    renderChrome(r);

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
  }

  function openNode(index, page) {
    lastFocus = '[data-index="' + index + '"]';
    targetKey = "";
    range = "1h";
    go(viewHash(route().view || lastView, index, page || "overview"));
    loadSeries(index);
  }

  function onMainClick(ev) {
    const dayBtn = ev.target.closest("[data-day]");
    if (dayBtn) {
      pulseDay = Number(dayBtn.getAttribute("data-day"));
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
    const viewBtn = ev.target.closest("[data-view]");
    if (viewBtn) {
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
    if (globeSkipClick) {
      globeSkipClick = false;
      if (ev.target.closest(".atlas")) return;
    }
    const item = ev.target.closest("[data-index]");
    if (!item) return;
    openNode(Number(item.getAttribute("data-index")));
  }

  function onWindowClick(ev) {
    const pageBtn = ev.target.closest("[data-page]");
    if (pageBtn) {
      const r = route();
      go(viewHash(r.view || lastView, r.node, pageBtn.getAttribute("data-page")));
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
    if (ev.key === "Escape" && route().node != null) {
      closeWindow();
      return;
    }
    if (ev.target !== document.body && ev.target.tagName !== "BODY" && ev.target.tagName !== "BUTTON") return;
    if (ev.key === "g") go(viewHash("grid", route().node, route().page, "nodes"));
    if (ev.key === "c") go(viewHash("column", route().node, route().page, "nodes"));
    if (ev.key === "l") go(viewHash("list", route().node, route().page, "nodes"));
  }

  setTheme(currentTheme());
  const themeBtn = document.getElementById("theme-toggle");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      setTheme(currentTheme() === "light" ? "dark" : "light");
      render();
    });
  }

  document.getElementById("site-nav").addEventListener("click", function (ev) {
    const btn = ev.target.closest("[data-home]");
    if (!btn) return;
    const sec = btn.getAttribute("data-home");
    if (sec === "nodes") go(viewHash(lastView || "grid", null, null, "nodes"));
    else go(viewHash(lastView, null, null, sec));
  });
  document.getElementById("win-close").addEventListener("click", closeWindow);
  document.getElementById("win-back").addEventListener("click", closeWindow);
  overlay.addEventListener("click", onWindowClick);
  main.addEventListener("click", onMainClick);
  main.addEventListener("pointerdown", onGlobeDown);
  main.addEventListener("pointermove", onGlobeMove);
  main.addEventListener("pointerup", onGlobeUp);
  main.addEventListener("pointercancel", onGlobeUp);
  window.addEventListener("hashchange", render);
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
    const start = first && first.period_start ? new Date(first.period_start + "T00:00:00") : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
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
  }

  function applyLive(payload) {
    if (!payload || payload.enabled === false) return;
    var theme = payload.appearance && payload.appearance.theme;
    var builtin = { follow: 1, flat: 1, pixel: 1, anime: 1, premium: 1 };
    if (theme && builtin[theme] && location.pathname.indexOf("/line-grid") === 0) {
      location.replace("/");
      return;
    }
    state = payload;
    liveMode = true;
    if (state.title) {
      document.title = state.title;
    }
    if (state.show_globe === false && localStorage.getItem("mmwx-globe") == null) {
      showGlobe = false;
    }
    rebuildPulse();
    if (globeDrag) return;
    const y = window.scrollY;
    const r = route();
    render();
    window.scrollTo(0, y);
    if (r.node != null) renderWindow(r.node);
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
    if (liveMode || globeDrag) return;
    (state.servers || []).forEach(function (s, i) {
      const src = ProbeDemo.payload.servers[i];
      if (!src || !s.online) return;
      const j = (Math.sin(Date.now() / 900 + i) + 1) / 2;
      s.download_speed = Math.round(src.download_speed * (0.92 + j * 0.12));
      s.upload_speed = Math.round(src.upload_speed * (0.9 + j * 0.14));
    });
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
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
  setInterval(renderFoot, 1000);

  (function startGlobeIdle() {
    let last = 0;
    function frame(t) {
      requestAnimationFrame(frame);
      if (t - last < 70) return;
      last = t;
      if (!showGlobe || globeDrag || document.hidden) return;
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (route().home !== "nodes") return;
      if (overlay && !overlay.hidden) return;
      if (!main.querySelector(".atlas svg")) return;
      globeLon = wrapLon(globeLon + 0.18);
      paintGlobe();
    }
    requestAnimationFrame(frame);
  })();

  render();
  ProbeAPI.fetchServers().then(function (payload) {
    if (!payload || payload.enabled === false) return;
    applyLive(payload);
    ProbeAPI.connectWS(applyLive);
  });
})();

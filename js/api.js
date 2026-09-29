(function (global) {
  function trimSlash(s) {
    return String(s || "").replace(/\/+$/, "");
  }

  function base() {
    const q = new URLSearchParams(location.search);
    if (q.get("demo") === "1") return "";
    if (q.get("api")) return trimSlash(q.get("api"));
    if (global.ProbeConfig && ProbeConfig.apiBase != null) return trimSlash(ProbeConfig.apiBase);
    return "";
  }

  function token() {
    const q = new URLSearchParams(location.search);
    return q.get("token") || localStorage.getItem("mmwx-token") || "";
  }

  function headers() {
    const h = { Accept: "application/json" };
    const t = token();
    if (t) h["X-MMwx-Probe-Token"] = t;
    return h;
  }

  function join(path) {
    const root = base();
    return root ? root + path : path;
  }

  function getJSON(path) {
    if (!base() && location.protocol === "file:") return Promise.resolve(null);
    const controller = new AbortController();
    const timeout = setTimeout(function () { controller.abort(); }, 8000);
    return fetch(join(path), { headers: headers(), credentials: "omit", cache: "no-store", signal: controller.signal })
      .then(function (res) {
        const type = res.headers.get("content-type") || "";
        if (!res.ok || type.indexOf("json") < 0) return null;
        return res.json();
      })
      .catch(function () { return null; }).finally(function () { clearTimeout(timeout); });
  }

  function firstJSON(paths) {
    return paths.reduce(function (prev, path) {
      return prev.then(function (data) {
        if (data) return data;
        return getJSON(path);
      });
    }, Promise.resolve(null));
  }

  let lastSource = "";

  function forcedSource() {
    const q = new URLSearchParams(location.search).get("src");
    if (q) return q;
    if (global.ProbeConfig && ProbeConfig.source) return ProbeConfig.source;
    return "";
  }

  function fetchKomari() {
    if (!global.KomariAdapt) return Promise.resolve(null);
    return Promise.all([
      getJSON("/api/nodes"),
      getJSON("/api/public"),
    ]).then(function (parts) {
      if (!KomariAdapt.looksLikeNodes(parts[0])) return null;
      KomariAdapt.remember(parts[0], parts[1]);
      lastSource = "komari";
      const payload = KomariAdapt.toPayload(parts[0], null, parts[1]);
      const jobs = (payload.servers || []).slice(0, 40).map(function (s) {
        if (!s.uuid) return Promise.resolve();
        return getJSON("/api/records/ping?uuid=" + encodeURIComponent(s.uuid) + "&hours=1").then(function (raw) {
          const ping = KomariAdapt.pingFromRecords(raw);
          if (ping && ping.length) {
            s.ping = ping;
            KomariAdapt.setPings(s.uuid, ping);
          }
        }).catch(function () {});
      });
      return Promise.all(jobs).then(function () { return payload; });
    });
  }

  function fetchServers() {
    if (forcedSource() === "komari") return fetchKomari();
    return firstJSON(["/api/probe", "/api/public/probe-servers"]).then(function (data) {
      if (data && data.servers) {
        lastSource = "mmwx";
        return data;
      }
      return fetchKomari().then(function (k) { return k || data; });
    });
  }

  function fetchSeries(index, range, target) {
    const q = new URLSearchParams();
    q.set("server", String(index));
    q.set("range", range || "1h");
    if (target && target !== "all") q.set("target", target);
    const qs = q.toString();
    return firstJSON([
      "/api/series?" + qs,
      "/api/public/probe-series?" + qs + "&metric=ping",
    ]);
  }

  function fetchSystem(index, range) {
    const q = new URLSearchParams();
    q.set("server", String(index));
    q.set("range", range || "1h");
    q.set("metric", "system");
    return firstJSON(["/api/series?" + q, "/api/public/probe-series?" + q]);
  }

  let current = null;

  function streamLive() {
    return !!(current && current.socket && current.socket.readyState === 1);
  }

  function wsRoot() {
    const root = base();
    if (!root && location.protocol === "file:") return "";
    return (root || (location.protocol + "//" + location.host)).replace(/^http/i, "ws");
  }

  // Keeps one socket alive: alternate URLs are tried only until one has opened, dropped sockets
  // reconnect with capped backoff, a silent socket is recycled, and a page hidden for a minute disconnects.
  function stream(urls, handlers) {
    const QUIET_MS = 30000, IDLE_MS = 60000;
    let index = 0, confirmed = false, retry = 0, ws = null, timer = 0, watchdog = 0, idle = 0;
    function live() { return ws && ws.readyState <= 1; }
    function drop(socket, reconnect) {
      if (ws !== socket) return;
      ws = null;
      clearTimeout(watchdog);
      try { socket.close(); } catch (err) {}
      if (handlers.close) handlers.close();
      if (reconnect) failed(true);
    }
    function arm(socket) {
      clearTimeout(watchdog);
      watchdog = setTimeout(function () { drop(socket, true); }, QUIET_MS);
    }
    function schedule() {
      clearTimeout(timer);
      if (document.hidden) return;
      const delay = Math.min(30000, 1000 * Math.pow(2, retry)) * (0.75 + Math.random() * 0.5);
      retry += 1;
      timer = setTimeout(open, delay);
    }
    function failed(opened) {
      if (!confirmed && !opened && index < urls.length - 1) { index += 1; open(); return; }
      if (!confirmed) index = 0;
      schedule();
    }
    function open() {
      clearTimeout(timer);
      if (live()) return;
      let socket;
      let opened = false;
      try { socket = new WebSocket(urls[index]); } catch (err) { failed(false); return; }
      ws = socket;
      socket.onopen = function () {
        opened = true; confirmed = true; retry = 0;
        arm(socket);
        if (handlers.open) handlers.open(socket);
      };
      socket.onmessage = function (ev) { if (ws !== socket) return; arm(socket); handlers.message(ev.data, socket); };
      socket.onclose = function () {
        if (ws !== socket) return;
        ws = null;
        clearTimeout(watchdog);
        if (handlers.close) handlers.close();
        failed(opened);
      };
    }
    function resume() {
      clearTimeout(idle);
      if (!live()) { retry = 0; open(); }
    }
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) { resume(); return; }
      clearTimeout(idle);
      idle = setTimeout(function () {
        clearTimeout(timer);
        if (document.hidden && ws) drop(ws, false);
      }, IDLE_MS);
    });
    window.addEventListener("online", resume);
    open();
    return { get socket() { return ws; } };
  }

  function connectKomari(onPayload) {
    const root = wsRoot();
    if (!root) return null;
    let timer = 0;
    return current = stream([root + "/api/clients"], {
      open: function (ws) {
        function ask() { if (ws.readyState === 1) { try { ws.send("get"); } catch (err) {} } }
        ask();
        clearInterval(timer);
        timer = setInterval(ask, 2000);
      },
      message: function (raw) {
        if (raw === "get") return;
        let msg = raw;
        try { if (typeof msg === "string") msg = JSON.parse(msg); } catch (err) { return; }
        if (!msg || typeof msg !== "object") return;
        onPayload(KomariAdapt.toPayload(null, msg, null));
      },
      close: function () { clearInterval(timer); },
    });
  }

  function connectWS(onPayload) {
    if (forcedSource() === "komari" || lastSource === "komari") return connectKomari(onPayload);
    const root = wsRoot();
    if (!root) return null;
    const q = token() ? "?token=" + encodeURIComponent(token()) : "";
    return current = stream([root + "/api/stream" + q, root + "/api/public/probe-ws" + q], {
      message: function (raw) {
        try {
          const data = JSON.parse(raw);
          if (data && typeof data === "object") onPayload(data);
        } catch (err) {}
      },
    });
  }

  function sparkFromSeries(payload) {
    if (!payload) return [];
    const series = payload.series;
    if (!series) return [];
    if (Array.isArray(series)) return series.map(function (p) { return p.value; });
    if (series.buckets) return series.buckets.map(function (b) { return b.ms; });
    return [];
  }

  global.ProbeAPI = {
    base: base,
    fetchServers: fetchServers,
    fetchSeries: fetchSeries,
    fetchSystem: fetchSystem,
    connectWS: connectWS,
    streamLive: streamLive,
    sparkFromSeries: sparkFromSeries,
  };
})(window);

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
    return fetch(join(path), { headers: headers(), credentials: "omit", cache: "no-store" })
      .then(function (res) {
        const type = res.headers.get("content-type") || "";
        if (!res.ok || type.indexOf("json") < 0) return null;
        return res.json();
      })
      .catch(function () { return null; });
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

  function connectKomari(onPayload) {
    const root = base();
    if (!root && location.protocol === "file:") return null;
    const http = root || (location.protocol + "//" + location.host);
    const wsRoot = http.replace(/^http/i, "ws");
    let timer = null;
    let ws = null;
    function ask() {
      if (ws && ws.readyState === 1) {
        try { ws.send("get"); } catch (err) {}
      }
    }
    try {
      ws = new WebSocket(wsRoot + "/api/clients");
    } catch (err) {
      return null;
    }
    ws.onopen = function () {
      ask();
      timer = setInterval(ask, 2000);
    };
    ws.onmessage = function (ev) {
      let msg = ev.data;
      if (msg === "get") return;
      try {
        if (typeof msg === "string") msg = JSON.parse(msg);
      } catch (err) { return; }
      if (!msg || typeof msg !== "object") return;
      onPayload(KomariAdapt.toPayload(null, msg, null));
    };
    ws.onclose = function () {
      if (timer) clearInterval(timer);
    };
    return ws;
  }

  function connectWS(onPayload) {
    if (forcedSource() === "komari" || lastSource === "komari") return connectKomari(onPayload);
    const root = base();
    if (!root && location.protocol === "file:") return null;
    const http = root || (location.protocol + "//" + location.host);
    const wsRoot = http.replace(/^http/i, "ws");
    const q = token() ? "?token=" + encodeURIComponent(token()) : "";
    const paths = ["/api/stream", "/api/public/probe-ws"];
    let i = 0;
    let ws = null;
    function open() {
      if (i >= paths.length) {
        connectKomari(onPayload);
        return;
      }
      try {
        ws = new WebSocket(wsRoot + paths[i] + q);
      } catch (err) {
        i += 1;
        open();
        return;
      }
      ws.onmessage = function (ev) {
        try {
          const data = JSON.parse(ev.data);
          if (data && typeof data === "object") onPayload(data);
        } catch (err) {}
      };
      ws.onerror = function () {
        try { ws.close(); } catch (err) {}
        i += 1;
        open();
      };
    }
    open();
    return ws;
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
    connectWS: connectWS,
    sparkFromSeries: sparkFromSeries,
  };
})(window);

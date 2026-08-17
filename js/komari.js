(function (global) {
  let nodesCache = [];
  let publicCache = {};

  function unwrap(payload) {
    if (!payload) return null;
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.data)) return payload.data;
    if (payload.data && typeof payload.data === "object") return payload.data;
    return payload;
  }

  function looksLikeNodes(payload) {
    const list = unwrap(payload);
    if (!Array.isArray(list) || !list.length) return false;
    const n = list[0];
    return !!(n.uuid || n.UUID);
  }

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function nest(obj, path) {
    const parts = path.split(".");
    let cur = obj;
    for (let i = 0; i < parts.length; i += 1) {
      if (cur == null) return null;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function firstNum(obj, paths) {
    for (let i = 0; i < paths.length; i += 1) {
      const v = nest(obj, paths[i]);
      if (v != null && v !== "") return num(v);
    }
    return 0;
  }

  function firstVal(obj, paths) {
    for (let i = 0; i < paths.length; i += 1) {
      const v = nest(obj, paths[i]);
      if (v != null && v !== "") return v;
    }
    return null;
  }

  function flagToIso(str) {
    const text = String(str || "");
    const ascii = text.match(/[A-Za-z]{2}/);
    if (ascii && !/[\uD800-\uDBFF]/.test(ascii[0])) {
      const only = text.replace(/[^A-Za-z]/g, "");
      if (only.length === 2) return only.toUpperCase();
    }
    const chars = Array.from(text);
    const letters = [];
    for (let i = 0; i < chars.length; i += 1) {
      const cp = chars[i].codePointAt(0);
      if (cp >= 0x1F1E6 && cp <= 0x1F1FF) letters.push(String.fromCharCode(cp - 0x1F1E6 + 65));
    }
    if (letters.length >= 2) return letters[0] + letters[1];
    return "";
  }

  function liveBundle(msg) {
    if (!msg || typeof msg !== "object") return { online: null, data: {} };
    let body = msg;
    if (msg.status === "success" && msg.data && typeof msg.data === "object") body = msg.data;
    const data = body.data && !Array.isArray(body.data) && !body.cpu ? body.data : body;
    const online = Array.isArray(body.online) ? body.online : (Array.isArray(msg.online) ? msg.online : null);
    return { online: online, data: data && typeof data === "object" && !Array.isArray(data) ? data : {} };
  }

  let pingCache = {};

  function trafficUsed(node, live) {
    const up = firstNum(live, ["network.totalUp", "net.totalUp", "net.total_up", "net_total_up", "net_out_transfer"]);
    const down = firstNum(live, ["network.totalDown", "net.totalDown", "net.total_down", "net_total_down", "net_in_transfer"]);
    const typ = node.traffic_limit_type || "sum";
    if (typ === "max") return Math.max(up, down);
    if (typ === "min") return Math.min(up, down);
    if (typ === "up") return up;
    if (typ === "down") return down;
    return up + down;
  }

  function pingFromRecords(raw) {
    const body = raw && raw.data ? raw.data : raw;
    const recs = (body && body.records) || [];
    const tasks = (body && body.tasks) || [];
    if (!tasks.length && recs.length) {
      const last = recs[recs.length - 1];
      return [{
        key: "ping",
        label: "Ping",
        current_ms: last ? Math.round(last.value) : -1,
        loss_pct: 0,
        buckets: recs.slice(-12).map(function (r) { return { ms: Math.round(r.value), loss: 0 }; }),
      }];
    }
    const byTask = {};
    recs.forEach(function (r) {
      (byTask[r.task_id] = byTask[r.task_id] || []).push(r);
    });
    return tasks.map(function (t) {
      const rows = byTask[t.id] || [];
      const last = rows[rows.length - 1];
      return {
        key: String(t.id),
        label: t.name || "Ping",
        current_ms: last ? Math.round(last.value) : -1,
        loss_pct: num(t.loss),
        buckets: rows.slice(-12).map(function (r) { return { ms: Math.round(r.value), loss: 0 }; }),
      };
    });
  }

  function setPings(uuid, ping) {
    pingCache[uuid] = ping;
  }

  function mapNode(node, st, onlineSet) {
    const id = String(node.uuid || node.UUID || node.id || "");
    const live = st || {};
    const regionRaw = firstVal(node, ["iso", "country", "region", "Region"]) || "";
    let online = true;
    if (onlineSet) online = onlineSet[id] === true;
    else if (live.online === false) online = false;
    return {
      uuid: id,
      name: node.name || node.Name || "未命名",
      online: online,
      region_country: flagToIso(regionRaw),
      region_city: String(regionRaw),
      region_name: node.group || node.Group || String(regionRaw),
      cpu_pct: firstNum(live, ["cpu.usage", "cpu", "cpu_used", "cpu_percent"]),
      mem_used: firstNum(live, ["ram.used", "mem_used", "ram", "memory"]),
      mem_total: firstNum(node, ["mem_total", "ram_total"]) || firstNum(live, ["ram.total", "mem_total"]),
      disk_used: firstNum(live, ["disk.used", "disk", "disk_used"]),
      disk_total: firstNum(node, ["disk_total"]) || firstNum(live, ["disk.total", "disk_total"]),
      download_speed: firstNum(live, ["network.down", "net.down", "net.in", "network.in", "net_in"]),
      upload_speed: firstNum(live, ["network.up", "net.up", "net.out", "network.out", "net_out"]),
      traffic_used: trafficUsed(node, live),
      traffic_limit: num(node.traffic_limit),
      uptime: firstNum(live, ["uptime", "uptime_seconds"]),
      ping: [],
      loadavg: firstVal(live, ["load.load1", "load1", "load"]) || "",
    };
  }

  function toPayload(nodes, liveMsg, publicInfo) {
    const list = Array.isArray(unwrap(nodes)) ? unwrap(nodes) : nodesCache;
    nodesCache = list;
    if (publicInfo) publicCache = unwrap(publicInfo) || publicInfo || publicCache;
    const live = liveBundle(liveMsg);
    const onlineSet = live.online ? {} : null;
    if (live.online) live.online.forEach(function (id) { onlineSet[id] = true; });
    const site = publicCache || {};
    return {
      enabled: true,
      title: site.sitename || site.site_name || site.name || "节点状态",
      appearance: { theme: "line-grid", color_mode: "dark" },
      show_globe: true,
      servers: list.map(function (n) {
        const id = n.uuid || n.UUID || n.id;
        const mapped = mapNode(n, live.data[id] || live.data[String(id)] || {}, onlineSet);
        mapped.ping = pingCache[mapped.uuid] || mapped.ping;
        return mapped;
      }),
      _source: "komari",
    };
  }

  function remember(nodes, publicInfo) {
    if (nodes) nodesCache = Array.isArray(unwrap(nodes)) ? unwrap(nodes) : nodesCache;
    if (publicInfo) publicCache = unwrap(publicInfo) || publicInfo;
  }

  global.KomariAdapt = {
    looksLikeNodes: looksLikeNodes,
    toPayload: toPayload,
    remember: remember,
    liveBundle: liveBundle,
    pingFromRecords: pingFromRecords,
    setPings: setPings,
  };
})(window);

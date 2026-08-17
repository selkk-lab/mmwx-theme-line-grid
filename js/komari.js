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
      download_speed: firstNum(live, ["net.in", "net.down", "network.in", "net_in", "net_in_speed"]),
      upload_speed: firstNum(live, ["net.out", "net.up", "network.out", "net_out", "net_out_speed"]),
      traffic_used: firstNum(live, ["net.total_in", "net.totalDown", "net.total_down", "net_in_transfer"]) +
        firstNum(live, ["net.total_out", "net.totalUp", "net.total_up", "net_out_transfer"]),
      traffic_limit: 0,
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
        return mapNode(n, live.data[id] || live.data[String(id)] || {}, onlineSet);
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
  };
})(window);

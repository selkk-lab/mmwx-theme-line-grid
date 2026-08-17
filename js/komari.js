(function (global) {
  function pick(obj, keys) {
    for (let i = 0; i < keys.length; i += 1) {
      if (obj && obj[keys[i]] != null && obj[keys[i]] !== "") return obj[keys[i]];
    }
    return null;
  }

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

  function regionCode(node) {
    const r = String(pick(node, ["iso", "country", "region", "Region", "location"]) || "");
    const m = r.match(/[A-Za-z]{2}/);
    return m ? m[0].toUpperCase() : "";
  }

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function isOnline(st) {
    if (st.online === false) return false;
    if (st.online === true) return true;
    const updated = pick(st, ["updated_at", "updated", "time", "last_seen"]);
    if (!updated) return true;
    const t = typeof updated === "number" ? (updated < 1e12 ? updated * 1000 : updated) : Date.parse(updated);
    if (!Number.isFinite(t)) return true;
    return Date.now() - t < 45000;
  }

  function mapNode(node, recent) {
    const id = node.uuid || node.UUID || node.id;
    const st = (recent && (recent[id] || recent[node.name])) || {};
    const memTotal = num(pick(node, ["mem_total", "ram_total", "memory_total"]) || pick(st, ["ram_total", "mem_total"]));
    const diskTotal = num(pick(node, ["disk_total"]) || pick(st, ["disk_total"]));
    return {
      uuid: id,
      name: node.name || node.Name || "未命名",
      online: isOnline(st),
      region_country: regionCode(node),
      region_city: node.region || node.Region || "",
      region_name: node.group || node.Group || node.region || "",
      cpu_pct: num(pick(st, ["cpu", "cpu_used", "cpu_percent"])),
      mem_used: num(pick(st, ["ram", "ram_used", "mem_used", "memory"])),
      mem_total: memTotal,
      disk_used: num(pick(st, ["disk", "disk_used"])),
      disk_total: diskTotal,
      download_speed: num(pick(st, ["net_in", "net_in_speed", "network_in"])),
      upload_speed: num(pick(st, ["net_out", "net_out_speed", "network_out"])),
      traffic_used: num(pick(st, ["net_in_transfer", "net_in_total"])) + num(pick(st, ["net_out_transfer", "net_out_total"])),
      traffic_limit: 0,
      uptime: num(pick(st, ["uptime", "uptime_seconds"])),
      ping: [],
      loadavg: pick(st, ["load", "load1"]) || "",
    };
  }

  function toPayload(nodes, recent, publicInfo) {
    const list = Array.isArray(unwrap(nodes)) ? unwrap(nodes) : [];
    const rec = unwrap(recent) || {};
    const site = publicInfo || {};
    return {
      enabled: true,
      title: site.sitename || site.site_name || site.name || "节点状态",
      appearance: { theme: "line-grid", color_mode: "dark" },
      show_globe: true,
      servers: list.map(function (n) { return mapNode(n, rec); }),
      _source: "komari",
    };
  }

  global.KomariAdapt = {
    looksLikeNodes: looksLikeNodes,
    toPayload: toPayload,
  };
})(window);

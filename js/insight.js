/* Derived readings in plain language. Everything comes from the current snapshot; estimates are labelled as such. */
(function (global) {
  const DAY = 86400000;
  const KB = 1024, MB = KB * 1024, GB = MB * 1024, TB = GB * 1024;
  const SYMBOL = { USD: "$", CNY: "¥", RMB: "¥", EUR: "€", GBP: "£", HKD: "HK$", JPY: "JP¥", TWD: "NT$", SGD: "S$", AUD: "A$", CAD: "C$", KRW: "₩" };
  const CYCLE = { month: "月", quarter: "季", half_year: "半年", year: "年" };
  const MODE = { both: "上下行合计", sum: "上下行合计", up: "仅上行", down: "仅下行", max: "取较大方向", min: "取较小方向" };
  const valid = v => typeof v === "number" && Number.isFinite(v) && v >= 0;
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function bytes(v) {
    if (!valid(v)) return "—";
    const units = [[TB, "TB"], [GB, "GB"], [MB, "MB"], [KB, "KB"]];
    for (const [size, unit] of units) if (v >= size) { const n = v / size; return (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)) + " " + unit; }
    return Math.round(v) + " B";
  }

  function money(v) {
    if (!valid(v)) return "—";
    const n = v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
    return "¥" + n.toLocaleString("zh-CN");
  }

  function price(amount, currency) {
    if (!valid(amount)) return "";
    const code = String(currency || "").toUpperCase();
    const n = Math.round(amount * 100) / 100;
    return SYMBOL[code] ? SYMBOL[code] + n : n + (code ? " " + code : "");
  }

  function renewal(s) {
    const cycle = CYCLE[s.renewal_cycle] || "";
    const code = String(s.renewal_currency || "").toUpperCase();
    const native = price(s.renewal_price, code);
    const cny = valid(s.renewal_price_cny) ? money(s.renewal_price_cny) : "";
    if (!native && !cny) return "";
    const head = native || cny;
    const tail = native && cny && code !== "CNY" && code !== "RMB" ? " ≈ " + cny : "";
    return head + (cycle ? " / " + cycle : "") + tail;
  }

  function monthly(s) {
    const c = s && s.renewal_price_cny;
    if (!valid(c)) return 0;
    return s.renewal_cycle === "year" ? c / 12 : s.renewal_cycle === "half_year" ? c / 6 : s.renewal_cycle === "quarter" ? c / 3 : c;
  }

  function day(text) {
    if (!text) return null;
    const t = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? text + "T00:00:00" : text).getTime();
    return Number.isFinite(t) ? t : null;
  }

  function daysUntil(text) {
    const t = day(text);
    if (t == null) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((t - today.getTime()) / DAY);
  }

  function countdown(days) {
    if (days == null) return "日期未知";
    if (days < 0) return "已过期 " + -days + " 天";
    if (days === 0) return "今天到期";
    return "还有 " + days + " 天";
  }

  // Coarse on purpose: the footer must not tick while no new data arrives.
  function ago(date, now) {
    if (!date) return "";
    const s = Math.max(0, Math.round(((now || Date.now()) - date.getTime()) / 1000));
    if (s < 30) return "刚刚";
    if (s < 60) return "半分钟前";
    if (s < 3600) return Math.floor(s / 60) + " 分钟前";
    if (s < 86400) return Math.floor(s / 3600) + " 小时前";
    return Math.floor(s / 86400) + " 天前";
  }

  function short(text) {
    const t = day(text);
    if (t == null) return "—";
    const d = new Date(t);
    return String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function period(s) {
    const start = day(s && s.period_start), end = day(s && s.period_end);
    if (start == null || end == null || end <= start) return null;
    const now = Date.now(), total = end - start;
    const elapsed = Math.min(total, Math.max(0, now - start));
    return { start, end, days: Math.round(total / DAY), elapsed: Math.floor(elapsed / DAY), fraction: elapsed / total, left: Math.max(0, Math.ceil((end - now) / DAY)) };
  }

  // Linear extrapolation of the billing period; withheld during the first days when it would be noise.
  function projection(s) {
    const p = period(s);
    if (!p || !(s.traffic_limit > 0) || !valid(s.traffic_used)) return null;
    const used = s.traffic_used / s.traffic_limit;
    const ended = p.fraction >= 1;
    const projected = ended ? used : p.fraction >= 0.1 ? used / p.fraction : null;
    return { used, pace: Math.min(1, p.fraction), projected, bytes: projected == null ? null : projected * s.traffic_limit, period: p, ended };
  }

  function quota(s) {
    return s && s.traffic_limit > 0 && valid(s.traffic_used) ? s.traffic_used / s.traffic_limit : null;
  }

  function loss(s) {
    const p = global.ProbeAdapt ? ProbeAdapt.primaryPing(s) : null;
    return p && valid(Number(p.loss_pct)) ? Number(p.loss_pct) : null;
  }

  function latency(s, role) {
    const p = global.ProbeAdapt ? ProbeAdapt.primaryPing(s, role) : null;
    return p && valid(Number(p.current_ms)) ? Number(p.current_ms) : null;
  }

  const percent = v => (v >= 10 ? Math.round(v * 100) : Math.round(v * 1000) / 10) + "%";

  function attention(servers) {
    const items = [];
    (servers || []).forEach((s, i) => {
      const add = (kind, tone, rank, text) => items.push({ i, s, kind, tone, rank, text });
      if (!s.online) add("离线", "danger", 0, s.region_label || s.region_country || "未上报心跳");
      const q = quota(s);
      if (q != null && q >= 1) add("超额", "danger", 1, "已用 " + percent(q) + " · 超出 " + bytes(s.traffic_used - s.traffic_limit));
      else if (q != null && q >= 0.9) add("流量", "warn", 2, "已用 " + percent(q) + " · 余 " + bytes(s.traffic_limit - s.traffic_used));
      const d = daysUntil(s.expires_at);
      if (d != null && d < 0) add("过期", "danger", 1, countdown(d));
      else if (d != null && d <= 14) add("到期", "warn", 3, d === 0 ? "今天到期" : d + " 天后到期");
      if (s.online) {
        const l = loss(s);
        if (l != null && l >= 2) add("丢包", "warn", 2, "当前 " + l.toFixed(1) + "%");
        if (valid(s.cpu_pct) && s.cpu_pct >= 85) add("CPU", "warn", 2, "当前 " + Math.round(s.cpu_pct) + "%");
      }
    });
    return items.sort((a, b) => a.rank - b.rank || String(a.s.name).localeCompare(String(b.s.name), "zh"));
  }

  function names(list, n) {
    const shown = list.slice(0, n || 2).map(s => "<b>" + esc(s.name || "未命名") + "</b>");
    return shown.join("、") + (list.length > shown.length ? " 等 " + list.length + " 台" : "");
  }

  function avg(list) {
    const good = list.filter(valid);
    return good.length ? good.reduce((a, b) => a + b, 0) / good.length : null;
  }

  function summary(home, servers) {
    const all = servers || [];
    if (!all.length) return "";
    const online = all.filter(s => s.online);
    const offline = all.filter(s => !s.online);
    if (home === "network") {
      const role = s => global.ProbeAdapt ? ProbeAdapt.serverRole(s) : "";
      const line = online.filter(s => ["line", "mixed"].includes(role(s)) && latency(s, "line") != null);
      const land = online.filter(s => role(s) === "land" && latency(s, "land") != null);
      const parts = [];
      if (line.length) {
        const best = line.slice().sort((a, b) => latency(a, "line") - latency(b, "line"))[0];
        parts.push("线路节点平均 <b>" + Math.round(avg(line.map(s => latency(s, "line")))) + " ms</b>，最快 " + names([best], 1) + " " + latency(best, "line") + " ms");
      }
      if (land.length) parts.push("落地节点平均 <b>" + Math.round(avg(land.map(s => latency(s, "land")))) + " ms</b>");
      const lossy = online.filter(s => (loss(s) || 0) >= 1);
      parts.push(lossy.length ? '<em class="tone-warn">' + lossy.length + " 台丢包 ≥ 1%</em>" : "各节点均未见明显丢包");
      if (offline.length) parts.push('<em class="tone-danger">' + offline.length + " 台离线无数据</em>");
      return parts.join("；") + "。";
    }
    if (home === "resource") {
      const pct = (used, total) => total > 0 ? Math.round(used / total * 100) + "%" : "—";
      const mem = online.filter(s => valid(s.mem_used) && s.mem_total > 0);
      const disk = online.filter(s => valid(s.disk_used) && s.disk_total > 0);
      const cpu = avg(online.map(s => s.cpu_pct));
      const sum = (list, k) => list.reduce((n, s) => n + (valid(s[k]) ? s[k] : 0), 0);
      const cost = all.reduce((n, s) => n + monthly(s), 0);
      const over = all.filter(s => (quota(s) || 0) >= 1);
      let text = "CPU 平均 <b>" + (cpu == null ? "—" : Math.round(cpu) + "%") + "</b>，内存 <b>" + pct(sum(mem, "mem_used"), sum(mem, "mem_total")) + "</b>，硬盘 <b>" + pct(sum(disk, "disk_used"), sum(disk, "disk_total")) + "</b>；本周期已用 <b>" + bytes(sum(all, "traffic_used")) + "</b>，月均成本 <b>" + money(cost) + "</b>";
      if (over.length) text += '；<em class="tone-danger">' + names(over) + " 已超出流量限额</em>";
      return text + "。";
    }
    const items = attention(all);
    const due = items.filter(x => x.kind === "到期" || x.kind === "过期").map(x => x.s);
    const over = items.filter(x => x.kind === "超额").map(x => x.s);
    const tight = items.filter(x => x.kind === "流量").map(x => x.s);
    const parts = [all.length + " 台节点" + (offline.length ? "，<b>" + online.length + "</b> 台在线" : "全部在线")];
    if (offline.length) parts.push('<em class="tone-danger">' + names(offline) + " 离线</em>");
    if (over.length) parts.push('<em class="tone-danger">' + names(over) + " 已超出流量限额</em>");
    if (tight.length) parts.push('<em class="tone-warn">' + names(tight) + " 流量接近限额</em>");
    if (due.length) parts.push('<em class="tone-warn">' + due.length + " 台临近或已过续费日</em>");
    if (!items.length) parts.push("没有需要处理的告警");
    return parts.join("，") + "。";
  }

  function recent(s) {
    return global.ProbeAdapt ? ProbeAdapt.lastDays(s.daily_traffic, 7).filter(d => d && valid(d.total)) : [];
  }

  function hotspots(servers, n) {
    const rows = (servers || []).map((s, i) => { const days = recent(s); return { s, i, used: valid(s.traffic_used) ? s.traffic_used : 0, week: days.reduce((t, d) => t + d.total, 0), days: days.length }; })
      .filter(r => r.used > 0 || r.week > 0)
      .sort((a, b) => b.used - a.used || b.week - a.week);
    const total = rows.reduce((t, r) => t + r.used, 0);
    rows.forEach(r => { r.share = total > 0 ? r.used / total : 0; });
    return { total, count: rows.length, rows: rows.slice(0, n || 8) };
  }

  function chains(state) {
    const raw = state && state.forward;
    const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : [];
    return list.filter(c => c && Array.isArray(c.groups) && c.groups.length);
  }

  function measured(chain) {
    return valid(chain.end_to_end_ms) && chain.end_to_end_ms > 0 || (chain.groups || []).some(g => g.to_next_ms > 0 || (g.servers || []).some(x => x.healthy || x.to_next_ms > 0));
  }

  global.ProbeInsight = { valid, esc, bytes, money, price, renewal, monthly, day, daysUntil, countdown, ago, short, period, projection, quota, loss, latency, attention, summary, hotspots, chains, measured, mode: k => MODE[k] || "", cycle: k => CYCLE[k] || "" };
})(window);

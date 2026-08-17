/* 演示快照：字段与妙妙屋X /api/public/probe-servers 对齐，便于以后换真接口。 */
(function (global) {
  const KB = 1024;
  const MB = 1024 ** 2;
  const GB = 1024 ** 3;
  const TB = 1024 ** 4;
  const DAY = 86400;

  function rng(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return function next() {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  function series(seed, n, base, spread, opts) {
    const r = rng(seed);
    const out = [];
    let v = base;
    for (let i = 0; i < n; i += 1) {
      v += (r() - 0.48) * spread;
      const lo = opts && opts.min != null ? opts.min : base * 0.45;
      const hi = opts && opts.max != null ? opts.max : base * 1.7;
      v = Math.max(lo, Math.min(hi, v));
      out.push(Math.round(v));
    }
    if (opts && opts.end != null) out[out.length - 1] = opts.end;
    return out;
  }

  function bucketsFrom(msArr, loss) {
    return msArr.map(function (ms) {
      return { ms: ms, loss: loss };
    });
  }

  function pingTarget(key, label, isp, current, loss, seed) {
    const ms = series(seed, 12, current, current * 0.12, { min: 8, max: current * 1.8, end: current });
    return {
      key: key,
      label: label,
      isp: isp,
      current_ms: current,
      loss_pct: loss,
      buckets: bucketsFrom(ms, loss),
    };
  }

  function daily(totals) {
    const start = new Date(Date.UTC(2026, 7, 11));
    return totals.map(function (total, i) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      const down = Math.round(total * 0.82);
      const up = total - down;
      return {
        date: d.toISOString().slice(0, 10),
        uplink: up,
        downlink: down,
        total: total,
      };
    });
  }

  const payload = {
    enabled: true,
    title: "节点状态",
    logo: "",
    appearance: { theme: "line-grid", color_mode: "dark", revision: 1 },
    block_login: false,
    show_name: true,
    show_globe: false,
    license_badge: { name: "mmwx", display_name: "妙妙屋X" },
    servers: [
      {
        name: "HK-01",
        online: true,
        region: "🇭🇰",
        region_country: "HK",
        region_name: "香港",
        region_city: "荃湾",
        provider_name: "Demo",
        provider_url: "",
        telecom_paid_peer: true,
        download_speed: Math.round(32.6 * MB),
        upload_speed: Math.round(4.3 * MB),
        traffic_used: Math.round(128.7 * GB),
        traffic_limit: 1 * TB,
        traffic_used_up: Math.round(18.4 * GB),
        traffic_used_down: Math.round(110.3 * GB),
        traffic_used_total: Math.round(128.7 * GB),
        period_start: "2026-08-01",
        period_end: "2026-09-01",
        cumulative_up: Math.round(19.1 * GB),
        cumulative_down: Math.round(112.0 * GB),
        cpu_pct: 6,
        loadavg: "0.42 0.38 0.31",
        mem_used: Math.round(8.96 * GB),
        mem_total: 32 * GB,
        disk_used: Math.round(88 * GB),
        disk_total: 400 * GB,
        uptime: 45 * DAY + 3 * 3600,
        cpu_model: "AMD EPYC 7543P",
        cpu_cores: 8,
        cpu_threads: 16,
        os: "Debian 12",
        kernel: "6.1.0-37-amd64",
        arch: "x86_64",
        ping: [
          pingTarget("sh-ct-v4", "上海电信", "telecom", 25, 0, 11),
          pingTarget("sh-cu-v4", "上海联通", "unicom", 31, 0.12, 12),
          pingTarget("sh-cm-v4", "上海移动", "mobile", 28, 0.04, 13),
        ],
        expires_at: "2026-12-01",
        renewal_price: 36,
        renewal_currency: "USD",
        renewal_cycle: "month",
        renewal_price_cny: 258,
        return_routes: [
          { carrier: "telecom", region: "上海", route_type: "CN2 GIA", tested_at: "2026-08-16T21:10:00Z" },
          { carrier: "unicom", region: "上海", route_type: "AS4837", tested_at: "2026-08-16T21:10:00Z" },
          { carrier: "mobile", region: "上海", route_type: "CMIN2", tested_at: "2026-08-16T21:10:00Z" },
        ],
        daily_traffic: daily([18.2, 21.4, 17.6, 19.8, 22.1, 24.0, 20.6].map(function (g) { return Math.round(g * GB); })),
      },
      {
        name: "JP-01",
        online: true,
        region: "🇯🇵",
        region_country: "JP",
        region_name: "日本 东京",
        region_city: "东京",
        provider_name: "Demo",
        provider_url: "",
        download_speed: Math.round(28.1 * MB),
        upload_speed: Math.round(3.6 * MB),
        traffic_used: Math.round(205.4 * GB),
        traffic_limit: 1 * TB,
        traffic_used_up: Math.round(24.8 * GB),
        traffic_used_down: Math.round(180.6 * GB),
        traffic_used_total: Math.round(205.4 * GB),
        period_start: "2026-08-01",
        period_end: "2026-09-01",
        cumulative_up: Math.round(25.2 * GB),
        cumulative_down: Math.round(182.1 * GB),
        cpu_pct: 7,
        loadavg: "0.61 0.55 0.48",
        mem_used: Math.round(9.92 * GB),
        mem_total: 32 * GB,
        disk_used: Math.round(72 * GB),
        disk_total: 400 * GB,
        uptime: 62 * DAY + 11 * 3600,
        cpu_model: "AMD EPYC 7R13",
        cpu_cores: 4,
        cpu_threads: 8,
        os: "Amazon Linux 2023",
        kernel: "6.1.119-129.201.amzn2023",
        arch: "x86_64",
        ping: [
          pingTarget("sh-ct-v4", "上海电信", "telecom", 38, 0.08, 21),
          pingTarget("sh-cu-v4", "上海联通", "unicom", 44, 0.2, 22),
          pingTarget("sh-cm-v4", "上海移动", "mobile", 41, 0.1, 23),
        ],
        expires_at: "2027-01-18",
        renewal_price: 42,
        renewal_currency: "USD",
        renewal_cycle: "month",
        renewal_price_cny: 301,
        return_routes: [
          { carrier: "telecom", region: "上海", route_type: "NTT → CN2", tested_at: "2026-08-16T20:40:00Z" },
          { carrier: "unicom", region: "上海", route_type: "IIJ → 联通", tested_at: "2026-08-16T20:40:00Z" },
          { carrier: "mobile", region: "广州", route_type: "软银 → 移动", tested_at: "2026-08-16T20:40:00Z" },
        ],
        daily_traffic: daily([26.4, 31.2, 28.8, 33.5, 29.1, 36.0, 30.4].map(function (g) { return Math.round(g * GB); })),
      },
      {
        name: "JP-02",
        online: true,
        region: "🇯🇵",
        region_country: "JP",
        region_name: "日本 大阪",
        region_city: "大阪",
        provider_name: "Demo",
        download_speed: Math.round(16.7 * MB),
        upload_speed: Math.round(2.1 * MB),
        traffic_used: Math.round(98.3 * GB),
        traffic_limit: 500 * GB,
        traffic_used_up: Math.round(11.2 * GB),
        traffic_used_down: Math.round(87.1 * GB),
        traffic_used_total: Math.round(98.3 * GB),
        period_start: "2026-08-01",
        period_end: "2026-09-01",
        cpu_pct: 4,
        loadavg: "0.21 0.18 0.16",
        mem_used: Math.round(3.52 * GB),
        mem_total: 16 * GB,
        disk_used: Math.round(32 * GB),
        disk_total: 200 * GB,
        uptime: 29 * DAY + 6 * 3600,
        cpu_model: "Intel Xeon E-2388G",
        cpu_cores: 8,
        cpu_threads: 16,
        os: "Ubuntu 24.04",
        kernel: "6.8.0-60-generic",
        arch: "x86_64",
        ping: [
          pingTarget("sh-ct-v4", "上海电信", "telecom", 50, 0.3, 31),
          pingTarget("sh-cu-v4", "上海联通", "unicom", 58, 0.4, 32),
          pingTarget("sh-cm-v4", "上海移动", "mobile", 54, 0.22, 33),
        ],
        expires_at: "2026-10-09",
        renewal_price: 180,
        renewal_currency: "CNY",
        renewal_cycle: "month",
        renewal_price_cny: 180,
        return_routes: [
          { carrier: "telecom", region: "上海", route_type: "CN2 GT", tested_at: "2026-08-16T19:05:00Z" },
          { carrier: "unicom", region: "上海", route_type: "公网", tested_at: "2026-08-16T19:05:00Z" },
          { carrier: "mobile", region: "上海", route_type: "CMI", tested_at: "2026-08-16T19:05:00Z" },
        ],
        daily_traffic: daily([12.4, 14.1, 11.8, 15.6, 13.2, 16.8, 14.4].map(function (g) { return Math.round(g * GB); })),
      },
      {
        name: "DE-01",
        online: true,
        region: "🇩🇪",
        region_country: "DE",
        region_name: "德国 法兰克福",
        region_city: "法兰克福",
        provider_name: "Demo",
        download_speed: Math.round(21.3 * MB),
        upload_speed: Math.round(2.8 * MB),
        traffic_used: Math.round(312.6 * GB),
        traffic_limit: 2 * TB,
        traffic_used_up: Math.round(40.2 * GB),
        traffic_used_down: Math.round(272.4 * GB),
        traffic_used_total: Math.round(312.6 * GB),
        period_start: "2026-08-01",
        period_end: "2026-09-01",
        cumulative_up: Math.round(41.0 * GB),
        cumulative_down: Math.round(274.8 * GB),
        cpu_pct: 9,
        loadavg: "1.04 0.92 0.81",
        mem_used: Math.round(22.4 * GB),
        mem_total: 64 * GB,
        disk_used: Math.round(216 * GB),
        disk_total: 800 * GB,
        uptime: 71 * DAY + 19 * 3600,
        cpu_model: "AMD EPYC 7443P",
        cpu_cores: 12,
        cpu_threads: 24,
        os: "Debian 12",
        kernel: "6.1.0-37-amd64",
        arch: "x86_64",
        ping: [
          pingTarget("sh-ct-v4", "上海电信", "telecom", 112, 0.6, 41),
          pingTarget("sh-cu-v4", "上海联通", "unicom", 128, 0.9, 42),
          pingTarget("sh-cm-v4", "上海移动", "mobile", 119, 0.7, 43),
        ],
        expires_at: "2026-11-30",
        renewal_price: 29,
        renewal_currency: "EUR",
        renewal_cycle: "month",
        renewal_price_cny: 232,
        return_routes: [
          { carrier: "telecom", region: "北京", route_type: "DE-CIX → CN2", tested_at: "2026-08-16T18:20:00Z" },
          { carrier: "unicom", region: "上海", route_type: "HE → 联通", tested_at: "2026-08-16T18:20:00Z" },
          { carrier: "mobile", region: "广州", route_type: "Telia → 移动", tested_at: "2026-08-16T18:20:00Z" },
        ],
        daily_traffic: daily([38.2, 44.6, 41.0, 48.8, 39.5, 52.1, 48.4].map(function (g) { return Math.round(g * GB); })),
      },
      {
        name: "JP-03",
        online: true,
        region: "🇯🇵",
        region_country: "JP",
        region_name: "日本 东京",
        region_city: "东京",
        provider_name: "Demo",
        download_speed: Math.round(18.4 * MB),
        upload_speed: Math.round(1.2 * MB),
        traffic_used: Math.round(31.2 * GB),
        traffic_limit: Math.round(1.12 * TB),
        traffic_used_up: Math.round(4.1 * GB),
        traffic_used_down: Math.round(27.1 * GB),
        traffic_used_total: Math.round(31.2 * GB),
        period_start: "2026-08-01",
        period_end: "2026-09-01",
        cpu_pct: 2,
        loadavg: "0.08 0.11 0.09",
        mem_used: Math.round(2.08 * GB),
        mem_total: 16 * GB,
        disk_used: Math.round(18 * GB),
        disk_total: 200 * GB,
        uptime: 32 * DAY + 4 * 3600,
        cpu_model: "AMD Ryzen 9 5950X",
        cpu_cores: 16,
        cpu_threads: 32,
        os: "Debian 12",
        kernel: "6.1.0-33-amd64",
        arch: "x86_64",
        ping: [
          pingTarget("sh-ct-v4", "上海电信", "telecom", 67, 0, 51),
          pingTarget("sh-cu-v4", "上海联通", "unicom", 74, 0.05, 52),
          pingTarget("sh-cm-v4", "上海移动", "mobile", 71, 0.02, 53),
        ],
        expires_at: "2026-12-20",
        renewal_price: 2200,
        renewal_currency: "JPY",
        renewal_cycle: "month",
        renewal_price_cny: 108,
        return_routes: [
          { carrier: "telecom", region: "上海", route_type: "IIJ → CN2 GIA", tested_at: "2026-08-16T22:00:00Z" },
          { carrier: "unicom", region: "上海", route_type: "NTT → 联通", tested_at: "2026-08-16T22:00:00Z" },
          { carrier: "mobile", region: "上海", route_type: "软银 → CMIN2", tested_at: "2026-08-16T22:00:00Z" },
        ],
        daily_traffic: daily([24.8, 28.6, 22.1, 19.6, 27.4, 32.1, 25.4].map(function (g) { return Math.round(g * GB); })),
      },
      {
        name: "NL-01",
        online: true,
        region: "🇳🇱",
        region_country: "NL",
        region_name: "荷兰 阿姆斯特丹",
        region_city: "阿姆斯特丹",
        provider_name: "Demo",
        provider_url: "",
        download_speed: Math.round(24.9 * MB),
        upload_speed: Math.round(3.1 * MB),
        traffic_used: Math.round(177.8 * GB),
        traffic_limit: 1 * TB,
        traffic_used_up: Math.round(21.6 * GB),
        traffic_used_down: Math.round(156.2 * GB),
        traffic_used_total: Math.round(177.8 * GB),
        period_start: "2026-08-01",
        period_end: "2026-09-01",
        cpu_pct: 8,
        loadavg: "0.73 0.66 0.58",
        mem_used: Math.round(4.64 * GB),
        mem_total: 16 * GB,
        disk_used: Math.round(42 * GB),
        disk_total: 200 * GB,
        uptime: 54 * DAY + 9 * 3600,
        cpu_model: "Intel Xeon E5-2697 v4",
        cpu_cores: 8,
        cpu_threads: 8,
        os: "AlmaLinux 9",
        kernel: "5.14.0-570.el9",
        arch: "x86_64",
        ping: [
          pingTarget("sh-ct-v4", "上海电信", "telecom", 94, 0.4, 61),
          pingTarget("sh-cu-v4", "上海联通", "unicom", 108, 0.8, 62),
          pingTarget("sh-cm-v4", "上海移动", "mobile", 101, 0.5, 63),
        ],
        expires_at: "2026-09-14",
        renewal_price: 49.99,
        renewal_currency: "USD",
        renewal_cycle: "year",
        renewal_price_cny: 358,
        return_routes: [
          { carrier: "telecom", region: "上海", route_type: "Cogent → CN2", tested_at: "2026-08-16T17:48:00Z" },
          { carrier: "unicom", region: "上海", route_type: "HE → 联通 169", tested_at: "2026-08-16T17:48:00Z" },
          { carrier: "mobile", region: "广州", route_type: "Telia → 移动", tested_at: "2026-08-16T17:48:00Z" },
        ],
        daily_traffic: daily([22.6, 25.1, 21.4, 27.8, 24.0, 29.5, 27.4].map(function (g) { return Math.round(g * GB); })),
      },
    ],
  };

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function systemSeries(server, range) {
    const spec = { "1h": [12, 300], "6h": [36, 600], "24h": [48, 1800] }[range] || [12, 300];
    const n = spec[0];
    const step = spec[1];
    const now = Math.floor(Date.now() / 1000);
    const start = now - n * step;
    const cpu = series(server.name.length * 17 + n, n, server.cpu_pct || 6, 2.4, { min: 1, max: 38 });
    const memBase = server.mem_used || 4 * GB;
    const mem = series(server.name.length * 19 + n, n, memBase / GB, 0.4, { min: 1, max: (server.mem_total || 16 * GB) / GB });
    const down = series(server.name.length * 23 + n, n, (server.download_speed || 10 * MB) / MB, 3.2, { min: 0.4, max: 80 });
    const up = series(server.name.length * 29 + n, n, (server.upload_speed || 2 * MB) / MB, 0.6, { min: 0.1, max: 20 });
    function pack(arr, scale) {
      return arr.map(function (value, i) {
        return { t: start + (i + 1) * step, value: Math.round(value * scale) };
      });
    }
    return {
      success: true,
      bucket_sec: step,
      generated_at: now,
      series: {
        cpu_pct: pack(cpu, 1).map(function (p) { return { t: p.t, value: p.value }; }),
        mem_used: pack(mem, GB),
        mem_total: pack(mem, 0).map(function (p) { return { t: p.t, value: server.mem_total || 16 * GB }; }),
        download_speed: pack(down, MB),
        upload_speed: pack(up, MB),
      },
    };
  }

  function pingSeries(server, range, targetKey) {
    const spec = { "1h": [12, 300], "6h": [36, 600], "24h": [48, 1800] }[range] || [12, 300];
    const n = spec[0];
    const step = spec[1];
    const now = Math.floor(Date.now() / 1000);
    const start = now - n * step;
    const target = (server.ping || []).find(function (p) { return p.key === targetKey; }) || (server.ping || [])[0];
    if (!target) {
      return { success: false, bucket_sec: step, generated_at: now, series: [] };
    }
    const ms = series(target.key.length * 41 + n, n, target.current_ms, Math.max(3, target.current_ms * 0.06), {
      min: Math.max(8, target.current_ms * 0.72),
      max: target.current_ms * 1.35,
      end: target.current_ms,
    });
    return {
      success: true,
      bucket_sec: step,
      generated_at: now,
      series: ms.map(function (value, i) {
        return { t: start + (i + 1) * step, value: value, loss: target.loss_pct };
      }),
    };
  }

  function monthPulse(servers) {
    const r = rng(202608);
    const today = new Date().getDate();
    const daysInMonth = 31;
    const names = (servers || payload.servers).map(function (s) { return s.name; });
    const days = [];
    let acc = 0;
    for (let d = 1; d <= daysInMonth; d += 1) {
      const future = d > today;
      const total = future ? 0 : Math.round((90 + r() * 70 + (d === 12 || d === 16 ? 40 : 0)) * GB);
      const peak = names[Math.floor(r() * names.length)] || "—";
      const loss = future ? 0 : (d === 9 ? 1.8 : r() * 0.4);
      acc += total;
      days.push({
        day: d,
        date: "2026-08-" + String(d).padStart(2, "0"),
        total: total,
        peak: peak,
        loss: Math.round(loss * 100) / 100,
        offline: d === 9 ? 1 : 0,
        acc: acc,
      });
    }
    return days;
  }

  global.ProbeDemo = {
    units: { KB: KB, MB: MB, GB: GB, TB: TB, DAY: DAY },
    payload: payload,
    clone: clone,
    snapshot: function () { return clone(payload); },
    systemSeries: systemSeries,
    pingSeries: pingSeries,
    monthPulse: monthPulse,
  };
})(window);

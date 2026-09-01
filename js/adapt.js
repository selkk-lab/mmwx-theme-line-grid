/* 把新版妙妙屋X 探针快照补成主题能画的字段。缺地区、空桶 -1、无限额都在这里消化。 */
(function (global) {
  const COUNTRY_NAMES = {
    AE: "阿联酋", AR: "阿根廷", AT: "奥地利", AU: "澳大利亚", BD: "孟加拉",
    BR: "巴西", CA: "加拿大", CH: "瑞士", CL: "智利", CN: "中国",
    CO: "哥伦比亚", CZ: "捷克", DE: "德国", EG: "埃及", ES: "西班牙",
    FI: "芬兰", FR: "法国", GB: "英国", HK: "香港", HU: "匈牙利",
    ID: "印尼", IE: "爱尔兰", IL: "以色列", IN: "印度", IS: "冰岛",
    IT: "意大利", JP: "日本", KE: "肯尼亚", KH: "柬埔寨", KP: "朝鲜",
    KR: "韩国", KZ: "哈萨克斯坦", LU: "卢森堡", MM: "缅甸", MN: "蒙古",
    MO: "澳门", MX: "墨西哥", MY: "马来西亚", NG: "尼日利亚", NL: "荷兰",
    NO: "挪威", NZ: "新西兰", PH: "菲律宾", PK: "巴基斯坦", PL: "波兰",
    PT: "葡萄牙", RO: "罗马尼亚", RU: "俄罗斯", SA: "沙特", SE: "瑞典",
    SG: "新加坡", TH: "泰国", TR: "土耳其", TW: "台湾", UA: "乌克兰",
    US: "美国", VN: "越南", ZA: "南非",
  };

  const COUNTRY_LL = {
    AE: [55.27, 25.20], AR: [-58.38, -34.60], AT: [16.37, 48.21], AU: [151.21, -33.87],
    BD: [90.41, 23.81], BR: [-46.63, -23.55], CA: [-79.38, 43.65], CH: [8.54, 47.38],
    CL: [-70.67, -33.45], CN: [121.47, 31.23], CO: [-74.07, 4.71], CZ: [14.44, 50.08],
    DE: [8.68, 50.11], EG: [31.24, 30.04], ES: [-3.70, 40.42], FI: [24.94, 60.17],
    FR: [2.35, 48.86], GB: [-0.13, 51.51], HK: [114.17, 22.32], HU: [19.04, 47.50],
    ID: [106.85, -6.21], IE: [-6.26, 53.35], IL: [34.78, 32.09], IN: [72.88, 19.08],
    IS: [-21.83, 64.15], IT: [12.50, 41.90], JP: [139.69, 35.69], KE: [36.82, -1.29],
    KH: [104.92, 11.56], KP: [125.75, 39.03], KR: [126.98, 37.57], KZ: [76.93, 43.24],
    LU: [6.13, 49.61], MM: [96.20, 16.80], MN: [106.91, 47.92], MO: [113.54, 22.20],
    MX: [-99.13, 19.43], MY: [101.69, 3.14], NG: [3.38, 6.52], NL: [4.90, 52.37],
    NO: [10.75, 59.91], NZ: [174.76, -36.85], PH: [121.03, 14.60], PK: [67.00, 24.86],
    PL: [21.01, 52.23], PT: [-9.14, 38.72], RO: [26.10, 44.43], RU: [37.62, 55.76],
    SA: [46.68, 24.71], SE: [18.07, 59.33], SG: [103.82, 1.35], TH: [100.50, 13.76],
    TR: [28.98, 41.01], TW: [121.56, 25.03], UA: [30.52, 50.45], US: [-118.24, 34.05],
    VN: [106.63, 10.82], ZA: [28.05, -26.20],
  };

  const CITY_LL = {
    amsterdam: [4.90, 52.37], beijing: [116.41, 39.90], frankfurt: [8.68, 50.11],
    "hong kong": [114.17, 22.32], "los angeles": [-118.24, 34.05], london: [-0.13, 51.51],
    osaka: [135.50, 34.69], seoul: [126.98, 37.57], shanghai: [121.47, 31.23],
    singapore: [103.82, 1.35], sydney: [151.21, -33.87], taichung: [120.68, 24.15],
    taipei: [121.56, 25.03], tokyo: [139.69, 35.69], "tung chung": [113.94, 22.29],
    "new york": [-74.01, 40.71], "san jose": [-121.89, 37.34],
  };

  const PLACE_NAMES = {
    amsterdam: "阿姆斯特丹", beijing: "北京", frankfurt: "法兰克福",
    "hong kong": "香港", islands: "", london: "伦敦", "los angeles": "洛杉矶",
    osaka: "大阪", seoul: "首尔", shanghai: "上海", singapore: "新加坡",
    sydney: "悉尼", taichung: "台中", taipei: "台北", taiwan: "台湾",
    tokyo: "东京", "tung chung": "东涌", "new york": "纽约", "san jose": "圣何塞",
  };

  const TOKEN_CC = {
    AE: "AE", AU: "AU", BJ: "CN", CA: "CA", CN: "CN", DE: "DE", FRA: "DE",
    FR: "FR", GB: "GB", GZ: "CN", HINET: "TW", HK: "HK", ICN: "KR",
    JP: "JP", KHH: "TW", KIX: "JP", KR: "KR", LA: "US", MO: "MO",
    NL: "NL", NRT: "JP", NY: "US", OSA: "JP", SEEDNET: "TW", SG: "SG",
    SH: "CN", SYD: "AU", SZ: "CN", TKY: "JP", TPE: "TW", TW: "TW",
    UK: "GB", US: "US", AMS: "NL",
  };

  const NAME_HINTS = [
    [/香港|hong\s*kong/i, "HK"],
    [/台湾|台灣|taipei|taichung|hinet|seednet/i, "TW"],
    [/日本|tokyo|osaka/i, "JP"],
    [/新加坡|singapore/i, "SG"],
    [/韩国|韓國|seoul/i, "KR"],
    [/美国|美國|los\s*angeles/i, "US"],
    [/荷兰|荷蘭|amsterdam/i, "NL"],
    [/德国|德國|frankfurt/i, "DE"],
    [/澳洲|澳大利亚|sydney/i, "AU"],
    [/英国|英國|london/i, "GB"],
    [/法国|法國/i, "FR"],
    [/澳门|澳門/i, "MO"],
    [/北京|上海|深圳|广州|廣州/i, "CN"],
  ];

  function upperIso(value) {
    const text = String(value || "").trim().toUpperCase();
    return /^[A-Z]{2}$/.test(text) ? text : "";
  }

  function flagToIso(value) {
    const text = String(value || "").trim();
    const direct = upperIso(text.split(/[·,\s]+/)[0]);
    if (direct) return direct;
    const chars = Array.from(text);
    const letters = [];
    for (let i = 0; i < chars.length; i += 1) {
      const cp = chars[i].codePointAt(0);
      if (cp >= 0x1F1E6 && cp <= 0x1F1FF) letters.push(String.fromCharCode(cp - 0x1F1E6 + 65));
    }
    if (letters.length >= 2) return letters[0] + letters[1];
    return "";
  }

  function isoToFlag(code) {
    const cc = upperIso(code);
    if (!cc) return "";
    return String.fromCodePoint(0x1F1E6 + cc.charCodeAt(0) - 65, 0x1F1E6 + cc.charCodeAt(1) - 65);
  }

  function tokens(name) {
    return String(name || "")
      .toUpperCase()
      .split(/[^A-Z0-9\u4E00-\u9FFF]+/)
      .filter(Boolean);
  }

  function inferCountry(server) {
    if (!server) return "";
    const fromField = upperIso(server.region_country);
    if (fromField) return fromField;
    const fromFlag = flagToIso(server.region);
    if (fromFlag) return fromFlag;
    const fromPlace = flagToIso(server.region_name) || flagToIso(server.region_city);
    if (fromPlace) return fromPlace;
    const name = server.name || "";
    const bits = tokens(name);
    for (let i = 0; i < bits.length; i += 1) {
      if (TOKEN_CC[bits[i]]) return TOKEN_CC[bits[i]];
    }
    for (let i = 0; i < NAME_HINTS.length; i += 1) {
      if (NAME_HINTS[i][0].test(name)) return NAME_HINTS[i][1];
    }
    const blob = [server.region_name, server.region_city].filter(Boolean).join(" ");
    for (let i = 0; i < NAME_HINTS.length; i += 1) {
      if (blob && NAME_HINTS[i][0].test(blob)) return NAME_HINTS[i][1];
    }
    return "";
  }

  function placeText(raw, country) {
    const text = String(raw || "").trim().replace(/[，,、·\s]+$/u, "");
    if (!text) return "";
    const key = text.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(PLACE_NAMES, key)) return PLACE_NAMES[key];
    const countryName = COUNTRY_NAMES[country] || "";
    if (countryName && (text === countryName || key === country.toLowerCase() || key === "taiwan" || key === "japan" || key === "korea")) {
      return "";
    }
    if (key === "islands" || key === "unknown" || key === "n/a") return "";
    return text;
  }

  function regionLabel(server, code) {
    const cc = code || inferCountry(server);
    const country = COUNTRY_NAMES[cc] || "";
    const city = placeText(server && server.region_city, cc);
    const area = placeText(server && server.region_name, cc);
    const place = city || (area && area !== country ? area : "");
    if (country && place && place !== country) return country + " · " + place;
    return country || place || "";
  }

  function coords(server) {
    if (!server) return null;
    const city = String(server.region_city || "").trim().toLowerCase();
    if (city && CITY_LL[city]) return CITY_LL[city];
    const area = String(server.region_name || "").trim().toLowerCase();
    if (area && CITY_LL[area]) return CITY_LL[area];
    const cc = inferCountry(server);
    if (cc === "CN" && /\bBJ\b|北京/.test(server.name || "")) return CITY_LL.beijing;
    if (cc && COUNTRY_LL[cc]) return COUNTRY_LL[cc];
    return null;
  }

  function pingList(server) {
    return server && Array.isArray(server.ping) ? server.ping : [];
  }

  function pingOk(p) {
    return p && Number.isFinite(Number(p.current_ms)) && Number(p.current_ms) >= 0;
  }

  function pingScore(p) {
    const isp = String(p.isp || "").toLowerCase();
    const key = String(p.key || "").toLowerCase();
    if (isp === "unicom" || isp === "telecom" || isp === "mobile") return 4;
    if (/^(ln-|cu-|ct-|cm-|cn-)/.test(key)) return 4;
    if (isp && isp !== "intl" && isp !== "web") return 3;
    if (isp === "intl" || key.indexOf("intl-") === 0) return 1;
    return 2;
  }

  function primaryPing(server) {
    const list = pingList(server);
    const valid = list.filter(pingOk);
    if (!valid.length) return list[0] || null;
    let best = valid[0];
    let bestScore = pingScore(best);
    for (let i = 1; i < valid.length; i += 1) {
      const s = pingScore(valid[i]);
      if (s > bestScore) {
        best = valid[i];
        bestScore = s;
      }
    }
    return best;
  }

  function meanMs(list) {
    const vals = (list || []).filter(pingOk).map(function (p) { return Number(p.current_ms); });
    if (!vals.length) return -1;
    return Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length);
  }

  function meanLoss(list) {
    const vals = (list || []).map(function (p) { return p && Number(p.loss_pct); }).filter(function (v) { return Number.isFinite(v) && v >= 0; });
    if (!vals.length) return 0;
    return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  }

  function sparkRuns(values) {
    const pts = values || [];
    const runs = [];
    let start = -1;
    for (let i = 0; i < pts.length; i += 1) {
      const v = Number(pts[i]);
      const ok = Number.isFinite(v) && v >= 0;
      if (ok) {
        if (start < 0) start = i;
      } else if (start >= 0) {
        runs.push([start, i - 1]);
        start = -1;
      }
    }
    if (start >= 0) runs.push([start, pts.length - 1]);
    return runs;
  }

  function lastDays(rows, n) {
    const list = Array.isArray(rows) ? rows.slice() : [];
    list.sort(function (a, b) { return String(a && a.date || "").localeCompare(String(b && b.date || "")); });
    return list.slice(-(n || 7));
  }

  function lastDaysAcross(servers, n) {
    const byDate = {};
    (servers || []).forEach(function (s) {
      (s.daily_traffic || []).forEach(function (d) {
        if (!d || !d.date) return;
        if (!byDate[d.date]) byDate[d.date] = { date: d.date, uplink: 0, downlink: 0, total: 0 };
        byDate[d.date].uplink += d.uplink || 0;
        byDate[d.date].downlink += d.downlink || 0;
        byDate[d.date].total += d.total || 0;
      });
    });
    return lastDays(Object.keys(byDate).map(function (k) { return byDate[k]; }), n);
  }

  function normalizeServer(server) {
    if (!server || typeof server !== "object") return server;
    const out = {};
    Object.keys(server).forEach(function (k) { out[k] = server[k]; });
    const cc = inferCountry(out);
    if (cc) {
      out.region_country = cc;
      if (!out.region) out.region = isoToFlag(cc);
    }
    out.region_label = regionLabel(out, cc);
    if (!Array.isArray(out.ping)) out.ping = [];
    return out;
  }

  function normalizePayload(payload) {
    if (!payload || typeof payload !== "object") return payload;
    const out = {};
    Object.keys(payload).forEach(function (k) { out[k] = payload[k]; });
    out.servers = (payload.servers || []).map(normalizeServer);
    return out;
  }

  const ProbeAdapt = {
    COUNTRY_NAMES: COUNTRY_NAMES,
    COUNTRY_LL: COUNTRY_LL,
    flagToIso: flagToIso,
    isoToFlag: isoToFlag,
    inferCountry: inferCountry,
    regionLabel: regionLabel,
    coords: coords,
    primaryPing: primaryPing,
    meanMs: meanMs,
    meanLoss: meanLoss,
    sparkRuns: sparkRuns,
    lastDays: lastDays,
    lastDaysAcross: lastDaysAcross,
    normalizeServer: normalizeServer,
    normalizePayload: normalizePayload,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = ProbeAdapt;
  global.ProbeAdapt = ProbeAdapt;
})(typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : this);

#!/usr/bin/env node
/*
 * Local preview: serves this theme and forwards /api/* (HTTP and WebSocket) to a deployed probe
 * site, so changes can be tried against real data without deploying.
 *
 *   node scripts/dev-server.mjs --upstream https://probe.example.com [--port 8780] [--host 127.0.0.1]
 *
 * Without --upstream only the demo (?demo=1) works. Keep it off port 8765: the browser tests
 * expect a plain static server there and must never receive live data.
 */
import http from "node:http";
import https from "node:https";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(option("port", process.env.PORT || 8780));
const HOST = option("host", "127.0.0.1");
const upstreamText = option("upstream", process.env.PROBE_UPSTREAM || "");
const UPSTREAM = upstreamText ? new URL(upstreamText) : null;
const client = UPSTREAM && UPSTREAM.protocol === "http:" ? http : https;
const PUBLIC = new Set(["index.html", "css", "js", "img", "fonts", "preview.svg"]);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function forwardHeaders(req) {
  const headers = { ...req.headers, host: UPSTREAM.host };
  delete headers.cookie;
  delete headers.authorization;
  if (headers.origin) headers.origin = UPSTREAM.origin;
  if (headers.referer) headers.referer = UPSTREAM.origin + "/line-grid/";
  return headers;
}

function sendJSON(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function proxy(req, res) {
  if (!UPSTREAM) return sendJSON(res, 503, { error: "dev-server started without --upstream; use ?demo=1" });
  const upstream = client.request(new URL(req.url, UPSTREAM), { method: req.method, headers: forwardHeaders(req), timeout: 15000 }, (reply) => {
    const headers = { ...reply.headers, "cache-control": "no-store" };
    delete headers["set-cookie"];
    res.writeHead(reply.statusCode || 502, headers);
    reply.pipe(res);
  });
  upstream.on("timeout", () => upstream.destroy(new Error("upstream timeout")));
  upstream.on("error", (err) => {
    if (res.headersSent) res.destroy(err);
    else sendJSON(res, 502, { error: "upstream unreachable", detail: err.message });
  });
  req.pipe(upstream);
}

function serveStatic(req, res) {
  let path;
  try { path = decodeURIComponent(new URL(req.url, "http://local").pathname); } catch { res.writeHead(400); res.end(); return; }
  if (path === "/line-grid") { res.writeHead(301, { location: "/line-grid/" }); res.end(); return; }
  if (path.startsWith("/line-grid/")) path = path.slice("/line-grid".length);
  if (path.endsWith("/")) path += "index.html";
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT + sep)) { res.writeHead(403); res.end(); return; }
  if (!PUBLIC.has(file.slice(ROOT.length + 1).split(sep)[0])) { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); res.end("Not found"); return; }
  let stat = null;
  try { stat = statSync(file); } catch {}
  if (!stat || !stat.isFile()) { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); res.end("Not found"); return; }
  res.writeHead(200, { "content-type": TYPES[extname(file).toLowerCase()] || "application/octet-stream", "content-length": stat.size, "cache-control": "no-store" });
  if (req.method === "HEAD") { res.end(); return; }
  createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); res.end(); return; }
  if (req.url.startsWith("/api/")) proxy(req, res);
  else serveStatic(req, res);
});

server.on("upgrade", (req, socket, head) => {
  if (!UPSTREAM || !req.url.startsWith("/api/")) { socket.destroy(); return; }
  const upstream = client.request(new URL(req.url, UPSTREAM), { headers: forwardHeaders(req) });
  upstream.on("upgrade", (reply, remote, remoteHead) => {
    let lines = "HTTP/1.1 101 Switching Protocols\r\n";
    for (let i = 0; i < reply.rawHeaders.length; i += 2) lines += reply.rawHeaders[i] + ": " + reply.rawHeaders[i + 1] + "\r\n";
    socket.write(lines + "\r\n");
    if (remoteHead.length) socket.write(remoteHead);
    if (head.length) remote.write(head);
    const close = () => { socket.destroy(); remote.destroy(); };
    remote.on("error", close);
    socket.on("error", close);
    remote.on("close", close);
    socket.on("close", close);
    remote.pipe(socket).pipe(remote);
  });
  upstream.on("response", (reply) => {
    socket.end("HTTP/1.1 " + reply.statusCode + " " + reply.statusMessage + "\r\n\r\n");
    reply.resume();
  });
  upstream.on("error", () => socket.destroy());
  upstream.end();
});

server.on("error", (err) => {
  console.error(err.code === "EADDRINUSE" ? `端口 ${PORT} 已被占用，可用 --port 换一个。` : err);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const base = `http://${HOST === "0.0.0.0" ? "127.0.0.1" : HOST}:${PORT}`;
  console.log("line-grid 本地预览");
  if (UPSTREAM) console.log(`  真实数据  ${base}/        （/api/* 转发到 ${UPSTREAM.origin}）`);
  else console.log("  未设置 --upstream，只能看演示数据");
  console.log(`  演示数据  ${base}/?demo=1`);
  console.log(`  效果面板  ${base}/?fx=1`);
  console.log("按 Ctrl+C 停止。");
});

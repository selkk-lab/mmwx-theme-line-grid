"""Measure steady-state browser cost with a synthetic live feed (no real probe backend).

Usage:
  python scripts/bench-live.py [--base http://127.0.0.1:8765/] [--seconds 20] [--servers 19] [--hash #/column]

Servers are cloned from the demo snapshot, /api/probe is intercepted, and /api/stream is a mocked
WebSocket that pushes a full snapshot every 5 seconds, matching the production cadence.
"""
import argparse
import json
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')
ap = argparse.ArgumentParser()
ap.add_argument('--base', default='http://127.0.0.1:8765/')
ap.add_argument('--seconds', type=float, default=20)
ap.add_argument('--servers', type=int, default=19)
ap.add_argument('--hash', default='#/column')
ap.add_argument('--label', default='')
ap.add_argument('--fx', default='', help='local effect overrides, e.g. pulse=0,grain=0')
args = ap.parse_args()
FX = dict(pair.split('=') for pair in args.fx.split(',') if '=' in pair)

MAIN_EVENTS = ['FireAnimationFrame', 'TimerFire', 'EventDispatch', 'FunctionCall', 'UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'Layerize', 'ParseHTML']


def fixture(demo, count):
    servers = []
    for i in range(count):
        s = json.loads(json.dumps(demo['servers'][i % len(demo['servers'])]))
        if i >= len(demo['servers']):
            s['name'] = s['name'] + '-' + str(i // len(demo['servers']) + 1)
        servers.append(s)
    demo['servers'] = servers
    return demo


def summarize(trace_path, seconds):
    data = json.loads(Path(trace_path).read_text(encoding='utf-8'))
    events = data['traceEvents'] if isinstance(data, dict) else data
    names = {}
    for e in events:
        if e.get('ph') == 'M' and e.get('name') == 'thread_name':
            names[(e['pid'], e['tid'])] = e['args']['name']
    main_threads = {k for k, v in names.items() if v == 'CrRendererMain'}
    out = {'main_busy': 0.0, 'raster': 0.0}
    for k in MAIN_EVENTS:
        out[k] = 0.0
    for e in events:
        if e.get('ph') != 'X' or 'dur' not in e:
            continue
        key = (e['pid'], e['tid'])
        name = e.get('name')
        if key in main_threads:
            if name == 'RunTask':
                out['main_busy'] += e['dur']
            elif name in out:
                out[name] += e['dur']
        elif name == 'RasterTask':
            out['raster'] += e['dur']
    return {k: round(v / 1000 / seconds, 2) for k, v in out.items()}


with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    probe = browser.new_page()
    probe.goto(args.base + '?demo=1', wait_until='networkidle')
    payload = fixture(probe.evaluate('ProbeDemo.snapshot()'), args.servers)
    probe.close()

    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    context.route('https://**/*', lambda route: route.abort())
    body = json.dumps(payload)
    context.route('**/api/probe', lambda route: route.fulfill(status=200, content_type='application/json', body=body))
    context.route('**/api/series**', lambda route: route.fulfill(status=200, content_type='application/json', body='{"series":[]}'))
    sockets = []

    def on_socket(ws):
        sockets.append(ws)

    context.route_web_socket('**/api/stream**', on_socket)
    if FX:
        context.add_init_script('localStorage.setItem("mmwx-fx", ' + json.dumps(json.dumps(FX)) + ')')
    page = context.new_page()
    page.goto(args.base + args.hash, wait_until='networkidle')
    page.wait_for_timeout(3000)
    page.evaluate("""() => {
      window.__mutations = 0;
      new MutationObserver(list => { for (const m of list) window.__mutations += m.addedNodes.length + m.removedNodes.length; })
        .observe(document.getElementById('main'), { childList: true, subtree: true, characterData: true });
    }""")
    cdp = context.new_cdp_session(page)
    cdp.send('Performance.enable')
    before = {m['name']: m['value'] for m in cdp.send('Performance.getMetrics')['metrics']}
    frames0 = page.evaluate('window.ProbeGlobe ? ProbeGlobe.inspect().frames : 0')
    trace = Path(tempfile.gettempdir()) / ('mmwx-bench-' + datetime.now().strftime('%H%M%S') + '.json')
    browser.start_tracing(page=page, path=str(trace), categories=['devtools.timeline', 'disabled-by-default-devtools.timeline', 'toplevel'])
    pushes = 0
    elapsed = 0.0
    while elapsed < args.seconds:
        step = min(5.0, args.seconds - elapsed)
        page.wait_for_timeout(step * 1000)
        elapsed += step
        if step == 5.0:
            for s in payload['servers']:
                s['download_speed'] = int(s['download_speed'] * (0.9 + (pushes % 3) * 0.1))
            for ws in sockets:
                ws.send(json.dumps(payload))
            pushes += 1
    browser.stop_tracing()
    after = {m['name']: m['value'] for m in cdp.send('Performance.getMetrics')['metrics']}
    frames1 = page.evaluate('window.ProbeGlobe ? ProbeGlobe.inspect().frames : 0')
    mutations = page.evaluate('window.__mutations')
    nodes = page.evaluate('document.getElementsByTagName("*").length')
    browser.close()

sec = args.seconds
result = {
    'label': args.label or args.base,
    'servers': args.servers,
    'seconds': sec,
    'ws_pushes': pushes,
    'cdp_task_ms_per_s': round((after['TaskDuration'] - before['TaskDuration']) * 1000 / sec, 2),
    'cdp_script_ms_per_s': round((after['ScriptDuration'] - before['ScriptDuration']) * 1000 / sec, 2),
    'cdp_style_ms_per_s': round((after['RecalcStyleDuration'] - before['RecalcStyleDuration']) * 1000 / sec, 2),
    'cdp_layout_ms_per_s': round((after['LayoutDuration'] - before['LayoutDuration']) * 1000 / sec, 2),
    'globe_frames_per_s': round((frames1 - frames0) / sec, 1),
    'dom_nodes_changed_per_push': round(mutations / max(1, pushes)),
    'dom_elements': nodes,
    'trace_ms_per_s': summarize(trace, sec),
}
trace.unlink(missing_ok=True)
print(json.dumps(result, ensure_ascii=False, indent=2))

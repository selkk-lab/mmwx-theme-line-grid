"""Live-feed behaviour: in-place DOM patching, stream reconnection, hidden tabs and an idle globe.

Uses local fixtures and a mocked WebSocket only; never contacts a real probe backend.
"""
import json
import sys
import time
from datetime import datetime
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

sys.stdout.reconfigure(encoding='utf-8')
OUT = Path(__file__).resolve().parents[1] / 'artifacts' / ('stream-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
OUT.mkdir(parents=True, exist_ok=True)
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8765/'
MB = 1024 ** 2
checks, errors = [], []


def passed(name):
    checks.append(name)
    print('PASS', name, flush=True)


def wait_until(page, fn, timeout=8000):
    end = time.time() + timeout / 1000
    while time.time() < end:
        if fn():
            return
        page.wait_for_timeout(100)
    raise AssertionError('condition not met within %d ms' % timeout)


with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    demo = browser.new_page()
    demo.goto(BASE + '?demo=1', wait_until='networkidle')
    payload = demo.evaluate('ProbeDemo.snapshot()')
    demo.close()

    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    context.route('https://**/*', lambda route: route.abort())
    context.route('**/api/probe', lambda route: route.fulfill(status=200, content_type='application/json', body=json.dumps(payload)))
    context.route('**/api/series**', lambda route: route.fulfill(status=200, content_type='application/json', body='{"series":[]}'))
    sockets = []
    context.route_web_socket('**/api/stream**', lambda ws: sockets.append(ws))
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))

    def push(speed_mb):
        payload['servers'][0]['download_speed'] = round(speed_mb * MB)
        sockets[-1].send(json.dumps(payload))

    first_speeds = lambda: page.locator('.row:not(.row-h)', has_text='HK-01').locator('.speeds')
    hk_row = "[...document.querySelectorAll('.row:not(.row-h)')].find(r => r.querySelector('.name-t').textContent === 'HK-01')"

    page.goto(BASE + '#/list', wait_until='networkidle')
    expect(page.locator('.row:not(.row-h)')).to_have_count(6)
    wait_until(page, lambda: len(sockets) == 1)
    page.evaluate("""() => {
      window.__row = """ + hk_row + """;
      const range = document.createRange();
      range.selectNodeContents(window.__row.querySelector('.name-t'));
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      window.__halo = document.getAnimations().filter(a => a.animationName === 'fx-breathe-halo').map(a => a.startTime);
    }""")
    push(123.4)
    expect(first_speeds()).to_contain_text('123.4 MB/s')
    check = page.evaluate("""() => ({
      selection: getSelection().toString(),
      sameRow: window.__row === """ + hk_row + """ && window.__row.isConnected,
      halos: window.__halo.length,
      haloKept: JSON.stringify(window.__halo) === JSON.stringify(document.getAnimations().filter(a => a.animationName === 'fx-breathe-halo').map(a => a.startTime)),
    })""")
    assert check['selection'] == 'HK-01', check
    assert check['sameRow'], check
    passed('a pushed snapshot updates readings in place and keeps the text selection')
    assert check['halos'] > 0 and check['haloKept'], check
    passed('status-lamp breathing is not restarted by a snapshot')

    sockets[-1].close()
    wait_until(page, lambda: len(sockets) == 2)
    push(234.5)
    expect(first_speeds()).to_contain_text('234.5 MB/s')
    passed('stream reconnects after the server closes it and keeps updating')

    page.evaluate("""() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    }""")
    push(345.6)
    page.wait_for_timeout(400)
    expect(first_speeds()).to_contain_text('234.5 MB/s')
    page.evaluate("""() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    }""")
    expect(first_speeds()).to_contain_text('345.6 MB/s')
    passed('a hidden page defers rendering and catches up when shown again')

    page.goto(BASE + '#/column', wait_until='networkidle')
    page.wait_for_timeout(800)
    frames = lambda: page.evaluate('ProbeGlobe.inspect().frames')
    start = frames()
    page.wait_for_timeout(500)
    assert frames() > start, 'globe should animate while visible'
    page.evaluate('scrollTo(0, document.documentElement.scrollHeight)')
    page.wait_for_timeout(400)
    parked = frames()
    page.wait_for_timeout(700)
    assert frames() == parked, 'globe kept drawing while scrolled out of view'
    page.evaluate('scrollTo(0, 0)')
    page.wait_for_timeout(500)
    assert frames() > parked, 'globe did not resume after scrolling back'
    passed('the globe stops drawing off-screen and resumes when visible')

    assert not errors, errors
    passed('no browser JavaScript errors')
    browser.close()

(OUT / 'stream-test-results.json').write_text(json.dumps({'passed': len(checks), 'checks': checks}, ensure_ascii=False, indent=2), encoding='utf-8')
print('ALL PASS', len(checks))

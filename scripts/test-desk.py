"""Integrated desk features: summaries, attention digest, chains, split matrices, quotas and node trends.

Local demo and intercepted fixtures only; never contacts a real probe backend.
"""
import json
import re
import sys
from datetime import date, timedelta
from pathlib import Path
from datetime import datetime
from playwright.sync_api import sync_playwright, expect

sys.stdout.reconfigure(encoding='utf-8')
OUT = Path(__file__).resolve().parents[1] / 'artifacts' / ('desk-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
OUT.mkdir(parents=True, exist_ok=True)
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8765/'
GB = 1024 ** 3
checks, errors = [], []


def passed(name):
    checks.append(name)
    print('PASS', name, flush=True)


def no_overflow(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'horizontal page overflow'


def live_context(browser, payload, system=None, requests=None, **kw):
    ctx = browser.new_context(viewport=kw.pop('viewport', {'width': 1440, 'height': 1000}), reduced_motion='reduce', **kw)
    ctx.route('https://**/*', lambda route: route.abort())
    body = json.dumps(payload)
    ctx.route('**/api/probe', lambda route: route.fulfill(status=200, content_type='application/json', body=body))

    def series(route):
        if requests is not None:
            requests.append(route.request.url)
        if 'metric=system' in route.request.url and system:
            route.fulfill(status=200, content_type='application/json', body=json.dumps(system))
        else:
            route.fulfill(status=200, content_type='application/json', body='{"series":[]}')
    ctx.route('**/api/series**', series)
    ctx.route_web_socket('**/api/stream**', lambda ws: None)
    return ctx


with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    demo_ctx = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
    demo_ctx.route('https://**/*', lambda route: route.abort())
    page = demo_ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE + '?demo=1#/column', wait_until='networkidle')
    base_payload = page.evaluate('ProbeDemo.snapshot()')
    system = page.evaluate('ProbeDemo.systemSeries(ProbeDemo.snapshot().servers[0], "1h")')

    expect(page.locator('#page-summary')).to_contain_text('台节点')
    page.locator('[data-home="network"]').click()
    expect(page.locator('#page-summary')).to_contain_text('线路节点平均')
    page.locator('[data-home="resource"]').click()
    expect(page.locator('#page-summary')).to_contain_text('CPU 平均')
    passed('every page opens with a plain-language status line')

    page.locator('[data-home="nodes"]').click()
    digest = page.locator('.digest')
    expect(digest.locator('.digest-item', has_text='NL-01')).to_contain_text('过期')
    expect(digest.locator('.digest-item', has_text='JP-02')).to_contain_text('到期')
    chip = digest.locator('.digest-item', has_text='JP-02')
    chip.click()
    expect(page.locator('#win-title')).to_have_text('JP-02')
    page.keyboard.press('Escape')
    expect(chip).to_be_focused()
    passed('attention digest lists renewals and returns focus to the clicked item')

    page.locator('[data-home="network"]').click()
    chain = page.locator('.chain-console')
    expect(chain).to_have_count(1)
    expect(chain.locator('.chain-group')).to_have_count(2)
    expect(chain.locator('.chain-link')).to_contain_text('27')
    expect(chain).to_contain_text('132 GB')
    chain.locator('button.chain-node', has_text='HK-01').click()
    expect(page.locator('#win-title')).to_have_text('HK-01')
    page.keyboard.press('Escape')
    passed('forward chain shows groups, hop latency, weekly traffic and opens member nodes')

    page.evaluate('scrollTo(0, 900)')
    page.locator('[data-home="resource"]').click()
    page.wait_for_timeout(200)
    assert page.evaluate('scrollY') == 0
    passed('switching pages starts at the top')

    hot = page.locator('.hotspot-list li')
    expect(hot.first).to_contain_text('DE-01')
    expect(page.locator('.quota-row')).to_have_count(6)
    first_quota = page.locator('.quota-row').first.locator('.quota-read b').inner_text()
    last_quota = page.locator('.quota-row').last.locator('.quota-read b').inner_text()
    assert float(first_quota.rstrip('%')) >= float(last_quota.rstrip('%'))
    text = page.locator('.resource-console').inner_text()
    assert 'NaN' not in text and 'undefined' not in text
    passed('hotspots rank period usage and quotas sort by consumption')

    page.locator('[data-home="nodes"]').click()
    page.locator('.slab').first.click()
    expect(page.locator('.detail-brief')).to_contain_text('到期')
    page.locator('[data-detail-tab="system"]').click()
    expect(page.locator('.trend-card')).to_have_count(4)
    page.locator('[data-sys-range="6h"]').click()
    expect(page.locator('[data-sys-range="6h"]')).to_have_attribute('aria-pressed', 'true')
    expect(page.locator('.trend-card')).to_have_count(4)
    page.locator('[data-detail-tab="traffic"]').click()
    expect(page.locator('.period-reads > div')).to_have_count(4)
    assert 'NaN' not in page.locator('#win-body').inner_text()
    page.keyboard.press('Escape')
    passed('node detail adds a brief, system trends with ranges and a billing-period view')
    demo_ctx.close()

    # Live fixture: an offline node, an over-quota node, messy prices, mixed targets and hidden sections.
    payload = json.loads(json.dumps(base_payload))
    today = date.today()
    s0, s1, s2, s3 = payload['servers'][:4]
    s0['online'] = False
    s1['traffic_used'] = int(1.3 * 1024 * GB)
    s1['traffic_limit'] = 1024 * GB
    s1['period_start'] = (today - timedelta(days=10)).isoformat()
    s1['period_end'] = (today + timedelta(days=20)).isoformat()
    s1['renewal_price_cny'] = 241.464886981018
    s1['renewal_price'] = 36
    s1['renewal_currency'] = 'USD'
    s1['renewal_cycle'] = 'year'
    s1['provider_name'] = 'good-host'
    s1['provider_url'] = 'https://example.com/'
    s2['provider_name'] = 'bad-host'
    s2['provider_url'] = 'javascript:alert(1)'
    s2['ping'] = [{'key': 'intl-web-github', 'label': 'GitHub', 'isp': 'intl', 'current_ms': 12, 'loss_pct': 0, 'buckets': [{'ms': 12, 'loss': 0}] * 12}]
    s3['ping'] = []
    for s in payload['servers']:
        if s is not s1:
            s['expires_at'] = (today + timedelta(days=200)).isoformat()
    payload['show_forward'] = False
    payload['show_traffic_hotspots'] = False
    requests = []
    ctx = live_context(browser, payload, system, requests)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE + '#/column', wait_until='networkidle')
    expect(page.locator('.digest-item', has_text=s0['name'])).to_contain_text('离线')
    expect(page.locator('.digest-item', has_text=s1['name'])).to_contain_text('超额')
    expect(page.locator('#page-summary')).to_contain_text('已超出流量限额')
    passed('live snapshot surfaces offline and over-quota nodes in the digest and summary')

    page.locator('[data-home="resource"]').click()
    renewal = page.locator('.renewal-console').inner_text()
    assert '¥241' in renewal and not re.search(r'\d+\.\d{3,}', renewal), renewal
    expect(page.locator('.hotspot-console')).to_have_count(0)
    over = page.locator('.quota-row', has_text=s1['name'])
    expect(over).to_have_class(re.compile('danger'))
    expect(over).to_contain_text('周期末约')
    passed('prices are rounded, hidden sections stay hidden and over-quota projection is shown')

    page.locator('[data-home="network"]').click()
    expect(page.locator('.chain-console')).to_have_count(0)
    expect(page.locator('.latency-matrix')).to_have_count(2)
    land = page.locator('.latency-matrix').nth(1)
    expect(land.locator('thead th')).to_have_count(2)
    expect(land.locator('tbody tr')).to_have_count(1)
    expect(page.locator('.matrix-silent')).to_contain_text(s3['name'])
    expect(page.locator('.channel-group')).to_have_count(3)
    passed('matrices split line and landing targets and list nodes without probes')

    page.locator('[data-home="nodes"]').click()
    page.locator('.digest-item', has_text=s1['name']).click()
    brief = page.locator('.detail-brief')
    expect(brief.locator('a')).to_have_attribute('href', 'https://example.com/')
    expect(brief).to_contain_text('$36 / 年 ≈ ¥241')
    page.locator('[data-detail-tab="system"]').click()
    expect(page.locator('.trend-card')).to_have_count(4)
    assert any('metric=system' in u for u in requests), requests
    page.locator('[data-detail-tab="traffic"]').click()
    expect(page.locator('.period-reads')).to_contain_text('已过 10 / 30 天')
    page.locator('[data-node-step="1"]').click()
    expect(page.locator('#win-title')).to_have_text(s2['name'])
    page.locator('[data-detail-tab="overview"]').click()
    expect(page.locator('.detail-brief a')).to_have_count(0)
    expect(page.locator('.detail-brief')).to_contain_text('bad-host')
    passed('detail brief links only http(s) providers and system trends use the system series API')
    ctx.close()

    calm = json.loads(json.dumps(base_payload))
    for s in calm['servers']:
        s['expires_at'] = (today + timedelta(days=200)).isoformat()
    ctx = live_context(browser, calm)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE + '#/column', wait_until='networkidle')
    expect(page.locator('.digest.is-clear')).to_contain_text('一切正常')
    expect(page.locator('#page-summary')).to_contain_text('没有需要处理的告警')
    passed('a healthy fleet gets an explicit all-clear instead of an empty panel')
    ctx.close()

    mobile = live_context(browser, payload, system, viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    page = mobile.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE + '#/column', wait_until='networkidle')
    for width in [360, 390, 768]:
        page.set_viewport_size({'width': width, 'height': 844})
        for home in ['nodes', 'network', 'resource']:
            page.locator('[data-home="' + home + '"]').click()
            page.wait_for_timeout(120)
            no_overflow(page)
    page.set_viewport_size({'width': 390, 'height': 844})
    page.locator('[data-home="nodes"]').click()
    page.screenshot(path=str(OUT / 'mobile-home.png'), full_page=True)
    page.locator('.digest-item').first.click()
    for tab in ['overview', 'system', 'traffic']:
        page.locator('[data-detail-tab="' + tab + '"]').click()
        page.wait_for_timeout(300)
        assert page.locator('#win-body').evaluate('(el) => el.scrollWidth <= el.clientWidth'), tab
    page.screenshot(path=str(OUT / 'mobile-detail.png'))
    passed('new panels fit 360 to 768px and detail sections fit a phone')
    mobile.close()

    assert not errors, errors
    passed('no browser JavaScript errors')
    browser.close()

(OUT / 'desk-test-results.json').write_text(json.dumps({'passed': len(checks), 'checks': checks}, ensure_ascii=False, indent=2), encoding='utf-8')
print('ALL PASS', len(checks))

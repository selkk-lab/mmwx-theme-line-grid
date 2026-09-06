"""Browser checks with local fixtures; never contacts a real probe backend."""
import json
import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone
from playwright.sync_api import sync_playwright, expect

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts' / ('ux-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
OUT.mkdir(parents=True, exist_ok=True)
BASE = 'http://127.0.0.1:8765/'
results = []
errors = []

def check(name, fn):
    fn()
    results.append(name)
    print('PASS', name)

def no_overflow(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'horizontal page overflow'

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
    context.route('https://**/*', lambda route: route.abort())
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE + '?demo=1#/list', wait_until='networkidle')
    payload = page.evaluate('ProbeDemo.snapshot()')
    check('demo is explicitly labeled', lambda: expect(page.locator('#connection-status')).to_contain_text('非真实数据'))
    check('desktop shows six nodes with no overflow', lambda: (expect(page.locator('.row:not(.row-h)')).to_have_count(6), no_overflow(page)))
    page.screenshot(path=str(OUT / 'after-desktop.png'), full_page=True)
    page.keyboard.press('/')
    check('slash focuses search', lambda: expect(page.locator('[data-find]')).to_be_focused())
    page.locator('[data-find]').fill('JP')
    check('name search filters correctly', lambda: expect(page.locator('.row:not(.row-h)')).to_have_count(3))
    page.locator('[data-find]').fill('日本')
    check('Chinese region search filters correctly', lambda: expect(page.locator('.row:not(.row-h)')).to_have_count(3))
    page.wait_for_timeout(5200)
    check('periodic update preserves search focus and value', lambda: (expect(page.locator('[data-find]')).to_be_focused(), expect(page.locator('[data-find]')).to_have_value('日本')))
    page.locator('[data-find]').fill('no-such-node')
    check('no matches shows useful empty state', lambda: expect(page.get_by_text('没有匹配的节点')).to_be_visible())
    for view in ['grid', 'column', 'list']:
        page.locator('[data-view="' + view + '"]').click()
        expect(page.get_by_text('没有匹配的节点')).to_be_visible()
    results.append('empty state consistent across all three views')
    page.locator('.search-empty [data-reset]').click()
    expect(page.locator('.row:not(.row-h)')).to_have_count(6)
    page.locator('[data-order]').select_option('ms')
    check('latency ascending places HK first', lambda: expect(page.locator('.row:not(.row-h) .name-t').first).to_have_text('HK-01'))
    page.get_by_role('button', name='切换排序方向').click()
    check('latency descending places DE first', lambda: expect(page.locator('.row:not(.row-h) .name-t').first).to_have_text('DE-01'))
    page.locator('.row:not(.row-h)').first.click()
    expect(page.locator('#overlay')).to_be_visible()
    check('dialog receives focus and background is inert', lambda: (expect(page.locator('#win-close')).to_be_focused(), expect(page.locator('.shell')).to_have_attribute('inert', '')))
    page.locator('#win-body').evaluate('(el) => el.scrollTop = 160')
    scroll_before = page.locator('#win-body').evaluate('(el) => el.scrollTop')
    page.wait_for_timeout(5200)
    assert page.locator('#win-body').evaluate('(el) => el.scrollTop') == scroll_before
    results.append('dialog scroll survives refresh')
    focusables = page.locator('#overlay button').filter(visible=True)
    focusables.last.focus()
    page.keyboard.press('Tab')
    check('dialog traps Tab focus', lambda: expect(page.locator('#win-back')).to_be_focused())
    page.keyboard.press('Escape')
    expect(page.locator('#overlay')).to_be_hidden()
    check('Escape closes dialog and returns focus to node', lambda: expect(page.locator('.row:not(.row-h)').first).to_be_focused())
    page.locator('[data-home="network"]').click()
    check('network view still opens', lambda: expect(page.locator('#page-title')).to_have_text('网络状况'))
    no_overflow(page)
    page.locator('[data-home="resource"]').click()
    check('resource view still opens', lambda: expect(page.locator('#page-title')).to_have_text('资源概况'))
    no_overflow(page)
    page.locator('[data-home="nodes"]').click()
    page.locator('[data-order]').select_option('name')
    page.locator('#theme-toggle').click()
    expect(page.locator('html')).to_have_attribute('data-theme', 'light')
    page.screenshot(path=str(OUT / 'after-light.png'), full_page=True)
    page.reload(wait_until='networkidle')
    check('theme persists across reload', lambda: expect(page.locator('html')).to_have_attribute('data-theme', 'light'))

    mobile = browser.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True, reduced_motion='reduce')
    mobile.route('https://**/*', lambda route: route.abort())
    m = mobile.new_page()
    m.on('pageerror', lambda error: errors.append(str(error)))
    m.goto(BASE + '?demo=1', wait_until='networkidle')
    check('mobile defaults to detailed with globe collapsed', lambda: (expect(m.locator('.stack')).to_be_visible(), expect(m.locator('[data-view="column"]')).to_have_attribute('aria-pressed','true'), expect(m.locator('.home-globe')).to_have_count(0), no_overflow(m)))
    m.screenshot(path=str(OUT / 'after-mobile.png'), full_page=True)
    m.locator('[data-globe]').click()
    expect(m.locator('.home-globe')).to_be_visible()
    no_overflow(m)
    m.locator('[data-globe]').click()
    for width in [360, 390, 768, 1024]:
        m.set_viewport_size({'width':width,'height':900})
        for view in ['grid','column','list']:
            m.locator('[data-view="'+view+'"]').click()
            m.wait_for_timeout(100)
            no_overflow(m)
        for home in ['network','resource']:
            m.locator('[data-home="'+home+'"]').click()
            m.wait_for_timeout(100)
            no_overflow(m)
        m.locator('[data-home="nodes"]').click()
    results.append('360/390/768/1024px: all views have no page overflow')
    m.set_viewport_size({'width':390,'height':844})
    m.locator('.row:not(.row-h)').first.click()
    no_overflow(m)
    m.screenshot(path=str(OUT/'detail-mobile.png'))
    m.keyboard.press('Escape')
    m.reload(wait_until='networkidle')
    check('view preference persists', lambda: expect(m.locator('[data-view="list"]')).to_have_attribute('aria-pressed','true'))

    live_context = browser.new_context(viewport={'width':1440,'height':1000}, reduced_motion='reduce')
    live_context.route('https://**/*', lambda route: route.abort())
    live = live_context.new_page()
    live.clock.install()
    live.on('pageerror', lambda error: errors.append(str(error)))
    fixture = {'mode':'error', 'payload':payload}
    payload['servers'][0]['online'] = False
    payload['servers'][1]['cpu_pct'] = 92
    payload['servers'][0]['name'] = 'LOCAL-TEST-OFFLINE'
    payload['servers'][1]['name'] = 'LOCAL-TEST-HIGH-CPU'
    def api(route):
        if fixture['mode'] == 'error': route.fulfill(status=503,content_type='application/json',body='{}')
        else: route.fulfill(status=200,content_type='application/json',body=json.dumps(fixture['payload']))
    live_context.route('**/api/**',api)
    live.goto(BASE + '#/list', wait_until='networkidle')
    check('API failure offers retry and never shows demo nodes', lambda: (expect(live.get_by_text('暂时无法连接探针')).to_be_visible(), expect(live.locator('.row:not(.row-h)')).to_have_count(0), expect(live.locator('#foot')).to_be_empty()))
    live.screenshot(path=str(OUT/'error-desktop.png'),full_page=True)
    fixture['mode'] = 'ok'
    live.locator('[data-retry]').click()
    expect(live.locator('.row:not(.row-h)')).to_have_count(6)
    check('retry recovers with local API fixture', lambda: expect(live.locator('#connection-status')).to_have_text('数据已同步'))
    live.locator('[data-status="offline"]').click()
    check('offline filter uses actual status', lambda: (expect(live.locator('.row:not(.row-h)')).to_have_count(1), expect(live.locator('.row .name-t')).to_have_text('LOCAL-TEST-OFFLINE')))
    live.locator('[data-status="attention"]').click()
    check('attention filter includes offline and high CPU', lambda: expect(live.locator('.row:not(.row-h)')).to_have_count(2))
    stamp = live.locator('#foot').text_content()
    live.wait_for_timeout(2100)
    check('last update timestamp does not advance without data', lambda: expect(live.locator('#foot')).to_have_text(stamp))
    live.clock.set_system_time(datetime.now(timezone.utc) + timedelta(seconds=60))
    live.clock.run_for(1100)
    check('stale data is labeled', lambda: expect(live.locator('#connection-status')).to_have_text('数据待更新'))
    live.clock.resume()
    fixture['payload'] = {'enabled':False,'servers':[]}
    live.locator('#refresh-data').click()
    check('disabled probe has explicit state', lambda: expect(live.get_by_text('探针未开启',exact=True).last).to_be_visible())
    expect(live.locator('#foot')).to_be_empty()
    fixture['payload'] = {'enabled':True,'servers':[]}
    live.locator('#refresh-data').click()
    check('empty API is distinct from search no matches', lambda: expect(live.get_by_text('暂无节点',exact=True)).to_be_visible())
    assert not errors, errors
    results.append('no browser JavaScript errors')
    browser.close()

(OUT/'test-results.json').write_text(json.dumps({'passed':len(results),'checks':results,'browser':'Microsoft Edge / Playwright','data':'local demo and intercepted API fixtures only'},ensure_ascii=False,indent=2),encoding='utf-8')
print('ALL PASS:',len(results))

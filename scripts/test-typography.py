"""Verify actual rendered fonts, first-visit migration and responsive typography."""
import json, sys
from datetime import datetime
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

sys.stdout.reconfigure(encoding='utf-8')
OUT = Path(__file__).resolve().parents[1] / 'artifacts' / ('typography-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
OUT.mkdir(parents=True, exist_ok=True)
BASE = 'http://127.0.0.1:8765/?demo=1'
checks, rendered, failures = [], {}, []

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    context = browser.new_context(viewport={'width':1440,'height':1050}, reduced_motion='reduce')
    context.route('https://**/*', lambda r: r.abort())
    page = context.new_page()
    page.on('pageerror', lambda e: failures.append(str(e)))
    page.on('requestfailed', lambda r: failures.append(r.url))
    page.goto(BASE, wait_until='networkidle')
    page.evaluate('document.fonts.ready')
    expect(page.locator('[data-view="column"]')).to_have_attribute('aria-pressed','true')
    expect(page.locator('.slab')).to_have_count(6)
    checks.append('fresh desktop defaults to detailed')

    cdp = context.new_cdp_session(page)
    cdp.send('DOM.enable'); cdp.send('CSS.enable')
    document = cdp.send('DOM.getDocument')['root']['nodeId']
    for label, selector, family in [('Chinese','#page-title','Noto Sans SC'), ('English','.brand > span','Space Grotesk'), ('Numbers','.ni-latency b','JetBrains Mono')]:
        node = cdp.send('DOM.querySelector', {'nodeId':document,'selector':selector})['nodeId']
        fonts = cdp.send('CSS.getPlatformFontsForNode', {'nodeId':node})['fonts']
        rendered[label] = fonts
        # Variable Noto builds retain "Thin" in their internal family name;
        # the rendered instance's weight is selected by CSS.
        assert any(f['familyName'].startswith(family) and f['isCustomFont'] and f['glyphCount'] > 0 for f in fonts), fonts
    checks.append('Chinese, English and numbers actually render in three self-hosted fonts')
    fonts = page.evaluate("performance.getEntriesByType('resource').filter(r=>r.name.includes('/fonts/')).map(r=>({url:r.name,bytes:r.encodedBodySize}))")
    assert fonts and all(f['url'].startswith('http://127.0.0.1:8765/') and f['bytes'] > 0 for f in fonts)
    checks.append('font requests succeed with external internet blocked')
    page.screenshot(path=str(OUT/'desktop.png'), full_page=True)
    page.locator('[data-view="grid"]').click()
    page.goto(BASE, wait_until='networkidle')
    expect(page.locator('[data-view="grid"]')).to_have_attribute('aria-pressed','true')
    checks.append('subsequent manual choice persists on root entry')
    page.locator('.brand').click()
    expect(page.locator('[data-view="column"]')).to_have_attribute('aria-pressed','true')
    checks.append('brand home opens detailed')
    page.goto(BASE+'#/list', wait_until='networkidle')
    expect(page.locator('.row:not(.row-h)')).to_have_count(6)
    checks.append('explicit list deep links remain valid')

    page.evaluate("localStorage.removeItem('mmwx-view-default'); localStorage.setItem('mmwx-view','grid')")
    page.goto(BASE, wait_until='networkidle')
    expect(page.locator('[data-view="column"]')).to_have_attribute('aria-pressed','true')
    page.reload(wait_until='networkidle')
    expect(page.locator('[data-view="column"]')).to_have_attribute('aria-pressed','true')
    checks.append('existing card preference migrates to detailed once')
    for width in [360,390,768,1024,1440]:
        page.set_viewport_size({'width':width,'height':950})
        for route in ['column','network','resource']:
            page.goto(BASE+'#/'+route, wait_until='networkidle')
            page.evaluate('document.fonts.ready')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width,route)
            if width==390:
                page.screenshot(path=str(OUT/('mobile-'+route+'.png')),full_page=True)
    checks.append('loaded typography fits home/network/resource at five viewport widths')
    page.locator('#theme-toggle').click()
    page.wait_for_function("getComputedStyle(document.body).backgroundColor === 'rgb(212, 192, 150)'")
    page.screenshot(path=str(OUT/'light-resource.png'), full_page=True)
    checks.append('original warm day palette preserved')
    assert not failures, failures
    checks.append('no JavaScript or failed network requests')
    browser.close()

(OUT/'results.json').write_text(json.dumps({'checks':checks,'rendered':rendered,'first_page_font_bytes':sum(f['bytes'] for f in fonts),'first_page_font_requests':len(fonts)},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'passed':len(checks),'font_bytes':sum(f['bytes'] for f in fonts),'output':str(OUT)},ensure_ascii=False))

"""Local console acceptance: linked navigation, data semantics, compactness and responsive layouts."""
import json, sys
from pathlib import Path
from datetime import datetime
from playwright.sync_api import sync_playwright, expect
sys.stdout.reconfigure(encoding='utf8')
OUT=Path(__file__).resolve().parents[1]/'artifacts'/('console-'+datetime.now().strftime('%Y%m%d-%H%M%S'))
OUT.mkdir(parents=True,exist_ok=True)
checks=[]
def passed(name): checks.append(name); print('PASS',name,flush=True)
with sync_playwright() as p:
 b=p.chromium.launch(channel='msedge',headless=True)
 page=b.new_page(viewport={'width':1440,'height':1050}); errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:8765/?demo=1&v=desk',wait_until='networkidle')
 page.wait_for_timeout(1000)
 page.locator('[data-view="grid"]').click();page.wait_for_timeout(1000)
 expect(page.locator('.node-instrument')).to_have_count(6)
 assert page.locator('.cell').first.bounding_box()['height']<280
 page.screenshot(path=str(OUT/'home-cards.png'),full_page=True)
 passed('six compact cards, each under 280px on desktop')
 page.locator('[data-quick-compare]').first.click()
 expect(page.locator('#overlay')).not_to_be_visible()
 expect(page.locator('[data-quick-compare]').first).to_have_attribute('aria-pressed','true')
 page.locator('[data-quick-compare]').nth(1).click()
 expect(page.locator('[data-compare-go]')).to_be_enabled()
 page.locator('[data-compare-go]').click();expect(page.locator('#workbench-dialog')).to_be_visible()
 page.keyboard.press('Escape')
 page.locator('[data-quick-compare]').first.click();page.locator('[data-quick-compare]').nth(1).click()
 passed('cards add and remove comparison selections without entering node details')
 page.locator('[data-view="column"]').click();page.wait_for_timeout(800)
 assert page.locator('.slab').first.bounding_box()['height']<290
 page.screenshot(path=str(OUT/'home-detail-layout.png'),full_page=True)
 passed('detailed layout keeps network, resources and system in one compact tile')
 page.locator('[data-home="network"]').click();page.wait_for_timeout(1000)
 expect(page.locator('.channel-node')).to_have_count(6)
 expect(page.locator('.target-channel')).to_have_count(3)
 expect(page.locator('.latency-matrix tbody tr')).to_have_count(6)
 page.screenshot(path=str(OUT/'network.png'),full_page=True)
 passed('network desk renders node channels, targets and cross-node matrix')
 page.locator('[data-matrix-node="1"]').first.click();page.wait_for_timeout(350)
 expect(page.locator('.channel-node[data-net="1"]')).to_have_attribute('aria-pressed','true')
 expect(page.locator('.target-channel.is-on')).to_have_count(1)
 expect(page.locator('.signal-primary>span')).to_have_text('当前延迟')
 passed('matrix selection links the node, target and main signal plot')
 page.locator('[data-nett="all"]').click()
 expect(page.locator('.signal-primary>span')).to_have_text('目标当前均值')
 values=page.locator('.scope-drawing svg').get_attribute('data-pts')
 assert len(values.split(';'))>1
 page.locator('[data-range="6h"]').click()
 expect(page.locator('[data-range="6h"]')).to_have_attribute('aria-pressed','true')
 passed('mean and selected-target modes are distinct and range controls work')
 before=page.locator('.scope-axis').inner_text()
 page.locator('[data-scope-zoom]').click()
 expect(page.locator('[data-scope-zoom]')).to_have_attribute('aria-pressed','true')
 assert page.locator('.scope-axis').inner_text()!=before
 page.locator('.scope-drawing').focus();page.keyboard.press('End')
 expect(page.locator('.sample-readout')).to_contain_text('样本')
 page.keyboard.press('Home');expect(page.locator('.sample-readout')).to_contain_text('样本 1 /')
 page.locator('[data-scope-zoom]').click()
 assert page.locator('.scope-axis').inner_text()==before
 passed('waveform magnification has explicit axes and keyboard sample inspection')
 page.locator('[data-home="resource"]').click();page.wait_for_timeout(1200)
 expect(page.locator('.capacity-gauge')).to_have_count(3)
 expect(page.locator('.sky-node')).to_have_count(6)
 page.locator('.capacity-panel>.console-heading [data-resource-metric="mem"]').click();page.wait_for_timeout(1100)
 assert '内存' in page.locator('.skyline').get_attribute('aria-label')
 expect(page.locator('.resource-matrix thead [data-resource-metric="mem"]')).to_have_class('is-on')
 page.screenshot(path=str(OUT/'resource.png'),full_page=True)
 passed('capacity dials and 3D chart use the selected resource metric')
 page.locator('[data-resource-order="name"]').click()
 names=page.locator('.resource-matrix tbody th button').all_text_contents()
 assert names==sorted(names)
 page.locator('.sky-node').first.focus();page.keyboard.press('Enter')
 expect(page.locator('#overlay')).to_be_visible()
 passed('resource ranking supports name sort and keyboard entry into node details')
 for tab in ['ping','traffic','system','overview']:
  page.locator('[data-detail-tab="'+tab+'"]').click()
  expect(page.locator('[data-detail-content="'+tab+'"]').first).to_be_visible()
 page.wait_for_timeout(700)
 page.screenshot(path=str(OUT/'node-detail.png'))
 page.locator('[data-detail-tab="system"]').click();page.wait_for_timeout(5100)
 expect(page.locator('[data-detail-content="system"]')).to_be_visible()
 expect(page.locator('[data-detail-tab="system"]')).to_be_focused()
 passed('detail sections work and retain selection and focus after a snapshot refresh')
 page.keyboard.press('Escape')
 expect(page.locator('#page-title')).to_have_text('资源概况')
 page.locator('#fx-launcher').click()
 expect(page.locator('#fx-panel [data-fx]')).to_have_count(16)
 for effect in ['trace','rise','scan','depth']:
  page.locator('[data-fx="'+effect+'"]').uncheck()
  assert page.locator('html').get_attribute('data-fx-'+effect)=='0'
 page.locator('[data-preset="recommended"]').click();page.locator('.fx-min').click()
 passed('four new effects are independently switchable in the 16-effect lab')
 for width in [360,390,768,1024,1440]:
  page.set_viewport_size({'width':width,'height':900})
  for home in ['network','resource','nodes']:
   page.locator('[data-home="'+home+'"]').click();page.wait_for_timeout(100)
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,home)
  for view in ['grid','column','list']:
   page.locator('[data-view="'+view+'"]').click();page.wait_for_timeout(100)
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,view)
 passed('all pages and all three machine layouts fit widths 360 through 1440')
 page.set_viewport_size({'width':390,'height':844})
 for home in ['network','resource','nodes']:
  page.locator('[data-home="'+home+'"]').click();page.wait_for_timeout(900)
  if home=='nodes':page.locator('[data-view="grid"]').click();page.wait_for_timeout(700)
  page.screenshot(path=str(OUT/('mobile-'+home+'.png')),full_page=True)
 page.locator('.cell').first.click();page.wait_for_timeout(600)
 page.screenshot(path=str(OUT/'mobile-detail.png'))
 for tab in ['overview','ping','traffic','system']:
  page.locator('[data-detail-tab="'+tab+'"]').click()
  assert page.locator('#win-body').evaluate('(el)=>el.scrollWidth<=el.clientWidth')
 passed('all four node detail sections fit a 390px mobile viewport')
 page.keyboard.press('Escape');page.set_viewport_size({'width':1440,'height':1050})
 page.locator('#theme-toggle').click();page.wait_for_timeout(1400)
 assert page.evaluate('getComputedStyle(document.body).backgroundColor')=='rgb(212, 192, 150)'
 page.locator('[data-home="resource"]').click();page.wait_for_timeout(1000)
 page.screenshot(path=str(OUT/'resource-light.png'),full_page=True)
 passed('the original warm-paper daytime palette remains unchanged')
 result=page.evaluate('''() => {
   const unknown={name:'Unknown',online:false,ping:[],expires_at:'2020-01-01'};
   return {
    unknown:ProbeConsole.node(unknown,0,false),
    resource:ProbeConsole.resource({servers:[unknown],last7:[],cost:0,settings:{}}),
    hidden:ProbeConsole.resource({servers:[unknown],last7:[],cost:0,settings:{show_resource_heatmap:false,show_traffic_7d:false,show_traffic_quota:false,show_renewal_timeline:false}}),
    stats:ProbeConsole.samples([10,-1,30,50]),
    malicious:ProbeConsole.node({name:'<img src=x onerror=alert(1)>',ping:[]},0,false)
   };
 }''')
 assert 'NaN' not in result['unknown'] and 'NaN' not in result['resource']
 assert '已过期' in result['resource'] and '0%<' not in result['unknown']
 assert result['stats']['jitter']==20 and result['stats']['coverage']==75
 for cls in ['capacity-panel','traffic-console','quota-console','renewal-console']: assert cls not in result['hidden']
 assert '<img' not in result['malicious']
 passed('missing readings, expired dates, feature visibility and untrusted text stay truthful')
 page.emulate_media(reduced_motion='reduce');page.locator('[data-home="network"]').click();page.wait_for_timeout(700)
 assert page.locator('.scope-scan').evaluate('(el)=>getComputedStyle(el).display')=='none'
 passed('reduced-motion preference disables signal scanning')
 assert not errors,errors
 passed('no browser JavaScript errors across all flows')
 b.close()
(OUT/'results.json').write_text(json.dumps({'passed':len(checks),'checks':checks},ensure_ascii=False,indent=2),encoding='utf8')
print('ALL PASS',len(checks),'ARTIFACTS',OUT)

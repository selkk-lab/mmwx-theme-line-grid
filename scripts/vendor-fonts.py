"""Vendor Google Fonts' unicode subsets, preserving full CJK name coverage.

Only run intentionally when updating typography; not part of the build.
"""
import concurrent.futures, hashlib, json, re, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'fonts'
DEST.mkdir(exist_ok=True)
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
families = [('Space Grotesk', 'Space+Grotesk:wght@400..700', 'spacegrotesk'),
            ('Noto Sans SC', 'Noto+Sans+SC:wght@400..700', 'notosanssc'),
            ('JetBrains Mono', 'JetBrains+Mono:wght@400..700', 'jetbrainsmono')]

def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60) as r:
        return r.read()

css = ['/* Self-hosted variable fonts. OFL licenses and upstream manifest: ../fonts/. */']
manifest = []
downloads = {}
for family, query, slug in families:
    source = 'https://fonts.googleapis.com/css2?family=' + query + '&display=swap'
    sheet = fetch(source).decode()
    for url in dict.fromkeys(re.findall(r'url\((https://[^)]+)\)', sheet)):
        filename = slug + '-' + hashlib.sha256(url.encode()).hexdigest()[:12] + '.woff2'
        downloads[filename] = url
        sheet = sheet.replace(url, '../fonts/' + filename)
    css.append(sheet)
    license_url = 'https://raw.githubusercontent.com/google/fonts/main/ofl/' + slug + '/OFL.txt'
    license_text = '\n'.join(line.rstrip() for line in fetch(license_url).decode().splitlines()) + '\n'
    (DEST / (slug + '-OFL.txt')).write_text(license_text, encoding='utf-8')
    manifest.append({'family': family, 'stylesheet': source, 'license': license_url})

def download(item):
    name, url = item
    target = DEST / name
    if not target.exists():
        data = fetch(url)
        assert data[:4] == b'wOF2', name
        target.write_bytes(data)
    return target.stat().st_size

with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    sizes = list(pool.map(download, downloads.items()))
(ROOT / 'css' / 'fonts.css').write_text('\n'.join(css), encoding='utf-8')
(DEST / 'manifest.json').write_text(json.dumps({'families': manifest, 'files': downloads}, indent=2), encoding='utf-8')
print(json.dumps({'files':len(sizes), 'bytes':sum(sizes), 'largest':max(sizes)}))

#!/usr/bin/env python3
"""Build index.html: the live Platinum Kaizo calculator with a "Link save" in place of its Sync / Upload Save.

    python3 tools/build.py [SELF_URL]

The page is https://pkcalc.anastarawneh.com/ exactly as it is served today, with <base href> pointing at it,
so every script, stylesheet, image and trainer set still comes from the calculator's own site and stays
current. Removed: the Sync (Lua) and Upload Save buttons (js/pk-save-link.js takes them out once the page
has built them), the Lua Script setting and the Lua Script link. Added: js/pk-save-link.js and
css/pk-save-link.css, loaded from SELF_URL (default: this repository's GitHub Pages address).
"""
import hashlib
import os
import re
import sys
import urllib.request

LIVE = 'https://pkcalc.anastarawneh.com/'
SELF = 'https://owakeningowl.github.io/platinum-kaizo-calc/'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def version(path):
    return hashlib.sha1(open(os.path.join(ROOT, path), 'rb').read()).hexdigest()[:8]


def once(html, old, new):
    assert html.count(old) == 1, f'expected exactly one {old!r} in the live calculator page'
    return html.replace(old, new)


def main(self_url):
    req = urllib.request.Request(LIVE, headers={'User-Agent': 'platinum-kaizo-calc build'})
    html = urllib.request.urlopen(req, timeout=30).read().decode('utf-8')

    html = once(html, '<head>\n', f'<head>\n    <base href="{LIVE}">\n')
    lua = re.compile(r'\s*<p class="label" align="center">Lua Script</p>\s*<span class="starterSelection"'
                     r'.*?</label>\s*</span>\s*<hr />', re.S)
    assert len(lua.findall(html)) == 1, 'the Lua Script setting moved'
    html = lua.sub('', html)
    html = once(html, '        <li><a href="https://github.com/anastarawneh/PKLuaScript/releases/latest" '
                      'class="links-lighten" target="_blank">Lua Script</a></li>\n', '')
    html = once(html, '</head>', f'    <link type="text/css" rel="stylesheet" href="{self_url}css/pk-save-link.css?v={version("css/pk-save-link.css")}" />\n</head>')
    html = once(html, '</body>', f'    <script src="{self_url}js/pk-save-link.js?v={version("js/pk-save-link.js")}"></script>\n</body>')

    with open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'index.html: {len(html)} bytes from {LIVE}, extras from {self_url}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else SELF)

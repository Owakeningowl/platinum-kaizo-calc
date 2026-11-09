#!/usr/bin/env python3
"""Build index.html: the live Platinum Kaizo calculator with a "Link save" in place of its Sync / Upload Save.

    python3 tools/build.py [SELF_URL]

The page is https://pkcalc.anastarawneh.com/ exactly as it is served today, with <base href> pointing at it,
so every script, stylesheet, image and trainer set still comes from the calculator's own site and stays
current. Removed: the Sync (Lua) and Upload Save buttons (js/pk-save-link.js takes them out once the page
has built them), the Lua Script setting and the Lua Script link. Added: its own browser storage (keys prefixed "pkcalc:", because every site on owakeningowl.github.io
shares one), js/pk-save-link.js, css/pk-save-link.css and css/pk-soft-dark.css (a softer dark mode), loaded from SELF_URL (default: this repository's GitHub Pages address).
"""
import hashlib
import os
import re
import sys
import urllib.request

LIVE = 'https://pkcalc.anastarawneh.com/'
SELF = 'https://owakeningowl.github.io/platinum-kaizo-calc/'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Every site under owakeningowl.github.io shares one browser storage, and other calculators there also keep
# their sets in localStorage.customsets. This copy keeps its own: each key it uses is stored as "pkcalc:<key>".
OWN_STORAGE = '''(function () {
  var real = window.localStorage, P = 'pkcalc:';
  function keys() { var out = []; for (var i = 0; i < real.length; i++) { var k = real.key(i); if (k && k.indexOf(P) === 0) out.push(k.slice(P.length)); } return out; }
  var api = {
    getItem: function (k) { return real.getItem(P + k); },
    setItem: function (k, v) { real.setItem(P + k, String(v)); },
    removeItem: function (k) { real.removeItem(P + k); },
    clear: function () { keys().forEach(function (k) { real.removeItem(P + k); }); },
    key: function (n) { var k = keys()[n]; return k === undefined ? null : k; },
    get length() { return keys().length; }
  };
  var store = new Proxy(api, {
    get: function (t, k) { if (k in t) return typeof t[k] === 'function' ? t[k].bind(t) : t[k]; if (typeof k !== 'string') return undefined; var v = real.getItem(P + k); return v === null ? undefined : v; },
    set: function (t, k, v) { real.setItem(P + k, String(v)); return true; },
    has: function (t, k) { return k in t || real.getItem(P + String(k)) !== null; },
    deleteProperty: function (t, k) { real.removeItem(P + String(k)); return true; },
    ownKeys: function () { return keys(); },
    getOwnPropertyDescriptor: function (t, k) { var v = real.getItem(P + String(k)); return v === null ? undefined : {value: v, enumerable: true, configurable: true, writable: true}; }
  });
  try { Object.defineProperty(window, 'localStorage', {configurable: true, get: function () { return store; }}); } catch (e) {}
})();'''


# The calculator switches tabs with window.location = '#/dex' (and the like, about 25 places). With <base href> on the
# official site, the browser resolves that to https://pkcalc.anastarawneh.com/#/dex and leaves this copy. This catches
# exactly those navigations (official address + a #/ fragment) and makes the same fragment change on this page.
STAY_HERE = '''(function () {
  if (!window.navigation) return;
  var home = new URL(%r);
  navigation.addEventListener('navigate', function (e) {
    var to = new URL(e.destination.url);
    if (to.origin === home.origin && to.pathname === home.pathname && to.hash && e.cancelable) {
      e.preventDefault();
      location.hash = to.hash;
    }
  });
})();'''


def version(path):
    return hashlib.sha1(open(os.path.join(ROOT, path), 'rb').read()).hexdigest()[:8]


def once(html, old, new):
    assert html.count(old) == 1, f'expected exactly one {old!r} in the live calculator page'
    return html.replace(old, new)


def main(self_url):
    req = urllib.request.Request(LIVE, headers={'User-Agent': 'platinum-kaizo-calc build'})
    html = urllib.request.urlopen(req, timeout=30).read().decode('utf-8')

    html = once(html, '<head>\n', f'<head>\n    <base href="{LIVE}">\n    <script>{OWN_STORAGE}</script>\n'
                                   f'    <script>{STAY_HERE % LIVE}</script>\n')
    lua = re.compile(r'\s*<p class="label" align="center">Lua Script</p>\s*<span class="starterSelection"'
                     r'.*?</label>\s*</span>\s*<hr />', re.S)
    assert len(lua.findall(html)) == 1, 'the Lua Script setting moved'
    html = lua.sub('', html)
    html = once(html, '        <li><a href="https://github.com/anastarawneh/PKLuaScript/releases/latest" '
                      'class="links-lighten" target="_blank">Lua Script</a></li>\n', '')
    html = once(html, '</head>', f'    <link type="text/css" rel="stylesheet" href="{self_url}css/pk-soft-dark.css?v={version("css/pk-soft-dark.css")}" />\n'
                                 f'    <link type="text/css" rel="stylesheet" href="{self_url}css/pk-save-link.css?v={version("css/pk-save-link.css")}" />\n'
                                 "    <script>if (localStorage.getItem('darkTheme') === 'true') document.documentElement.classList.add('pk-soft-dark');</script>\n"
                                 '</head>')
    html = once(html, '</body>', f'    <script src="{self_url}js/pk-save-link.js?v={version("js/pk-save-link.js")}"></script>\n</body>')

    with open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'index.html: {len(html)} bytes from {LIVE}, extras from {self_url}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else SELF)

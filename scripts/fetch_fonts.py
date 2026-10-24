"""
Copies the board's fonts from Google Fonts into the project, so the app doesn't depend on Google:
the woff2 files into public/fonts and their @font-face rules into src/fonts.css.

Only the Latin and Cyrillic parts of each font are kept. Each part has its unicode-range, so a
browser fetches a file only when text on screen needs it. Fonts Google serves as one variable
file for several weights are fetched once.

Run it again after changing FAMILIES: it rewrites both.
Usage: python3 scripts/fetch_fonts.py
"""
from __future__ import annotations

import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / 'public' / 'fonts'
CSS = ROOT / 'src' / 'fonts.css'
FAMILIES = (
    'family=Onest:wght@400;500;600;700&family=Unbounded:wght@600'
    '&family=Inter:ital,wght@0,400;0,500;0,600;0,700;1,400;1,700'
    '&family=Montserrat:ital,wght@0,400;0,500;0,600;0,700;1,400;1,700'
    '&family=PT+Serif:ital,wght@0,400;0,700;1,400;1,700'
    '&family=JetBrains+Mono:ital,wght@0,400;0,700;1,400;1,700'
    '&family=Caveat:wght@400;500;600;700'
)
SUBSETS = {'latin', 'cyrillic'}
# A browser Google serves woff2 to.
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'


def get(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA})) as r:
        return r.read()


def main() -> None:
    css = get(f'https://fonts.googleapis.com/css2?{FAMILIES}&display=swap').decode()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob('*.woff2'):
        old.unlink()
    saved: dict[str, str] = {}
    rules = []
    for subset, body in re.findall(r'/\* ([\w-]+) \*/\s*@font-face \{(.*?)\}', css, re.S):
        if subset not in SUBSETS:
            continue
        family = re.search(r"font-family: '([^']+)'", body).group(1)
        style = re.search(r'font-style: (\w+)', body).group(1)
        url = re.search(r'url\((https://[^)]+\.woff2)\)', body).group(1)
        if url not in saved:
            name = f"{family.lower().replace(' ', '-')}-{style}-{subset}-{len(saved)}.woff2"
            (OUT_DIR / name).write_bytes(get(url))
            saved[url] = name
        rules.append(f'/* {family}, {subset} */\n@font-face {{' + body.replace(url, f'/fonts/{saved[url]}') + '}')
    head = ('/* The board\'s fonts, kept in the project (public/fonts): written by scripts/fetch_fonts.py,\n'
            '   do not edit. Each file is fetched only when text on screen needs it. */\n')
    CSS.write_text(head + '\n'.join(rules) + '\n')
    total = sum((OUT_DIR / n).stat().st_size for n in saved.values())
    print(f'{len(rules)} faces, {len(saved)} files, {total // 1024} KB')


if __name__ == '__main__':
    main()

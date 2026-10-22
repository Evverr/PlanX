"""Build src/icons/icons.json from the SVG files in assets/icons.

The icons are the Bitrix "Outline Icon Bold" set: 24x24 SVGs made of <path>
elements (a few reuse paths through <defs>/<use>). Fill #333333 becomes
"current" (drawn in the item's colour), #909090 becomes "current" at 45%
opacity, any other fill (the green accent #15C674) is kept as is.

Files are named by a slug of the icon's Figma name ("Add product" ->
add-product.svg); scripts/icon-names-ru.json maps those names to Russian
for search.

Usage: python3 scripts/gen_icons.py
"""
import json
import os
import re
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "icons")
OUT = os.path.join(ROOT, "src", "icons", "icons.json")
RU = os.path.join(ROOT, "scripts", "icon-names-ru.json")
NS = "{http://www.w3.org/2000/svg}"
XLINK = "{http://www.w3.org/1999/xlink}href"


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


with open(RU, encoding="utf-8") as f:
    NAMES = {slug(en): (en, ru) for en, ru in json.load(f).items()}

PATH_DATA = re.compile(r"[0-9MmLlHhVvCcSsQqTtAaZz.,\s-]+")
NUMBER = re.compile(r"-?\d*\.\d+|-?\d+")


def compact(d: str) -> str:
    """Path data rounded to 0.01, plenty on a 24 grid, which halves the file."""
    return NUMBER.sub(lambda m: f"{float(m.group()):.2f}".rstrip("0").rstrip("."), d)


def main() -> None:
    icons = []
    for fname in sorted(os.listdir(SRC)):
        if not fname.endswith(".svg"):
            continue
        icon_id = fname[:-4]
        root = ET.parse(os.path.join(SRC, fname)).getroot()
        # Paths kept in <defs> take their fill from the <use> that draws them.
        use_fill = {}
        for u in root.iter(NS + "use"):
            href = (u.get(XLINK) or u.get("href") or "").lstrip("#")
            if href and u.get("fill"):
                use_fill[href] = u.get("fill")
        paths = []
        for p in root.iter(NS + "path"):
            d = p.get("d", "")
            if not PATH_DATA.fullmatch(d):
                raise SystemExit(f"{fname}: unexpected path data")
            fill = (p.get("fill") or use_fill.get(p.get("id", "")) or "#333333").upper()
            entry = {"d": compact(d)}
            if fill == "#333333":
                entry["fill"] = "current"
            elif fill == "#909090":
                entry["fill"] = "current"
                entry["opacity"] = 0.45
            else:
                entry["fill"] = fill
            if p.get("fill-rule") == "evenodd":
                entry["evenodd"] = True
            paths.append(entry)
        en, ru = NAMES.get(icon_id, (icon_id.replace("-", " ").capitalize(), icon_id.replace("-", " ")))
        icons.append({"id": icon_id, "en": en, "ru": ru, "paths": paths})
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(icons, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(icons)} icons -> {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()

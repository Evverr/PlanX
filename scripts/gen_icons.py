"""Build src/icons/icons.json from the SVG files in assets/icons.

The icons are the Bitrix "Outline Icon Bold" set: 24x24 SVGs made of <path>
elements (a few reuse paths through <defs>/<use>). A few also have
outlined strokes (stroke="..." with no fill, and one <rect>): those stay
strokes with their width and caps, since filling an open or outline-only
path draws a solid blob. Every fill and stroke colour, the grey
#909090 and the green accent included, becomes "current": icons are drawn
in one colour, the item's (black by default).

Icons drawn at several sizes (alert-l, alert-m, alert-s, alert-xs) keep
only the largest; the smaller ids become its "aliases" so boards that
already use them still draw.

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


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


with open(RU, encoding="utf-8") as f:
    NAMES = {slug(en): (en, ru) for en, ru in json.load(f).items()}

PATH_DATA = re.compile(r"[0-9MmLlHhVvCcSsQqTtAaZz.,\s-]+")
NUMBER = re.compile(r"-?\d*\.\d+|-?\d+")


def compact(d: str) -> str:
    """Path data rounded to 0.01, plenty on a 24 grid, which halves the file."""
    return NUMBER.sub(lambda m: f"{float(m.group()):.2f}".rstrip("0").rstrip("."), d)


def rect_path(r) -> str:
    """A <rect> as path data. Only the plain translate/flip matrix Figma writes is supported."""
    w, h = float(r.get("width")), float(r.get("height"))
    x, y = float(r.get("x", "0")), float(r.get("y", "0"))
    rx = min(float(r.get("rx", "0")), w / 2, h / 2)
    t = r.get("transform")
    if t:
        m = re.fullmatch(r"matrix\((\S+) 0 0 (\S+) (\S+) (\S+)\)", t)
        if not m:
            raise SystemExit(f"unsupported rect transform {t}")
        sx, sy, tx, ty = map(float, m.groups())
        x0, x1 = sorted((tx + sx * x, tx + sx * (x + w)))
        y0, y1 = sorted((ty + sy * y, ty + sy * (y + h)))
        x, y = x0, y0
    return (f"M{x + rx} {y}H{x + w - rx}A{rx} {rx} 0 0 1 {x + w} {y + rx}V{y + h - rx}"
            f"A{rx} {rx} 0 0 1 {x + w - rx} {y + h}H{x + rx}A{rx} {rx} 0 0 1 {x} {y + h - rx}"
            f"V{y + rx}A{rx} {rx} 0 0 1 {x + rx} {y}Z")


SIZES = ["l", "m", "s", "xs"]
SIZED = re.compile(r"(.+)-(l|m|s|xs)$")


def main() -> None:
    files = sorted(f[:-4] for f in os.listdir(SRC) if f.endswith(".svg"))
    # Size variants grouped by their base name, largest first.
    variants = {}
    for icon_id in files:
        m = SIZED.fullmatch(icon_id)
        if m:
            variants.setdefault(m.group(1), []).append(icon_id)
    for ids in variants.values():
        ids.sort(key=lambda i: SIZES.index(i.rsplit("-", 1)[1]))
    icons = []
    for icon_id in files:
        m = SIZED.fullmatch(icon_id)
        group = variants[m.group(1)] if m else [icon_id]
        if group[0] != icon_id:
            continue
        fname = icon_id + ".svg"
        root = ET.parse(os.path.join(SRC, fname)).getroot()
        paths = []
        for p in root.iter():
            if p.tag == NS + "rect":
                d = rect_path(p)
            elif p.tag == NS + "path":
                d = p.get("d", "")
            else:
                continue
            if not PATH_DATA.fullmatch(d):
                raise SystemExit(f"{fname}: unexpected path data")
            entry = {"d": compact(d), "fill": "current"}
            if p.get("stroke"):
                entry["stroke"] = float(p.get("stroke-width", "1"))
                if p.get("stroke-linecap") == "round":
                    entry["round"] = True
            if p.get("fill-rule") == "evenodd":
                entry["evenodd"] = True
            paths.append(entry)
        en, ru = NAMES.get(icon_id, (icon_id.replace("-", " ").capitalize(), icon_id.replace("-", " ")))
        icon = {"id": icon_id, "en": en, "ru": ru, "paths": paths}
        if len(group) > 1:
            # One size left, so the size letter in the name says nothing.
            icon["en"] = re.sub(r"\s+(L|M|S|XS)$", "", en)
            icon["ru"] = re.sub(r"\s+(L|M|S|XS)$", "", ru)
            icon["aliases"] = group[1:]
        icons.append(icon)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(icons, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(icons)} icons -> {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()

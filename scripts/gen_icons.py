"""Build src/icons/icons.json from the SVG files in assets/icons.

Each icon is a 24x24 outline SVG made only of <path> elements. Fill #333333
becomes "current" (drawn in the item's colour), #909090 becomes "current" at
45% opacity, any other fill is kept as is.

Usage: python3 scripts/gen_icons.py
"""
import json
import os
import re
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "icons")
OUT = os.path.join(ROOT, "src", "icons", "icons.json")
NS = "{http://www.w3.org/2000/svg}"

NAMES = {
    "achievement": ("Achievement", "Достижение"),
    "add-product": ("Add product", "Добавить товар"),
    "barcode": ("Barcode", "Штрихкод"),
    "box": ("Box", "Коробка"),
    "cash-terminal": ("Cash terminal", "Касса"),
    "collaboration": ("Collaboration", "Совместная работа"),
    "crown": ("Crown", "Корона"),
    "day-off": ("Day off", "Выходной"),
    "dislike": ("Dislike", "Не нравится"),
    "distribution": ("Distribution", "Распределение"),
    "double-check": ("Double check", "Прочитано"),
    "favorite": ("Favorite", "Избранное"),
    "fire": ("Fire", "Огонь"),
    "flag-with-cross": ("Flag with cross", "Флаг снят"),
    "flag": ("Flag", "Флаг"),
    "headset": ("Headset", "Поддержка"),
    "heart": ("Heart", "Сердце"),
    "inventory-management": ("Inventory management", "Склад"),
    "like": ("Like", "Нравится"),
    "mention": ("Mention", "Упоминание"),
    "money": ("Money", "Деньги"),
    "music": ("Music", "Музыка"),
    "neutral": ("Neutral", "Нейтрально"),
    "non-favorite": ("Non favorite", "Не в избранном"),
    "notification-off": ("Notification off", "Уведомления выкл."),
    "notification-settings": ("Notification settings", "Настройки уведомлений"),
    "notification-with-cross": ("Notification with cross", "Уведомление отклонено"),
    "notification": ("Notification", "Уведомление"),
    "package-cancel": ("Package cancel", "Посылка отменена"),
    "package-receive": ("Package receive", "Посылка получена"),
    "package": ("Package", "Посылка"),
    "payment-terminal": ("Payment terminal", "Терминал"),
    "payment": ("Payment", "Оплата"),
    "ping": ("Ping", "Метка"),
    "product": ("Product", "Товар"),
    "pulse": ("Pulse", "Пульс"),
    "qr-code": ("QR code", "QR-код"),
    "sad": ("Sad", "Грусть"),
    "sale-tag": ("Sale tag", "Скидка"),
    "sended": ("Sent", "Отправлено"),
    "shopping-cart": ("Shopping cart", "Корзина"),
    "sick": ("Sick", "Болезнь"),
    "smile": ("Smile", "Улыбка"),
    "sound-off": ("Sound off", "Звук выкл."),
    "sound-on": ("Sound on", "Звук вкл."),
    "stock": ("Stock", "Запасы"),
    "stress-no": ("No stress", "Без стресса"),
    "stress": ("Stress", "Стресс"),
    "wallet": ("Wallet", "Кошелёк"),
}

PATH_DATA = re.compile(r"[0-9MmLlHhVvCcSsQqTtAaZz.,\s-]+")


def main() -> None:
    icons = []
    for fname in sorted(os.listdir(SRC)):
        if not fname.endswith(".svg"):
            continue
        icon_id = fname[:-4]
        root = ET.parse(os.path.join(SRC, fname)).getroot()
        paths = []
        for p in root.iter(NS + "path"):
            d = p.get("d", "")
            if not PATH_DATA.fullmatch(d):
                raise SystemExit(f"{fname}: unexpected path data")
            fill = p.get("fill", "#333333").upper()
            entry = {"d": d}
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
        en, ru = NAMES.get(icon_id, (icon_id.replace("-", " ").capitalize(), icon_id))
        icons.append({"id": icon_id, "en": en, "ru": ru, "paths": paths})
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(icons, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(icons)} icons -> {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()

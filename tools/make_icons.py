"""Нарезает иконки приложения из одного исходника: icons/icon-source.jpeg (квадрат 1024x1024).

    python3 tools/make_icons.py

Исходник нарисован как скруглённый значок внутри зелёного фона с полями, поэтому:
  - для iPhone, Android «any» и вкладки браузера берём внутренний квадрат (ОС сама скруглит углы);
  - для Android «maskable» (иконка в круге или другой форме) строим фон из тех же цветов
    и ставим рисунок в безопасную зону, чтобы не было «иконки в иконке» и обрезки по краям.
Если исходник заменить, поправьте INNER (границы внутреннего квадрата) под новую картинку.
Нужен Pillow: pip3 install pillow
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ICONS = Path(__file__).resolve().parent.parent / "icons"
SOURCE = ICONS / "icon-source.jpeg"
# Внутренний квадрат без мягкой кромки по краю: (left, top, right, bottom)
INNER = (154, 153, 869, 868)

src = Image.open(SOURCE).convert("RGB")
assert src.size == (1024, 1024), f"Исходник должен быть 1024x1024, а не {src.size}"
inner = src.crop(INNER)


def save(img, name, size):
    img.resize((size, size), Image.LANCZOS).save(ICONS / name, optimize=True)
    print("OK", name, size)


def maskable(inner_img, n=1024, art_share=0.84):
    """Фон из размытого значка + сам значок, плавно вмонтированный в центр (безопасная зона Android)."""
    bg = inner_img.resize((n, n), Image.LANCZOS).filter(ImageFilter.GaussianBlur(90))
    s = int(n * art_share)
    art = inner_img.resize((s, s), Image.LANCZOS)
    radius = int(s * 0.14)
    # маска: скруглённый квадрат, подрезанный внутрь (светлая кромка исходника не попадает) и смягчённый
    outer = Image.new("L", (s, s), 0)
    ImageDraw.Draw(outer).rounded_rectangle((0, 0, s - 1, s - 1), radius=radius, fill=255)
    outer = outer.filter(ImageFilter.GaussianBlur(5))
    inset = Image.new("L", (s, s), 0)
    ImageDraw.Draw(inset).rounded_rectangle((10, 10, s - 11, s - 11), radius=radius - 6, fill=255)
    mask = Image.composite(outer, Image.new("L", (s, s), 0), inset.filter(ImageFilter.GaussianBlur(6)))
    bg.paste(art, ((n - s) // 2, (n - s) // 2), mask)
    return bg


save(inner, "icon-192.png", 192)
save(inner, "icon-512.png", 512)
save(maskable(inner), "icon-maskable-512.png", 512)
save(inner, "apple-touch-icon.png", 180)
save(inner, "favicon-64.png", 64)

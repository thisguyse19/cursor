#!/usr/bin/env python3
"""Generate PNG icons and iOS splash screens for the Triple PWA (trip-planner theme)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT_ICONS = ROOT / "icons"
OUT_SPLASH = ROOT / "splash"
INTER_PATH = ROOT / "fonts" / "Inter-Regular.ttf"

BG = (236, 238, 242)
INK = (29, 29, 31)
SUB = (81, 81, 84)

# Translucent “liquid glass” (matches app.css --glass-fill feel; tune alphas for PNG)
GLASS_FILL = (255, 255, 255, 58)
GLASS_BORDER = (255, 255, 255, 135)
GLASS_HIGHLIGHT = (255, 255, 255, 55)
GLASS_SHADOW = (35, 38, 45, 32)
GLASS_TINT = (0, 113, 227, 26)


def trip_mesh_background(w: int, h: int) -> Image.Image:
    """Approximate the site mesh: soft grey base + blue / purple / green glows."""
    img = Image.new("RGB", (w, h), BG)
    draw = ImageDraw.Draw(img)
    draw.ellipse(
        (-w // 4, -h // 6, int(w * 0.58), int(h * 0.38)),
        fill=(225, 235, 250),
    )
    draw.ellipse(
        (int(w * 0.42), -h // 8, w + w // 4, int(h * 0.32)),
        fill=(232, 230, 248),
    )
    draw.ellipse(
        (int(w * 0.08), int(h * 0.70), int(w * 0.92), h + h // 3),
        fill=(228, 244, 234),
    )
    return img


def inter_font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(INTER_PATH), size)


def _measure_font(text: str, max_w: int, start_px: int, min_px: int = 8) -> ImageFont.FreeTypeFont:
    """Shrink font until text fits within max_w (width)."""
    probe = Image.new("RGB", (4, 4))
    draw = ImageDraw.Draw(probe)
    font_size = max(min_px, start_px)
    while font_size >= min_px:
        font = inter_font(font_size)
        bbox = draw.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        if tw <= max_w:
            return font
        font_size -= 1
    return inter_font(min_px)


def _replace_rgba(dst: Image.Image, src: Image.Image) -> None:
    """Copy full RGBA from src onto dst (same size)."""
    dst.paste(src, (0, 0))


def _paste_rounded_blur_under(
    img: Image.Image, box: tuple[int, int, int, int], corner_r: int, blur: int
) -> None:
    """Replace pixels inside a rounded rect with a blurred copy (frosted-glass base)."""
    x0, y0, x1, y1 = box
    cw, ch = x1 - x0, y1 - y0
    if cw < 2 or ch < 2:
        return
    crop = img.crop((x0, y0, x1, y1))
    blurred = crop.filter(ImageFilter.GaussianBlur(max(1, blur)))
    mask = Image.new("L", (cw, ch), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, cw, ch), radius=corner_r, fill=255)
    img.paste(blurred, (x0, y0), mask)


def _draw_liquid_glass_pill(
    base_rgba: Image.Image,
    text: str,
    *,
    max_text_w: int,
    font_start: int,
    cx: int,
    cy: int,
    blur: int,
) -> None:
    """Composite a frosted pill + wordmark onto base_rgba (mutates in place)."""
    draw_probe = ImageDraw.Draw(Image.new("RGB", (4, 4)))
    font = _measure_font(text, max_text_w, font_start)
    tb = draw_probe.textbbox((0, 0), text, font=font)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]

    pad_x = max(12, tw // 3, int(min(base_rgba.size) * 0.07))
    pad_y = max(10, th // 2, int(min(base_rgba.size) * 0.055))
    pill_w = tw + 2 * pad_x
    pill_h = th + 2 * pad_y
    corner_r = max(18, min(pill_w, pill_h) * 9 // 20)

    x0 = cx - pill_w // 2
    y0 = cy - pill_h // 2
    x1 = x0 + pill_w
    y1 = y0 + pill_h

    _paste_rounded_blur_under(base_rgba, (x0, y0, x1, y1), corner_r, blur)

    glass = Image.new("RGBA", base_rgba.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glass)
    stroke = max(1, base_rgba.size[0] // 120)
    so = max(1, stroke)
    gd.rounded_rectangle(
        (x0 + so, y0 + so + 1, x1 + so, y1 + so + 2),
        radius=corner_r,
        fill=GLASS_SHADOW,
    )
    gd.rounded_rectangle((x0, y0, x1, y1), radius=corner_r, fill=GLASS_FILL, outline=GLASS_BORDER, width=stroke)
    inset = max(3, corner_r // 5)
    gd.rounded_rectangle(
        (x0 + inset, y0 + int(pill_h * 0.52), x1 - inset, y1 - stroke - 2),
        radius=max(4, corner_r // 2),
        fill=GLASS_TINT,
    )
    shine_h = max(3, pill_h // 9)
    gd.rounded_rectangle(
        (x0 + inset, y0 + stroke + 1, x1 - inset, y0 + stroke + shine_h),
        radius=max(4, corner_r // 2),
        fill=GLASS_HIGHLIGHT,
    )

    _replace_rgba(base_rgba, Image.alpha_composite(base_rgba, glass))

    td = ImageDraw.Draw(base_rgba)
    td.text((cx, cy), text, font=font, fill=INK, anchor="mm")


def draw_app_icon(size: int) -> Image.Image:
    base = trip_mesh_background(size, size).convert("RGBA")
    text = "triple"
    _draw_liquid_glass_pill(
        base,
        text,
        max_text_w=int(size * 0.32),
        font_start=int(size * 0.15),
        cx=size // 2,
        cy=size // 2,
        blur=max(8, min(28, size // 5)),
    )
    return base.convert("RGB")


def draw_maskable_512() -> Image.Image:
    s = 512
    base = trip_mesh_background(s, s).convert("RGBA")
    text = "triple"
    _draw_liquid_glass_pill(
        base,
        text,
        max_text_w=int(s * 0.26),
        font_start=int(s * 0.10),
        cx=s // 2,
        cy=s // 2,
        blur=max(10, s // 28),
    )
    return base.convert("RGB")


def draw_splash(w: int, h: int) -> Image.Image:
    base = trip_mesh_background(w, h).convert("RGBA")
    draw_probe = ImageDraw.Draw(Image.new("RGB", (4, 4)))
    title = "triple"
    sub = "Trip planner"
    max_title_w = int(w * 0.40)
    font_title = _measure_font(title, max_title_w, start_px=min(w, h) // 11)
    font_sub = inter_font(max(13, min(w, h) // 30))
    tb = draw_probe.textbbox((0, 0), title, font=font_title)
    sb = draw_probe.textbbox((0, 0), sub, font=font_sub)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    sw, sh = sb[2] - sb[0], sb[3] - sb[1]

    pad_x, pad_y = w // 12, h // 45
    card_w = tw + 2 * pad_x
    card_h = th + sh + pad_y + h // 55
    cx, cy = w // 2, h // 2
    x0 = cx - card_w // 2
    y0 = cy - card_h // 2
    x1 = x0 + card_w
    y1 = y0 + card_h
    corner_r = min(w, h) // 28
    blur = max(8, min(28, min(w, h) // 28))

    _paste_rounded_blur_under(base, (x0, y0, x1, y1), corner_r, blur)

    glass = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glass)
    stroke = max(1, w // 200)
    so = max(1, stroke + 1)
    gd.rounded_rectangle(
        (x0 + so, y0 + so + 2, x1 + so, y1 + so + 3),
        radius=corner_r,
        fill=GLASS_SHADOW,
    )
    gd.rounded_rectangle((x0, y0, x1, y1), radius=corner_r, fill=GLASS_FILL, outline=GLASS_BORDER, width=stroke)
    inset = max(6, corner_r // 3)
    gd.rounded_rectangle(
        (x0 + inset, y0 + int(card_h * 0.48), x1 - inset, y1 - stroke - 3),
        radius=max(6, corner_r // 2),
        fill=GLASS_TINT,
    )
    shine_h = max(5, card_h // 12)
    gd.rounded_rectangle(
        (x0 + inset, y0 + stroke + 2, x1 - inset, y0 + stroke + shine_h),
        radius=max(6, corner_r // 2),
        fill=GLASS_HIGHLIGHT,
    )
    _replace_rgba(base, Image.alpha_composite(base, glass))

    tx = cx - tw // 2 - tb[0]
    ty = y0 + pad_y - tb[1]
    sx = cx - sw // 2 - sb[0]
    sy = ty + th + h // 70 - sb[1]
    td = ImageDraw.Draw(base)
    td.text((tx, ty), title, font=font_title, fill=INK)
    td.text((sx, sy), sub, font=font_sub, fill=SUB)
    return base.convert("RGB")


def main() -> None:
    if not INTER_PATH.is_file():
        raise SystemExit(f"Missing Inter font at {INTER_PATH}")

    OUT_ICONS.mkdir(parents=True, exist_ok=True)
    OUT_SPLASH.mkdir(parents=True, exist_ok=True)

    icon192 = draw_app_icon(192)
    draw_app_icon(180).save(OUT_ICONS / "apple-touch-icon.png", "PNG", optimize=True)
    icon192.save(OUT_ICONS / "icon-192.png", "PNG", optimize=True)
    draw_app_icon(512).save(OUT_ICONS / "icon-512.png", "PNG", optimize=True)
    draw_maskable_512().save(OUT_ICONS / "maskable-512.png", "PNG", optimize=True)
    icon192.resize((32, 32), Image.Resampling.LANCZOS).save(
        OUT_ICONS / "favicon-32.png", "PNG", optimize=True
    )

    splashes = [
        (1170, 2532),
        (1284, 2778),
        (750, 1334),
        (1242, 2688),
        (828, 1792),
        (1125, 2436),
    ]
    for ww, hh in splashes:
        path = OUT_SPLASH / f"apple-splash-{ww}-{hh}.png"
        draw_splash(ww, hh).save(path, "PNG", optimize=True)
        print("Wrote", path.relative_to(ROOT))

    for p in OUT_ICONS.glob("*.png"):
        print("Wrote", p.relative_to(ROOT))


if __name__ == "__main__":
    main()

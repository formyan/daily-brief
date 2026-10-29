"""Generate the PWA icon set locally with Pillow.

Run from the project root:
    python scripts/make-icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

INK = (17, 22, 21, 255)
CREAM = (244, 241, 234, 255)
ACCENT = (232, 120, 79, 255)
MUTED = (244, 241, 234, 150)


def draw_icon(size: int, maskable: bool = False) -> Image.Image:
    scale = 4
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if maskable:
        # Full bleed: safe zone keeps the mark inside the inner 80%.
        d.rectangle((0, 0, s, s), fill=INK)
        unit = s * 0.70
        ox = (s - unit) / 2
        oy = (s - unit) / 2
    else:
        radius = int(s * 0.22)
        d.rounded_rectangle((0, 0, s, s), radius=radius, fill=INK)
        unit = s * 0.78
        ox = (s - unit) / 2
        oy = (s - unit) / 2

    # Sun.
    sun_r = unit * 0.17
    sun_x = ox + unit * 0.70
    sun_y = oy + unit * 0.28
    d.ellipse((sun_x - sun_r, sun_y - sun_r, sun_x + sun_r, sun_y + sun_r), fill=ACCENT)

    # Three editorial rules.
    line_w = unit * 0.085
    for i, (left, right) in enumerate([(0.12, 0.70), (0.12, 0.82), (0.12, 0.56)]):
        y = oy + unit * (0.61 + i * 0.12)
        x1 = ox + unit * left
        x2 = ox + unit * right
        d.rounded_rectangle((x1, y - line_w / 2, x2, y + line_w / 2), radius=line_w / 2, fill=CREAM)

    # A faint fourth rule above, like a kicker.
    y = oy + unit * 0.47
    d.rounded_rectangle(
        (ox + unit * 0.12, y - line_w / 2, ox + unit * 0.42, y + line_w / 2),
        radius=line_w / 2,
        fill=MUTED,
    )
    return img.resize((size, size), Image.LANCZOS)


def main():
    for size in (32, 180, 192, 512):
        draw_icon(size).save(OUT / f"icon-{size}.png", optimize=True)
    draw_icon(512, maskable=True).save(OUT / "icon-maskable-512.png", optimize=True)
    print(f"wrote icons to {OUT}")


if __name__ == "__main__":
    main()

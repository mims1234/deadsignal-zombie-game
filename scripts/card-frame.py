"""Frame a carrier's portrait (`scripts/card-portrait.py`) as her card image: rounded corners (transparent outside), a
border and an inner line in her accent colour, her name and title on a dark plate at the foot. 750 x 1050 WebP.

usage:  python scripts/card-frame.py PORTRAIT.png src/cards/art/kaede.webp 7f8cff "Kaede Mori" "The Sprinter"
"""
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

src, out, accent, name, title = sys.argv[1:6]
acc = tuple(int(accent[i:i + 2], 16) for i in (0, 2, 4))
W, H, R = 750, 1050, 46


def font(size, bold=True):
    for f in (["segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"] if bold else ["segoeui.ttf", "arial.ttf", "DejaVuSans.ttf"]):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            continue
    return ImageFont.load_default()


art = Image.open(src).convert("RGB").resize((W, H), Image.LANCZOS)
card = Image.new("RGBA", (W, H), (0, 0, 0, 0))
card.paste(art, (0, 0))
d = ImageDraw.Draw(card, "RGBA")
# the name plate: a dark band fading up into the picture
plate = Image.new("L", (W, H), 0)
pd = ImageDraw.Draw(plate)
for y in range(H - 300, H):
    pd.line([(0, y), (W, y)], fill=int(235 * min(1, (y - (H - 300)) / 170)))
card = Image.composite(Image.new("RGBA", (W, H), (10, 9, 16, 255)), card, plate)
d = ImageDraw.Draw(card, "RGBA")
fn, ft = font(62), font(30, bold=False)
d.text((W // 2, H - 150), name.upper(), font=fn, fill=(244, 240, 250, 255), anchor="mm")
d.line([(W // 2 - 120, H - 108), (W // 2 + 120, H - 108)], fill=(*acc, 255), width=3)
d.text((W // 2, H - 76), title.upper(), font=ft, fill=(*acc, 255), anchor="mm")
# border: an outer band in her colour, a thin light line inside it
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(glow).rounded_rectangle([14, 14, W - 15, H - 15], R - 10, outline=(*acc, 200), width=10)
card = Image.alpha_composite(card, glow.filter(ImageFilter.GaussianBlur(6)))
d = ImageDraw.Draw(card, "RGBA")
d.rounded_rectangle([6, 6, W - 7, H - 7], R, outline=(*acc, 255), width=12)
d.rounded_rectangle([24, 24, W - 25, H - 25], R - 16, outline=(255, 255, 255, 120), width=2)
mask = Image.new("L", (W, H), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, W - 1, H - 1], R, fill=255)
card.putalpha(Image.composite(card.getchannel("A"), Image.new("L", (W, H), 0), mask))
card.save(out, "WEBP", quality=88, method=6)
print("CARD", out)

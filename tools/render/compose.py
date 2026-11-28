import math, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont
D = 'final/'
BG = (9, 12, 18)
FB = '/usr/share/fonts/opentype/inter/Inter-Bold.otf'; FR = '/usr/share/fonts/opentype/inter/Inter-Medium.otf'
def font(sz, bold=True): return ImageFont.truetype(FB if bold else FR, sz)
SPR_CELLS = 1.3            # a crystal render covers 1.3 cells (ortho 1.3)
BOARD_UNITS = 8 + 0.42 * 2 + 0.5
TILT = math.radians(9)
DEPTH = 0.2
_cache = {}
def sprite(name):
  if name not in _cache: _cache[name] = Image.open(D + f'crystal_{name}.png').convert('RGBA')
  return _cache[name]

def shadow(size, pitch):
  """Soft contact shadow: a blurred rounded square, offset down-right (light from the upper left)."""
  s = int(pitch * 1.6); im = Image.new('RGBA', (s, s), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
  w = pitch * 0.86; o = (s - w) / 2
  d.rounded_rectangle([o + pitch * 0.04, o + pitch * 0.07, o + w + pitch * 0.04, o + w + pitch * 0.07], radius=pitch * 0.06, fill=(0, 0, 0, 170))
  return im.filter(ImageFilter.GaussianBlur(pitch * 0.05))

def put(canvas, name, cx, cy, pitch, shade=True):
  if shade:
    sh = shadow(None, pitch); canvas.alpha_composite(sh, (int(cx - sh.width / 2), int(cy - sh.height / 2)))
  s = int(round(pitch * SPR_CELLS)); im = sprite(name).resize((s, s), Image.LANCZOS)
  canvas.alpha_composite(im, (int(round(cx - s / 2)), int(round(cy - s / 2))))

def board_img(px):
  return Image.open(D + 'board.png').convert('RGBA').resize((px, px), Image.LANCZOS)

def cell_center(px, r, c):
  P = px / BOARD_UNITS
  return px / 2 + (c - 3.5) * P, px / 2 + (r - 3.5) * P * math.cos(TILT) + DEPTH * math.sin(TILT) * P, P

def board_with(px, cells):
  b = board_img(px)
  for (r, c, name) in sorted(cells):
    x, y, P = cell_center(px, r, c); put(b, name, x, y, P)
  return b

def label(d, xy, text, sz=26, col=(234, 245, 255), bold=True, anchor='la'):
  d.text(xy, text, font=font(sz, bold), fill=col, anchor=anchor)

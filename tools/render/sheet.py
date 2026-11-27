exec(open('compose.py').read())
from PIL import ImageEnhance
SEAT = 0.95  # crystals are a little smaller than their compartment, so they sit inside it
NAMES = {'magenta': 'Pink tourmaline', 'pulse': 'Aquamarine (Pulse)', 'gold': 'Citrine', 'violet': 'Amethyst', 'green': 'Emerald', 'blue': 'Sapphire'}
for n in ['magenta','pulse','gold','violet','green','blue','cyan']:
  im = Image.open(D+f'crystal_{n}.png').convert('RGBA'); a = im.getchannel('A')
  rgb = ImageEnhance.Brightness(ImageEnhance.Color(im.convert('RGB')).enhance(1.3)).enhance(1.1)
  rgb.putalpha(a); _cache[n] = rgb; rgb.save(f'graded/crystal_{n}.png')
_put = put
def put(canvas, name, cx, cy, pitch, shade=True): _put(canvas, name, cx, cy, pitch * SEAT, shade)
def board_with(px, cells):
  b = board_img(px)
  for (r, c, name) in sorted(cells):
    x, y, P = cell_center(px, r, c); put(b, name, x, y, P)
  return b
def solo(name, size):
  im = Image.new('RGBA', (size, size), BG + (255,)); P = size / 1.2
  put(im, name, size / 2, size / 2, P / SEAT); return im
def framed(im, w, h, title, sub=None):
  o = Image.new('RGBA', (w, h + 70), BG + (255,)); o.alpha_composite(im, ((w - im.width) // 2, 0))
  d = ImageDraw.Draw(o); label(d, (w // 2, im.height + 14), title, 24, anchor='ma')
  if sub: label(d, (w // 2, im.height + 44), sub, 18, (143, 168, 185), False, anchor='ma')
  return o

W = 2000; rows = []
def section(title, items, gap=30):
  h = max(i.height for i in items); tot = sum(i.width for i in items) + gap * (len(items) - 1)
  o = Image.new('RGBA', (W, h + 90), BG + (255,)); d = ImageDraw.Draw(o)
  label(d, (60, 24), title, 30, (89, 221, 235))
  x = (W - tot) // 2
  for i in items: o.alpha_composite(i, (x, 80)); x += i.width + gap
  rows.append(o)

# 1. Enlarged comparison
b6 = Image.open('../b6c/b6-01-block-enlarged.png').convert('RGBA').crop((130, 130, 650, 650)).resize((420, 420))
section('1  ENLARGED: BUILD 6 BLOCK VS BUILD 7 CRYSTALS', [framed(b6, 440, 420, 'Build 6', 'procedural 2D'), framed(solo('magenta', 420), 440, 420, 'Build 7 magenta', 'pink tourmaline'),
  framed(solo('pulse', 420), 440, 420, 'Build 7 Pulse', 'aquamarine, energy core'), framed(solo('gold', 420), 440, 420, 'Build 7 gold', 'citrine')])
# 2. Palette
section('2  CRYSTAL FAMILY (same cut, light and proportions)', [framed(solo(n, 230), 250, 230, NAMES[n], n) for n in ['magenta', 'pulse', 'gold', 'violet', 'green', 'blue']], gap=16)
# 3. Pieces and cells (enlarged crops of the real board render)
BIG = 2400
def crop_cells(px, cells, r0, c0, r1, c1, out):
  b = board_with(px, cells); x0, y0, P = cell_center(px, r0, c0); x1, y1, _ = cell_center(px, r1, c1)
  m = P * 0.62; return b.crop((int(x0 - m), int(y0 - m), int(x1 + m), int(y1 + m))).resize(out, Image.LANCZOS)
empty = crop_cells(BIG, [], 3, 3, 5, 5, (380, 380))
occ = crop_cells(BIG, [(4, 4, 'magenta')], 3, 3, 5, 5, (380, 380))
three = crop_cells(BIG, [(3, 3, 'magenta'), (4, 3, 'magenta'), (4, 4, 'magenta')], 2, 2, 5, 5, (380, 380))
sq = crop_cells(BIG, [(3, 3, 'gold'), (3, 4, 'gold'), (4, 3, 'gold'), (4, 4, 'gold')], 2, 2, 5, 5, (380, 380))
section('3  RECESSED COMPARTMENTS AND PIECES (crystals seated in the board)', [framed(empty, 400, 380, 'Empty compartments'), framed(occ, 400, 380, 'Occupied compartment'),
  framed(three, 400, 380, 'Three-block piece'), framed(sq, 400, 380, 'Square piece')], gap=20)
# 4. Full board, game size, vs Build 6
CELLS = [(7,0,'magenta'),(7,1,'magenta'),(7,2,'magenta'),(6,1,'magenta'),(5,5,'pulse'),(6,5,'gold'),(6,6,'gold'),(7,6,'gold'),(7,5,'gold'),(2,2,'violet'),(3,2,'green'),(4,2,'blue'),(7,7,'magenta'),(6,7,'magenta'),(3,6,'pulse'),(4,6,'magenta'),(4,7,'magenta'),(1,4,'magenta'),(1,5,'magenta')]
full = board_with(1400, CELLS); bg = Image.new('RGBA', full.size, BG + (255,)); bg.alpha_composite(full); full = bg
b6b = Image.open('../b6c/b6-04-full-board.png').convert('RGBA').resize((726, 726), Image.LANCZOS)
game = full.resize((726, 726), Image.LANCZOS)
section('4  FULL BOARD AT GAMEPLAY SIZE (iPhone 14, 2x screen) - BUILD 6 VS BUILD 7', [framed(b6b, 760, 726, 'Build 6'), framed(game, 760, 726, 'Build 7 prototype', 'board 93% of screen width in the new layout')])
# 5. Actual size row
tiny = Image.new('RGBA', (900, 140), BG + (255,))
x = 30
for n in ['magenta', 'pulse', 'gold', 'violet', 'green', 'blue']:
  im = solo(n, 120); tiny.alpha_composite(im.resize((86, 86), Image.LANCZOS), (x, 20)); x += 96
x += 30
for n in ['magenta', 'pulse', 'gold']:
  im = solo(n, 120); tiny.alpha_composite(im.resize((60, 60), Image.LANCZOS), (x, 33)); x += 66
section('5  ACTUAL CELL SIZE (86 px = one cell on a 2x iPhone; right: tray size)', [tiny])

H = 150 + sum(r.height for r in rows)
sheet = Image.new('RGBA', (W, H), BG + (255,)); d = ImageDraw.Draw(sheet)
label(d, (60, 40), 'BLOQ  Build 7 asset prototype', 46)
label(d, (60, 100), 'Path-traced 3D crystals (Blender Cycles) rendered to transparent PNG, on a rendered recessed titanium board', 22, (143, 168, 185), False)
y = 150
for r in rows: sheet.alpha_composite(r, (0, y)); y += r.height
sheet.convert('RGB').save('build7-asset-prototype.png', optimize=True)
full.convert('RGB').save('build7-full-board-1400.png')
print(sheet.size)

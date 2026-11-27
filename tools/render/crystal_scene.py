# BLOQ Build 7 crystal asset renderer (Blender/Cycles via bpy). Usage:
#   python scene.py <job.json>
import bpy, bmesh, json, sys, math
from mathutils import Vector

PALETTE = {
  'magenta': ((0.95, 0.04, 0.62), (1.0, 0.40, 0.85)),   # pink tourmaline
  'cyan':    ((0.10, 0.80, 0.95), (0.6, 1.0, 1.0)),     # aquamarine (Pulse)
  'gold':    ((1.00, 0.62, 0.08), (1.0, 0.85, 0.45)),   # citrine
  'violet':  ((0.55, 0.20, 0.95), (0.80, 0.60, 1.0)),   # amethyst
  'green':   ((0.08, 0.85, 0.35), (0.55, 1.0, 0.70)),   # emerald
  'blue':    ((0.12, 0.35, 1.00), (0.55, 0.70, 1.0)),   # sapphire
  # Build 8 gemstone set
  'ruby':     ((1.00, 0.04, 0.12), (1.0, 0.45, 0.5)),
  'pink':     ((0.95, 0.03, 0.64), (1.0, 0.45, 0.85)),   # pink sapphire
  'sapphire': ((0.06, 0.22, 1.00), (0.5, 0.65, 1.0)),    # royal sapphire
  'aqua':     ((0.10, 0.80, 0.95), (0.6, 1.0, 1.0)),     # aquamarine (Pulse)
  'emerald':  ((0.03, 0.80, 0.38), (0.5, 1.0, 0.7)),
  'amethyst': ((0.52, 0.16, 0.98), (0.80, 0.60, 1.0)),
  'amber':    ((1.00, 0.42, 0.03), (1.0, 0.75, 0.4)),    # amber / citrine
  'topaz':    ((1.00, 0.70, 0.02), (1.0, 0.92, 0.5)),    # golden topaz
  'diamond':  ((0.78, 0.88, 1.00), (0.9, 0.95, 1.0)),    # platinum material
}

def reset():
  bpy.ops.wm.read_factory_settings(use_empty=True)
  sc = bpy.context.scene
  sc.render.engine = 'CYCLES'
  sc.cycles.device = 'CPU'
  sc.cycles.use_denoising = True
  sc.render.film_transparent = True
  sc.view_settings.view_transform = 'AgX'
  sc.view_settings.look = 'AgX - Medium High Contrast'
  sc.cycles.max_bounces = 16; sc.cycles.transmission_bounces = 16; sc.cycles.glossy_bounces = 8
  sc.cycles.caustics_refractive = True; sc.cycles.caustics_reflective = True
  return sc

def world(sc):
  w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True
  bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.006, 0.008, 0.014, 1); bg.inputs[1].default_value = 1.0

def area(name, loc, size, power, color=(1,1,1), target=(0,0,0), shape='RECTANGLE', sy=None):
  import os
  if os.environ.get('SOLO') and os.environ['SOLO'] != name: return None
  d = bpy.data.lights.new(name, 'AREA'); d.energy = power * LSCALE * LMUL.get(name, 1.0); d.color = color; d.shape = shape
  d.size = size; 
  if sy: d.size_y = sy
  o = bpy.data.objects.new(name, d); bpy.context.collection.objects.link(o); o.location = loc
  dirv = Vector(target) - Vector(loc); o.rotation_euler = dirv.to_track_quat('-Z', 'Y').to_euler()
  return o

def studio():
  # key softbox upper-left, high; long strip highlights for the bevels; cool rim from the right; weak fill below
  area('key', (-2.6, 2.4, 4.2), 3.5, 700, (1.0, 0.97, 0.94))
  area('stripT', (0.0, 3.2, 2.2), 4.0, 16, (0.95, 0.97, 1.0), sy=0.35)
  area('stripL', (-3.2, 0.0, 2.0), 0.35, 40, (0.95, 0.97, 1.0), sy=4.0)
  area('rim', (3.0, -1.6, 1.4), 1.2, 60, (0.55, 0.85, 1.0))
  area('top', (-1.0, 1.8, 6.0), 8.0, 90, (0.85, 0.9, 1.0))
  area('front', (0.0, -3.4, 2.2), 5.0, 22, (0.9, 0.92, 1.0), sy=1.6)

def glass_mat(name, col, glow, pulse=False, od=0.0):
  m = bpy.data.materials.new(name); m.use_nodes = True
  nt = m.node_tree; N = nt.nodes; L = nt.links
  p = N['Principled BSDF']
  p.inputs['Base Color'].default_value = (*[min(1, c * 1.0 + 0.15) for c in col], 1)
  p.inputs['Roughness'].default_value = 0.015
  p.inputs['IOR'].default_value = 1.62
  p.inputs['Transmission Weight'].default_value = 1.0
  p.inputs['Coat Weight'].default_value = 0.25
  p.inputs['Coat Roughness'].default_value = 0.02
  out = N['Material Output']
  vol = N.new('ShaderNodeVolumePrincipled')
  vol.inputs['Color'].default_value = (*col, 1)
  vol.inputs['Density'].default_value = 0.0
  vol.inputs['Absorption Color'].default_value = (*col, 1)
  # thickness-dependent saturation: absorption via a separate node
  ab = N.new('ShaderNodeVolumeAbsorption'); ab.inputs['Color'].default_value = (*col, 1); ab.inputs['Density'].default_value = DENS
  em = N.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*glow, 1); em.inputs['Strength'].default_value = 0.0
  add = N.new('ShaderNodeAddShader')
  # internal energy: a faint volume emission (the crystal is lit from within)
  vem = N.new('ShaderNodeVolumePrincipled'); vem.inputs['Density'].default_value = 0.0
  vem.inputs['Emission Strength'].default_value = (0.35 if pulse else 0.35) + od
  vem.inputs['Emission Color'].default_value = (*glow, 1)
  L.new(ab.outputs[0], add.inputs[0]); L.new(vem.outputs[0], add.inputs[1])
  L.new(add.outputs[0], out.inputs['Volume'])
  return m

def CROWN(half, h):
  # table, two crown steps (pronounced bevel), then a tall girdle wall (perceived thickness)
  return [(half - 0.15, h), (half - 0.07, h - 0.05), (half - 0.012, h - 0.115), (half, h - 0.14), (half, 0.32)]
BEVW = 0.012
DENS = 2.6

def crystal_mesh(half=0.44, h=0.56, cut='princess'):
  """Square brilliant: table, two crown steps, vertical girdle walls, and a faceted pavilion (square -> diamond ->
  culet) whose steep facets return the light through the table by total internal reflection."""
  crown = CROWN(half, h)
  bm = bmesh.new()
  sq = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
  loops = [[bm.verts.new((x * r, y * r, z)) for (x, y) in sq] for (r, z) in crown]
  for i in range(len(loops) - 1):
    a, b = loops[i], loops[i + 1]
    for k in range(4): bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
  bm.faces.new(loops[0][::-1])
  G = loops[-1]
  mid = [((sq[k][0] + sq[(k + 1) % 4][0]) / 2, (sq[k][1] + sq[(k + 1) % 4][1]) / 2) for k in range(4)]
  D = [bm.verts.new((x * half * 0.62, y * half * 0.62, 0.15)) for (x, y) in mid]
  apex = bm.verts.new((0, 0, 0.0))
  for k in range(4):
    bm.faces.new((G[k], G[(k + 1) % 4], D[k][::1] if False else D[k]))
    bm.faces.new((G[(k + 1) % 4], D[(k + 1) % 4], D[k]))
    bm.faces.new((D[k], D[(k + 1) % 4], apex))
  bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
  me = bpy.data.meshes.new('crystal'); bm.to_mesh(me); bm.free()
  o = bpy.data.objects.new('crystal', me); bpy.context.collection.objects.link(o)
  b2 = o.modifiers.new('round', 'BEVEL'); b2.width = BEVW; b2.segments = 3; b2.limit_method = 'ANGLE'; b2.angle_limit = math.radians(10)
  return o

def core(scale=0.12, z=0.2, strength=6.0, col=(0.7, 1, 1)):
  bm = bmesh.new()
  pts = [(0,0,1),(0,0,-1),(1,0,0),(-1,0,0),(0,1,0),(0,-1,0)]
  vs = [bm.verts.new(p) for p in pts]
  for a, b in [(2,4),(4,3),(3,5),(5,2)]:
    bm.faces.new((vs[0], vs[a], vs[b])); bm.faces.new((vs[1], vs[b], vs[a]))
  bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
  me = bpy.data.meshes.new('core'); bm.to_mesh(me); bm.free()
  o = bpy.data.objects.new('core', me); bpy.context.collection.objects.link(o)
  o.scale = (scale, scale, scale * 0.8); o.location = (0, 0, z)
  m = bpy.data.materials.new('coremat'); m.use_nodes = True
  N = m.node_tree.nodes; p = N['Principled BSDF']
  p.inputs['Base Color'].default_value = (*col, 1); p.inputs['Emission Color'].default_value = (*col, 1); p.inputs['Emission Strength'].default_value = strength
  p.inputs['Roughness'].default_value = 0.1
  o.data.materials.append(m)
  return o

def heart(col, strength):
  # internal energy: a soft glowing volume low in the crystal (no hard edges), seen through the facets
  bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=(0, 0, 0.15), segments=24, ring_count=12)
  o = bpy.context.active_object; o.scale = (0.32, 0.32, 0.1)
  m = bpy.data.materials.new('heart'); m.use_nodes = True
  N = m.node_tree.nodes; L = m.node_tree.links; out = N['Material Output']
  N.remove(N['Principled BSDF'])
  t = N.new('ShaderNodeBsdfTransparent'); L.new(t.outputs[0], out.inputs['Surface'])
  v = N.new('ShaderNodeEmission'); v.inputs['Color'].default_value = (*col, 1); v.inputs['Strength'].default_value = strength
  L.new(v.outputs[0], out.inputs['Volume'])
  o.data.materials.append(m)
  return o

def floor(catcher=True, col=(0.012, 0.016, 0.024), size=20, z=0.0):
  bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, z))
  o = bpy.context.active_object; o.is_shadow_catcher = catcher
  m = bpy.data.materials.new('floor'); m.use_nodes = True
  p = m.node_tree.nodes['Principled BSDF']; p.inputs['Base Color'].default_value = (*col, 1); p.inputs['Roughness'].default_value = 0.45
  o.data.materials.append(m)
  return o

def camera(sc, ortho, tilt_deg=None, target=(0, 0, 0.0)):
  if tilt_deg is None: tilt_deg = TILT
  cd = bpy.data.cameras.new('cam'); cd.type = 'ORTHO'; cd.ortho_scale = ortho
  o = bpy.data.objects.new('cam', cd); bpy.context.collection.objects.link(o); sc.camera = o
  t = math.radians(tilt_deg)
  o.location = (target[0], target[1] - math.sin(t) * 10, target[2] + math.cos(t) * 10)
  o.rotation_euler = (t, 0, 0)
  return o

def render(sc, path, px, samples):
  sc.render.resolution_x = px[0]; sc.render.resolution_y = px[1]; sc.render.resolution_percentage = 100
  sc.cycles.samples = samples
  sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
  sc.render.filepath = path
  bpy.ops.render.render(write_still=True)

CAV, DEPTH, RIM, FRAMEH = 0.91, 0.12, 0.42, 0.1

def board_mat():
  m = bpy.data.materials.new('titanium'); m.use_nodes = True
  N = m.node_tree.nodes; L = m.node_tree.links; p = N['Principled BSDF']
  p.inputs['Base Color'].default_value = (0.03, 0.036, 0.05, 1); p.inputs['Metallic'].default_value = 0.0; p.inputs['Specular IOR Level'].default_value = 0.12
  p.inputs['Roughness'].default_value = 0.42
  # faint machined texture: fine noise on roughness and a whisper of bump
  tc = N.new('ShaderNodeTexCoord'); nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 140; nz.inputs['Detail'].default_value = 6
  L.new(tc.outputs['Object'], nz.inputs['Vector'])
  mr = N.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = 0.62; mr.inputs['To Max'].default_value = 0.75
  L.new(nz.outputs['Fac'], mr.inputs['Value']); L.new(mr.outputs['Result'], p.inputs['Roughness'])
  bp = N.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = 0.04
  L.new(nz.outputs['Fac'], bp.inputs['Height']); L.new(bp.outputs['Normal'], p.inputs['Normal'])
  return m

def floor_mat():
  m = bpy.data.materials.new('cellfloor'); m.use_nodes = True
  p = m.node_tree.nodes['Principled BSDF']
  p.inputs['Base Color'].default_value = (0.018, 0.02, 0.027, 1); p.inputs['Metallic'].default_value = 0.0; p.inputs['Roughness'].default_value = 0.45
  return m

def board(n=8, cells=True):
  """Machined board: a dark titanium slab with n*n square compartments cut into it, inside a raised bevelled frame."""
  half = n / 2
  bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, -0.15))
  slab = bpy.context.active_object; slab.scale = (n + RIM * 2, n + RIM * 2, 0.3)
  bpy.ops.object.transform_apply(scale=True)
  if cells:
    cutters = []
    for r in range(n):
      for c in range(n):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(c - half + 0.5, half - r - 0.5, -DEPTH + 0.1))
        k = bpy.context.active_object; k.scale = (CAV, CAV, 0.2)
        bpy.ops.object.transform_apply(scale=True)
        bm_ = k.modifiers.new('r', 'BEVEL'); bm_.width = 0.07; bm_.segments = 4; bm_.limit_method = 'ANGLE'; bm_.angle_limit = math.radians(80)
        bpy.context.view_layer.objects.active = k; bpy.ops.object.modifier_apply(modifier='r'); cutters.append(k)
    bpy.ops.object.select_all(action='DESELECT')
    for k in cutters: k.select_set(True)
    bpy.context.view_layer.objects.active = cutters[0]; bpy.ops.object.join()
    cut = bpy.context.active_object
    mod = slab.modifiers.new('cells', 'BOOLEAN'); mod.object = cut; mod.operation = 'DIFFERENCE'; mod.solver = 'EXACT'
    bpy.context.view_layer.objects.active = slab; bpy.ops.object.modifier_apply(modifier='cells')
    bpy.data.objects.remove(cut)
  bv = slab.modifiers.new('edges', 'BEVEL'); bv.width = 0.02; bv.segments = 3; bv.limit_method = 'ANGLE'
  slab.data.materials.append(board_mat()); slab.data.materials.append(floor_mat())
  for poly in slab.data.polygons:
    if poly.normal.z > 0.9 and poly.center.z < -DEPTH / 2: poly.material_index = 1
  # compartment floors (slightly darker, smoother) under the cut-outs
  bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, -DEPTH + 0.002))
  fl = bpy.context.active_object; fl.scale = (n + RIM * 2, n + RIM * 2, 1); fl.data.materials.append(floor_mat()); fl.hide_render = True
  # raised frame: four bevelled bars
  W = n + RIM * 2
  for (x, y, sx, sy) in [(0, half + RIM / 2, W, RIM), (0, -half - RIM / 2, W, RIM), (half + RIM / 2, 0, RIM, n), (-half - RIM / 2, 0, RIM, n)]:
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, FRAMEH / 2))
    b = bpy.context.active_object; b.scale = (sx, sy, FRAMEH)
    bpy.ops.object.transform_apply(scale=True)
    m = b.modifiers.new('bev', 'BEVEL'); m.width = 0.06; m.segments = 1
    b.data.materials.append(board_mat())
  # restrained cyan light set into the frame's inner lip
  em = bpy.data.materials.new('lip'); em.use_nodes = True
  N = em.node_tree.nodes; L = em.node_tree.links; N.remove(N['Principled BSDF'])
  e = N.new('ShaderNodeEmission'); e.inputs['Color'].default_value = (0.25, 0.85, 1.0, 1); e.inputs['Strength'].default_value = 1.4
  L.new(e.outputs[0], N['Material Output'].inputs['Surface'])
  # cyan light set into the frame: bright corner brackets, a very dim line between them
  def strip(x, y, sx, sy, strength):
    m = bpy.data.materials.new('lip'); m.use_nodes = True
    N = m.node_tree.nodes; L = m.node_tree.links; N.remove(N['Principled BSDF'])
    e = N.new('ShaderNodeEmission'); e.inputs['Color'].default_value = (0.03, 0.62, 1.0, 1); e.inputs['Strength'].default_value = strength
    L.new(e.outputs[0], N['Material Output'].inputs['Surface'])
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, FRAMEH + 0.004))
    o = bpy.context.active_object; o.scale = (sx, sy, 0.02); o.data.materials.append(m)
  t = 0.035; o_ = half + 0.14; Lc = 1.1
  for sgn in (1, -1):
    strip(0, sgn * o_, 2 * o_ - 2 * Lc, t * 0.7, 0.12); strip(sgn * o_, 0, t * 0.7, 2 * o_ - 2 * Lc, 0.12)
    for sx in (1, -1):
      strip(sx * (o_ - Lc / 2), sgn * o_, Lc, t, 1.0); strip(sx * o_, sgn * (o_ - Lc / 2), t, Lc, 1.0)
  return slab

def place(r, c, color, pulse=False, n=8, od=0.0):
  col, glow = PALETTE[color]
  o = crystal_mesh(); o.data.materials.append(glass_mat('g' + color, col, glow, pulse, od))
  x, y = c - n / 2 + 0.5, n / 2 - r - 0.5
  o.location = (x, y, -DEPTH + 0.002)
  if pulse:
    k = core(); k.location = (x, y, -DEPTH + 0.2)

def sun(name, direction_from, strength, angle_deg=6, color=(1,1,1)):
  d = bpy.data.lights.new(name, 'SUN'); d.energy = strength * LMUL.get(name, 1.0); d.angle = math.radians(angle_deg); d.color = color
  o = bpy.data.objects.new(name, d); bpy.context.collection.objects.link(o)
  o.rotation_euler = (-Vector(direction_from)).to_track_quat('-Z', 'Y').to_euler()

def tile_scene(job):
  """Build 8: one machined compartment, rendered straight down at exactly one cell pitch so it tiles seamlessly
  (a 3x3 block of compartments is modelled; the camera sees only the centre one plus half of each web)."""
  top, bot, depth, edge = job.get('top', 0.90), job.get('bot', 0.80), job.get('depth', 0.16), job.get('edge', 0.025)
  # built directly (no booleans): for each cell, the web top (pitch square -> opening), a 45-degree chamfer,
  # tapered walls and the floor; the four faces of each ring are separate so materials can be assigned by role
  ch = job.get('chamfer', 0.014); a, b = top / 2, bot / 2
  bm = bmesh.new()
  SQ = [(-1,-1),(1,-1),(1,1),(-1,1)]
  roles = []
  for i in (-1, 0, 1):
    for j in (-1, 0, 1):
      ring = lambda r, z: [bm.verts.new((i + x * r, j + y * r, z)) for (x, y) in SQ]
      R0 = ring(0.5, 0.0); R1 = ring(a + ch, 0.0); R2 = ring(a, -ch); R3 = ring(b, -depth)
      for (L1, L2, role) in ((R0, R1, 0), (R1, R2, 3), (R2, R3, 1)):
        for k in range(4):
          bm.faces.new((L1[k], L1[(k+1)%4], L2[(k+1)%4], L2[k])); roles.append(role)
      bm.faces.new(R3); roles.append(2)
  bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
  bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
  me = bpy.data.meshes.new('tile'); bm.to_mesh(me); bm.free()
  slab = bpy.data.objects.new('tile', me); bpy.context.collection.objects.link(slab)
  for poly in me.polygons:
    if poly.normal.z < 0: pass
  if job.get('round', 0):
    bvm = slab.modifiers.new('r', 'BEVEL'); bvm.width = job['round']; bvm.segments = 3; bvm.limit_method = 'ANGLE'; bvm.angle_limit = math.radians(50)
  # materials: frame web = gunmetal, walls = dark graphite, floor = graphite with a faint machined texture
  def pbsdf(name, base, rough, metal=0.0, spec=0.3, noise=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    N = m.node_tree.nodes; L = m.node_tree.links; p = N['Principled BSDF']
    p.inputs['Base Color'].default_value = (*base, 1); p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal; p.inputs['Specular IOR Level'].default_value = spec
    if noise:
      tc = N.new('ShaderNodeTexCoord'); nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 90; nz.inputs['Detail'].default_value = 8
      L.new(tc.outputs['Object'], nz.inputs['Vector'])
      bp = N.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = noise
      L.new(nz.outputs['Fac'], bp.inputs['Height']); L.new(bp.outputs['Normal'], p.inputs['Normal'])
    return m
  slab.data.materials.append(pbsdf('web', tuple(job.get('webCol', (0.045, 0.05, 0.06))), job.get('webRough', 0.38), job.get('webMetal', 0.6), 0.5, 0.03))
  slab.data.materials.append(pbsdf('wall', tuple(job.get('wallCol', (0.03, 0.034, 0.042))), 0.55, 0.3, 0.4))
  slab.data.materials.append(pbsdf('floor', tuple(job.get('floorCol', (0.05, 0.055, 0.065))), job.get('floorRough', 0.7), 0.0, 0.25, 0.06))
  slab.data.materials.append(pbsdf('lip', tuple(job.get('lipCol', (0.12, 0.13, 0.15))), 0.3, 0.8, 0.6))
  for poly, role in zip(slab.data.polygons, roles): poly.material_index = {0: 0, 1: 1, 2: 2, 3: 3}[role]
  # light: a soft sun from the upper left (the game's global light), a dim cool fill from the right, sky for occlusion
  sun('sun', (-0.55, 0.65, 1.0), job.get('sun', 3.0), job.get('sunAngle', 12), (1.0, 0.97, 0.93))
  sun('fill', (0.7, -0.4, 0.9), job.get('fill', 0.5), 30, (0.7, 0.85, 1.0))
  w = bpy.context.scene.world; w.node_tree.nodes['Background'].inputs[0].default_value = tuple(job.get('sky', (0.03, 0.035, 0.045))) + (1,)

job = json.load(open(sys.argv[-1]))
LSCALE = job.get('light', 1.0)
TILT = job.get('tilt', 9.0)
LMUL = job.get('lights', {})
sc = reset(); world(sc); studio()
kind = job.get('kind', 'sprite')
if kind == 'sprite':
  col, glow = PALETTE[job['color']]
  o = crystal_mesh(); o.data.materials.append(glass_mat('g', col, glow, job.get('pulse', False), job.get('od', 0)))
  if job.get('pulse'): core()
  elif job.get('heart', 0) > 0: heart(col, job.get('heart', 0.0) + job.get('od', 0) * 3)
  f = floor(False); f.visible_camera = False  # seen only through the glass; the game draws its own contact shadow
  camera(sc, job.get('ortho', 1.3))
  render(sc, job['out'], (job['px'], job['px']), job.get('samples', 96))

if kind == 'tile':
  tile_scene(job)
  sc.render.film_transparent = False
  camera(sc, job.get('ortho', 1.0), tilt_deg=0, target=(0, 0, 0))
  render(sc, job['out'], (job['px'], job['px']), job.get('samples', 64))

if kind in ('board', 'cell'):
  board()
  for p in job.get('place', []): place(p[0], p[1], p[2], len(p) > 3 and p[3])
  if kind == 'board':
    camera(sc, 8 + RIM * 2 + 0.5, target=(0, 0, 0))
  else:
    x, y = job['at']; camera(sc, job.get('ortho', 2.4), target=(x, y, 0))
  render(sc, job['out'], (job['px'], job['px']), job.get('samples', 64))

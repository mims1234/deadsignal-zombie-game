"""Build the Asylum's real-asset people (grounded, MakeHuman CC0) as VRM 1.0 files the game's VRM path wears.

Each character is a MakeHuman body from MPFB (Blender add-on) with its low-poly proxy, the Mixamo-named skeleton (the VRM
add-on maps it to VRM humanoid bones), CC0 MakeHuman skin/eyes/hair/clothes re-dyed for the part, and pieces built here:
garments shaped from the character's own body (a gown, a lab coat, a habit and veil, a tactical vest: shells of the
body pushed out, and skirts measured around the hips and legs, all skinned from the body's own weights), a nurse's
cap, a coif band, glasses. The export is then fixed for the web: solid skin/clothes/eyes, alpha-cutout hair/brows/
lashes (the exporter marks everything alpha-blended, which draws back faces over front ones), no clearcoat.

Needs Blender 4.2+ with the `mpfb` and `vrm` extensions and the MakeHuman system assets pack installed in MPFB.
usage:  blender -b --python scripts/asylum-cast.py -- halloway OUT-raw.vrm
then:   python scripts/vrm-slim.py OUT-raw.vrm public/models/asylum/halloway.vrm 1024
"""
import bpy, bmesh, json, math, os, struct, sys, tempfile
import numpy as np
from mathutils import Vector
from bl_ext.blender_org.mpfb.services import HumanService

name, out = sys.argv[sys.argv.index("--") + 1:][:2]


def ph(gender=0.0, age=0.5, muscle=0.5, weight=0.5, proportions=0.6, height=0.5, cup=0.5, race=(0, 1, 0)):
    return {"gender": gender, "age": age, "muscle": muscle, "weight": weight, "proportions": proportions, "height": height,
            "cupsize": cup, "firmness": 0.55, "race": {"asian": race[0], "caucasian": race[1], "african": race[2]}}


CAST = {
    # Mary Halloway, night sister: mid-thirties, auburn hair tied back, green eyes, a cream uniform (long sleeves, skirt
    # below the knee), black shoes, a starched cap with a red band (her accent, `SURVIVORS.asylum` in config)
    "halloway": {
        "phenotype": ph(age=0.6, muscle=0.45, weight=0.45, proportions=0.65, height=0.45, cup=0.45),
        "skin": "middleage_caucasian_female", "eyes_mat": "green", "eyebrows": "eyebrow010",
        "hair": "braid01", "hair_color": (0.40, 0.15, 0.08),
        "clothes": ["female_elegantsuit01", "shoes03"],
        "dye": {"female_elegantsuit01": {"base": (0.86, 0.84, 0.78)}},
        "cap": {"color": (0.95, 0.94, 0.9), "band": (0.85, 0.25, 0.3)},
    },
    # Vance, the Lantern team's rifle: field kit (olive shirt, charcoal trousers, a dark plate vest), boots, dark ponytail
    "vance": {
        "phenotype": ph(age=0.55, muscle=0.62, weight=0.48, proportions=0.6, height=0.55, cup=0.4),
        "skin": "young_caucasian_female", "eyes_mat": "brown", "eyebrows": "eyebrow003",
        "hair": "ponytail01", "hair_color": (0.17, 0.11, 0.07),
        "clothes": ["male_casualsuit06", "shoes03"],
        "dye": {"male_casualsuit06": {"base": (0.28, 0.32, 0.24), "blue": (0.16, 0.17, 0.18)}},
        "garments": [{"kind": "vest", "color": (0.14, 0.15, 0.15)}],
    },
    # Dr. Okafor, the Lantern team's doctor: blue scrubs under a white coat, natural hair, deep brown skin
    "okafor": {
        "phenotype": ph(age=0.62, muscle=0.5, weight=0.52, proportions=0.6, height=0.5, cup=0.5, race=(0, 0, 1)),
        "skin": "middleage_african_female", "eyes_mat": "brown", "eyebrows": "eyebrow006",
        "hair": "afro01", "hair_color": (0.07, 0.05, 0.04),
        "clothes": ["female_casualsuit01", "shoes03"],
        "dye": {"female_casualsuit01": {"base": (0.33, 0.5, 0.6), "blue": (0.3, 0.46, 0.56)}},
        "garments": [{"kind": "coat", "color": (0.92, 0.92, 0.9)}],
    },
    # Ellie Crane, patient 117: young and slight, long silver hair, pale blue eyes, a washed-out hospital gown, barefoot
    "ellie": {
        "phenotype": ph(age=0.42, muscle=0.35, weight=0.36, proportions=0.6, height=0.42, cup=0.4),
        "skin": "young_caucasian_female2", "eyes_mat": "lightblue", "eyebrows": "eyebrow011",
        "hair": "long01", "hair_color": (0.84, 0.84, 0.88),
        "clothes": [],
        "garments": [{"kind": "gown", "color": (0.7, 0.84, 0.85)}],
    },
    # Pip Arden, trainee nurse: young, pink-dyed hair in a ponytail, a pink uniform, a cap with a rose band, white shoes
    "pip": {
        "phenotype": ph(age=0.4, muscle=0.4, weight=0.45, proportions=0.6, height=0.4, cup=0.5),
        "skin": "young_caucasian_female", "eyes_mat": "brownlight", "eyebrows": "eyebrow009",
        "hair": "ponytail01", "hair_color": (0.94, 0.6, 0.74),
        "clothes": ["female_elegantsuit01", "shoes02"],
        "dye": {"female_elegantsuit01": {"base": (0.96, 0.78, 0.84)}},
        "cap": {"color": (0.95, 0.94, 0.92), "band": (0.88, 0.38, 0.5)},
    },
    # Sister Maeve, the chaplain: older, a black habit to the ankles, a veil over a white band, black shoes
    "maeve": {
        "phenotype": ph(age=0.82, muscle=0.4, weight=0.55, proportions=0.55, height=0.42, cup=0.5),
        "skin": "old_caucasian_female", "eyes_mat": "grey", "eyebrows": "eyebrow002",
        "hair": None,
        "clothes": ["shoes03"],
        "garments": [{"kind": "habit", "color": (0.09, 0.09, 0.11)}, {"kind": "veil", "color": (0.08, 0.08, 0.1), "band": (0.93, 0.92, 0.9)}],
    },
    # Dr. Yuki Sato, resident: a black bob, glasses, a slate blouse and skirt under a white coat
    "sato": {
        "phenotype": ph(age=0.5, muscle=0.45, weight=0.42, proportions=0.62, height=0.4, cup=0.45, race=(1, 0, 0)),
        "skin": "young_asian_female", "eyes_mat": "brown", "eyebrows": "eyebrow007",
        "hair": "bob02", "hair_color": (0.05, 0.05, 0.06),
        "clothes": ["female_elegantsuit01", "shoes03"],
        "dye": {"female_elegantsuit01": {"base": (0.38, 0.45, 0.55)}},
        "garments": [{"kind": "coat", "color": (0.93, 0.93, 0.91)}],
        "glasses": (0.08, 0.08, 0.09),
    },
}
spec = CAST[name]

for o in list(bpy.data.objects):  # (not read_factory_settings: that unloads the extensions)
    bpy.data.objects.remove(o, do_unlink=True)

mh = lambda folder: f"{folder}/{folder}.mhclo"
info = {
    "name": name,
    "phenotype": spec["phenotype"],
    "rig": "mixamo",
    "eyes": "low-poly/low-poly.mhclo",
    "eyebrows": mh(spec["eyebrows"]),
    "eyelashes": mh("eyelashes01"),
    "hair": mh(spec["hair"]) if spec.get("hair") else "",
    "proxy": "female1605/female1605.proxy",
    "clothes": [mh(c) for c in spec["clothes"]],
    "skin_mhmat": f"{spec['skin']}/{spec['skin']}.mhmat",
    "skin_material_type": "MAKESKIN",
    "eyes_material_type": "MAKESKIN",
    "eyes_material_settings": {},
    "clothes_material_type": "MAKESKIN",
    "targets": [],
}
settings = HumanService.get_default_deserialization_settings()
settings["subdiv_levels"] = 0
basemesh = HumanService.deserialize_from_dict(info, settings)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
bpy.data.objects.remove(basemesh, do_unlink=True)  # the hidden full-detail mesh: the proxy is the body
tmp = tempfile.mkdtemp()
bpy.context.view_layer.update()


def part(key):
    return next((o for o in bpy.data.objects if o.type == "MESH" and key in o.name), None)


body = part("female1605")
bone = lambda b: arm.matrix_world @ arm.pose.bones[f"mixamorig:{b}"].head
J = {
    "hip": bone("Hips").z, "knee": bone("LeftLeg").z, "ankle": bone("LeftFoot").z, "spine": bone("Spine1").z,
    "neck": bone("Neck").z, "head": bone("Head").z, "shoulderX": abs(bone("LeftArm").x), "elbowX": abs(bone("LeftForeArm").x),
    "wristX": abs(bone("LeftHand").x), "headY": bone("Head").y,
}
BV = [body.matrix_world @ v.co for v in body.data.vertices]
# the arms hang down beside the hips while building (MPFB's rest pose): a skirt neither measures nor follows them
_gname = {vg.index: vg.name for vg in body.vertex_groups}
def _armish(v):
    g = max(v.groups, key=lambda g: g.weight, default=None)
    return g is not None and any(k in _gname.get(g.group, "") for k in ("Arm", "Hand", "Shoulder"))
TRUNK = [i for i, v in enumerate(body.data.vertices) if not _armish(v)]
from mathutils.kdtree import KDTree
_kd_all = KDTree(len(BV))
for i, v in enumerate(BV):
    _kd_all.insert(v, i)
_kd_all.balance()
_trunk = set(TRUNK)
# everything a skirt must go around: the body's trunk and legs, and the clothes over them (not hair, eyes, sleeves)
OUTER = [BV[i] for i in TRUNK] + [p for o in bpy.data.objects if o.type == "MESH" and any(c in o.name for c in spec["clothes"]) for p in (o.matrix_world @ v.co for v in o.data.vertices) if _kd_all.find(p)[1] in _trunk]
J["top"] = max(v.z for v in BV)


def tex_image(obj, hint="diffuse"):
    """The image on the material's base colour (the diffuse map)."""
    for slot in obj.material_slots:
        for n in slot.material.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image and hint in n.image.name.lower():
                return n.image
    for slot in obj.material_slots:
        for n in slot.material.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image and "normal" not in n.image.name.lower() and "_ao" not in n.image.name.lower():
                return n.image
    return None


def pixels(img):
    a = np.empty(len(img.pixels), dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(img.size[1], img.size[0], 4)


def put_pixels(img, a, tag):
    img.pixels.foreach_set(a.astype(np.float32).ravel())
    img.filepath_raw = os.path.join(tmp, f"{tag}.png")
    img.file_format = "PNG"
    img.save()


def lum(a):
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


# hair: keep the strands' light and dark, in the character's colour
hair = part(spec["hair"]) if spec.get("hair") else None
if hair and spec.get("hair_color"):
    img = tex_image(hair)
    a = pixels(img)
    L = lum(a)
    L = L / max(1e-3, float(L[a[..., 3] > 0.5].mean()))
    L = 0.45 + 0.55 * np.clip(L, 0, 1.6)  # soft: strands still read, no clipped highlights
    for c in range(3):
        a[..., c] = np.clip(spec["hair_color"][c] * L, 0, 1)
    put_pixels(img, a, "hair")

# clothes re-dyed: the garment's own folds and shading (its ambient occlusion map), one colour per region ('blue':
# what was denim, 'base': the rest); the pattern goes (pinstripes, logos)
for key, cols in spec.get("dye", {}).items():
    o = part(key)
    if not o:
        continue
    img = tex_image(o)
    a = pixels(img)
    L = np.ones(a.shape[:2], dtype=np.float32)
    ao = next((n.image for s in o.material_slots for n in s.material.node_tree.nodes if n.type == "TEX_IMAGE" and n.image and "_ao" in n.image.name.lower()), None)
    if ao is None:
        p = bpy.path.abspath(img.filepath).replace("_diffuse", "_ao")
        ao = bpy.data.images.load(p) if os.path.exists(p) else None
    if ao is not None:
        if tuple(ao.size) != tuple(img.size):
            ao.scale(img.size[0], img.size[1])
        L = L * (0.35 + 0.65 * pixels(ao)[..., 0])
    else:  # no occlusion map: the diffuse's own light and dark, softened
        Ld = lum(a)
        L = L * (0.6 + 0.4 * np.clip(Ld / max(1e-3, float(Ld.mean())), 0, 1.5))
    blue = (a[..., 2] > a[..., 0] + 0.06) & (a[..., 2] >= a[..., 1])
    for c in range(3):
        base = cols["base"][c]
        a[..., c] = np.clip(np.where(blue, cols.get("blue", cols["base"])[c], base) * L, 0, 1)
    put_pixels(img, a, key)

# eyes: the iris colour
eyes = part("low-poly")
if eyes and spec.get("eyes_mat"):
    root = os.path.dirname(os.path.dirname(bpy.path.abspath(tex_image(eyes).filepath)))
    p = os.path.join(root, "materials", f"{spec['eyes_mat']}_eye.png")
    if os.path.exists(p):
        tex_image(eyes).filepath = p
        tex_image(eyes).reload()

# shoes thinned to a budget (hair cards are left whole: thinning them breaks their shape)
for key in [c for c in spec["clothes"] if c.startswith("shoes")]:
    o = part(key)
    o.data.calc_loop_triangles()
    n = len(o.data.loop_triangles)
    if n > 1200:
        m = o.modifiers.new("thin", "DECIMATE")
        m.ratio = 1200 / n
        m.use_collapse_triangulate = True

# ------------------------------------------------------------------------------------------------------------------
# built pieces
# ------------------------------------------------------------------------------------------------------------------

rng = np.random.default_rng(len(name))


def cloth_mat(tag, col, rough=0.85, weave=True):
    """A fabric material: the colour over a fine woven grain (a small tiling texture), or plain."""
    m = bpy.data.materials.new(f"garment_{tag}")
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = rough
    if not weave:
        bsdf.inputs["Base Color"].default_value = (*col, 1)
        return m
    S = 256
    y, x = np.mgrid[0:S, 0:S].astype(np.float32)
    g = 0.5 + 0.25 * np.sin(x * math.pi / 2) * np.sin(y * math.pi / 2) + 0.25 * rng.random((S, S))
    g = 0.9 + 0.1 * g
    img = bpy.data.images.new(f"garment_{tag}", S, S)
    a = np.ones((S, S, 4), dtype=np.float32)
    for c in range(3):
        a[..., c] = np.clip(col[c] * g, 0, 1)
    put_pixels(img, a, f"garment_{tag}")
    t = m.node_tree.nodes.new("ShaderNodeTexImage")
    t.image = img
    m.node_tree.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    return m


def skin_to(obj, groups_by_vertex):
    """Weights per vertex ({bone: w}), the skeleton modifier and the armature parent."""
    for v_i, gw in enumerate(groups_by_vertex):
        for g, w in gw.items():
            vg = obj.vertex_groups.get(g) or obj.vertex_groups.new(name=g)
            vg.add([v_i], w, "REPLACE")
    obj.parent = arm
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm


def link(me, tag, mat):
    o = bpy.data.objects.new(f"{name}.{tag}", me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    return o


def shell(tag, zmin, zmax, xmax, offset, mat, keep=None, src=None):
    """A copy of the body between two heights (and within |x| < xmax: the arms to a sleeve's length), pushed out along
    its normals: it bends exactly as the skin under it (same weights)."""
    src = src or body
    me = src.data.copy()
    o = bpy.data.objects.new(f"{name}.{tag}", me)
    bpy.context.scene.collection.objects.link(o)
    o.matrix_world = src.matrix_world
    for vg in src.vertex_groups:
        o.vertex_groups.new(name=vg.name)
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    dl = bm.verts.layers.deform.verify()
    gone = [v for v in bm.verts if v.co.z < zmin or v.co.z > zmax or abs(v.co.x) > xmax or (keep and not keep(v.co))]
    bmesh.ops.delete(bm, geom=gone, context="VERTS")
    # the proxy is coarse: one smoothed subdivision so the garment reads as cloth, not facets (weights interpolate)
    if src is body:
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True, smooth=1.0)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * offset
    bm.to_mesh(me)
    bm.free()
    me.materials.clear()
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    o.parent = arm
    o.matrix_parent_inverse = arm.matrix_world.inverted()
    mod = o.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    return o


def nearest_weights(points):
    """For each point, the body's weights at the nearest body vertex (the skirt follows the hips and thighs)."""
    kd = KDTree(len(TRUNK))
    for i in TRUNK:
        kd.insert(BV[i], i)
    kd.balance()
    names = {vg.index: vg.name for vg in body.vertex_groups if vg.name.startswith("mixamorig:")}
    res = []
    for p in points:
        _, i, _ = kd.find(p)
        gw = {names[g.group]: g.weight for g in body.data.vertices[i].groups if g.group in names and g.weight > 0.01}
        res.append(gw)
    return res


def skirt(tag, ztop, zbot, offset, flare, mat, seg=28, rows=9):
    """A skirt, gown or robe from the waist down: rings measured around the body at each height (hips, then both legs),
    widening toward the hem; its weights blend the thighs' toward the hips' so it swings rather than splitting."""
    me = bpy.data.meshes.new(tag)
    bm = bmesh.new()
    rings, pts, ts = [], [], []
    rx_prev = ry_prev = 0.0
    for r in range(rows):
        t = r / (rows - 1)
        z = ztop + (zbot - ztop) * t
        band = [v for v in OUTER if abs(v.z - z) < 0.025 and abs(v.x) < 0.4]
        cx = 0.0
        cy = sum(v.y for v in band) / len(band) if band else 0.0
        off = offset * (0.35 + 0.65 * min(1.0, t * 3))  # snug at the waist (no step under the top), easing out
        rx = max((abs(v.x) for v in band), default=rx_prev) + off
        ry = max((abs(v.y - cy) for v in band), default=ry_prev) + off
        rx, ry = max(rx, rx_prev), max(ry, ry_prev * 0.98)
        rx_prev, ry_prev = rx, ry
        k = 1 + (flare - 1) * t * t
        ring = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            p = Vector((cx + math.cos(a) * rx * k, cy + math.sin(a) * ry * k, z))
            ring.append(bm.verts.new(p))
            pts.append(p)
            ts.append(t)
        rings.append(ring)
    for r in range(rows - 1):
        for i in range(seg):
            j = (i + 1) % seg
            bm.faces.new((rings[r][i], rings[r][j], rings[r + 1][j], rings[r + 1][i]))
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    uv = me.uv_layers.new(name="UVMap")
    for loop in me.loops:
        v = me.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = (math.atan2(v.y, v.x) / (2 * math.pi) * 6, v.z * 6)
    o = link(me, tag, mat)
    w = nearest_weights(pts)
    out_w = []
    for gw, t in zip(w, ts):
        s = min(1.0, t * 1.4) * 0.3  # how much of the hips' weight replaces the thighs' lower down (more: knees poke through)
        gw = {g: x * (1 - s) for g, x in gw.items()}
        gw["mixamorig:Hips"] = gw.get("mixamorig:Hips", 0) + s
        tot = sum(gw.values()) or 1
        out_w.append({g: x / tot for g, x in gw.items()})
    skin_to(o, out_w)
    return o


def join(objs, tag):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = f"{name}.{tag}"
    return objs[0]


def head_weights(n):
    return [{"mixamorig:Head": 1.0}] * n


def band_ring(tag, z, r, h, col, arc=(0.1, 0.9), tilt=0.0, yoff=0.0, crown=False):
    """A band around the head (a cap's front, a coif): `arc` is the part of the circle it covers (front = 0.5)."""
    me = bpy.data.meshes.new(tag)
    bm = bmesh.new()
    seg = 16
    rings = []
    full = arc[1] - arc[0] >= 0.99
    count = seg if full else seg + 1
    for zz, rr in [(0.0, r), (h * 0.5, r * 1.04), (h, r * 1.08)]:
        ring = []
        for i in range(count):
            a = math.pi * 2 * (arc[0] + (arc[1] - arc[0]) * i / seg) if full else math.pi * (arc[0] + (arc[1] - arc[0]) * i / seg) * 2 - math.pi / 2
            ring.append(bm.verts.new((math.cos(a) * rr, math.sin(a) * rr * 0.95, zz)))
        rings.append(ring)
    for k in range(2):
        for i in range(seg):
            j = (i + 1) % count if full else i + 1
            bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
    if crown:
        c0 = bm.verts.new((0, 0.02, h * 0.9))
        for i in range(seg):
            j = (i + 1) % count if full else i + 1
            bm.faces.new((rings[2][i], rings[2][j], c0))
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    me.uv_layers.new(name="UVMap")
    o = link(me, tag, cloth_mat(tag, col, 0.8, weave=False))
    o.location = (0, yoff, z)
    o.rotation_euler = (tilt, 0, 0)
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    skin_to(o, head_weights(len(me.vertices)))
    return o


head_r = max(abs(v.x) for v in BV if v.z > J["head"] + 0.05)
for g in spec.get("garments", []):
    kind, col = g["kind"], g["color"]
    mat = cloth_mat(kind, col)
    if kind == "vest":
        shirt = next((part(c) for c in spec["clothes"] if not c.startswith("shoes")), None)
        shell("garment_vest", J["hip"] + 0.08, J["neck"] - 0.05, J["shoulderX"] * 0.72, 0.022, mat, src=shirt)
    elif kind == "coat":
        top = shell("garment_coat", J["hip"] - 0.02, J["neck"] - 0.005, J["wristX"] - 0.035, 0.024, mat)
        sk = skirt("garment_coat_skirt", J["hip"] + 0.05, J["knee"] - 0.02, 0.04, 1.12, mat)
        join([top, sk], "garment_coat")
    elif kind == "gown":
        top = shell("garment_gown", J["hip"] - 0.02, J["neck"] - 0.01, (J["shoulderX"] + J["elbowX"]) / 2, 0.012, mat)
        sk = skirt("garment_gown_skirt", J["hip"] + 0.01, J["knee"] - 0.03, 0.02, 1.12, mat)
        join([top, sk], "garment_gown")
    elif kind == "habit":
        top = shell("garment_habit", J["hip"] - 0.02, J["neck"] + 0.01, J["wristX"] - 0.02, 0.02, mat)
        sk = skirt("garment_habit_skirt", J["hip"] + 0.02, J["ankle"] + 0.03, 0.03, 1.4, mat, rows=12)
        join([top, sk], "garment_habit")
    elif kind == "veil":
        # over the head and down the back, the face left open; a white band across the brow
        brow = max((o.matrix_world @ v.co).z for o in [part(spec["eyebrows"])] for v in o.data.vertices)
        face = lambda c: not (c.y < J["headY"] - 0.035 and c.z < brow + 0.02)
        hood = shell("garment_veil", J["head"] - 0.02, J["top"] + 1, head_r + 0.05, 0.03, mat, keep=face)
        me = bpy.data.meshes.new("drape")
        bm = bmesh.new()
        rows, seg = 7, 12
        rings, pts, ts = [], [], []
        for r in range(rows):
            t = r / (rows - 1)
            z = J["top"] - 0.07 - t * (J["top"] - 0.07 - (J["neck"] - 0.2))
            rr = head_r + 0.035 + t * 0.09
            ring = []
            for i in range(seg + 1):
                a = math.pi * (0.05 + 0.9 * i / seg)
                p = Vector((math.cos(a) * rr, J["headY"] + 0.01 + math.sin(a) * rr * (0.9 + 0.3 * t), z))
                ring.append(bm.verts.new(p))
                pts.append(p)
                ts.append(t)
            rings.append(ring)
        for r in range(rows - 1):
            for i in range(seg):
                bm.faces.new((rings[r][i], rings[r][i + 1], rings[r + 1][i + 1], rings[r + 1][i]))
        bm.normal_update()
        bm.to_mesh(me)
        bm.free()
        uv = me.uv_layers.new(name="UVMap")
        for loop in me.loops:
            v = me.vertices[loop.vertex_index].co
            uv.data[loop.index].uv = (v.x * 6, v.z * 6)
        drape = link(me, "garment_veil_drape", mat)
        skin_to(drape, [{"mixamorig:Head": 1 - min(1, t * 1.3), "mixamorig:Spine2": min(1, t * 1.3)} for t in ts])
        join([hood, drape], "garment_veil")
        band_ring("garment_coif", brow + 0.004, head_r + 0.036, 0.05, g["band"], arc=(0.0, 1.0), yoff=J["headY"] + 0.005)

# the nurse's cap: a starched band standing up on the crown, tilted back, with a coloured stripe; skinned to the head
if spec.get("cap"):
    top = max((hair.matrix_world @ v.co).z for v in hair.data.vertices) if hair else J["top"]
    hb = [hair.matrix_world @ v.co for v in hair.data.vertices if (hair.matrix_world @ v.co).z > top - 0.06] if hair else []
    cy = sum(v.y for v in hb) / len(hb) if hb else J["headY"]
    capm = cloth_mat("cap", spec["cap"]["color"], 0.8, weave=False)
    bandm = cloth_mat("capband", spec["cap"]["band"], 0.7, weave=False)
    me = bpy.data.meshes.new("cap")
    bm = bmesh.new()
    seg, r0, r1, h = 14, 0.075, 0.085, 0.055
    rings = []
    for (r, z) in [(r0, 0.0), ((r0 + r1) / 2, h * 0.45), ((r0 + r1) / 2, h * 0.6), (r1, h)]:
        ring = []
        for i in range(seg + 1):
            t = math.pi * (0.1 + 0.8 * i / seg)  # the front arc only
            ring.append(bm.verts.new((math.cos(t) * r, -math.sin(t) * r * 0.95, z)))
        rings.append(ring)
    for k in range(3):
        for i in range(seg):
            f = bm.faces.new((rings[k][i], rings[k][i + 1], rings[k + 1][i + 1], rings[k + 1][i]))
            f.material_index = 1 if k == 1 else 0
    cv = [bm.verts.new((math.cos(math.pi * (0.1 + 0.8 * i / seg)) * r1, -math.sin(math.pi * (0.1 + 0.8 * i / seg)) * r1 * 0.95, h)) for i in range(seg + 1)]
    c0 = bm.verts.new((0, 0.02, h * 0.9))
    for i in range(seg):
        bm.faces.new((cv[i], cv[i + 1], c0))
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    cap = link(me, "cap", capm)
    me.materials.append(bandm)
    cap.location = (0, cy + 0.02, top - 0.062)
    cap.rotation_euler = (math.radians(-28), 0, 0)
    bpy.ops.object.select_all(action="DESELECT")
    cap.select_set(True)
    bpy.context.view_layer.objects.active = cap
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    me.uv_layers.new(name="UVMap")
    skin_to(cap, head_weights(len(me.vertices)))

# glasses: two thin rims and a bridge in front of the eyes
if spec.get("glasses") and eyes:
    ev = [eyes.matrix_world @ v.co for v in eyes.data.vertices]
    parts = []
    for side in (-1, 1):
        pts = [v for v in ev if v.x * side > 0]
        c = Vector((sum(p.x for p in pts) / len(pts), min(p.y for p in pts) - 0.012, sum(p.z for p in pts) / len(pts)))
        bpy.ops.mesh.primitive_torus_add(major_radius=0.019, minor_radius=0.0018, major_segments=16, minor_segments=4, location=c, rotation=(math.pi / 2, 0, 0))
        parts.append(bpy.context.active_object)
        if side == 1:
            right = c
        else:
            left = c
    mid = (left + right) / 2
    bpy.ops.mesh.primitive_cylinder_add(radius=0.0018, depth=abs(right.x - left.x) - 0.036, vertices=6, location=mid, rotation=(0, math.pi / 2, 0))
    parts.append(bpy.context.active_object)
    gl = join(parts, "glasses")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    gl.data.materials.clear()
    gl.data.materials.append(cloth_mat("glasses", spec["glasses"], 0.35, weave=False))
    gl.data.uv_layers.new(name="UVMap")
    skin_to(gl, head_weights(len(gl.data.vertices)))

# bake every modifier but the skeleton into the meshes
tris = 0
for o in list(bpy.data.objects):
    if o.type != "MESH":
        continue
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = o
    if o.data.shape_keys:
        o.shape_key_clear()
    for m in list(o.modifiers):
        if m.type != "ARMATURE":
            bpy.ops.object.modifier_apply(modifier=m.name)
    o.data.calc_loop_triangles()
    tris += len(o.data.loop_triangles)
    print("MESH", o.name, len(o.data.loop_triangles))
print("TRIS", tris)

ext = arm.data.vrm_addon_extension
ext.spec_version = "1.0"
bpy.ops.vrm.assign_vrm1_humanoid_human_bones_automatically(armature_object_name=arm.name)
meta = ext.vrm1.meta
meta.vrm_name = name
meta.authors.add().value = "Zombies GenXmims (MakeHuman CC0 assets)"
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
bpy.ops.export_scene.vrm(filepath=out, armature_object_name=arm.name, ignore_warning=True)

# fix the export's materials for the web
b = open(out, "rb").read()
n = struct.unpack("<I", b[12:16])[0]
j = json.loads(b[20:20 + n])
rest = b[20 + n:]
CUT = ("braid", "ponytail", "bob0", "afro", "short0", "long0", "eyebrow", "eyelash", "casualsuit")
for m in j["materials"]:
    m.get("extensions", {}).pop("KHR_materials_clearcoat", None)
    if not m.get("extensions"):
        m.pop("extensions", None)
    low = m["name"].lower()
    if any(k in low for k in CUT):
        m.update(alphaMode="MASK", alphaCutoff=0.5, doubleSided=True)
        m.pop("normalTexture", None)
    else:
        m["alphaMode"] = "OPAQUE"
        m.pop("alphaCutoff", None)
        if "cap" in low or "garment" in low:
            m["doubleSided"] = True
for key in ("extensionsUsed", "extensionsRequired"):
    if key in j and "KHR_materials_clearcoat" in j[key]:
        j[key].remove("KHR_materials_clearcoat")
js = json.dumps(j, separators=(",", ":")).encode()
js += b" " * (-len(js) % 4)
open(out, "wb").write(b[:4] + struct.pack("<II", 2, 12 + 8 + len(js) + len(rest)) + struct.pack("<I", len(js)) + b"JSON" + js + rest)
print("EXPORTED", out, os.path.getsize(out))

"""Build the Asylum's real-asset people (grounded, MakeHuman CC0) as VRM 1.0 files the game's VRM path wears.

Each character is a MakeHuman body from MPFB (Blender add-on) with its low-poly proxy, the Mixamo-named skeleton (the VRM
add-on maps it to VRM humanoid bones), CC0 MakeHuman skin/eyes/hair/clothes re-dyed for the part, and small extras
built here (a nurse's cap). The export is then fixed for the web: solid skin/clothes/eyes, alpha-cutout hair/brows/
lashes (the exporter marks everything alpha-blended, which draws back faces over front ones), no clearcoat.

Needs Blender 4.2+ with the `mpfb` and `vrm` extensions and the MakeHuman system assets pack installed in MPFB.
usage:  blender -b --python scripts/asylum-cast.py -- halloway public/models/asylum/halloway-raw.vrm
then:   python scripts/vrm-slim.py public/models/asylum/halloway-raw.vrm public/models/asylum/halloway.vrm 1024
"""
import bpy, bmesh, json, os, struct, sys, tempfile
import numpy as np
from mathutils import Vector
from bl_ext.blender_org.mpfb.services import HumanService

name, out = sys.argv[sys.argv.index("--") + 1:][:2]

CAST = {
    # Mary Halloway, night sister: mid-thirties, auburn hair tied back, green eyes, an off-white uniform (long sleeves,
    # skirt below the knee), black shoes, a starched cap with a red band (her accent, `SURVIVORS.asylum` in config)
    "halloway": {
        "phenotype": {"gender": 0.0, "age": 0.6, "muscle": 0.45, "weight": 0.45, "proportions": 0.65, "height": 0.45,
                      "cupsize": 0.45, "firmness": 0.55, "race": {"asian": 0.0, "caucasian": 1.0, "african": 0.0}},
        "skin": "middleage_caucasian_female/middleage_caucasian_female.mhmat",
        "eyes_mat": "green",
        "hair": "braid01/braid01.mhclo",
        "hair_color": (0.40, 0.15, 0.08),
        "eyebrows": "eyebrow010/eyebrow010.mhclo",
        "clothes": ["female_elegantsuit01/female_elegantsuit01.mhclo", "shoes03/shoes03.mhclo"],
        "dye": {"female_elegantsuit01": (0.86, 0.84, 0.78)},
        "cap": {"color": (0.95, 0.94, 0.9), "band": (0.85, 0.25, 0.3)},
        "budget": {"shoes03": 1200},
    },
}
spec = CAST[name]

for o in list(bpy.data.objects):  # (not read_factory_settings: that unloads the extensions)
    bpy.data.objects.remove(o, do_unlink=True)

info = {
    "name": name,
    "phenotype": spec["phenotype"],
    "rig": "mixamo",
    "eyes": "low-poly/low-poly.mhclo",
    "eyebrows": spec["eyebrows"],
    "eyelashes": "eyelashes01/eyelashes01.mhclo",
    "hair": spec["hair"],
    "proxy": "female1605/female1605.proxy",
    "clothes": spec["clothes"],
    "skin_mhmat": spec["skin"],
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


def part(key):
    return next((o for o in bpy.data.objects if o.type == "MESH" and key in o.name), None)


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
hair = part(spec["hair"].split("/")[0])
if hair and spec.get("hair_color"):
    img = tex_image(hair)
    a = pixels(img)
    L = lum(a)
    L = L / max(1e-3, float(L[a[..., 3] > 0.5].mean()))
    L = 0.45 + 0.55 * np.clip(L, 0, 1.6)  # soft: strands still read, no clipped highlights
    for c in range(3):
        a[..., c] = np.clip(spec["hair_color"][c] * L, 0, 1)
    put_pixels(img, a, "hair")

# clothes re-dyed: the garment's own folds and shading (its ambient occlusion map) in one colour
for key, col in spec.get("dye", {}).items():
    o = part(key)
    if not o:
        continue
    img = tex_image(o)
    a = pixels(img)
    L = np.ones(a.shape[:2], dtype=np.float32)  # the pattern goes (pinstripes, checks): only the folds' shading stays
    ao = next((n.image for s in o.material_slots for n in s.material.node_tree.nodes if n.type == "TEX_IMAGE" and n.image and "_ao" in n.image.name.lower()), None)
    if ao is None:
        p = bpy.path.abspath(img.filepath).replace("_diffuse", "_ao")
        ao = bpy.data.images.load(p) if os.path.exists(p) else None
    if ao is not None:
        if tuple(ao.size) != tuple(img.size):
            ao.scale(img.size[0], img.size[1])
        L = L * (0.35 + 0.65 * pixels(ao)[..., 0])
    for c in range(3):
        a[..., c] = np.clip(col[c] * L, 0, 1)
    put_pixels(img, a, key)

# eyes: the iris colour
eyes = part("low-poly")
if eyes and spec.get("eyes_mat"):
    root = os.path.dirname(os.path.dirname(bpy.path.abspath(tex_image(eyes).filepath)))
    p = os.path.join(root, "materials", f"{spec['eyes_mat']}_eye.png")
    if os.path.exists(p):
        tex_image(eyes).filepath = p
        tex_image(eyes).reload()

# heavy parts thinned to their budget (hair cards and shoes are the costly ones)
for key, budget in spec.get("budget", {}).items():
    o = part(key)
    if not o:
        continue
    o.data.calc_loop_triangles()
    n = len(o.data.loop_triangles)
    if n > budget:
        m = o.modifiers.new("thin", "DECIMATE")
        m.ratio = budget / n
        m.use_collapse_triangulate = True

# the nurse's cap: a starched band standing up on the crown, tilted back, with a coloured stripe; skinned to the head
if spec.get("cap"):
    bpy.context.view_layer.update()
    head = arm.pose.bones["mixamorig:Head"]
    hpos = arm.matrix_world @ head.head
    top = max((hair.matrix_world @ v.co).z for v in hair.data.vertices) if hair else hpos.z + 0.2
    hb = [hair.matrix_world @ v.co for v in hair.data.vertices if (hair.matrix_world @ v.co).z > top - 0.06] if hair else []
    cy = sum(v.y for v in hb) / len(hb) if hb else hpos.y
    capm = bpy.data.materials.new("cap")
    capm.use_nodes = True
    capm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*spec["cap"]["color"], 1)
    capm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.8
    bandm = bpy.data.materials.new("capband")
    bandm.use_nodes = True
    bandm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*spec["cap"]["band"], 1)
    bandm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.7
    me = bpy.data.meshes.new("cap")
    bm = bmesh.new()
    # a short open-backed tube (front band) standing on the head, slightly flared at the top
    seg, r0, r1, h = 14, 0.075, 0.085, 0.055
    import math
    rings = []
    for k, (r, z) in enumerate([(r0, 0.0), ((r0 + r1) / 2, h * 0.45), ((r0 + r1) / 2, h * 0.6), (r1, h)]):
        ring = []
        for i in range(seg + 1):
            t = math.pi * (0.1 + 0.8 * i / seg)  # the front arc only
            ring.append(bm.verts.new((math.cos(t) * r, -math.sin(t) * r * 0.95, z)))
        rings.append(ring)
    for k in range(3):
        for i in range(seg):
            f = bm.faces.new((rings[k][i], rings[k][i + 1], rings[k + 1][i + 1], rings[k + 1][i]))
            f.material_index = 1 if k == 1 else 0
    # a flat crown over the back of the band
    cv = [bm.verts.new((math.cos(math.pi * (0.1 + 0.8 * i / seg)) * r1, -math.sin(math.pi * (0.1 + 0.8 * i / seg)) * r1 * 0.95, h)) for i in range(seg + 1)]
    c0 = bm.verts.new((0, 0.02, h * 0.9))
    for i in range(seg):
        bm.faces.new((cv[i], cv[i + 1], c0))
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    cap = bpy.data.objects.new(f"{name}.cap", me)
    bpy.context.scene.collection.objects.link(cap)
    me.materials.append(capm)
    me.materials.append(bandm)
    for p in me.polygons:
        p.use_smooth = True
    cap.location = (0, cy + 0.02, top - 0.062)
    cap.rotation_euler = (math.radians(-28), 0, 0)
    bpy.context.view_layer.objects.active = cap
    bpy.ops.object.select_all(action="DESELECT")
    cap.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    me.uv_layers.new(name="UVMap")
    vg = cap.vertex_groups.new(name="mixamorig:Head")
    vg.add(list(range(len(me.vertices))), 1.0, "REPLACE")
    cap.parent = arm
    mod = cap.modifiers.new("Armature", "ARMATURE")
    mod.object = arm

# bake every modifier but the skeleton into the meshes
tris = 0
for o in list(bpy.data.objects):
    if o.type != "MESH":
        continue
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
CUT = ("braid", "ponytail", "bob0", "afro", "short0", "long0", "eyebrow", "eyelash")
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
        if "cap" in low:
            m["doubleSided"] = True
for key in ("extensionsUsed", "extensionsRequired"):
    if key in j and "KHR_materials_clearcoat" in j[key]:
        j[key].remove("KHR_materials_clearcoat")
js = json.dumps(j, separators=(",", ":")).encode()
js += b" " * (-len(js) % 4)
open(out, "wb").write(b[:4] + struct.pack("<II", 2, 12 + 8 + len(js) + len(rest)) + struct.pack("<I", len(js)) + b"JSON" + js + rest)
print("EXPORTED", out, os.path.getsize(out))

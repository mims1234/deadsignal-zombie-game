"""Render a Mazoku carrier's card portrait from her real-asset model (head and shoulders, arms down, a rim light in her
accent colour). `scripts/card-frame.py` then frames it as the card image in `src/cards/art/`.

usage:  blender -b --python scripts/card-portrait.py -- public/models/mazoku/kaede.vrm OUT.png 7f8cff
"""
import math, sys
import bpy
from mathutils import Matrix, Vector

src, out, accent = sys.argv[sys.argv.index("--") + 1:][:3]
acc = tuple(int(accent[i:i + 2], 16) / 255 for i in (0, 2, 4))

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.vrm(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")


def bone(*names):
    return next((arm.pose.bones[n] for n in names if n in arm.pose.bones), None)


def turn(pb, axis, deg):
    """Rotate a pose bone about an armature-space axis (from its rest pose)."""
    if pb is None:
        return
    rest = pb.bone.matrix_local.to_3x3()
    r = Matrix.Rotation(math.radians(deg), 3, axis)
    pb.rotation_mode = "QUATERNION"
    pb.rotation_quaternion = (rest.inverted() @ r @ rest).to_quaternion()


# arms down by the sides, elbows a little bent (the figure faces -Y; her left is +X)
turn(bone("mixamorig:LeftArm", "LeftArm"), "Y", 72)
turn(bone("mixamorig:RightArm", "RightArm"), "Y", -72)
turn(bone("mixamorig:LeftForeArm", "LeftForeArm"), "X", -12)
turn(bone("mixamorig:RightForeArm", "RightForeArm"), "X", -12)
bpy.context.view_layer.update()

sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE_NEXT"
sc.render.resolution_x, sc.render.resolution_y = 750, 1050
sc.render.film_transparent = False
sc.render.filepath = out
w = bpy.data.worlds.new("w")
w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (acc[0] * 0.08 + 0.02, acc[1] * 0.08 + 0.02, acc[2] * 0.08 + 0.025, 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 1.0
sc.world = w
sc.view_settings.look = "AgX - Medium High Contrast" if "AgX - Medium High Contrast" in [i.name for i in bpy.types.ColorManagedViewSettings.bl_rna.properties["look"].enum_items] else "None"


def look(obj, pos, tgt):
    obj.location = pos
    obj.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat("-Z", "Y").to_euler()


top = max((o.matrix_world @ v.co).z for o in bpy.data.objects if o.type == "MESH" for v in o.data.vertices)
head = arm.matrix_world @ (bone("mixamorig:Head", "Head").head)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.lens = 70
# head and shoulders down to the waist, a little from her right and above
aim = (0, head.y, head.z - 0.1)
look(cam, (0.4, head.y - 1.5, head.z + 0.08), aim)
for name, pos, e, col in [("key", (1.6, -2.2, head.z + 1.0), 380, (1, 0.97, 0.94)), ("fill", (-2.2, -1.6, head.z), 110, (0.85, 0.9, 1)),
                          ("rim", (-1.3, 1.6, head.z + 0.6), 900, acc), ("rim2", (1.5, 1.4, head.z + 0.2), 500, acc)]:
    L = bpy.data.objects.new(name, bpy.data.lights.new(name, "AREA"))
    L.data.energy = e
    L.data.size = 1.5
    L.data.color = col
    sc.collection.objects.link(L)
    look(L, pos, (0, head.y, head.z - 0.2))
# a soft glow of her colour behind her
bpy.ops.mesh.primitive_plane_add(size=4, location=(0, head.y + 1.2, head.z - 0.3), rotation=(math.pi / 2, 0, 0))
bg = bpy.context.active_object
m = bpy.data.materials.new("glow")
m.use_nodes = True
nt = m.node_tree
em = nt.nodes.new("ShaderNodeEmission")
em.inputs["Color"].default_value = (*acc, 1)
grad = nt.nodes.new("ShaderNodeTexGradient")
grad.gradient_type = "SPHERICAL"
mapn = nt.nodes.new("ShaderNodeMapping")
mapn.inputs["Scale"].default_value = (0.9, 0.9, 0.9)
tc = nt.nodes.new("ShaderNodeTexCoord")
nt.links.new(tc.outputs["Object"], mapn.inputs["Vector"])
nt.links.new(mapn.outputs["Vector"], grad.inputs["Vector"])
mul = nt.nodes.new("ShaderNodeMath")
mul.operation = "MULTIPLY"
mul.inputs[1].default_value = 0.55
nt.links.new(grad.outputs["Fac"], mul.inputs[0])
nt.links.new(mul.outputs[0], em.inputs["Strength"])
nt.links.new(em.outputs["Emission"], nt.nodes["Material Output"].inputs["Surface"])
bg.data.materials.append(m)
bpy.ops.render.render(write_still=True)
print("RENDERED", out)

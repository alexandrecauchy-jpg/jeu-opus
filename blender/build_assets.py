"""
Génère tous les modèles 3D et animations du jeu « Le Donjon des Os » avec Blender.

Usage :
    blender --background --python blender/build_assets.py
ou, avec le module bpy (pip install bpy==4.2.0) :
    python3 blender/build_assets.py

Les fichiers .glb sont écrits dans game/assets/.
"""
import bpy
import os
import math
from math import radians

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "game", "assets")
os.makedirs(OUT, exist_ok=True)
FPS = 30


# ---------------------------------------------------------------------------
# Outils généraux
# ---------------------------------------------------------------------------
def reset():
    _MATS.clear()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)


_MATS = {}


def mat(name, color, metal=0.0, rough=0.6, emit=None, strength=0.0):
    key = name
    if key in _MATS:
        return _MATS[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    _MATS[key] = m
    return m


def part(kind, loc, scale, material, bone=None, rot=(0, 0, 0), bevel=0.0,
         smooth=False, v=12, r2=0.0, minor=0.12, name=None):
    """Crée une primitive, applique les transformations et l'assigne à un os."""
    rot = tuple(radians(a) for a in rot)
    if kind == "cube":
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    elif kind == "cyl":
        bpy.ops.mesh.primitive_cylinder_add(vertices=v, radius=0.5, depth=1, location=loc, rotation=rot)
    elif kind == "sphere":
        bpy.ops.mesh.primitive_uv_sphere_add(segments=v, ring_count=max(4, v // 2), radius=0.5,
                                             location=loc, rotation=rot)
    elif kind == "ico":
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=v, radius=0.5, location=loc, rotation=rot)
    elif kind == "cone":
        bpy.ops.mesh.primitive_cone_add(vertices=v, radius1=0.5, radius2=r2, depth=1, location=loc, rotation=rot)
    elif kind == "torus":
        bpy.ops.mesh.primitive_torus_add(major_segments=v, minor_segments=6, major_radius=0.5,
                                         minor_radius=minor, location=loc, rotation=rot)
    o = bpy.context.active_object
    if name:
        o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if bevel > 0:
        mod = o.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 1
        bpy.ops.object.modifier_apply(modifier=mod.name)
    o.data.materials.append(material)
    for p in o.data.polygons:
        p.use_smooth = smooth
    if bone:
        vg = o.vertex_groups.new(name=bone)
        vg.add(list(range(len(o.data.vertices))), 1.0, "REPLACE")
    return o


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    return o


def set_origin(obj, point):
    bpy.context.scene.cursor.location = point
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    bpy.context.scene.cursor.location = (0, 0, 0)


def export(path, objects=None):
    bpy.ops.object.select_all(action="DESELECT")
    objs = objects if objects is not None else list(bpy.context.scene.objects)
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, path),
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_yup=True,
        export_apply=False,
    )
    print("  ->", path)


# ---------------------------------------------------------------------------
# Squelette d'animation humanoïde (commun à tous les personnages)
#
# Conventions des axes (vérifiées) :
#   os vertical (colonne, tête) : +X = pencher en avant, +Y = tourner vers sa gauche
#   os vers le bas (bras, jambes) : -X = balancer vers l'avant, +X = vers l'arrière
#       bras gauche : -Z = lever sur le côté ; bras droit : +Z = lever sur le côté
#   Translation de « hips » / « root » : composante Y = vers le haut
# ---------------------------------------------------------------------------
BONES = [
    # nom, tête, queue, parent
    ("root", (0, 0, 0), (0, 0, 0.25), None),
    ("hips", (0, 0, 0.95), (0, 0, 1.08), "root"),
    ("spine", (0, 0, 1.08), (0, 0, 1.30), "hips"),
    ("chest", (0, 0, 1.30), (0, 0, 1.52), "spine"),
    ("head", (0, 0, 1.55), (0, 0, 1.85), "chest"),
    ("upperarm_L", (0.27, 0, 1.48), (0.27, 0, 1.18), "chest"),
    ("forearm_L", (0.27, 0, 1.18), (0.27, 0, 0.92), "upperarm_L"),
    ("hand_L", (0.27, 0, 0.92), (0.27, 0, 0.82), "forearm_L"),
    ("upperarm_R", (-0.27, 0, 1.48), (-0.27, 0, 1.18), "chest"),
    ("forearm_R", (-0.27, 0, 1.18), (-0.27, 0, 0.92), "upperarm_R"),
    ("hand_R", (-0.27, 0, 0.92), (-0.27, 0, 0.82), "forearm_R"),
    ("thigh_L", (0.11, 0, 0.95), (0.11, 0, 0.52), "hips"),
    ("shin_L", (0.11, 0, 0.52), (0.11, 0, 0.06), "thigh_L"),
    ("thigh_R", (-0.11, 0, 0.95), (-0.11, 0, 0.52), "hips"),
    ("shin_R", (-0.11, 0, 0.52), (-0.11, 0, 0.06), "thigh_R"),
]


def make_armature(name, extra=()):
    arm = bpy.data.armatures.new(name + "_rig")
    obj = bpy.data.objects.new(name + "_rig", arm)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    for bname, head, tail, parent in list(BONES) + list(extra):
        b = arm.edit_bones.new(bname)
        b.head, b.tail, b.roll = head, tail, 0
        if parent:
            b.parent = arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in obj.pose.bones:
        pb.rotation_mode = "XYZ"
    return obj


def skin(mesh, rig):
    mesh.parent = rig
    mod = mesh.modifiers.new("Armature", "ARMATURE")
    mod.object = rig


def add_action(rig, name, keys, interp="BEZIER"):
    """keys : liste de (frame, {os: (rx, ry, rz) | {'r':(..), 'l':(..)}})"""
    if rig.animation_data is None:
        rig.animation_data_create()
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data.action = act
    for frame, pose in keys:
        for pb in rig.pose.bones:
            spec = pose.get(pb.name, (0, 0, 0))
            if isinstance(spec, dict):
                r = spec.get("r", (0, 0, 0))
                l = spec.get("l", (0, 0, 0))
            else:
                r, l = spec, (0, 0, 0)
            pb.rotation_euler = tuple(radians(a) for a in r)
            pb.location = l
            pb.keyframe_insert("rotation_euler", frame=frame)
            pb.keyframe_insert("location", frame=frame)
    for fc in act.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = interp
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, int(keys[0][0]), act)
    track.mute = True
    rig.animation_data.action = None
    return act


def merge(*dicts):
    out = {}
    for d in dicts:
        out.update(d)
    return out


# ---------------------------------------------------------------------------
# Matériaux
# ---------------------------------------------------------------------------
def materials():
    return dict(
        steel=mat("Acier", (0.55, 0.57, 0.62), 0.9, 0.32),
        dark_steel=mat("AcierSombre", (0.22, 0.23, 0.26), 0.85, 0.4),
        gold=mat("Or", (0.95, 0.66, 0.2), 1.0, 0.28),
        blue=mat("Tabard", (0.06, 0.14, 0.5), 0.0, 0.75),
        red=mat("Cape", (0.55, 0.04, 0.05), 0.0, 0.8),
        leather=mat("Cuir", (0.22, 0.12, 0.06), 0.0, 0.7),
        visor=mat("Visiere", (0.02, 0.02, 0.03), 0.0, 0.5, (0.35, 0.7, 1.0), 2.5),
        bone=mat("Os", (0.48, 0.44, 0.36), 0.0, 0.72),
        bone_dark=mat("OsSombre", (0.04, 0.03, 0.03), 0.0, 0.9),
        ghost_eye=mat("OeilSpectral", (0.1, 1.0, 0.55), 0.0, 0.4, (0.15, 1.0, 0.5), 9.0),
        rag=mat("Haillon", (0.25, 0.07, 0.06), 0.0, 0.95),
        rust=mat("Rouille", (0.3, 0.25, 0.21), 0.75, 0.6),
        wood=mat("Bois", (0.33, 0.2, 0.1), 0.0, 0.8),
        wood_dark=mat("BoisSombre", (0.16, 0.09, 0.05), 0.0, 0.85),
        iron=mat("Fer", (0.12, 0.12, 0.13), 0.9, 0.5),
        skin=mat("Peau", (0.95, 0.72, 0.6), 0.0, 0.6),
        dress=mat("Robe", (0.72, 0.18, 0.52), 0.0, 0.55),
        dress_light=mat("RobeClaire", (0.95, 0.75, 0.9), 0.0, 0.6),
        hair=mat("Cheveux", (0.95, 0.72, 0.3), 0.1, 0.5),
        eye=mat("Oeil", (0.05, 0.1, 0.25), 0.0, 0.3),
        pink_gem=mat("GemmeRose", (1.0, 0.3, 0.7), 0.0, 0.1, (1.0, 0.3, 0.7), 4.0),
        stone=mat("Pierre", (0.32, 0.3, 0.29), 0.0, 0.9),
        stone_light=mat("PierreClaire", (0.45, 0.43, 0.4), 0.0, 0.85),
        flame=mat("Flamme", (1.0, 0.45, 0.1), 0.0, 0.3, (1.0, 0.45, 0.08), 12.0),
        rune=mat("Rune", (0.2, 0.8, 1.0), 0.0, 0.3, (0.2, 0.8, 1.0), 8.0),
        potion=mat("Potion", (0.9, 0.05, 0.1), 0.0, 0.1, (0.9, 0.05, 0.12), 2.5),
        glass=mat("Verre", (0.75, 0.85, 0.9), 0.0, 0.05),
        cork=mat("Bouchon", (0.5, 0.35, 0.2), 0.0, 0.9),
        banner=mat("Banniere", (0.45, 0.03, 0.06), 0.0, 0.9),
        ember=mat("Braise", (1.0, 0.3, 0.05), 0.0, 0.5, (1.0, 0.25, 0.02), 6.0),
        boss_eye=mat("OeilRoi", (1.0, 0.15, 0.05), 0.0, 0.4, (1.0, 0.15, 0.05), 12.0),
        purple=mat("Violet", (0.25, 0.05, 0.35), 0.0, 0.7),
    )


# ---------------------------------------------------------------------------
# Personnages
# ---------------------------------------------------------------------------
def build_hero(M, do_export=True):
    rig = make_armature("Hero")
    P = []
    # Bassin & jupe de tabard
    P.append(part("cube", (0, 0, 0.98), (0.36, 0.22, 0.14), M["leather"], "hips", bevel=0.02))
    P.append(part("cube", (0, -0.12, 0.98), (0.08, 0.03, 0.07), M["gold"], "hips", bevel=0.01))
    P.append(part("cone", (0, 0, 0.82), (0.5, 0.36, 0.28), M["blue"], "hips", v=8, r2=0.32))
    # Torse
    P.append(part("cube", (0, 0, 1.19), (0.34, 0.23, 0.22), M["blue"], "spine", bevel=0.03))
    P.append(part("cube", (0, 0, 1.41), (0.46, 0.3, 0.27), M["steel"], "chest", bevel=0.05))
    P.append(part("cube", (0, -0.155, 1.4), (0.14, 0.03, 0.14), M["gold"], "chest", rot=(0, 45, 0), bevel=0.01))
    P.append(part("cube", (0, 0.17, 1.16), (0.44, 0.03, 0.62), M["red"], "chest", rot=(-8, 0, 0)))
    P.append(part("cyl", (0, 0, 1.55), (0.14, 0.14, 0.08), M["dark_steel"], "chest", v=10))
    # Casque
    P.append(part("cyl", (0, 0, 1.69), (0.3, 0.3, 0.26), M["steel"], "head", v=10, bevel=0.01))
    P.append(part("sphere", (0, 0, 1.81), (0.3, 0.3, 0.16), M["steel"], "head", v=12, smooth=True))
    P.append(part("cube", (0, -0.145, 1.71), (0.2, 0.03, 0.03), M["visor"], "head"))
    P.append(part("cube", (0, -0.145, 1.66), (0.03, 0.03, 0.09), M["visor"], "head"))
    P.append(part("cube", (0, 0, 1.86), (0.04, 0.32, 0.06), M["gold"], "head"))
    P.append(part("sphere", (0, 0.08, 1.93), (0.08, 0.32, 0.14), M["red"], "head", rot=(-20, 0, 0), smooth=True))
    for s, side in ((1, "L"), (-1, "R")):
        ua, fa, hd = "upperarm_" + side, "forearm_" + side, "hand_" + side
        P.append(part("sphere", (0.3 * s, 0, 1.5), (0.22, 0.24, 0.17), M["steel"], ua, v=10, smooth=True))
        P.append(part("cyl", (0.27 * s, 0, 1.33), (0.13, 0.13, 0.3), M["dark_steel"], ua, v=8))
        P.append(part("cyl", (0.27 * s, 0, 1.06), (0.14, 0.14, 0.26), M["steel"], fa, v=8))
        P.append(part("cyl", (0.27 * s, 0, 0.96), (0.17, 0.17, 0.07), M["gold"], fa, v=8))
        P.append(part("cube", (0.27 * s, 0, 0.87), (0.1, 0.11, 0.12), M["leather"], hd, bevel=0.015))
        th, sh = "thigh_" + side, "shin_" + side
        P.append(part("cyl", (0.11 * s, 0, 0.74), (0.17, 0.17, 0.4), M["dark_steel"], th, v=8))
        P.append(part("sphere", (0.11 * s, -0.02, 0.52), (0.14, 0.14, 0.12), M["steel"], sh, v=8, smooth=True))
        P.append(part("cyl", (0.11 * s, 0, 0.3), (0.16, 0.16, 0.38), M["steel"], sh, v=8))
        P.append(part("cube", (0.11 * s, -0.04, 0.05), (0.14, 0.26, 0.1), M["leather"], sh, bevel=0.02))
    # Bouclier sur l'avant-bras gauche
    P.append(part("cyl", (0.37, -0.02, 1.05), (0.56, 0.56, 0.05), M["blue"], "forearm_L", rot=(0, 90, 0), v=16))
    P.append(part("torus", (0.39, -0.02, 1.05), (0.56, 0.56, 0.4), M["gold"], "forearm_L", rot=(0, 90, 0), v=16, minor=0.06))
    P.append(part("sphere", (0.41, -0.02, 1.05), (0.12, 0.12, 0.12), M["gold"], "forearm_L", v=8, smooth=True))
    P.append(part("cube", (0.4, -0.02, 1.05), (0.02, 0.06, 0.4), M["gold"], "forearm_L"))
    P.append(part("cube", (0.4, -0.02, 1.08), (0.02, 0.3, 0.06), M["gold"], "forearm_L"))
    body = join(P, "Hero")
    skin(body, rig)

    rest_arm = {"upperarm_R": (-10, 0, 4), "forearm_R": (-25, 0, 0), "upperarm_L": (-5, 0, -4), "forearm_L": (-55, 0, 0)}
    add_action(rig, "Idle", [
        (1, merge(rest_arm, {"chest": (2, 0, 0), "head": (-2, 0, 0)})),
        (31, merge(rest_arm, {"chest": (5, 0, 0), "head": (0, 0, 0), "hips": {"l": (0, -0.012, 0)},
                              "upperarm_R": (-13, 0, 6), "upperarm_L": (-7, 0, -6)})),
        (61, merge(rest_arm, {"chest": (2, 0, 0), "head": (-2, 0, 0)})),
    ])
    run = []
    for f, ph in ((1, 0), (6, 1), (11, 2), (16, 3), (21, 0)):
        thl = [-38, 0, 38, 0][ph]
        shl = [10, 25, 30, 80][ph]
        shr = [30, 80, 10, 25][ph]
        bob = [0.0, 0.05, 0.0, 0.05][ph]
        arm = [-1, 0, 1, 0][ph]
        run.append((f, {
            "hips": {"l": (0, bob - 0.03, 0)},
            "spine": (10, 0, 0), "chest": (4, -6 * arm, 0), "head": (-10, 6 * arm, 0),
            "thigh_L": (thl, 0, 0), "shin_L": (shl, 0, 0),
            "thigh_R": (-thl, 0, 0), "shin_R": (shr, 0, 0),
            "upperarm_R": (-15 - 25 * arm, 0, 6), "forearm_R": (-40, 0, 0),
            "upperarm_L": (-5 + 15 * arm, 0, -6), "forearm_L": (-70, 0, 0),
        }))
    add_action(rig, "Run", run)
    add_action(rig, "Attack", [
        (1, merge(rest_arm, {})),
        (6, {"upperarm_R": (-165, 0, 10), "forearm_R": (-35, 0, 0), "chest": (-6, -25, 0), "spine": (-4, -10, 0),
             "upperarm_L": (-30, 0, -15), "forearm_L": (-70, 0, 0), "thigh_R": (15, 0, 0), "shin_R": (10, 0, 0)}),
        (10, {"upperarm_R": (-35, 0, 0), "forearm_R": (-5, 0, 0), "chest": (14, 22, 0), "spine": (12, 10, 0),
              "head": (-10, -10, 0), "upperarm_L": (15, 0, -20), "forearm_L": (-50, 0, 0),
              "hips": {"l": (0, -0.08, 0)},
              "thigh_L": (-35, 0, 0), "shin_L": (25, 0, 0), "thigh_R": (20, 0, 0), "shin_R": (15, 0, 0)}),
        (14, {"upperarm_R": (-30, 0, 0), "forearm_R": (-8, 0, 0), "chest": (12, 20, 0), "spine": (10, 8, 0),
              "upperarm_L": (12, 0, -18), "forearm_L": (-50, 0, 0), "hips": {"l": (0, -0.07, 0)},
              "thigh_L": (-30, 0, 0), "shin_L": (22, 0, 0), "thigh_R": (18, 0, 0), "shin_R": (14, 0, 0)}),
        (20, merge(rest_arm, {})),
    ])
    add_action(rig, "Attack2", [
        (1, merge(rest_arm, {})),
        (5, {"upperarm_R": (-85, 0, 70), "forearm_R": (-20, 0, 0), "chest": (0, -45, 0), "spine": (0, -15, 0),
             "upperarm_L": (-40, 0, -10), "forearm_L": (-80, 0, 0), "hips": {"l": (0, -0.06, 0)},
             "thigh_L": (-20, 0, 0), "shin_L": (20, 0, 0), "thigh_R": (10, 0, 0), "shin_R": (20, 0, 0)}),
        (10, {"upperarm_R": (-85, 0, -45), "forearm_R": (-10, 0, 0), "chest": (4, 45, 0), "spine": (4, 15, 0),
              "upperarm_L": (10, 0, -25), "forearm_L": (-50, 0, 0), "hips": {"l": (0, -0.08, 0)},
              "thigh_L": (-25, 0, 0), "shin_L": (20, 0, 0), "thigh_R": (15, 0, 0), "shin_R": (20, 0, 0)}),
        (14, {"upperarm_R": (-80, 0, -50), "forearm_R": (-12, 0, 0), "chest": (4, 48, 0), "spine": (4, 15, 0),
              "upperarm_L": (10, 0, -25), "forearm_L": (-50, 0, 0), "hips": {"l": (0, -0.07, 0)},
              "thigh_L": (-22, 0, 0), "shin_L": (18, 0, 0), "thigh_R": (14, 0, 0), "shin_R": (18, 0, 0)}),
        (20, merge(rest_arm, {})),
    ])
    add_action(rig, "Hit", [
        (1, merge(rest_arm, {})),
        (4, {"spine": (-14, 8, 0), "chest": (-10, 10, 4), "head": (-22, 0, 8), "upperarm_R": (-40, 0, 30),
             "upperarm_L": (-40, 0, -30), "forearm_L": (-70, 0, 0), "forearm_R": (-50, 0, 0), "hips": {"l": (0, -0.03, 0.06)}}),
        (12, merge(rest_arm, {})),
    ])
    tuck = {"hips": {"l": (0, -0.48, 0), "r": (0, 0, 0)}, "spine": (45, 0, 0), "chest": (30, 0, 0), "head": (30, 0, 0),
            "thigh_L": (-120, 0, 0), "shin_L": (130, 0, 0), "thigh_R": (-115, 0, 0), "shin_R": (130, 0, 0),
            "upperarm_R": (-70, 0, 0), "forearm_R": (-60, 0, 0), "upperarm_L": (-60, 0, 0), "forearm_L": (-90, 0, 0)}
    tuck2 = dict(tuck)
    tuck2["hips"] = {"l": (0, -0.48, 0), "r": (360, 0, 0)}
    add_action(rig, "Roll", [
        (1, merge(rest_arm, {})),
        (3, tuck),
        (13, tuck2),
        (17, merge(rest_arm, {"hips": {"l": (0, -0.05, 0), "r": (360, 0, 0)}})),
    ])
    add_action(rig, "Drink", [
        (1, merge(rest_arm, {})),
        (7, merge(rest_arm, {"upperarm_L": (-110, 0, 25), "forearm_L": (-110, 0, 0), "head": (-25, 0, 0)})),
        (17, merge(rest_arm, {"upperarm_L": (-115, 0, 25), "forearm_L": (-115, 0, 0), "head": (-30, 0, 0)})),
        (24, merge(rest_arm, {})),
    ])
    add_action(rig, "Die", [
        (1, merge(rest_arm, {})),
        (8, {"spine": (-15, 0, 0), "head": (-25, 0, 0), "upperarm_R": (-50, 0, 40), "upperarm_L": (-50, 0, -40)}),
        (16, {"hips": {"l": (0, -0.3, 0)}, "spine": (20, 0, 0), "head": (15, 0, 0),
              "thigh_L": (-55, 0, 0), "shin_L": (95, 0, 0), "thigh_R": (-35, 0, 0), "shin_R": (70, 0, 0),
              "upperarm_R": (-20, 0, 20), "upperarm_L": (-20, 0, -20)}),
        (28, {"root": (-90, 0, 0), "upperarm_R": (-10, 0, 70), "upperarm_L": (-10, 0, -70), "head": (-10, 0, 10),
              "thigh_L": (-6, 0, 0), "thigh_R": (4, 0, 0)}),
        (40, {"root": (-88, 0, 0), "upperarm_R": (-10, 0, 75), "upperarm_L": (-10, 0, -75), "head": (-10, 0, 15),
              "thigh_L": (-6, 0, 0), "thigh_R": (4, 0, 0)}),
    ])
    add_action(rig, "Victory", [
        (1, {"upperarm_R": (-170, 0, 15), "forearm_R": (-10, 0, 0), "upperarm_L": (-20, 0, -30), "forearm_L": (-60, 0, 0), "head": (-15, 0, 0)}),
        (11, {"upperarm_R": (-178, 0, 8), "forearm_R": (0, 0, 0), "upperarm_L": (-20, 0, -30), "forearm_L": (-60, 0, 0),
              "head": (-20, 0, 0), "hips": {"l": (0, 0.06, 0)}}),
        (21, {"upperarm_R": (-170, 0, 15), "forearm_R": (-10, 0, 0), "upperarm_L": (-20, 0, -30), "forearm_L": (-60, 0, 0), "head": (-15, 0, 0)}),
    ])
    if do_export:
        export("hero.glb", [rig, body])
    return rig


SKEL_EXTRA = [("jaw", (0, -0.02, 1.62), (0, -0.12, 1.62), "head")]


def build_skeleton(M, eye_mat_key="ghost_eye", fname="skeleton.glb", name="Skeleton", do_export=True):
    rig = make_armature(name, SKEL_EXTRA)
    B, D, E = M["bone"], M["bone_dark"], M[eye_mat_key]
    P = []
    P.append(part("cube", (0, 0, 0.97), (0.28, 0.15, 0.1), B, "hips", bevel=0.03))
    P.append(part("cone", (0, 0, 0.86), (0.42, 0.3, 0.22), M["rag"], "hips", v=7, r2=0.36))
    P.append(part("cube", (0, 0, 0.99), (0.33, 0.2, 0.05), M["leather"], "hips"))
    for i in range(5):
        z = 1.04 + i * 0.05
        P.append(part("cyl", (0, 0.03, z), (0.07, 0.07, 0.04), B, "spine", v=6))
    for i, z in enumerate((1.28, 1.35, 1.42, 1.48)):
        w = 0.3 + 0.03 * min(i, 2)
        P.append(part("torus", (0, 0, z), (w, 0.22, 0.25), B, "chest" if z > 1.31 else "spine", v=12, minor=0.1))
    P.append(part("cube", (0, -0.1, 1.38), (0.04, 0.03, 0.22), B, "chest"))
    P.append(part("cube", (0, 0.02, 1.5), (0.5, 0.05, 0.04), B, "chest", bevel=0.01))
    P.append(part("cyl", (0, 0.02, 1.56), (0.06, 0.06, 0.08), B, "chest", v=6))
    # Crâne
    P.append(part("sphere", (0, 0, 1.72), (0.27, 0.3, 0.27), B, "head", v=12, smooth=True))
    P.append(part("cube", (0, -0.05, 1.64), (0.17, 0.16, 0.06), B, "head", bevel=0.02))
    for s in (1, -1):
        P.append(part("sphere", (0.055 * s, -0.115, 1.73), (0.075, 0.06, 0.07), D, "head", v=8))
        P.append(part("sphere", (0.055 * s, -0.135, 1.73), (0.035, 0.03, 0.035), E, "head", v=6))
    P.append(part("cone", (0, -0.14, 1.67), (0.04, 0.03, 0.04), D, "head", rot=(180, 0, 0), v=3))
    P.append(part("cube", (0, -0.07, 1.585), (0.15, 0.14, 0.035), B, "jaw", bevel=0.01))
    for i in range(5):
        P.append(part("cube", (-0.05 + i * 0.025, -0.135, 1.605), (0.015, 0.01, 0.025), B, "jaw"))
    for s, side in ((1, "L"), (-1, "R")):
        ua, fa, hd = "upperarm_" + side, "forearm_" + side, "hand_" + side
        P.append(part("sphere", (0.26 * s, 0, 1.49), (0.09, 0.09, 0.09), B, ua, v=8, smooth=True))
        P.append(part("cyl", (0.27 * s, 0, 1.33), (0.05, 0.05, 0.28), B, ua, v=6))
        P.append(part("sphere", (0.27 * s, 0, 1.18), (0.07, 0.07, 0.07), B, fa, v=8, smooth=True))
        P.append(part("cyl", (0.265 * s, 0.01, 1.05), (0.035, 0.035, 0.25), B, fa, v=6))
        P.append(part("cyl", (0.28 * s, -0.01, 1.05), (0.03, 0.03, 0.25), B, fa, v=6))
        P.append(part("cube", (0.27 * s, 0, 0.89), (0.07, 0.08, 0.06), B, hd, bevel=0.01))
        for k in range(3):
            P.append(part("cube", (0.27 * s, -0.025 + k * 0.025, 0.84), (0.02, 0.018, 0.07), B, hd))
        th, sh = "thigh_" + side, "shin_" + side
        P.append(part("cyl", (0.11 * s, 0, 0.74), (0.06, 0.06, 0.4), B, th, v=6))
        P.append(part("sphere", (0.11 * s, -0.01, 0.52), (0.08, 0.08, 0.08), B, sh, v=8, smooth=True))
        P.append(part("cyl", (0.11 * s, 0, 0.29), (0.05, 0.05, 0.42), B, sh, v=6))
        P.append(part("cube", (0.11 * s, -0.05, 0.04), (0.08, 0.2, 0.05), B, sh, bevel=0.015))
    body = join(P, name)
    skin(body, rig)

    rest = {"spine": (8, 0, 0), "chest": (6, 0, 0), "head": (-8, 0, 0), "upperarm_R": (-12, 0, 6),
            "forearm_R": (-35, 0, 0), "upperarm_L": (-8, 0, -8), "forearm_L": (-25, 0, 0),
            "thigh_L": (-6, 0, 0), "shin_L": (10, 0, 0), "thigh_R": (-6, 0, 0), "shin_R": (10, 0, 0),
            "hips": {"l": (0, -0.03, 0)}}
    add_action(rig, "Idle", [
        (1, merge(rest, {"head": (-8, 0, 4), "jaw": (2, 0, 0)})),
        (14, merge(rest, {"head": (-4, 6, -3), "jaw": (12, 0, 0), "chest": (9, 0, 2)})),
        (27, merge(rest, {"head": (-10, -5, 2), "jaw": (3, 0, 0), "chest": (5, 0, -2)})),
        (41, merge(rest, {"head": (-8, 0, 4), "jaw": (2, 0, 0)})),
    ])
    walk = []
    for f, ph in ((1, 0), (9, 1), (17, 2), (25, 3), (33, 0)):
        thl = [-28, 0, 28, 0][ph]
        shl = [8, 20, 25, 60][ph]
        shr = [25, 60, 8, 20][ph]
        bob = [0.0, 0.03, 0.0, 0.03][ph]
        sway = [1, 0, -1, 0][ph]
        walk.append((f, {
            "hips": {"l": (0, bob - 0.04, 0), "r": (0, 6 * sway, 0)},
            "spine": (14, 0, 5 * sway), "chest": (6, 0, 4 * sway), "head": (-10, -6 * sway, -6 * sway),
            "jaw": (6 + 6 * abs(sway), 0, 0),
            "thigh_L": (thl, 0, 0), "shin_L": (shl, 0, 0), "thigh_R": (-thl, 0, 0), "shin_R": (shr, 0, 0),
            "upperarm_R": (-25 - 15 * sway, 0, 8), "forearm_R": (-40, 0, 0),
            "upperarm_L": (-25 + 20 * sway, 0, -8), "forearm_L": (-30, 0, 0),
        }))
    add_action(rig, "Walk", walk)
    add_action(rig, "Attack", [
        (1, merge(rest, {})),
        (10, merge(rest, {"upperarm_R": (-160, 0, 15), "forearm_R": (-50, 0, 0), "chest": (-10, -20, 0), "spine": (-4, -8, 0),
                          "head": (-15, 0, 0), "jaw": (25, 0, 0), "upperarm_L": (-40, 0, -25)})),
        (14, merge(rest, {"upperarm_R": (-30, 0, 0), "forearm_R": (-10, 0, 0), "chest": (18, 20, 0), "spine": (14, 8, 0),
                          "jaw": (30, 0, 0), "upperarm_L": (15, 0, -20), "hips": {"l": (0, -0.1, 0)},
                          "thigh_L": (-35, 0, 0), "shin_L": (30, 0, 0), "thigh_R": (15, 0, 0)})),
        (19, merge(rest, {"upperarm_R": (-28, 0, 0), "forearm_R": (-12, 0, 0), "chest": (16, 18, 0), "spine": (12, 8, 0),
                          "jaw": (10, 0, 0), "hips": {"l": (0, -0.09, 0)}, "thigh_L": (-30, 0, 0), "shin_L": (28, 0, 0)})),
        (26, merge(rest, {})),
    ])
    add_action(rig, "Shoot", [
        (1, merge(rest, {})),
        (9, merge(rest, {"upperarm_L": (-88, 0, -10), "forearm_L": (-5, 0, 0), "upperarm_R": (-92, 0, -18),
                         "forearm_R": (-120, 0, 0), "chest": (0, -30, 0), "head": (-5, 25, 0)})),
        (19, merge(rest, {"upperarm_L": (-90, 0, -10), "forearm_L": (-3, 0, 0), "upperarm_R": (-90, 0, -22),
                          "forearm_R": (-135, 0, 0), "chest": (0, -32, 0), "head": (-5, 27, 0)})),
        (21, merge(rest, {"upperarm_L": (-90, 0, -10), "forearm_L": (-3, 0, 0), "upperarm_R": (-80, 0, 30),
                          "forearm_R": (-60, 0, 0), "chest": (0, -30, 0), "head": (-5, 25, 0), "jaw": (15, 0, 0)})),
        (30, merge(rest, {})),
    ])
    add_action(rig, "Hit", [
        (1, merge(rest, {})),
        (4, merge(rest, {"spine": (-12, 10, 0), "chest": (-10, 12, 6), "head": (-30, 15, 12), "jaw": (30, 0, 0),
                         "upperarm_R": (-45, 0, 40), "upperarm_L": (-45, 0, -40), "hips": {"l": (0, -0.03, 0.08)}})),
        (12, merge(rest, {})),
    ])
    add_action(rig, "Die", [
        (1, merge(rest, {})),
        (6, merge(rest, {"head": (-35, 10, 15), "jaw": (40, 0, 0), "spine": (-10, 0, 0),
                         "upperarm_R": (-60, 0, 45), "upperarm_L": (-60, 0, -45)})),
        (15, {"hips": {"l": (0, -0.5, 0)}, "spine": (30, 0, 8), "chest": (15, 0, 0), "head": (20, 15, 20), "jaw": (35, 0, 0),
              "thigh_L": (-85, 0, 0), "shin_L": (140, 0, 0), "thigh_R": (-80, 0, 0), "shin_R": (135, 0, 0),
              "upperarm_R": (-20, 0, 30), "upperarm_L": (-20, 0, -30)}),
        (24, {"root": (82, 0, 0), "hips": {"l": (0, -0.55, 0)}, "spine": (10, 0, 15), "head": (-10, 30, 25), "jaw": (40, 0, 0),
              "thigh_L": (-85, 0, 0), "shin_L": (140, 0, 0), "thigh_R": (-80, 0, 0), "shin_R": (135, 0, 0),
              "upperarm_R": (-150, 0, 40), "upperarm_L": (-140, 0, -40)}),
        (32, {"root": (88, 0, 0), "hips": {"l": (0, -0.58, 0)}, "spine": (8, 0, 18), "head": (-10, 35, 25), "jaw": (45, 0, 0),
              "thigh_L": (-85, 0, 0), "shin_L": (140, 0, 0), "thigh_R": (-80, 0, 0), "shin_R": (135, 0, 0),
              "upperarm_R": (-155, 0, 45), "upperarm_L": (-145, 0, -45)}),
    ])
    claw = {"upperarm_R": (-160, 0, 20), "upperarm_L": (-160, 0, -20), "forearm_R": (-30, 0, 0), "forearm_L": (-30, 0, 0)}
    add_action(rig, "Rise", [
        (1, merge(claw, {"root": {"l": (0, -1.9, 0)}, "head": (-30, 0, 0), "jaw": (30, 0, 0)})),
        (12, merge(claw, {"root": {"l": (0, -1.1, 0)}, "head": (-20, 10, 0), "jaw": (35, 0, 0), "spine": (15, 0, 10)})),
        (24, merge(rest, {"root": {"l": (0, -0.35, 0)}, "head": (-10, -10, 0), "jaw": (30, 0, 0), "spine": (25, 0, -10),
                          "upperarm_R": (-60, 0, 30), "upperarm_L": (-60, 0, -30)})),
        (36, merge(rest, {"jaw": (20, 0, 0)})),
        (42, merge(rest, {})),
    ])
    add_action(rig, "Roar", [
        (1, merge(rest, {})),
        (10, merge(rest, {"spine": (-15, 0, 0), "chest": (-15, 0, 0), "head": (-30, 0, 0), "jaw": (45, 0, 0),
                          "upperarm_R": (-40, 0, 70), "upperarm_L": (-40, 0, -70), "forearm_R": (-20, 0, 0), "forearm_L": (-20, 0, 0)})),
        (34, merge(rest, {"spine": (-17, 0, 0), "chest": (-17, 0, 0), "head": (-32, 0, 0), "jaw": (48, 0, 0),
                          "upperarm_R": (-45, 0, 75), "upperarm_L": (-45, 0, -75), "forearm_R": (-25, 0, 0), "forearm_L": (-25, 0, 0)})),
        (44, merge(rest, {})),
    ])
    add_action(rig, "Slam", [
        (1, merge(rest, {})),
        (14, merge(rest, {"upperarm_R": (-175, 0, -10), "upperarm_L": (-175, 0, 10), "forearm_R": (-20, 0, 0), "forearm_L": (-20, 0, 0),
                          "spine": (-15, 0, 0), "chest": (-10, 0, 0), "head": (-20, 0, 0), "jaw": (30, 0, 0)})),
        (19, merge(rest, {"upperarm_R": (-40, 0, -5), "upperarm_L": (-40, 0, 5), "forearm_R": (-5, 0, 0), "forearm_L": (-5, 0, 0),
                          "spine": (30, 0, 0), "chest": (15, 0, 0), "jaw": (40, 0, 0), "hips": {"l": (0, -0.2, 0)},
                          "thigh_L": (-40, 0, 0), "shin_L": (50, 0, 0), "thigh_R": (-40, 0, 0), "shin_R": (50, 0, 0)})),
        (26, merge(rest, {"upperarm_R": (-38, 0, -5), "upperarm_L": (-38, 0, 5), "spine": (28, 0, 0), "jaw": (20, 0, 0),
                          "hips": {"l": (0, -0.18, 0)}, "thigh_L": (-38, 0, 0), "shin_L": (48, 0, 0), "thigh_R": (-38, 0, 0), "shin_R": (48, 0, 0)})),
        (36, merge(rest, {})),
    ])
    if do_export:
        export(fname, [rig, body])
    return rig


def build_princess(M, do_export=True):
    rig = make_armature("Princess")
    P = []
    P.append(part("cone", (0, 0, 0.52), (0.9, 0.84, 0.98), M["dress"], "hips", v=16, r2=0.19, smooth=True))
    P.append(part("torus", (0, 0, 0.06), (0.9, 0.84, 0.5), M["gold"], "hips", v=16, minor=0.05))
    P.append(part("cone", (0, -0.005, 0.62), (0.7, 0.66, 0.7), M["dress_light"], "hips", v=16, r2=0.2, smooth=True))
    P.append(part("torus", (0, 0, 0.96), (0.37, 0.33, 0.5), M["gold"], "hips", v=12, minor=0.08))
    P.append(part("cyl", (0, 0, 1.17), (0.3, 0.26, 0.26), M["dress"], "spine", v=12, smooth=True))
    P.append(part("cyl", (0, 0, 1.39), (0.34, 0.28, 0.2), M["dress"], "chest", v=12, smooth=True))
    P.append(part("cyl", (0, 0, 1.5), (0.3, 0.24, 0.05), M["dress_light"], "chest", v=12, smooth=True))
    P.append(part("cyl", (0, 0, 1.55), (0.09, 0.09, 0.1), M["skin"], "chest", v=8, smooth=True))
    P.append(part("sphere", (0, -0.13, 1.42), (0.06, 0.03, 0.06), M["pink_gem"], "chest", v=8))
    # Tête
    P.append(part("sphere", (0, 0, 1.69), (0.25, 0.25, 0.28), M["skin"], "head", v=16, smooth=True))
    P.append(part("sphere", (0, 0.02, 1.73), (0.28, 0.28, 0.28), M["hair"], "head", v=16, smooth=True))
    P.append(part("cube", (0, 0.1, 1.48), (0.27, 0.09, 0.44), M["hair"], "head", bevel=0.04))
    for s in (1, -1):
        P.append(part("sphere", (0.05 * s, -0.12, 1.69), (0.04, 0.02, 0.05), M["eye"], "head", v=8))
        P.append(part("sphere", (0.13 * s, -0.02, 1.58), (0.08, 0.08, 0.22), M["hair"], "head", v=8, smooth=True))
    P.append(part("sphere", (0, -0.125, 1.63), (0.04, 0.015, 0.015), M["red"], "head", v=8))
    P.append(part("torus", (0, 0, 1.86), (0.22, 0.22, 0.5), M["gold"], "head", v=12, minor=0.1))
    for k in range(5):
        ang = radians(-90 + (k - 2) * 25)
        P.append(part("cone", (0.11 * math.cos(ang), 0.11 * math.sin(ang), 1.9), (0.04, 0.04, 0.08), M["gold"], "head", v=4))
    P.append(part("sphere", (0, -0.11, 1.9), (0.04, 0.03, 0.04), M["pink_gem"], "head", v=8))
    for s, side in ((1, "L"), (-1, "R")):
        ua, fa, hd = "upperarm_" + side, "forearm_" + side, "hand_" + side
        P.append(part("sphere", (0.24 * s, 0, 1.45), (0.16, 0.16, 0.16), M["dress_light"], ua, v=10, smooth=True))
        P.append(part("cyl", (0.26 * s, 0, 1.3), (0.07, 0.07, 0.28), M["skin"], ua, v=8, smooth=True))
        P.append(part("cyl", (0.26 * s, 0, 1.06), (0.065, 0.065, 0.26), M["skin"], fa, v=8, smooth=True))
        P.append(part("sphere", (0.26 * s, 0, 0.89), (0.07, 0.07, 0.09), M["skin"], hd, v=8, smooth=True))
        P.append(part("cube", (0.11 * s, -0.05, 0.04), (0.1, 0.18, 0.08), M["dress"], "shin_" + side, bevel=0.02))
    body = join(P, "Princess")
    skin(body, rig)

    clasp = {"upperarm_R": (-35, 0, -18), "forearm_R": (-95, 0, 0), "upperarm_L": (-35, 0, 18), "forearm_L": (-95, 0, 0)}
    add_action(rig, "Idle", [
        (1, merge(clasp, {"head": (8, 0, 4), "spine": (0, 0, 2)})),
        (25, merge(clasp, {"head": (4, 12, -3), "spine": (0, 0, -2), "chest": (3, 0, 0)})),
        (50, merge(clasp, {"head": (10, -12, 3), "spine": (0, 0, 2)})),
        (75, merge(clasp, {"head": (8, 0, 4), "spine": (0, 0, 2)})),
    ])
    add_action(rig, "Cheer", [
        (1, {"upperarm_R": (-160, 0, 25), "upperarm_L": (-160, 0, -25), "forearm_R": (-20, 0, 0), "forearm_L": (-20, 0, 0),
             "head": (-15, 0, 0)}),
        (8, {"upperarm_R": (-170, 0, 10), "upperarm_L": (-170, 0, -10), "forearm_R": (-5, 0, 0), "forearm_L": (-5, 0, 0),
             "head": (-20, 0, 0), "root": {"l": (0, 0.12, 0)}}),
        (15, {"upperarm_R": (-160, 0, 25), "upperarm_L": (-160, 0, -25), "forearm_R": (-20, 0, 0), "forearm_L": (-20, 0, 0),
              "head": (-15, 0, 0)}),
    ])
    walk = []
    for f, ph in ((1, 0), (9, 1), (17, 2), (25, 3), (33, 0)):
        t = [-15, 0, 15, 0][ph]
        a = [1, 0, -1, 0][ph]
        walk.append((f, {"thigh_L": (t, 0, 0), "thigh_R": (-t, 0, 0), "hips": {"l": (0, 0.02 * abs(a), 0), "r": (0, 4 * a, 0)},
                         "upperarm_R": (-15 * a, 0, 8), "upperarm_L": (15 * a, 0, -8),
                         "forearm_R": (-20, 0, 0), "forearm_L": (-20, 0, 0), "head": (-3, 0, 0)}))
    add_action(rig, "Walk", walk)
    if do_export:
        export("princess.glb", [rig, body])
    return rig


# ---------------------------------------------------------------------------
# Armes : poignée à l'origine, lame vers +Z
# ---------------------------------------------------------------------------
def weapon(fname, parts):
    reset()
    M = materials()
    objs = parts(M)
    o = join(objs, os.path.splitext(fname)[0])
    export(fname, [o])


def w_rusty(M):
    return [part("cyl", (0, 0, 0), (0.05, 0.05, 0.2), M["wood_dark"], v=8),
            part("cube", (0, 0, 0.12), (0.22, 0.06, 0.04), M["rust"], bevel=0.01),
            part("cube", (0, 0, 0.5), (0.08, 0.02, 0.72), M["rust"], bevel=0.008),
            part("cone", (0, 0, 0.9), (0.08, 0.02, 0.09), M["rust"], v=4, rot=(0, 0, 45)),
            part("sphere", (0, 0, -0.12), (0.06, 0.06, 0.06), M["rust"], v=6)]


def w_knight(M):
    return [part("cyl", (0, 0, 0), (0.05, 0.05, 0.22), M["blue"], v=8),
            part("cube", (0, 0, 0.13), (0.34, 0.07, 0.05), M["gold"], bevel=0.015),
            part("cube", (0, 0, 0.56), (0.09, 0.025, 0.82), M["steel"], bevel=0.01),
            part("cube", (0, 0, 0.5), (0.015, 0.03, 0.66), M["gold"]),
            part("cone", (0, 0, 1.01), (0.092, 0.025, 0.12), M["steel"], v=4, rot=(0, 0, 45)),
            part("sphere", (0, 0, -0.13), (0.08, 0.08, 0.08), M["gold"], v=8, smooth=True)]


def w_mace(M):
    o = [part("cyl", (0, 0, 0.25), (0.05, 0.05, 0.75), M["wood"], v=8),
         part("cyl", (0, 0, -0.1), (0.07, 0.07, 0.06), M["iron"], v=8),
         part("ico", (0, 0, 0.66), (0.22, 0.22, 0.22), M["iron"], v=1)]
    for a in range(6):
        ang = radians(a * 60)
        o.append(part("cone", (0.12 * math.cos(ang), 0.12 * math.sin(ang), 0.66), (0.06, 0.06, 0.12), M["steel"], v=4,
                      rot=(0, 90, a * 60)))
    o.append(part("cone", (0, 0, 0.8), (0.06, 0.06, 0.12), M["steel"], v=4))
    return o


def w_axe(M):
    return [part("cyl", (0, 0, 0.32), (0.05, 0.05, 0.95), M["wood"], v=8),
            part("cyl", (0, 0, 0.0), (0.06, 0.06, 0.08), M["leather"], v=8),
            part("cube", (0, 0, 0.72), (0.12, 0.08, 0.14), M["dark_steel"], bevel=0.01),
            part("cyl", (0.2, 0, 0.72), (0.42, 0.42, 0.03), M["steel"], v=6, rot=(90, 0, 0)),
            part("cyl", (-0.17, 0, 0.72), (0.32, 0.32, 0.03), M["steel"], v=6, rot=(90, 0, 0)),
            part("cone", (0, 0, 0.86), (0.05, 0.05, 0.12), M["dark_steel"], v=4)]


def w_spear(M):
    return [part("cyl", (0, 0, 0.45), (0.04, 0.04, 1.6), M["wood"], v=8),
            part("cyl", (0, 0, 1.2), (0.06, 0.06, 0.08), M["gold"], v=8),
            part("cone", (0, 0, 1.38), (0.12, 0.03, 0.32), M["steel"], v=4, rot=(0, 0, 45)),
            part("cube", (0, 0, 1.17), (0.12, 0.02, 0.04), M["banner"]),
            part("cone", (0, 0, -0.38), (0.05, 0.05, 0.08), M["steel"], v=6, rot=(180, 0, 0))]


def w_hammer(M):
    return [part("cyl", (0, 0, 0.3), (0.055, 0.055, 0.9), M["wood_dark"], v=8),
            part("cyl", (0, 0, 0.0), (0.07, 0.07, 0.1), M["leather"], v=8),
            part("cube", (0, 0, 0.78), (0.42, 0.22, 0.22), M["dark_steel"], bevel=0.03),
            part("cube", (0, -0.112, 0.78), (0.25, 0.01, 0.06), M["rune"]),
            part("cube", (0, 0.112, 0.78), (0.25, 0.01, 0.06), M["rune"]),
            part("cube", (0.212, 0, 0.78), (0.01, 0.12, 0.12), M["rune"]),
            part("cube", (-0.212, 0, 0.78), (0.01, 0.12, 0.12), M["rune"])]


def w_flame(M):
    return [part("cyl", (0, 0, 0), (0.055, 0.055, 0.24), M["purple"], v=8),
            part("cube", (0, 0, 0.14), (0.42, 0.08, 0.06), M["gold"], bevel=0.02),
            part("sphere", (0, -0.04, 0.14), (0.06, 0.04, 0.06), M["flame"], v=8),
            part("cube", (0, 0, 0.62), (0.12, 0.03, 0.9), M["steel"], bevel=0.012),
            part("cube", (0, 0, 0.6), (0.05, 0.034, 0.78), M["flame"]),
            part("cone", (0, 0, 1.13), (0.122, 0.03, 0.16), M["steel"], v=4, rot=(0, 0, 45)),
            part("sphere", (0, 0, -0.15), (0.09, 0.09, 0.09), M["gold"], v=8, smooth=True)]


def w_boss_blade(M):
    return [part("cyl", (0, 0, 0), (0.07, 0.07, 0.35), M["iron"], v=8),
            part("cube", (0, 0, 0.2), (0.5, 0.1, 0.08), M["iron"], bevel=0.02),
            part("cone", (0.22, 0, 0.26), (0.08, 0.08, 0.16), M["bone"], v=5),
            part("cone", (-0.22, 0, 0.26), (0.08, 0.08, 0.16), M["bone"], v=5),
            part("cube", (0.04, 0, 0.85), (0.32, 0.04, 1.2), M["dark_steel"], bevel=0.02),
            part("cube", (0.04, 0, 0.85), (0.06, 0.045, 1.0), M["boss_eye"]),
            part("cone", (0.04, 0, 1.55), (0.32, 0.04, 0.22), M["dark_steel"], v=4, rot=(0, 0, 45))]


# Accessoires d'ennemis
def a_shield(M):
    return [part("cyl", (0, 0, 0), (0.5, 0.5, 0.05), M["wood"], v=12, rot=(90, 0, 0)),
            part("torus", (0, 0, 0), (0.5, 0.5, 0.5), M["rust"], v=12, minor=0.06, rot=(90, 0, 0)),
            part("sphere", (0, -0.03, 0), (0.12, 0.08, 0.12), M["rust"], v=8)]


def a_bow(M):
    o = []
    for i in range(7):
        a = radians(-60 + i * 20)
        o.append(part("cyl", (0, -0.09 * math.cos(a) + 0.09, 0.5 * math.sin(a)), (0.035, 0.035, 0.17), M["wood_dark"], v=6,
                      rot=(-math.degrees(a), 0, 0)))
    o.append(part("cyl", (0, 0.045, 0), (0.008, 0.008, 0.86), M["bone"], v=4))
    o.append(part("cyl", (0, -0.045, 0), (0.05, 0.05, 0.12), M["leather"], v=6))
    return o


def a_helmet(M):
    return [part("sphere", (0, 0, 0), (0.32, 0.34, 0.26), M["rust"], v=12, smooth=True),
            part("cyl", (0, 0, -0.04), (0.36, 0.38, 0.03), M["rust"], v=12),
            part("cube", (0, -0.17, -0.04), (0.04, 0.03, 0.14), M["rust"]),
            part("cone", (0.15, 0, 0.06), (0.06, 0.06, 0.2), M["bone"], v=5, rot=(0, -60, 0)),
            part("cone", (-0.15, 0, 0.06), (0.06, 0.06, 0.2), M["bone"], v=5, rot=(0, 60, 0))]


def a_crown(M):
    o = [part("cyl", (0, 0, 0), (0.3, 0.3, 0.08), M["gold"], v=10)]
    for k in range(8):
        a = radians(k * 45)
        o.append(part("cone", (0.15 * math.cos(a), 0.15 * math.sin(a), 0.1), (0.07, 0.07, 0.14), M["gold"], v=4))
        if k % 2 == 0:
            o.append(part("sphere", (0.155 * math.cos(a), 0.155 * math.sin(a), 0.0), (0.05, 0.05, 0.05), M["boss_eye"], v=6))
    return o


def a_arrow(M):
    return [part("cyl", (0, 0, 0), (0.02, 0.02, 0.7), M["wood"], v=4),
            part("cone", (0, 0, 0.38), (0.05, 0.02, 0.08), M["iron"], v=4),
            part("cube", (0, 0, -0.3), (0.06, 0.005, 0.1), M["bone"])]


# ---------------------------------------------------------------------------
# Décor
# ---------------------------------------------------------------------------
def prop(fname, parts, origin=None):
    reset()
    M = materials()
    objs = parts(M)
    o = join(objs, os.path.splitext(fname)[0])
    export(fname, [o])


def chest_model():
    """Coffre : le couvercle est un objet séparé nommé « lid », pivot à la charnière."""
    reset()
    M = materials()
    base = join([
        part("cube", (0, 0, 0.22), (0.9, 0.56, 0.44), M["wood"], bevel=0.02),
        part("cube", (0, 0, 0.42), (0.92, 0.58, 0.04), M["gold"]),
        part("cube", (0.3, 0, 0.22), (0.06, 0.58, 0.45), M["iron"]),
        part("cube", (-0.3, 0, 0.22), (0.06, 0.58, 0.45), M["iron"]),
        part("cube", (0, -0.29, 0.33), (0.12, 0.03, 0.14), M["gold"], bevel=0.01),
        part("cube", (0, 0, 0.4), (0.8, 0.46, 0.02), M["ember"]),
    ], "chest_base")
    lid = join([
        part("cyl", (0, 0, 0.46), (0.9, 0.56, 0.5), M["wood"], v=10, rot=(0, 90, 0)),
        part("cube", (0, 0, 0.45), (0.9, 0.56, 0.02), M["wood"]),
        part("cyl", (0.3, 0, 0.46), (0.06, 0.6, 0.53), M["iron"], v=10, rot=(0, 90, 0)),
        part("cyl", (-0.3, 0, 0.46), (0.06, 0.6, 0.53), M["iron"], v=10, rot=(0, 90, 0)),
        part("cube", (0, -0.29, 0.5), (0.1, 0.03, 0.12), M["gold"], bevel=0.01),
    ], "lid")
    # Ne garder que la moitié supérieure du cylindre du couvercle
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(lid.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < 0.445], context="VERTS")
    bm.to_mesh(lid.data)
    bm.free()
    set_origin(lid, (0, 0.28, 0.45))
    lid.parent = base
    lid.location = (0, 0.28, 0.45)
    export("chest.glb", [base, lid])


def portcullis():
    reset()
    M = materials()
    o = []
    for i in range(9):
        x = -1.6 + i * 0.4
        o.append(part("cube", (x, 0, 1.6), (0.07, 0.07, 3.2), M["iron"]))
        o.append(part("cone", (x, 0, -0.08), (0.09, 0.09, 0.16), M["iron"], v=4, rot=(180, 0, 0)))
    for z in (0.5, 1.4, 2.3, 3.1):
        o.append(part("cube", (0, 0, z), (3.4, 0.09, 0.09), M["iron"]))
    export("gate.glb", [join(o, "gate")])


def torch(M):
    return [part("cube", (0, 0.04, 0), (0.12, 0.08, 0.22), M["iron"], bevel=0.01),
            part("cyl", (0, -0.08, 0.1), (0.05, 0.05, 0.4), M["wood_dark"], v=6, rot=(-25, 0, 0)),
            part("cyl", (0, -0.16, 0.3), (0.12, 0.12, 0.1), M["iron"], v=8, rot=(-25, 0, 0)),
            part("ico", (0, -0.17, 0.34), (0.1, 0.1, 0.08), M["ember"], v=1)]


def pillar(M):
    return [part("cube", (0, 0, 0.12), (0.95, 0.95, 0.24), M["stone_light"], bevel=0.04),
            part("cube", (0, 0, 0.3), (0.8, 0.8, 0.14), M["stone"], bevel=0.03),
            part("cyl", (0, 0, 2.0), (0.62, 0.62, 3.3), M["stone"], v=10),
            part("cube", (0, 0, 3.75), (0.85, 0.85, 0.22), M["stone"], bevel=0.03),
            part("cube", (0, 0, 3.92), (1.0, 1.0, 0.16), M["stone_light"], bevel=0.04)]


def barrel(M):
    return [part("cyl", (0, 0, 0.42), (0.62, 0.62, 0.84), M["wood"], v=12),
            part("cyl", (0, 0, 0.42), (0.68, 0.68, 0.4), M["wood"], v=12),
            part("cyl", (0, 0, 0.12), (0.65, 0.65, 0.05), M["iron"], v=12),
            part("cyl", (0, 0, 0.72), (0.65, 0.65, 0.05), M["iron"], v=12),
            part("cyl", (0, 0, 0.84), (0.58, 0.58, 0.02), M["wood_dark"], v=12)]


def crate(M):
    o = [part("cube", (0, 0, 0.35), (0.7, 0.7, 0.7), M["wood"], bevel=0.02)]
    for s in (1, -1):
        o.append(part("cube", (0, 0.355 * s, 0.35), (0.72, 0.02, 0.1), M["wood_dark"], rot=(0, 45, 0)))
        o.append(part("cube", (0.355 * s, 0, 0.35), (0.02, 0.72, 0.1), M["wood_dark"], rot=(45, 0, 0)))
    return o


def bones(M):
    o = []
    import random
    rnd = random.Random(7)
    for i in range(9):
        o.append(part("cyl", (rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.4), 0.04), (0.06, 0.06, rnd.uniform(0.3, 0.5)),
                      M["bone"], v=5, rot=(90, 0, rnd.uniform(0, 180))))
    o.append(part("sphere", (0.1, 0.05, 0.11), (0.24, 0.27, 0.22), M["bone"], v=10, smooth=True, rot=(20, 0, 30)))
    o.append(part("sphere", (0.07, -0.05, 0.12), (0.06, 0.05, 0.06), M["bone_dark"], v=6))
    o.append(part("sphere", (0.15, -0.03, 0.13), (0.06, 0.05, 0.06), M["bone_dark"], v=6))
    return o


def throne(M):
    return [part("cube", (0, 0, 0.15), (2.0, 1.6, 0.3), M["stone"], bevel=0.03),
            part("cube", (0, 0.1, 0.65), (1.2, 1.0, 0.7), M["dark_steel"], bevel=0.03),
            part("cube", (0, 0.5, 1.7), (1.2, 0.2, 2.2), M["dark_steel"], bevel=0.03),
            part("cube", (0, 0.45, 1.9), (0.6, 0.05, 1.4), M["banner"]),
            part("cube", (0.6, 0.1, 1.15), (0.2, 1.0, 0.25), M["dark_steel"], bevel=0.02),
            part("cube", (-0.6, 0.1, 1.15), (0.2, 1.0, 0.25), M["dark_steel"], bevel=0.02),
            part("sphere", (0.6, -0.35, 1.3), (0.28, 0.32, 0.28), M["bone"], v=10, smooth=True),
            part("sphere", (-0.6, -0.35, 1.3), (0.28, 0.32, 0.28), M["bone"], v=10, smooth=True),
            part("sphere", (0, 0.5, 2.95), (0.45, 0.5, 0.45), M["bone"], v=10, smooth=True),
            part("sphere", (0.08, 0.28, 2.97), (0.1, 0.06, 0.1), M["boss_eye"], v=6),
            part("sphere", (-0.08, 0.28, 2.97), (0.1, 0.06, 0.1), M["boss_eye"], v=6)]


def cage():
    reset()
    M = materials()
    o = [part("cyl", (0, 0, 0.08), (2.2, 2.2, 0.16), M["iron"], v=16),
         part("cyl", (0, 0, 3.0), (2.2, 2.2, 0.14), M["iron"], v=16),
         part("cone", (0, 0, 3.4), (2.2, 2.2, 0.7), M["iron"], v=16),
         part("torus", (0, 0, 1.6), (2.2, 2.2, 0.5), M["iron"], v=16, minor=0.03)]
    for k in range(16):
        a = radians(k * 22.5)
        o.append(part("cyl", (1.08 * math.cos(a), 1.08 * math.sin(a), 1.5), (0.06, 0.06, 3.0), M["iron"], v=5))
    o.append(part("cyl", (0, 0, 4.6), (0.04, 0.04, 2.0), M["iron"], v=4))
    export("cage.glb", [join(o, "cage")])


def coin(M):
    return [part("cyl", (0, 0, 0), (0.22, 0.22, 0.04), M["gold"], v=12, rot=(90, 0, 0))]


def potion(M):
    return [part("sphere", (0, 0, 0.13), (0.22, 0.22, 0.22), M["potion"], v=12, smooth=True),
            part("cyl", (0, 0, 0.28), (0.08, 0.08, 0.12), M["glass"], v=8),
            part("cyl", (0, 0, 0.35), (0.07, 0.07, 0.05), M["cork"], v=8)]


def heart_flask(M):
    return [part("sphere", (0, 0, 0.13), (0.24, 0.24, 0.24), M["pink_gem"], v=12, smooth=True),
            part("cyl", (0, 0, 0.29), (0.08, 0.08, 0.12), M["gold"], v=8),
            part("sphere", (0, 0, 0.37), (0.08, 0.08, 0.08), M["gold"], v=8)]


def key(M):
    return [part("torus", (0, 0, 0.32), (0.22, 0.22, 0.6), M["gold"], v=10, minor=0.18, rot=(90, 0, 0)),
            part("cyl", (0, 0, 0.05), (0.05, 0.05, 0.4), M["gold"], v=6),
            part("cube", (0.05, 0, -0.1), (0.1, 0.03, 0.05), M["gold"]),
            part("cube", (0.04, 0, -0.03), (0.08, 0.03, 0.04), M["gold"])]


def banner(M):
    return [part("cyl", (0, 0, 2.5), (0.05, 0.05, 1.2), M["iron"], v=6, rot=(0, 90, 0)),
            part("cube", (0, 0.02, 1.7), (1.0, 0.03, 1.6), M["banner"]),
            part("cone", (0, 0.02, 0.8), (1.0, 0.03, 0.4), M["banner"], v=3, rot=(0, 0, 0)),
            part("cube", (0, 0.0, 1.95), (0.35, 0.035, 0.35), M["gold"], rot=(0, 45, 0))]


def brazier(M):
    return [part("cyl", (0, 0, 0.45), (0.12, 0.12, 0.9), M["iron"], v=6),
            part("cone", (0, 0, 0.05), (0.7, 0.7, 0.1), M["iron"], v=6),
            part("cone", (0, 0, 1.0), (0.8, 0.8, 0.3), M["iron"], v=10, r2=0.25, rot=(180, 0, 0)),
            part("ico", (0, 0, 1.1), (0.55, 0.55, 0.2), M["ember"], v=1)]


def candles(M):
    o = []
    for i, (x, y, h) in enumerate(((0, 0, 0.35), (0.12, 0.08, 0.25), (-0.1, 0.07, 0.2), (0.05, -0.11, 0.15))):
        o.append(part("cyl", (x, y, h / 2), (0.08, 0.08, h), M["bone"], v=8))
        o.append(part("sphere", (x, y, h + 0.03), (0.04, 0.04, 0.07), M["flame"], v=6))
    return o


def rubble(M):
    import random
    rnd = random.Random(3)
    return [part("ico", (rnd.uniform(-0.5, 0.5), rnd.uniform(-0.5, 0.5), 0.05), (s, s * 0.9, s * 0.6), M["stone"], v=1,
                 rot=(rnd.uniform(0, 90), rnd.uniform(0, 90), 0))
            for s in [rnd.uniform(0.12, 0.35) for _ in range(8)]]


def spikes(M):
    o = [part("cube", (0, 0, 0.02), (1.9, 1.9, 0.04), M["iron"])]
    for i in range(4):
        for j in range(4):
            o.append(part("cone", (-0.7 + i * 0.47, -0.7 + j * 0.47, 0.25), (0.14, 0.14, 0.5), M["steel"], v=4))
    return o


def main():
    print("== Personnages ==")
    reset(); build_hero(materials())
    reset(); build_skeleton(materials())
    reset(); build_princess(materials())
    print("== Armes ==")
    for f, fn in (("w_rusty.glb", w_rusty), ("w_knight.glb", w_knight), ("w_mace.glb", w_mace),
                  ("w_axe.glb", w_axe), ("w_spear.glb", w_spear), ("w_hammer.glb", w_hammer),
                  ("w_flame.glb", w_flame), ("w_boss.glb", w_boss_blade),
                  ("a_shield.glb", a_shield), ("a_bow.glb", a_bow), ("a_helmet.glb", a_helmet),
                  ("a_crown.glb", a_crown), ("a_arrow.glb", a_arrow)):
        weapon(f, fn)
    print("== Décor ==")
    chest_model()
    portcullis()
    cage()
    for f, fn in (("torch.glb", torch), ("pillar.glb", pillar), ("barrel.glb", barrel), ("crate.glb", crate),
                  ("bones.glb", bones), ("throne.glb", throne), ("coin.glb", coin), ("potion.glb", potion),
                  ("heart.glb", heart_flask), ("key.glb", key), ("banner.glb", banner), ("brazier.glb", brazier),
                  ("candles.glb", candles), ("rubble.glb", rubble), ("spikes.glb", spikes)):
        prop(f, fn)
    save_blend()
    print("Terminé :", OUT)


def save_blend():
    """Sauve les trois personnages animés dans un .blend pour les ouvrir dans Blender."""
    reset()
    M = materials()
    for build, x, act in ((build_hero, 0, "Attack"), (build_skeleton, 2.0, "Walk"), (build_princess, -2.0, "Cheer")):
        rig = build(M, do_export=False)
        rig.location.x = x
        rig.animation_data.action = bpy.data.actions[act] if act in bpy.data.actions else None
    # Un sol, une lumière et une caméra pour un rendu immédiat
    bpy.ops.mesh.primitive_plane_add(size=12)
    bpy.ops.object.light_add(type="SUN", location=(3, -4, 6))
    bpy.context.active_object.data.energy = 3
    bpy.ops.object.camera_add(location=(0, -7.5, 2.6), rotation=(radians(80), 0, 0))
    bpy.context.scene.camera = bpy.context.active_object
    bpy.context.scene.frame_end = 60
    path = os.path.join(ROOT, "blender", "personnages.blend")
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)
    print("  ->", path)


if __name__ == "__main__":
    main()

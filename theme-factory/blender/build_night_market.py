"""M2.22 deterministic Blender prototype. Run: blender -b --python theme-factory/blender/build_night_market.py -- --out /tmp/night-market
Requires Blender 4.x; does not touch the gameplay code or release assets.
"""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector

args = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
out = Path(args[args.index("--out")+1]) if "--out" in args else Path("theme-factory/dist/night-market")
out.mkdir(parents=True, exist_ok=True)
manifest = json.loads((Path(__file__).resolve().parent.parent/"themes/night-market.json").read_text(encoding='utf-8'))
report = {"theme": manifest["id"], "assets": []}

def reset():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for material in list(bpy.data.materials):
        if material.users == 0: bpy.data.materials.remove(material)

def mat(name, color, rough=.72):
    m = bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    bs=m.node_tree.nodes.get("Principled BSDF")
    bs.inputs["Base Color"].default_value=(*color,1)
    bs.inputs["Roughness"].default_value=rough
    return m

def rgb(s):
    return tuple(((int(s[i:i+2],16)/255+0.055)/1.055)**2.4 if int(s[i:i+2],16)/255>0.04045 else int(s[i:i+2],16)/255/12.92 for i in (1,3,5))

def cube(name, loc, scale, material, bevel=.06):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc); o=bpy.context.object; o.name=name
    o.dimensions=scale; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(material)
    if bevel:
        b=o.modifiers.new("soft toy edges","BEVEL"); b.width=bevel; b.segments=2
        o.modifiers.new("weighted normals","WEIGHTED_NORMAL")
    return o

def ball(name, loc, scale, material, segments=12, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=loc)
    o=bpy.context.object; o.name=name; o.scale=scale; o.data.materials.append(material)
    for f in o.data.polygons: f.use_smooth=True
    return o

def cylinder(name, loc, radius, depth, material, vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=loc)
    o=bpy.context.object; o.name=name; o.data.materials.append(material); return o

def make_tile(item):
    reset(); a,b,c=[mat(item["id"]+str(i),rgb(x)) for i,x in enumerate(item["palette"])]
    if item["id"]=="skewer":
        cylinder("wooden-stick",(0,0,.45),.045,.85,c,8)
        for z in (.28,.44,.60): ball("grilled-bite",(0,0,z),(.19,.17,.105),a)
        ball("sauce",(0,-.12,.5),(.055,.025,.055),b)
    elif item["id"]=="cart":
        cube("cart-body",(0,0,.36),(.8,.49,.33),a)
        cube("counter",(0,0,.56),(.88,.55,.065),b)
        for x in (-.29,.29):
            cylinder("wheel",(x,-.3,.17),.12,.06,c)
            cube("awning-post",(x,.18,.89),(.045,.045,.62),c,.01)
        cube("awning",(0,.17,1.2),(.96,.66,.12),a)
        for x in (-.3,0,.3): ball("lantern",(x,-.2,1.11),(.09,.09,.11),b)
    else:
        cube("festival-platform",(0,0,.24),(1.04,.88,.24),c)
        cube("grand-gate-left",(-.39,.13,.7),(.15,.16,.78),a)
        cube("grand-gate-right",(.39,.13,.7),(.15,.16,.78),a)
        cube("grand-gate-top",(0,.13,1.13),(.98,.19,.16),b)
        cube("festival-stall",(0,-.16,.57),(.58,.43,.35),a)
        cube("festival-roof",(0,-.16,.83),(.7,.53,.11),b)
        for x in (-.39,0,.39): ball("festival-lantern",(x,-.25,1.02),(.085,.08,.12),b)
    # Scale applies to the full tile as a group: no baked number glyphs.
    for o in bpy.context.scene.objects: o.scale*=item["scale"]

def export_asset(name, budget):
    bpy.context.view_layer.update()
    meshes=[o for o in bpy.context.scene.objects if o.type=="MESH"]
    # Evaluated mesh counts include modifiers; this is the geometry actually exported.
    deps=bpy.context.evaluated_depsgraph_get()
    triangles=0
    for o in meshes:
        evaluated=o.evaluated_get(deps); mesh=evaluated.to_mesh()
        mesh.calc_loop_triangles(); triangles+=len(mesh.loop_triangles)
        evaluated.to_mesh_clear()
    materials=len({m.name for o in meshes for m in o.data.materials if m})
    path=out/(name+".glb")
    bpy.ops.export_scene.gltf(filepath=str(path),export_format="GLB",export_apply=True)
    size=path.stat().st_size
    limits={"triangles":budget.get("maxTrianglesPerTile",3000),"materials":budget.get("maxMaterialsPerTile",4),"bytes":budget.get("maxAssetBytes",180000)}
    passed=triangles<=limits["triangles"] and materials<=limits["materials"] and size<=limits["bytes"]
    report["assets"].append({"id":name,"triangles":triangles,"materials":materials,"bytes":size,"pass":passed})
    if not passed: raise RuntimeError(f"Asset budget exceeded: {name}: {report['assets'][-1]}")

def board():
    reset()
    wood=mat("warm-wood",rgb("#80513D")); slot=mat("recessed-cell",rgb("#B68D6C")); gold=mat("trim",rgb("#E8BC73"))
    cube("board-foundation",(0,0,-.17),(4.45,4.45,.28),wood)
    cube("board-surface",(0,0,-.015),(4.1,4.1,.07),gold)
    for row in range(4):
        for col in range(4):
            cube("cell-%d-%d"%(row,col),(col-1.5,row-1.5,.035),(.92,.92,.035),slot,.035)
    # All decorative pieces outside the playable 4x4 footprint.
    for x in (-2.43,2.43):
        for y in (-1.65,0,1.65):
            cube("market-post",(x,y,.25),(.10,.10,.50),wood,.015)
            ball("warm-lantern",(x,y,.56),(.12,.12,.15),gold)
    export_asset("board",{"maxTrianglesPerTile":manifest["budgets"]["maxBoardTriangles"],"maxMaterialsPerTile":4,"maxAssetBytes":250000})

def preview():
    world=bpy.context.scene.world or bpy.data.worlds.new("studio")
    bpy.context.scene.world=world; world.use_nodes=True
    world.node_tree.nodes["Background"].inputs["Color"].default_value=(.35,.29,.25,1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value=.8
    bpy.ops.object.light_add(type="AREA",location=(2,-3,6))
    bpy.context.object.data.energy=650; bpy.context.object.data.shape="DISK"; bpy.context.object.data.size=5
    bpy.ops.object.camera_add(location=(5,-7,6))
    camera=bpy.context.object; target=Vector((0,0,.45)); camera.rotation_euler=(target-camera.location).to_track_quat("-Z","Y").to_euler()
    camera.data.type="ORTHO"; camera.data.ortho_scale=2.5; bpy.context.scene.camera=camera
    scene=bpy.context.scene; scene.render.engine="BLENDER_EEVEE"
    scene.render.resolution_x=640; scene.render.resolution_y=640; scene.render.resolution_percentage=100
    scene.render.image_settings.file_format="PNG"

for item in manifest["levels"]:
    make_tile(item)
    export_asset(item["id"],manifest["budgets"])
    preview()
    bpy.context.scene.render.filepath=str(out/(item["id"]+".png"))
    bpy.ops.render.render(write_still=True)
board()
(out/"report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False))

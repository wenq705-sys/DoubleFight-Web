import bpy, math, json, struct, time
from mathutils import Vector
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public'/'assets'/'themes'/'inkdragon'
TILES=OUT/'tiles'
TILES.mkdir(parents=True,exist_ok=True)
START=time.time()
LEVELS=[2,4,8,16,32,64,128,256,512,1024,2048]

def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.curves, bpy.data.meshes, bpy.data.materials):
        pass

def material(name, color, rough=.72, metal=.0, alpha=1.0):
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color=(*color,alpha)
    m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color,alpha)
    bs.inputs['Roughness'].default_value=rough
    bs.inputs['Metallic'].default_value=metal
    if alpha<1:
        bs.inputs['Alpha'].default_value=alpha
        m.surface_render_method='DITHERED'
    return m
INK=material('ink black brush',(0.018,0.022,0.023),.88)
INK2=material('soft diluted ink',(0.16,0.18,0.18),.92)
PAPER=material('warm rice paper',(0.82,0.78,0.66),.96)
PAPER2=material('cool rice paper',(0.64,0.66,0.61),.94)
VERM=material('vermilion cinnabar',(0.58,0.055,0.032),.78)
GOLD=material('aged muted gold',(0.48,0.34,0.11),.58,.16)
WATER=material('pale ink water',(0.24,0.36,0.35),.82)
STONE=material('washed stone',(0.38,0.39,0.36),.95)

def smooth(o):
    if o.type=='MESH':
        for p in o.data.polygons:p.use_smooth=True
    return o

def uv(name,loc,scale,mat,segments=16,rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=loc)
    o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return smooth(o)

def cube(name,loc,scale,mat,bevel=0):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('soft handmade edge','BEVEL');mod.width=bevel;mod.segments=2
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def cone(name,loc,scale,mat,verts=6,rot=(0,0,0)):
    bpy.ops.mesh.primitive_cone_add(vertices=verts,radius1=1,radius2=.12,depth=1,location=loc,rotation=rot)
    o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return smooth(o)
def tube(name,points,radius,mat,res=1):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=res
    c.bevel_depth=radius;c.bevel_resolution=1;c.resolution_u=1;c.use_fill_caps=True
    s=c.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
    for bp,co in zip(s.bezier_points,points):
        bp.co=co;bp.handle_left_type='AUTO';bp.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.data.materials.append(mat)
    bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH')
    return smooth(o)

def disc(name,loc,scale,mat,rot=(math.pi/2,0,0),verts=28):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=1,depth=.035,location=loc,rotation=rot)
    o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return o

def fin(name,loc,scale,mat,rot=(0,0,0)):
    return cone(name,loc,scale,mat,verts=3,rot=rot)

def eye_pair(z=.88, x=.39, y=-.34, size=.06):
    for sx in (-x,x):
        uv('bold ink eye',(sx,y,z),(size,size*.55,size),INK,12,6)

def fish(value):
    tier=LEVELS.index(value)
    paper=value>=16
    body=uv(f'{value} broad readable body',(0,0,.72),(0.58+.018*tier,.34+.01*tier,.47+.025*tier),PAPER if paper else INK2,18,10)
    body.rotation_euler[2]=-.08
    tail=fin('brush fan tail',(0,.37,.71),(.42+.02*tier,.16,.48+.018*tier),INK,rot=(math.pi/2,0,math.pi))
    fin('left brush fin',(-.48,-.02,.58),(.25,.09,.30),INK,rot=(0,.35,-.85))
    fin('right brush fin',(.48,-.02,.58),(.25,.09,.30),INK,rot=(0,-.35,.85))
    eye_pair(.83,.37,-.30,.055)
    if value>=8:
        tube('single calligraphy dorsal',[(-.30,.02,1.02),(0,.01,1.12),(.30,.02,1.02)],.035,INK)
    if value>=16:
        tube('two long whiskers',[(-.34,-.31,.73),(-.64,-.48,.64),(-.79,-.42,.54)],.022,INK)
        tube('two long whiskers R',[(.34,-.31,.73),(.64,-.48,.64),(.79,-.42,.54)],.022,INK)
    if value>=32:
        uv('large cinnabar patch',(-.22,-.30,.82),(.25,.055,.25),VERM,14,7)
        uv('small cinnabar patch',(.25,-.31,.60),(.14,.045,.14),VERM,12,6)
        tube('old gold brow',[(-.22,-.35,.97),(0,-.39,1.04),(.22,-.35,.97)],.026,GOLD)
    return body
def dragon(value):
    tier=LEVELS.index(value)
    final=value==2048
    heroic=value>=512
    pts=[]
    count=8 if final else 6
    for i in range(count):
        a=(-1.0 if final else -.82)+i*(2.0 if final else 1.64)/(count-1)
        z=.38 + .16*i + (.18 if i%2 else 0)
        y=.16*math.sin(i*1.3)
        pts.append((a,y,z))
    body=tube(f'{value} coiled ink dragon',pts,.18 if final else .15,INK if value>=512 else INK2)
    head=uv('oversized dragon head',(pts[-1][0],pts[-1][1]-.09,pts[-1][2]+.14),(.35 if final else .30,.30,.30),PAPER if value>=1024 else INK2,18,10)
    uv('dragon snout',(pts[-1][0],pts[-1][1]-.29,pts[-1][2]+.08),(.25,.18,.14),PAPER if value>=1024 else INK2,14,7)
    for sx in (-.18,.18):
        cone('ink horn',(pts[-1][0]+sx,pts[-1][1],pts[-1][2]+.47),(.08,.08,.32),GOLD if final else INK,verts=5,rot=(0,.22*sx/abs(sx),0))
        uv('dragon eye',(pts[-1][0]+sx*.72,pts[-1][1]-.29,pts[-1][2]+.18),(.055,.035,.055),VERM,10,5)
    tube('left whisker',[(pts[-1][0]-.16,pts[-1][1]-.28,pts[-1][2]+.04),(pts[-1][0]-.55,-.45,pts[-1][2]-.05),(pts[-1][0]-.68,-.25,pts[-1][2]-.20)],.024,INK)
    tube('right whisker',[(pts[-1][0]+.16,pts[-1][1]-.28,pts[-1][2]+.04),(pts[-1][0]+.55,-.45,pts[-1][2]-.05),(pts[-1][0]+.68,-.25,pts[-1][2]-.20)],.024,INK)
    for i in range(1,count-1):
        if i%2: fin('flying brush mane',(pts[i][0],pts[i][1]+.04,pts[i][2]+.20),(.22,.07,.22),VERM if final and i==count-2 else INK,rot=(0,.2,math.pi/2))
    if value>=256:
        tube('ink wave base',[(-.72,.18,.13),(-.30,.31,.05),(.12,.23,.12),(.58,.36,.06)],.055,INK2)
    if heroic:
        for x in (-.45,.15):
            tube('small claw',[(x,-.02,.60),(x-.08,-.30,.47),(x+.08,-.38,.42)],.045,PAPER if value>=1024 else INK)
    if final:
        disc('cinnabar seal',(-.72,.10,.20),(.16,.16,.16),VERM,rot=(0,0,0),verts=16)
        tube('gold spine accent',[(-.62,.02,.62),(-.15,.02,.92),(.32,.01,1.20),(.70,.00,1.48)],.032,GOLD)
    return body

def build_character(value):
    clear()
    fish(value) if value<=128 else dragon(value)
    if value in (2,32,256,2048):
        # Review anchors get an extra silhouette-first brush stroke.
        tube('anchor brush gesture',[(-.62,.19,.11),(-.18,.29,.04),(.30,.24,.09),(.64,.10,.04)],.035,INK)
def export_glb(path):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,
        export_apply=True,export_yup=True,export_animations=False,export_lights=False,export_cameras=False)

def build_board():
    clear()
    cube('heavy inkstone base',(0,0,.52),(2.82,2.82,.16),INK,.10)
    cube('rice paper field',(0,0,.70),(2.48,2.48,.08),PAPER,.06)
    gap=1.065
    for r in range(4):
        for c in range(4):
            x=(c-1.5)*gap;y=(r-1.5)*gap
            cube(f'paper cell {r}-{c}',(x,y,.855),(.46,.46,.025),PAPER2,.045)
            if (r+c)%5==0:
                disc('faint ink watermark',(x+.14,y-.12,.885),(.12,.12,.12),INK2,rot=(0,0,0),verts=12)
    for x,y in [(-2.48,-2.48),(2.48,-2.48),(-2.48,2.48),(2.48,2.48)]:
        disc('old gold corner',(x,y,.78),(.10,.10,.10),GOLD,rot=(0,0,0),verts=12)
    tube('left frame brush',[(-2.54,-2.0,.81),(-2.61,0,.81),(-2.50,2.0,.81)],.035,VERM)
    tube('right frame brush',[(2.54,-2.0,.81),(2.61,0,.81),(2.50,2.0,.81)],.035,VERM)
    export_glb(OUT/'board-4x4.glb')

def build_environment():
    clear()
    disc('ink wash water',(0,0,.18),(5.1,5.1,.15),WATER,rot=(0,0,0),verts=40)
    # Back mountain silhouettes: broad low-poly shapes, readable at phone scale.
    for x,s,z in [(-3.8,1.45,1.15),(-2.1,1.1,1.55),(2.3,1.25,1.35),(4.0,.95,1.0)]:
        cone('washed ink mountain',(x,3.9,z),(s,s*.62,2.1*s),INK2,verts=7)
    # Dragon Gate is the single strong landmark in the home carousel.
    for x in (-1.55,1.55):
        cube('dragon gate pillar',(x,3.25,1.75),(.22,.30,1.55),STONE,.06)
        cube('vermilion gate footing',(x,3.25,.36),(.34,.42,.16),VERM,.04)
    cube('dragon gate lintel',(0,3.25,3.06),(1.85,.34,.24),STONE,.08)
    cube('dragon gate ink roof',(0,3.25,3.42),(2.15,.45,.14),INK,.10)
    for sx in (-1,1):
        cone('roof brush tip',(sx*2.10,3.25,3.44),(.42,.28,.16),INK,verts=4,rot=(0,math.pi/2,0))
    disc('paper moon',(0,4.75,4.15),(1.22,1.22,.20),PAPER,rot=(math.pi/2,0,0),verts=36)
    disc('cinnabar moon seal',(.72,4.70,3.52),(.20,.20,.10),VERM,rot=(math.pi/2,0,0),verts=16)
    # Oversized ink-wave strokes survive the small home-preview render.
    for y,w in [(-3.8,4.1),(-3.25,3.3),(3.0,2.8)]:
        tube('water calligraphy',[(-w,y,.24),(-w*.35,y+.12,.20),(w*.25,y-.10,.23),(w,y+.06,.19)],.045,INK2)
    export_glb(OUT/'environment-mobile.glb')

def build_hero():
    clear()
    # Rebuild the same lightweight landmarks for the non-native Web hero preview.
    disc('hero water',(0,0,.05),(5,5,.1),WATER,rot=(0,0,0),verts=40)
    for x in (-1.55,1.55): cube('hero gate pillar',(x,3.1,1.7),(.22,.3,1.5),STONE,.06)
    cube('hero gate lintel',(0,3.1,3.0),(1.85,.34,.22),STONE,.08)
    cube('hero gate roof',(0,3.1,3.36),(2.15,.44,.13),INK,.08)
    disc('hero moon',(0,4.5,4.0),(1.15,1.15,.15),PAPER,rot=(math.pi/2,0,0),verts=32)
    cube('hero board',(0,0,.25),(2.7,2.7,.14),INK,.08)
    cube('hero paper',(0,0,.45),(2.38,2.38,.05),PAPER,.04)
    anchors=[(2,(-1.45,-.65,.48)),(32,(-.48,-.65,.48)),(256,(.55,-.55,.48)),(2048,(1.45,-.42,.48))]
    for value,offset in anchors:
        before=set(bpy.context.scene.objects)
        fish(value) if value<=128 else dragon(value)
        for o in set(bpy.context.scene.objects)-before:
            o.location.x+=offset[0];o.location.y+=offset[1];o.location.z+=offset[2]
            o.scale*=.62
    bpy.ops.object.light_add(type='AREA',location=(-3,-4,8));key=bpy.context.object;key.data.energy=1050;key.data.shape='DISK';key.data.size=5
    bpy.ops.object.light_add(type='AREA',location=(4,1,5));fill=bpy.context.object;fill.data.energy=650;fill.data.size=4
    bpy.ops.object.camera_add(location=(7.6,-10.8,8.8));cam=bpy.context.object
    def track(o,p): o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
    track(cam,(0,.7,1.25));bpy.context.scene.camera=cam
    sc=bpy.context.scene
    sc.render.engine='BLENDER_EEVEE'
    sc.render.resolution_x=1024;sc.render.resolution_y=1024;sc.render.resolution_percentage=100
    sc.render.image_settings.file_format='PNG';sc.render.filepath=str(OUT/'scene-hero.png')
    sc.world.color=(0.76,0.73,0.65)
    bpy.ops.render.render(write_still=True)

def inspect_glb(path):
    b=path.read_bytes()
    assert b[:4]==b'glTF' and struct.unpack_from('<I',b,4)[0]==2
    assert struct.unpack_from('<I',b,8)[0]==len(b)
    n=struct.unpack_from('<I',b,12)[0]
    j=json.loads(b[20:20+n].decode('utf8'))
    tris=sum(len(m.get('primitives',[])) for m in j.get('meshes',[]))
    return {'bytes':len(b),'meshes':len(j.get('meshes',[])),'primitives':tris}

for value in LEVELS:
    build_character(value)
    target=TILES/f'{value:04d}.glb'
    export_glb(target)
build_board()
build_environment()
build_hero()
report={str(v):inspect_glb(TILES/f'{v:04d}.glb') for v in LEVELS}
report['board']=inspect_glb(OUT/'board-4x4.glb')
report['environment']=inspect_glb(OUT/'environment-mobile.glb')
report['seconds']=round(time.time()-START,1)
(OUT/'slice-build-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print('INKDRAGON_SLICE_RESULT '+json.dumps(report,ensure_ascii=False),flush=True)

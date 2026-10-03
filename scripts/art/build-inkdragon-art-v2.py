import bpy, math, json, struct, time
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public'/'assets'/'themes'/'inkdragon'
TILES=OUT/'tiles'
TILES.mkdir(parents=True,exist_ok=True)
LEVELS=[2,4,8,16,32,64,128,256,512,1024,2048]
START=time.time()

def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)

def mat(name, color, rough=.7, metallic=0.0, emission=None, alpha=1.0):
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes=True
    m.diffuse_color=(*color,alpha)
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color,alpha)
    bs.inputs['Roughness'].default_value=rough
    bs.inputs['Metallic'].default_value=metallic
    if emission:
        bs.inputs['Emission Color'].default_value=(*emission,1)
        bs.inputs['Emission Strength'].default_value=.12
    if alpha<1:
        bs.inputs['Alpha'].default_value=alpha
        m.surface_render_method='DITHERED'
    return m

INK=mat('sumi ink black',(0.012,0.015,0.016),.9)
SOFT=mat('diluted charcoal ink',(0.11,0.12,0.12),.92)
MID=mat('warm grey wash',(0.31,0.30,0.27),.9)
PAPER=mat('rice paper ivory',(0.86,0.82,0.71),.96)
PAPER_LIGHT=mat('rice paper light',(0.95,0.91,0.80),.96)
VERM=mat('cinnabar vermilion',(0.72,0.075,0.035),.74)
GOLD=mat('antique muted gold',(0.56,0.39,0.13),.5,.20)
JADE=mat('ink jade water',(0.23,0.42,0.39),.72)
FOAM=mat('paper foam',(0.88,0.88,0.80),.88)
STONE=mat('washed limestone',(0.48,0.46,0.40),.93)
MIST=mat('soft paper mist',(0.80,0.82,0.77),.95,alpha=.58)
WOOD=mat('dark lacquer wood',(0.07,0.05,0.035),.68)

def smooth(o):
    if o.type=='MESH':
        for p in o.data.polygons:p.use_smooth=True
    return o

def bevel(o,width=.04,segments=2):
    mod=o.modifiers.new('hand softened edge','BEVEL')
    mod.width=width;mod.segments=segments
    bpy.context.view_layer.objects.active=o
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return o
def ellipsoid(name,loc,scale,material,segments=28,rings=16,rot=(0,0,0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=loc, rotation=rot)
    o=bpy.context.object;o.name=name;o.scale=scale
    o.data.materials.append(material)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return smooth(o)

def cube(name,loc,scale,material,width=.04,rot=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(location=loc,rotation=rot)
    o=bpy.context.object;o.name=name;o.scale=scale
    o.data.materials.append(material)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if width: bevel(o,width,2)
    return o

def cyl(name,loc,radius,depth,material,verts=24,rot=(0,0,0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=radius,depth=depth,location=loc,rotation=rot)
    o=bpy.context.object;o.name=name;o.data.materials.append(material)
    return smooth(o)

def cone(name,loc,r1,r2,depth,material,verts=12,rot=(0,0,0)):
    bpy.ops.mesh.primitive_cone_add(vertices=verts,radius1=r1,radius2=r2,depth=depth,location=loc,rotation=rot)
    o=bpy.context.object;o.name=name;o.data.materials.append(material)
    return smooth(o)

def tube(name,points,radius,material,bevel_res=2):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=2
    c.bevel_depth=radius;c.bevel_resolution=bevel_res;c.use_fill_caps=True
    s=c.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
    for bp,co in zip(s.bezier_points,points):
        bp.co=co;bp.handle_left_type='AUTO';bp.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o)
    o.data.materials.append(material)
    bpy.context.view_layer.objects.active=o;o.select_set(True)
    bpy.ops.object.convert(target='MESH')
    return smooth(o)

def leaf(name,center,w,h,depth,material,angle=0.0,skew=0.0):
    # Broad custom brush/fin silhouette facing the gameplay camera.
    cx,cy,cz=center
    pts=[(-.56,0),(-.42,.28),(-.20,.47),(.06,.50),(.34,.31),(.56,0),(.37,-.25),(.12,-.43),(-.16,-.46),(-.40,-.28)]
    ca,sa=math.cos(angle),math.sin(angle)
    verts=[]
    for px,pz in pts:
        x=(px*w + skew*pz*w)
        z=pz*h
        rx=x*ca-z*sa;rz=x*sa+z*ca
        verts.append((cx+rx,cy,cz+rz))
    faces=[tuple(range(len(verts)))]
    me=bpy.data.meshes.new(name+' mesh');me.from_pydata(verts,[],faces);me.update()
    o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o)
    o.data.materials.append(material)
    sol=o.modifiers.new('brush thickness','SOLIDIFY');sol.thickness=depth
    bev=o.modifiers.new('soft brush edge','BEVEL');bev.width=min(w,h)*.035;bev.segments=2
    bpy.context.view_layer.objects.active=o
    bpy.ops.object.modifier_apply(modifier=sol.name)
    bpy.ops.object.modifier_apply(modifier=bev.name)
    return o

def eye(name,x,z,iris=VERM):
    ellipsoid(name,(x,-.285,z),(.065,.040,.065),INK,16,8)
    ellipsoid(name+' glint',(x-.015,-.323,z+.018),(.018,.012,.018),PAPER_LIGHT,10,6)
def whisker(name,points,material=INK,r=.016):
    return tube(name,points,r,material,2)

def fish_body(name,body_mat=PAPER,scale=(.68,.29,.38),loc=(0,0,.60)):
    # Side-view body reads as a fish instead of a front-facing blob.
    body=ellipsoid(name,loc,scale,body_mat,32,18)
    # Taper the tail side and slightly raise the forehead.
    for v in body.data.vertices:
        x=v.co.x
        if x < -0.10:
            factor=max(.62,1+(x+.10)*.42)
            v.co.z*=factor
            v.co.y*=factor
        if x > .30:
            v.co.z*=1.06
    return body

def build_fish(value):
    clear()
    if value<=8:
        body_mat=INK if value==2 else SOFT
        fish_body(f'{value} ink-drop fish',body_mat,(.62,.27,.34),(0,0,.58))
        leaf('broad calligraphy tail',(-.58,.03,.57),.72,.72,.055,INK,angle=.05)
        if value>=4:
            leaf('upper tail stroke',(-.62,.05,.72),.52,.48,.045,SOFT,angle=.55)
        if value>=8:
            leaf('lower tail stroke',(-.62,.06,.43),.52,.48,.045,MID,angle=-.55)
        leaf('belly fin',(-.02,-.02,.31),.34,.28,.035,SOFT,angle=-.25)
        eye('single bright eye',.35,.68,VERM)
        ellipsoid('tiny paper muzzle',(.52,-.03,.56),(.15,.20,.12),PAPER_LIGHT,18,10)
        if value==2:
            leaf('one wet ink flick',(-.20,.08,.86),.30,.22,.025,SOFT,angle=.35)
        return

    body_mat=PAPER_LIGHT if value>=32 else PAPER
    fish_body(f'{value} sculpted koi body',body_mat,(.72,.30,.38),(0,0,.60))
    leaf('upper fan tail',(-.66,.04,.72),.72,.62,.050,INK,angle=.45)
    leaf('lower fan tail',(-.66,.04,.46),.72,.62,.050,SOFT,angle=-.45)
    leaf('dorsal ink fin',(-.05,.02,.91),.48,.30,.038,INK,angle=.05)
    leaf('near pectoral fin',(.10,-.28,.42),.44,.28,.035,VERM if value>=32 else SOFT,angle=-.35)
    eye('koi eye',.38,.70)
    ellipsoid('ivory koi muzzle',(.56,-.02,.58),(.18,.22,.13),PAPER,20,10)
    whisker('left koi barbel',[(.52,-.20,.55),(.72,-.32,.48),(.88,-.28,.42)],INK,.014)
    whisker('right koi barbel',[(.52,.04,.54),(.76,.12,.45),(.88,.06,.37)],INK,.014)
    if value>=32:
        ellipsoid('large cinnabar saddle',(.10,-.287,.72),(.27,.035,.25),VERM,22,10)
        ellipsoid('cinnabar cheek',(.42,-.292,.58),(.14,.030,.13),VERM,18,8)
        whisker('gold brow',[(-.10,-.315,.86),(.10,-.33,.94),(.30,-.31,.88)],GOLD,.020)
    if value>=64:
        leaf('gold dorsal accent',(-.03,-.015,.98),.34,.18,.025,GOLD,angle=.08)
        whisker('long ceremonial barbel',[(.50,-.25,.52),(.83,-.43,.48),(1.00,-.31,.36)],GOLD,.012)
    if value>=128:
        cone('left budding horn',(.30,-.02,.96),.075,.015,.28,INK,10,rot=(0,.30,0))
        cone('right budding horn',(.52,-.02,.91),.065,.012,.24,GOLD,10,rot=(0,-.22,0))
        leaf('neck mane',(.28,.02,.88),.36,.30,.040,INK,angle=.80)
def antler(name,base,scale,flip,material):
    x,y,z=base
    main=[(x,y,z),(x-.12*flip*scale,y+.02,z+.24*scale),(x-.30*flip*scale,y+.04,z+.42*scale)]
    tube(name+' main',main,.030*scale,material,2)
    tube(name+' branch A',[(x-.13*flip*scale,y+.02,z+.24*scale),(x-.02*flip*scale,y+.01,z+.42*scale)],.022*scale,material,2)
    tube(name+' branch B',[(x-.26*flip*scale,y+.04,z+.38*scale),(x-.38*flip*scale,y+.03,z+.52*scale)],.019*scale,material,2)

def dragon_head(center,scale=1.0,final=False):
    x,y,z=center
    head=ellipsoid('dragon sculpted head',(x,y,z),(.37*scale,.29*scale,.31*scale),PAPER_LIGHT if final else SOFT,32,18)
    ellipsoid('dragon long muzzle',(x+.29*scale,y-.05,z-.08*scale),(.30*scale,.235*scale,.135*scale),PAPER,24,12)
    eye('dragon visible eye',x+.12*scale,z+.11*scale)
    ellipsoid('dragon nostril',(x+.49*scale,-.288,z-.03*scale),(.035*scale,.025*scale,.028*scale),INK,12,6)
    leaf('heavy dragon brow',(x+.06*scale,y-.02,z+.22*scale),.32*scale,.15*scale,.034,INK,angle=.10)
    hornmat=GOLD if final else INK
    antler('dragon antler rear',(x-.12*scale,y+.02,z+.22*scale),scale,-1,hornmat)
    antler('dragon antler front',(x+.05*scale,y+.03,z+.24*scale),scale,1,hornmat)
    leaf('dragon ear',(x-.24*scale,y+.02,z+.13*scale),.34*scale,.32*scale,.040,VERM if final else INK,angle=.72)
    leaf('dragon cheek mane',(x-.02*scale,y+.04,z-.01*scale),.52*scale,.40*scale,.045,VERM if final else INK,angle=-.50)
    whisker('dragon long whisker',[(x+.27*scale,y-.22,z-.13*scale),(x+.67*scale,y-.34,z-.18*scale),(x+.92*scale,y-.25,z-.34*scale)],INK,.019*scale)
    whisker('dragon gold whisker',[(x+.22*scale,y+.08,z-.15*scale),(x+.60*scale,y+.14,z-.26*scale),(x+.84*scale,y+.05,z-.41*scale)],GOLD if final else INK,.014*scale)
    return head

def wave_pedestal(final=False):
    tube('front rolling ink wave',[(-.76,-.04,.16),(-.48,-.16,.29),(-.12,-.17,.14),(.20,-.18,.30),(.56,-.10,.15)],.075,INK,2)
    tube('paper foam crest',[(-.60,-.20,.23),(-.36,-.24,.37),(-.06,-.24,.22),(.20,-.24,.38),(.44,-.20,.22)],.035,FOAM,2)
    if final:
        tube('gold water glint',[(-.50,-.26,.14),(-.18,-.28,.20),(.18,-.28,.12),(.48,-.24,.20)],.018,GOLD,2)
def claw(name,base,flip=1,material=PAPER):
    x,y,z=base
    tube(name+' arm',[(x,y,z),(x+.10*flip,y-.08,z-.15),(x+.22*flip,y-.14,z-.16)],.045,material,2)
    for i,dz in enumerate((-.04,.02,.08)):
        tube(name+f' digit{i}',[(x+.20*flip,y-.14,z-.16),(x+(.34+.02*i)*flip,y-.18,z-.16+dz)],.018,material,1)

def build_dragon(value):
    clear()
    final=value>=2048
    high=value>=1024
    heroic=value>=512
    wave_pedestal(final)
    if value==256:
        pts=[(-.62,.03,.30),(-.36,.05,.55),(-.02,.02,.42),(.28,.00,.67),(.10,-.02,.92)]
        radius=.18
    elif value==512:
        pts=[(-.70,.05,.28),(-.42,.02,.62),(-.04,.00,.50),(.35,-.02,.72),(.18,-.04,1.02)]
        radius=.19
    elif value==1024:
        pts=[(-.74,.06,.26),(-.54,.02,.70),(-.12,.00,.82),(.27,-.02,.60),(.52,-.04,.96),(.30,-.05,1.24)]
        radius=.205
    else:
        pts=[(-.70,.08,.30),(-.76,.04,.78),(-.45,.00,1.16),(0,.00,1.28),(.38,-.02,1.04),(.55,-.04,.70),(.42,-.06,.40)]
        radius=.22
    tube(f'{value} calligraphy dragon body',pts,radius,INK if heroic else SOFT,3)
    tx,ty,tz=pts[0]
    leaf('dragon brush tail',(tx-.10,ty+.03,tz+.02),.58 if final else .48,.42 if final else .36,.045,VERM if final else INK,angle=.55)
    # Keep mid-tier dragons as one solid ink silhouette; ivory belly begins only at high tiers.
    if value>=1024:
        belly=[(x,y-.12,z-.05) for x,y,z in pts[1:-1]]
        if len(belly)>=2:tube('ivory belly ribbon',belly,radius*.42,PAPER,2)
    hx,hy,hz=pts[-1]
    dragon_head((hx,hy-.02,hz+.15),1.16 if final else 1.02,final)
    # Broad mane leaves, not dozens of thin hairs.
    for i,(x,y,z) in enumerate(pts[1:-1]):
        if i%2==0:
            leaf('flying mane '+str(i),(x,y+.07,z+.15),.38,.30,.038,VERM if final and i>=2 else INK,angle=.45 if i%4==0 else -.42)
    clawmat=PAPER if high else INK
    claw('front claw',(-.02,-.18,.61),1,clawmat)
    if heroic:claw('rear claw',(-.46,-.12,.67),-1,clawmat)
    if value in (256,512):
        leaf('cinnabar shoulder mane',(hx-.18,hy+.06,hz+.22),.50,.34,.045,VERM,angle=.62)
    if final:
        tube('antique gold spine',[(x,y+.08,z+.13) for x,y,z in pts],.024,GOLD,2)
        # Cinnabar seal grounds the final silhouette without covering the dragon.
        cube('cinnabar final seal',(-.72,.04,.18),(.16,.06,.16),VERM,.025,rot=(0,0,.08))

def build_character(value):
    if value<=128:build_fish(value)
    else:build_dragon(value)

def export_glb(path):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,
        export_apply=True,export_yup=True,export_animations=False,export_lights=False,export_cameras=False)

def rounded_panel(name,loc,scale,material,width=.08):
    return cube(name,loc,scale,material,width)

def brush_mark(name,loc,length,material,angle=0):
    x,y,z=loc
    tube(name,[(x-length*.5,y,z),(x,y-.02,z+.02),(x+length*.5,y,z)],.018,material,1)
def build_board():
    clear()
    rounded_panel('carved black inkstone',(0,0,.48),(2.78,2.78,.18),INK,.14)
    rounded_panel('inner lacquer lip',(0,0,.67),(2.58,2.58,.08),WOOD,.08)
    rounded_panel('warm rice paper field',(0,0,.78),(2.44,2.44,.055),PAPER_LIGHT,.06)
    gap=1.065
    for r in range(4):
        for c in range(4):
            x=(c-1.5)*gap;y=(r-1.5)*gap
            rounded_panel(f'paper tile {r}-{c}',(x,y,.86),(.455,.455,.032),PAPER,.055)
            # restrained hand-drawn mark: visible, but does not compete with pieces
            if (r,c) in ((0,0),(1,2),(3,1)):
                brush_mark('faint fish-water glyph',(x-.16,y-.01,.902),.30,MID,.12*(r+1))
    cube('small cinnabar seal',(2.32,-2.34,.90),(.14,.10,.14),VERM,.025,rot=(0,0,.08))
    for x in (-2.54,2.54):
        tube('vermilion frame stroke',[(x,-2.20,.82),(x*.99,0,.83),(x,2.20,.82)],.030,VERM,1)
    export_glb(OUT/'board-4x4.glb')

def mountain(name,points,y,depth,material):
    # Custom cut-paper silhouette in XZ, softly extruded for real 3D parallax.
    verts=[(x,y,z) for x,z in points]
    faces=[tuple(range(len(verts)))]
    me=bpy.data.meshes.new(name+' mesh');me.from_pydata(verts,[],faces);me.update()
    o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);o.data.materials.append(material)
    sol=o.modifiers.new('mountain depth','SOLIDIFY');sol.thickness=depth
    bev=o.modifiers.new('eroded ridge','BEVEL');bev.width=.035;bev.segments=2
    bpy.context.view_layer.objects.active=o
    bpy.ops.object.modifier_apply(modifier=sol.name);bpy.ops.object.modifier_apply(modifier=bev.name)
    return o
def roof_mesh(name,z,y,width,material):
    verts=[(-width,y,z),(width,y,z),(.84*width,y,z+.12),(.58*width,y,z+.20),
           (0,y,z+.23),(-.58*width,y,z+.20),(-.84*width,y,z+.12)]
    faces=[tuple(range(len(verts)))]
    me=bpy.data.meshes.new(name+' mesh');me.from_pydata(verts,[],faces);me.update()
    o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);o.data.materials.append(material)
    sol=o.modifiers.new('roof depth','SOLIDIFY');sol.thickness=.28
    bev=o.modifiers.new('roof softened','BEVEL');bev.width=.045;bev.segments=2
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=sol.name);bpy.ops.object.modifier_apply(modifier=bev.name)
    return o

def build_environment():
    clear()
    # Smaller footprint than v1: the gate frames the board instead of swallowing the UI.
    cyl('shallow ink-water island',(0,.10,.10),4.85,.18,JADE,48)
    mountain('far pale mountain',[(-4.8,.15),(-4.0,.65),(-3.35,.42),(-2.6,1.40),(-1.9,.55),(-1.2,.20),(-4.8,.15)],3.95,.18,MID)
    mountain('far right mountain',[(1.25,.18),(1.90,.58),(2.55,.42),(3.20,1.20),(4.0,.55),(4.75,.18),(1.25,.18)],4.00,.18,SOFT)
    mountain('near left ink cliff',[(-4.8,.12),(-4.15,.95),(-3.45,1.55),(-2.9,.76),(-2.40,.12),(-4.8,.12)],3.25,.24,INK)
    mountain('near right ink cliff',[(2.35,.12),(2.90,.72),(3.42,1.46),(4.15,.88),(4.8,.12),(2.35,.12)],3.30,.24,INK)
    # Dragon gate: tapered pillars + sculpted roof profile.
    for x in (-1.38,1.38):
        cone('stone gate pillar',(x,3.18,1.42),.23,.17,2.30,STONE,12)
        cube('cinnabar stone shoe',(x,3.18,.31),(.30,.28,.16),VERM,.04)
        cyl('gold pillar collar',(x,3.18,2.36),.23,.08,GOLD,18)
    cube('carved gate beam',(0,3.18,2.40),(1.68,.28,.19),STONE,.07)
    roof_mesh('upturned ink roof',2.62,3.18,2.02,INK)
    # Modest moon and seal: readable landmark, no longer a giant flat circle behind the UI.
    cyl('paper moon',(0,3.82,3.72),.72,.055,PAPER_LIGHT,40,rot=(math.pi/2,0,0))
    cyl('small cinnabar sun seal',(.48,3.77,3.42),.12,.060,VERM,20,rot=(math.pi/2,0,0))
    # Low mist ribbons and a few bold water strokes create ink-wash depth cheaply.
    for i,(yy,zz,ll) in enumerate(((3.65,.54,2.6),(3.78,.86,1.9),(-3.30,.19,3.2))):
        tube('mist ribbon '+str(i),[(-ll,yy,zz),(-ll*.34,yy-.04,zz+.05),(ll*.32,yy,zz-.03),(ll,yy+.02,zz+.02)],.045,MIST,2)
    for i,y in enumerate((-3.55,-3.05)):
        tube('foreground ink current '+str(i),[(-3.8,y,.18),(-1.4,y+.10,.16),(.6,y-.06,.18),(3.8,y+.05,.16)],.026,SOFT,1)
    export_glb(OUT/'environment-mobile.glb')

def set_studio():
    sc=bpy.context.scene
    sc.render.engine='BLENDER_EEVEE'
    sc.render.resolution_x=1024;sc.render.resolution_y=1024;sc.render.resolution_percentage=100
    sc.render.image_settings.file_format='PNG'
    sc.world.color=(0.70,0.69,0.65)
    bpy.ops.object.light_add(type='AREA',location=(-4,-5,9))
    key=bpy.context.object;key.data.energy=1150;key.data.shape='DISK';key.data.size=5
    bpy.ops.object.light_add(type='AREA',location=(4,-1,6))
    fill=bpy.context.object;fill.data.energy=720;fill.data.size=4
    bpy.ops.object.light_add(type='AREA',location=(0,5,5))
    rim=bpy.context.object;rim.data.energy=520;rim.data.size=3
def build_hero():
    # Hero is assembled from the authored GLBs after export, so the preview exactly reflects game assets.
    clear()
    for f in ('environment-mobile.glb','board-4x4.glb'):
        bpy.ops.import_scene.gltf(filepath=str(OUT/f))
    anchors=[(2,(-1.48,-.82,.88)),(32,(-.48,-.82,.88)),(256,(.56,-.78,.88)),(2048,(1.52,-.72,.88))]
    for value,(x,y,z) in anchors:
        before=set(bpy.context.scene.objects)
        bpy.ops.import_scene.gltf(filepath=str(TILES/f'{value:04d}.glb'))
        for o in set(bpy.context.scene.objects)-before:
            o.location.x+=x;o.location.y+=y;o.location.z+=z
            o.scale*=.54
    set_studio()
    bpy.ops.object.camera_add(location=(7.2,-11.4,8.2))
    cam=bpy.context.object
    cam.rotation_euler=(Vector((0,.55,.90))-cam.location).to_track_quat('-Z','Y').to_euler()
    bpy.context.scene.camera=cam
    bpy.context.scene.render.filepath=str(OUT/'scene-hero.png')
    bpy.ops.render.render(write_still=True)

def build_anchor_sheet():
    clear()
    positions=[(-2.25,0,0),( -.72,0,0),(.85,0,0),(2.35,0,0)]
    for value,(x,_,_) in zip((2,32,256,2048),positions):
        before=set(bpy.context.scene.objects)
        bpy.ops.import_scene.gltf(filepath=str(TILES/f'{value:04d}.glb'))
        for o in set(bpy.context.scene.objects)-before:
            o.location.x+=x;o.location.z+=.15
            o.scale*=.82
    set_studio()
    bpy.ops.object.camera_add(location=(6.6,-12.8,5.1))
    cam=bpy.context.object;cam.data.lens=58
    cam.rotation_euler=(Vector((0,0,.75))-cam.location).to_track_quat('-Z','Y').to_euler()
    bpy.context.scene.camera=cam
    bpy.context.scene.render.filepath=str(OUT/'anchor-review.png')
    bpy.ops.render.render(write_still=True)
def inspect(path):
    b=path.read_bytes();assert b[:4]==b'glTF' and struct.unpack_from('<I',b,4)[0]==2
    n=struct.unpack_from('<I',b,12)[0]
    j=json.loads(b[20:20+n].decode('utf8'))
    return {'bytes':len(b),'meshes':len(j.get('meshes',[])),'materials':len(j.get('materials',[]))}

for value in LEVELS:
    build_character(value)
    export_glb(TILES/f'{value:04d}.glb')
build_board()
build_environment()
build_hero()
build_anchor_sheet()
report={str(v):inspect(TILES/f'{v:04d}.glb') for v in LEVELS}
report['board']=inspect(OUT/'board-4x4.glb')
report['environment']=inspect(OUT/'environment-mobile.glb')
report['seconds']=round(time.time()-START,1)
(OUT/'slice-build-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print('INKDRAGON_ART_V2 '+json.dumps(report,ensure_ascii=False),flush=True)

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

def mat(name,color,rough=.8,metal=0.0):
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes=True
    m.diffuse_color=(*color,1)
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Roughness'].default_value=rough
    bs.inputs['Metallic'].default_value=metal
    return m

INK=mat('V3 deep sumi',(0.006,0.008,0.009),.94)
PAPER=mat('V3 bright rice paper',(0.96,0.91,0.76),.97)
VERM=mat('V3 saturated cinnabar',(0.78,0.055,0.022),.74)
GOLD=mat('V3 antique gold',(0.62,0.40,0.10),.48,.22)
STONE=mat('V3 warm stone',(0.35,0.33,0.28),.92)
WATER=mat('V3 pale jade water',(0.55,0.69,0.64),.90)
MIST=mat('V3 fog paper',(0.82,0.83,0.76),.95)
SHADOW=mat('V3 ink shadow',(0.035,0.035,0.032),.93)
WOOD=mat('V3 lacquer blackwood',(0.035,0.022,0.014),.76)

def bevel(o,w=.025,segments=2):
    mod=o.modifiers.new('hand-bevel','BEVEL');mod.width=w;mod.segments=segments
    bpy.context.view_layer.objects.active=o
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def profile(name,pts,y,depth,material,bevel_w=.025):
    verts=[(x,y,z) for x,z in pts]
    me=bpy.data.meshes.new(name+' mesh');me.from_pydata(verts,[],[tuple(range(len(verts)))]);me.update()
    o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);o.data.materials.append(material)
    sol=o.modifiers.new('paper thickness','SOLIDIFY');sol.thickness=depth
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=sol.name)
    if bevel_w:bevel(o,bevel_w,2)
    return o
def tube(name,points,radius,material,res=2):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=2
    c.bevel_depth=radius;c.bevel_resolution=res;c.use_fill_caps=True
    s=c.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
    for bp,co in zip(s.bezier_points,points):
        bp.co=co;bp.handle_left_type='AUTO';bp.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.data.materials.append(material)
    bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH')
    return o

def ellipse(name,loc,scale,material,segments=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=12,location=loc)
    o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(material)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for p in o.data.polygons:p.use_smooth=True
    return o

def cube(name,loc,scale,material,b=.03,rot=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(location=loc,rotation=rot)
    o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(material)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return bevel(o,b,2) if b else o

def cyl(name,loc,radius,depth,material,verts=28,rot=(0,0,0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=radius,depth=depth,location=loc,rotation=rot)
    o=bpy.context.object;o.name=name;o.data.materials.append(material)
    return bevel(o,.015,1)

def eye(x,z,size=.055):
    ellipse('bold ink eye',(x,-.11,z),(size,.038,size),INK,16)
    ellipse('eye glint',(x-.012,-.145,z+.016),(size*.24,.014,size*.24),PAPER,12)

def tail_fan(name,cx,cz,w,h,material,split=0):
    if split==0:
        pts=[(cx-w*.55,cz),(cx-w*.18,cz+h*.52),(cx+w*.46,cz+h*.38),(cx+w*.56,cz),
             (cx+w*.38,cz-h*.40),(cx-w*.12,cz-h*.52)]
        profile(name,pts,.03,.10,material,.025)
    else:
        pts1=[(cx,cz),(cx-w*.12,cz+h*.12),(cx-w*.18,cz+h*.55),(cx+w*.48,cz+h*.40),(cx+w*.56,cz+h*.05)]
        pts2=[(cx,cz),(cx-w*.12,cz-h*.12),(cx-w*.18,cz-h*.55),(cx+w*.48,cz-h*.40),(cx+w*.56,cz-h*.05)]
        profile(name+' upper',pts1,.04,.10,material,.022);profile(name+' lower',pts2,.04,.10,material,.022)
def fish_base(name,body_pts,material=PAPER,y=0.0,depth=.22):
    profile(name,body_pts,y,depth,material,.035)

def build_tier_2():
    # Giant droplet + one broad stroke tail: unmistakable at 50px.
    body=[(-.38,.35),(-.10,.48),(.30,.40),(.52,.16),(.44,-.15),(.12,-.36),(-.28,-.30),(-.50,-.02)]
    fish_base('2 giant ink drop',body,INK)
    tail_fan('2 brush tail',-.50,.01,.62,.60,INK)
    profile('2 vermilion cheek',[(.19,.19),(.42,.16),(.40,-.02),(.18,-.05)],-.12,.035,VERM,.012)
    eye(.29,.24,.050)

def build_tier_4():
    # Diamond/kite fish; body silhouette differs completely from tier 2.
    body=[(-.42,.05),(-.08,.48),(.39,.31),(.55,.03),(.35,-.30),(-.10,-.45)]
    fish_base('4 paper kite fish',body,PAPER)
    tail_fan('4 black flag tail',-.43,.03,.70,.46,INK)
    profile('4 ink dorsal',[(-.12,.43),(.12,.66),(.28,.38)],.02,.08,INK,.018)
    eye(.33,.19,.052)

def build_tier_8():
    # Very short body + huge split tail.
    body=[(-.28,.32),(.05,.43),(.44,.27),(.54,.02),(.42,-.27),(.03,-.39),(-.30,-.27)]
    fish_base('8 compact twin-tail fish',body,INK)
    tail_fan('8 enormous split tail',-.32,.02,.86,.74,PAPER,split=1)
    profile('8 cinnabar forehead',[(.14,.40),(.39,.28),(.32,.10),(.08,.16)],-.12,.035,VERM,.012)
    eye(.30,.18,.054)

def build_tier_16():
    # Tall white carp with an almost sail-like dorsal fin and long ventral ribbon.
    body=[(-.46,.22),(-.20,.54),(.10,.62),(.42,.44),(.58,.12),(.46,-.26),(.12,-.48),(-.25,-.42),(-.54,-.10)]
    fish_base('16 tall white spirit carp',body,PAPER)
    tail_fan('16 single black fan',-.50,.00,.66,.58,INK)
    profile('16 tall dorsal sail',[(-.16,.50),(.02,.92),(.28,.52)],.03,.08,INK,.018)
    tube('16 long ventral ribbon',[(-.02,-.04,-.35),(.12,-.08,-.60),(.44,-.06,-.72)],.025,VERM,1)
    eye(.34,.31,.055)
def build_tier_32():
    # Iconic red-white-black koi: one huge red saddle survives phone downsampling.
    body=[(-.52,.22),(-.28,.49),(.08,.56),(.45,.39),(.62,.08),(.50,-.27),(.13,-.47),(-.28,-.40),(-.58,-.08)]
    fish_base('32 white cinnabar koi',body,PAPER)
    tail_fan('32 split ink tail',-.55,.00,.72,.62,INK,split=1)
    profile('32 huge cinnabar saddle',[(-.06,.52),(.27,.47),(.42,.22),(.24,-.03),(-.10,.02),(-.26,.26)],-.125,.038,VERM,.014)
    profile('32 black dorsal',[(-.26,.43),(-.08,.72),(.18,.50)],.03,.08,INK,.018)
    eye(.38,.27,.058)
    tube('32 long koi whisker',[(.54,-.09,.02),(.82,-.13,-.03),(1.00,-.08,-.16)],.018,INK,1)

def build_tier_64():
    # Big square head, gold crest, long whiskers; body is deliberately shorter.
    body=[(-.54,.18),(-.36,.45),(-.02,.52),(.30,.37),(.40,.03),(.27,-.33),(-.08,-.44),(-.45,-.30)]
    fish_base('64 dragon-carp short body',body,INK)
    tail_fan('64 ivory banner tail',-.52,-.01,.70,.56,PAPER)
    profile('64 oversized ivory head',[(.18,.42),(.53,.40),(.72,.19),(.68,-.16),(.40,-.31),(.15,-.12)],-.12,.045,PAPER,.025)
    profile('64 gold crown crest',[(.22,.40),(.36,.75),(.49,.43)],-.135,.040,GOLD,.014)
    eye(.50,.22,.060)
    tube('64 twin gold whisker',[(.62,-.10,.01),(.92,-.15,-.04),(1.08,-.10,-.20)],.022,GOLD,1)
    tube('64 twin black whisker',[(.58,.03,-.05),(.89,.07,-.12),(1.05,.05,-.28)],.017,INK,1)

def build_tier_128():
    # Antlers occupy 1/3 model height; cannot be mistaken for tier 64.
    body=[(-.52,.16),(-.32,.42),(.00,.48),(.28,.34),(.36,.03),(.24,-.30),(-.10,-.41),(-.44,-.26)]
    fish_base('128 horned dragon carp',body,INK)
    tail_fan('128 vermilion brush tail',-.50,0,.62,.54,VERM)
    profile('128 ivory armored face',[(.15,.37),(.48,.38),(.66,.17),(.62,-.15),(.37,-.28),(.13,-.09)],-.12,.045,PAPER,.024)
    eye(.45,.21,.060)
    # Huge branched antlers.
    for flip in (-1,1):
        bx=.28+.12*(flip+1)/2
        tube('128 antler main '+str(flip),[(bx,.00,.35),(bx-.12*flip,.02,.68),(bx-.34*flip,.03,.94)],.035,GOLD,2)
        tube('128 antler fork '+str(flip),[(bx-.12*flip,.02,.68),(bx+.05*flip,.02,.89)],.027,GOLD,2)
        tube('128 antler tine '+str(flip),[(bx-.27*flip,.03,.86),(bx-.42*flip,.03,1.03)],.023,GOLD,2)
    tube('128 long whisker',[(.56,-.09,.02),(.90,-.14,-.03),(1.10,-.10,-.22)],.020,INK,1)
def wave_base(label,wide=1.0):
    # Solid base read as "standing on wave", not thin random lines.
    pts=[(-.80*wide,.00),(-.62*wide,.22),(-.36*wide,.10),(-.12*wide,.30),(.14*wide,.12),(.38*wide,.28),(.70*wide,.06),(.78*wide,-.08),(-.76*wide,-.08)]
    profile(label+' ink wave',pts,.07,.13,INK,.030)
    pts2=[(-.58*wide,.12),(-.40*wide,.24),(-.22*wide,.16),(.02*wide,.31),(.20*wide,.16),(.40*wide,.25),(.56*wide,.12)]
    profile(label+' paper foam',pts2,-.07,.055,PAPER,.018)

def dragon_head(label,cx,cz,scale=1.0,final=False,branched=True,head_material=None):
    # Profile-based Chinese dragon head, huge relative to body.
    head=[(cx-.34*scale,cz+.28*scale),(cx-.12*scale,cz+.46*scale),(cx+.18*scale,cz+.42*scale),
          (cx+.40*scale,cz+.25*scale),(cx+.62*scale,cz+.15*scale),(cx+.70*scale,cz-.02*scale),
          (cx+.54*scale,cz-.16*scale),(cx+.22*scale,cz-.18*scale),(cx-.08*scale,cz-.30*scale),
          (cx-.34*scale,cz-.12*scale)]
    headmat=head_material or (PAPER if final else INK)
    profile(label+' huge dragon head',head,-.13,.17,headmat,.032)
    muzzle=[(cx+.38*scale,cz+.10*scale),(cx+.78*scale,cz+.08*scale),(cx+.88*scale,cz-.05*scale),
            (cx+.72*scale,cz-.18*scale),(cx+.38*scale,cz-.15*scale)]
    profile(label+' long dragon muzzle',muzzle,-.155,.075,PAPER,.018)
    eye(cx+.30*scale,cz+.24*scale,.055*scale)
    profile(label+' brow',[(cx+.10*scale,cz+.33*scale),(cx+.38*scale,cz+.40*scale),(cx+.50*scale,cz+.29*scale)],-.17,.060,INK,.014)
    # Horn language changes by evolution tier: short jiao horns first, branched dragon antlers later.
    hornmat=GOLD if final else VERM
    if branched:
        tube(label+' antler A',[(cx-.05*scale,0,cz+.38*scale),(cx-.18*scale,.02,cz+.72*scale),(cx-.48*scale,.03,cz+.92*scale)],.038*scale,hornmat,2)
        tube(label+' antler A fork',[(cx-.18*scale,.02,cz+.72*scale),(cx+.02*scale,.02,cz+.94*scale)],.030*scale,hornmat,2)
        tube(label+' antler B',[(cx+.10*scale,0,cz+.39*scale),(cx+.27*scale,.02,cz+.70*scale),(cx+.52*scale,.03,cz+.88*scale)],.036*scale,hornmat,2)
        tube(label+' antler B fork',[(cx+.27*scale,.02,cz+.70*scale),(cx+.15*scale,.02,cz+.98*scale)],.028*scale,hornmat,2)
    else:
        tube(label+' short horn A',[(cx-.04*scale,0,cz+.38*scale),(cx-.12*scale,.01,cz+.61*scale)],.048*scale,GOLD,2)
        tube(label+' short horn B',[(cx+.12*scale,0,cz+.38*scale),(cx+.20*scale,.01,cz+.59*scale)],.046*scale,GOLD,2)
    profile(label+' cheek mane',[(cx-.30*scale,cz+.16*scale),(cx-.52*scale,cz+.30*scale),(cx-.47*scale,cz+.02*scale),(cx-.64*scale,cz-.12*scale),(cx-.28*scale,cz-.18*scale)],.02,.10,VERM if final else PAPER,.022)
    tube(label+' whisker',[(cx+.60*scale,-.12,cz-.05*scale),(cx+.96*scale,-.14,cz-.12*scale),(cx+1.12*scale,-.10,cz-.34*scale)],.020*scale,GOLD if final else PAPER,1)
def build_tier_256():
    # Squat four-legged jiao. No fish silhouette at all.
    wave_base('256',.88)
    torso=[(-.56,.20),(-.40,.42),(-.06,.48),(.28,.35),(.45,.10),(.34,-.18),(.00,-.28),(-.40,-.16)]
    profile('256 stout ink torso',torso,.02,.25,INK,.040)
    tail=[(-.50,.14),(-.78,.32),(-.90,.18),(-.70,.02),(-.92,-.12),(-.68,-.20),(-.44,-.08)]
    profile('256 broad brush tail',tail,.04,.18,VERM,.030)
    dragon_head('256',.25,.28,.70,False,False,PAPER)
    for x in (-.30,.16):
        profile('256 thick claw '+str(x),[(x,.02),(x+.12,-.24),(x+.25,-.28),(x+.18,-.08)],-.12,.11,INK,.018)

def build_tier_512():
    # C silhouette: thick continuous coil + head at upper right.
    wave_base('512',.96)
    pts=[(-.62,0,.08),(-.82,0,.38),(-.70,0,.76),(-.36,0,.98),(.02,0,.94),(.32,0,.70),(.22,0,.40)]
    tube('512 unmistakable C coil',pts,.20,INK,3)
    profile('512 cinnabar tail blade',[(-.68,.10),(-.94,.26),(-.92,-.08),(-.66,-.18)],.04,.15,VERM,.024)
    dragon_head('512',.30,.55,.76,False,True,PAPER)
    profile('512 front claw',[(.05,.44),(.18,.14),(.40,.04),(.34,.28)],-.13,.11,PAPER,.018)

def build_tier_1024():
    # Tall S silhouette. Head is physically higher than all previous tiers.
    wave_base('1024',.98)
    pts=[(-.64,0,.05),(-.34,0,.32),(.08,0,.28),(.40,0,.58),(.22,0,.94),(-.12,0,1.18),(.22,0,1.42)]
    tube('1024 vertical S dragon',pts,.205,INK,3)
    profile('1024 gold tail flame',[(-.62,.12),(-.92,.32),(-.86,-.06),(-.58,-.18)],.04,.15,GOLD,.024)
    dragon_head('1024',.22,1.44,.82,False,True,VERM)
    profile('1024 ivory belly shield',[(-.08,.45),(.18,.38),(.26,.68),(.05,.78),(-.16,.66)],-.13,.09,PAPER,.018)
    profile('1024 flying vermilion mane',[(.05,1.24),(-.18,1.48),(-.10,1.10),(-.34,.98),(.06,.98)],.03,.10,VERM,.020)

def build_tier_2048():
    # Ring silhouette fills the tile. Final head is the focal point, not a tiny appendage.
    wave_base('2048',1.06)
    pts=[(-.64,0,.14),(-.78,0,.55),(-.62,0,1.02),(-.22,0,1.30),(.28,0,1.28),(.60,0,1.00),(.70,0,.62),(.52,0,.30)]
    tube('2048 monumental ring dragon',pts,.24,INK,3)
    profile('2048 cinnabar tail flag',[(-.62,.18),(-.98,.44),(-.92,.02),(-.58,-.12)],.04,.18,VERM,.028)
    dragon_head('2048',.48,.52,.94,True,True,PAPER)
    tube('2048 gold spine',[(-.70,.02,.56),(-.48,.02,1.00),(-.12,.02,1.28),(.28,.02,1.23),(.58,.02,.94)],.030,GOLD,2)
    profile('2048 huge vermilion mane',[(.14,.76),(-.20,1.00),(-.10,.62),(-.38,.44),(.12,.42)],.02,.13,VERM,.026)
    profile('2048 ivory claw',[(.10,.45),(.25,.12),(.52,.02),(.42,.32)],-.13,.12,PAPER,.018)
    profile('2048 seal',[(-.78,.14),(-.48,.14),(-.48,-.16),(-.78,-.16)],-.10,.09,VERM,.018)

BUILDERS={2:build_tier_2,4:build_tier_4,8:build_tier_8,16:build_tier_16,32:build_tier_32,64:build_tier_64,
          128:build_tier_128,256:build_tier_256,512:build_tier_512,1024:build_tier_1024,2048:build_tier_2048}
def export_glb(path):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,
        export_apply=True,export_yup=True,export_animations=False,export_lights=False,export_cameras=False)

def build_board():
    clear()
    cube('V3 carved inkstone',(0,0,.48),(2.80,2.80,.18),INK,.14)
    cube('V3 blackwood inner lip',(0,0,.67),(2.60,2.60,.08),WOOD,.07)
    cube('V3 bright paper field',(0,0,.78),(2.46,2.46,.055),PAPER,.055)
    gap=1.065
    for r in range(4):
        for c in range(4):
            x=(c-1.5)*gap;y=(r-1.5)*gap
            cube(f'V3 tile {r}-{c}',(x,y,.86),(.455,.455,.030),PAPER,.050)
            # dark lower edge improves grid readability without outlining every cell.
            cube(f'V3 tile shadow {r}-{c}',(x,y+.435,.835),(.43,.022,.022),SHADOW,.008)
    for x in (-2.53,2.53):
        tube('V3 cinnabar frame stroke',[(x,-2.2,.82),(x*.99,0,.84),(x,2.2,.82)],.033,VERM,1)
    cube('V3 large corner seal',(2.31,-2.31,.90),(.16,.10,.16),VERM,.025,rot=(0,0,.08))
    export_glb(OUT/'board-4x4.glb')

def build_mountain(name,pts,y,depth,material):
    profile(name,pts,y,depth,material,.035)

def build_environment():
    clear()
    cyl('V3 jade ink pool',(0,.08,.10),4.82,.18,WATER,48)
    # Three high-contrast cut-paper mountain layers instead of generic triangles.
    build_mountain('V3 far paper ridge',[(-4.8,.10),(-4.2,.42),(-3.6,.30),(-2.9,.90),(-2.2,.36),(-1.2,.12),(-4.8,.10)],3.95,.14,STONE)
    build_mountain('V3 left ink cliff',[(-4.8,.08),(-4.3,.70),(-3.9,1.45),(-3.45,.88),(-3.02,1.72),(-2.45,.46),(-2.15,.08)],3.38,.22,INK)
    build_mountain('V3 right ink cliff',[(2.00,.08),(2.55,.56),(2.92,1.48),(3.38,.82),(3.85,1.62),(4.35,.65),(4.8,.08)],3.42,.22,INK)
    # Dragon Gate itself is a single calligraphic arch: two thick brush-pillars + swept top.
    tube('V3 left brush gate',[(-1.55,3.22,.28),(-1.66,3.20,1.18),(-1.52,3.18,2.20)],.17,INK,3)
    tube('V3 right brush gate',[(1.55,3.22,.28),(1.65,3.20,1.16),(1.52,3.18,2.18)],.17,INK,3)
    tube('V3 sweeping dragon gate',[(-1.58,3.18,2.20),(-.92,3.15,2.50),(0,3.14,2.58),(.92,3.15,2.50),(1.58,3.18,2.20)],.15,INK,3)
    # Gold joints + one cinnabar seal make the landmark intentional.
    for x in (-1.56,1.56):
        cyl('V3 gate gold joint '+str(x),(x,3.18,.40),.22,.08,GOLD,20)
    cube('V3 gate seal',(1.12,3.04,2.24),(.15,.055,.15),VERM,.025,rot=(0,0,.10))
    # Moon is intentionally small and off-axis.
    cyl('V3 small paper moon',(-.66,3.70,3.12),.48,.045,PAPER,36,rot=(math.pi/2,0,0))
    cyl('V3 moon cinnabar dot',(-.38,3.66,2.92),.09,.050,VERM,20,rot=(math.pi/2,0,0))
    # Large, few ink currents; no thin white spaghetti.
    tube('V3 foreground current A',[(-3.8,-3.45,.17),(-1.7,-3.36,.16),(.4,-3.47,.18),(3.7,-3.36,.16)],.032,INK,1)
    tube('V3 foreground current B',[(-3.4,-2.95,.16),(-1.0,-2.88,.18),(1.3,-3.00,.16),(3.4,-2.92,.17)],.020,GOLD,1)
    export_glb(OUT/'environment-mobile.glb')
def set_studio():
    sc=bpy.context.scene;sc.render.engine='BLENDER_EEVEE'
    sc.render.resolution_x=1100;sc.render.resolution_y=850;sc.render.resolution_percentage=100
    sc.render.image_settings.file_format='PNG';sc.world.color=(0.72,0.70,0.64)
    bpy.ops.object.light_add(type='AREA',location=(-4,-5,9));bpy.context.object.data.energy=1200;bpy.context.object.data.size=5
    bpy.ops.object.light_add(type='AREA',location=(5,-1,6));bpy.context.object.data.energy=700;bpy.context.object.data.size=4

def import_asset(path,offset=(0,0,0),scale=1):
    before=set(bpy.context.scene.objects);bpy.ops.import_scene.gltf(filepath=str(path))
    for o in set(bpy.context.scene.objects)-before:
        o.location.x+=offset[0];o.location.y+=offset[1];o.location.z+=offset[2];o.scale*=scale

def build_anchor_sheet():
    clear()
    for v,x in zip((2,32,256,2048),(-2.65,-.85,.95,2.72)):
        import_asset(TILES/f'{v:04d}.glb',(x,0,.15),.82)
    set_studio()
    bpy.ops.object.camera_add(location=(6.3,-13.4,4.5));cam=bpy.context.object;cam.data.lens=60
    cam.rotation_euler=(Vector((0,0,.70))-cam.location).to_track_quat('-Z','Y').to_euler();bpy.context.scene.camera=cam
    bpy.context.scene.render.filepath=str(OUT/'anchor-review-v3.png');bpy.ops.render.render(write_still=True)

def build_full_tier_sheet():
    clear()
    xs=[-3.1,-1.55,0,1.55,3.1]; zs=[1.35,-.45,-2.15]
    for i,v in enumerate(LEVELS):
        row=i//5;col=i%5
        import_asset(TILES/f'{v:04d}.glb',(xs[col],0,zs[row]),.68)
    set_studio()
    bpy.ops.object.camera_add(location=(7.5,-15.5,7.0));cam=bpy.context.object;cam.data.lens=62
    cam.rotation_euler=(Vector((0,0,-.20))-cam.location).to_track_quat('-Z','Y').to_euler();bpy.context.scene.camera=cam
    bpy.context.scene.render.filepath=str(OUT/'all-tiers-review-v3.png');bpy.ops.render.render(write_still=True)

def build_hero():
    clear();import_asset(OUT/'environment-mobile.glb');import_asset(OUT/'board-4x4.glb')
    for v,off in [(2,(-1.48,-.80,.90)),(32,(-.45,-.78,.90)),(256,(.62,-.78,.90)),(2048,(1.55,-.70,.90))]:
        import_asset(TILES/f'{v:04d}.glb',off,.52)
    set_studio();bpy.context.scene.render.resolution_x=1024;bpy.context.scene.render.resolution_y=1024
    bpy.ops.object.camera_add(location=(7.1,-11.6,8.0));cam=bpy.context.object
    cam.rotation_euler=(Vector((0,.45,.92))-cam.location).to_track_quat('-Z','Y').to_euler();bpy.context.scene.camera=cam
    bpy.context.scene.render.filepath=str(OUT/'scene-hero.png');bpy.ops.render.render(write_still=True)


def build_mobile_board_review():
    clear()
    import_asset(OUT/'environment-mobile.glb')
    import_asset(OUT/'board-4x4.glb')
    cells=[(-1.60,1.60),(-.53,1.60),(.53,1.60),(1.60,1.60),
           (-1.60,.53),(-.53,.53),(.53,.53),(1.60,.53),
           (-1.60,-.53),(-.53,-.53),(.53,-.53)]
    for v,(x,zoff) in zip(LEVELS,cells):
        import_asset(TILES/f'{v:04d}.glb',(x,-zoff,.90),.70)
    set_studio()
    sc=bpy.context.scene;sc.render.resolution_x=720;sc.render.resolution_y=1280
    bpy.ops.object.camera_add(location=(0,-10.5,10.4));cam=bpy.context.object;cam.data.lens=49
    cam.rotation_euler=(Vector((0,0,.65))-cam.location).to_track_quat('-Z','Y').to_euler()
    bpy.context.scene.camera=cam
    sc.render.filepath=str(OUT/'mobile-board-review-v3.png')
    bpy.ops.render.render(write_still=True)

def inspect(path):
    b=path.read_bytes();assert b[:4]==b'glTF'
    n=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+n].decode('utf8'))
    return {'bytes':len(b),'meshes':len(j.get('meshes',[])),'materials':len(j.get('materials',[]))}

for v in LEVELS:
    clear();BUILDERS[v]();export_glb(TILES/f'{v:04d}.glb')
build_board();build_environment();build_anchor_sheet();build_full_tier_sheet();build_hero();build_mobile_board_review()
report={str(v):inspect(TILES/f'{v:04d}.glb') for v in LEVELS}
report['board']=inspect(OUT/'board-4x4.glb');report['environment']=inspect(OUT/'environment-mobile.glb')
report['seconds']=round(time.time()-START,1)
(OUT/'slice-build-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print('INKDRAGON_ART_V3 '+json.dumps(report,ensure_ascii=False),flush=True)

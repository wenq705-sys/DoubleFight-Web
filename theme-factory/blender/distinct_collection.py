"""Eleven silhouette-distinct night-market diorama collectibles. Blender 5.x."""
import bpy, math
from pathlib import Path
from mathutils import Vector
OUT=Path(__file__).resolve().parent.parent/'dist'/'night-market'
def material(n,c,metal=0,emission=0):
 m=bpy.data.materials.get(n) or bpy.data.materials.new(n);m.diffuse_color=(*c,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=.36
 if emission:p.inputs['Emission Color'].default_value=(*c,1);p.inputs['Emission Strength'].default_value=emission
 return m
ivory=material('steamed ivory',(.96,.79,.56));red=material('cinnabar lacquer',(.72,.045,.035));gold=material('antique gold',(.82,.48,.10),.65);jade=material('celadon jade',(.09,.47,.38),.22);dark=material('dark walnut',(.15,.075,.048));ink=material('ink enamel',(.04,.045,.058));white=material('silk white',(.95,.90,.77));pink=material('blush',(.95,.28,.26));orange=material('roasted orange',(.92,.30,.055));blue=material('glazed blue',(.08,.29,.53),.18);light=material('lantern glow',(1,.48,.08),0,2);purple=material('opera violet',(.40,.13,.52))
def ball(n,p,s,m):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,location=p);o=bpy.context.object;o.name=n;o.scale=s;o.data.materials.append(m);return o
def cone(n,p,a,b,h,m,v=16):
 bpy.ops.mesh.primitive_cone_add(vertices=v,radius1=a,radius2=b,depth=h,location=p);o=bpy.context.object;o.name=n;o.data.materials.append(m);return o
def box(n,p,s,m):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.name=n;o.dimensions=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m);b=o.modifiers.new('carved soft edge','BEVEL');b.width=.024;b.segments=2;return o
def rod(n,a,b,r,m):
 v=Vector(b)-Vector(a);bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=r,depth=v.length,location=(Vector(a)+Vector(b))/2);o=bpy.context.object;o.name=n;o.rotation_euler=v.to_track_quat('Z','Y').to_euler();o.data.materials.append(m);return o
def torus(n,p,major,minor,m):
 bpy.ops.mesh.primitive_torus_add(major_segments=24,minor_segments=8,location=p,major_radius=major,minor_radius=minor);o=bpy.context.object;o.name=n;o.data.materials.append(m);return o
def face(y,z,x=.15):
 for side in (-1,1):
  ball('eye',(side*x,y,z),(.045,.025,.058),ink);ball('eye glint',(side*x-.012,y-.026,z+.020),(.012,.007,.014),white)
 ball('smile',(0,y-.015,z-.12),(.065,.012,.022),dark)
def pedestal(i):
 cone('carved walnut plinth',(0,0,.07),.50,.46,.14,dark,32);cone('gold filigree rim',(0,0,.155),.49,.47,.028,gold,32)
 for j in range(8):a=j*math.tau/8;ball('rank rivet',(.465*math.cos(a),.465*math.sin(a),.16),(.016,.016,.014),gold)
def hat(z,m=red):
 cone('traditional pointed hat',(0,0,z),.32,.035,.26,m);cone('hat brim',(0,0,z-.13),.38,.34,.025,gold)
def feet():
 for x in (-.16,.16):ball('feet',(x,-.05,.25),(.11,.13,.07),dark)
def lantern(x,y,z):
 ball('silk lantern',(x,y,z),(.13,.12,.19),red);ball('lantern light',(x,y-.12,z),(.09,.025,.12),light)
 cone('lantern crown',(x,y,z+.20),.095,.07,.05,gold);rod('lantern tassel',(x,y,z-.20),(x,y,z-.36),.009,gold)
def batch_export(name):
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
 for o in meshes:
  bpy.ops.object.select_all(action='DESELECT');o.select_set(True)
  bpy.context.view_layer.objects.active=o
  bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
  for mod in list(o.modifiers):
   try:bpy.ops.object.modifier_apply(modifier=mod.name)
   except RuntimeError:pass
 groups={}
 for o in meshes:groups.setdefault(tuple(m.name for m in o.data.materials),[]).append(o)
 for k,items in groups.items():
  if len(items)<2:continue
  bpy.ops.object.select_all(action='DESELECT')
  for o in items:o.select_set(True)
  bpy.context.view_layer.objects.active=items[0];bpy.ops.object.join()
 path=OUT/(name+'.glb');bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_apply=True)
 print('COLLECTIBLE',name,len(meshes),'objects ->',len(groups),'material groups',path.stat().st_size,'bytes')
names=['01-night-newcomer','02-candied-hawthorn','03-raccoon-grill','04-lantern-rabbit','05-fox-teahouse','06-panda-chef','07-opera-diva','08-golden-toad','09-dragon-boat','10-phoenix-pavilion','11-night-market-king']
for i,name in enumerate(names):
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);pedestal(i)
 if i==0:
  ball('dumpling',(0,0,.53),(.33,.27,.28),ivory);face(-.26,.65);feet()
  for x in (-.22,-.14,-.07,0,.07,.14,.22):ball('pleated pastry crown',(x,.015,.79),(.055,.12,.085),ivory)
  cone('bamboo steamer',(0,0,.26),.40,.37,.13,gold);rod('held bamboo skewer',(.27,-.15,.43),(.43,-.17,.96),.015,dark)
  for z in (.67,.80,.92):ball('grilled bite',(.34,-.16,z),(.06,.06,.05),orange)
 elif i==1:
  ball('hawthorn vendor',(0,0,.56),(.27,.23,.28),pink);face(-.23,.66);feet();hat(.99)
  box('candy tray',(0,-.33,.38),(.55,.24,.11),gold)
  for x in (-.33,-.12,.12,.33):
   rod('candy stick',(x,-.12,.40),(x*1.25,-.12,1.34),.014,dark)
   for z in (.82,.98,1.14):ball('translucent candy',(x*1.2,-.12,z),(.08,.075,.085),red)
 elif i==2:
  ball('raccoon torso',(0,0,.60),(.31,.26,.33),orange);ball('masked raccoon head',(0,-.04,.96),(.30,.25,.26),orange)
  for x in (-.17,.17):ball('raccoon mask',(x,-.255,1.01),(.11,.03,.09),ink)
  face(-.29,.99);feet();ball('ringtail',(.43,.15,.57),(.23,.18,.14),dark)
  box('charcoal grill',(0,-.43,.32),(.72,.30,.23),dark)
  for x in (-.22,0,.22):
   rod('skewer',(x,-.64,.39),(x,-.24,.39),.012,gold)
   for y in (-.54,-.44,-.34):ball('grilled meat',(x,y,.43),(.065,.045,.045),orange)
  for x in (-.2,.1,.25):ball('fire ember',(x,-.39,.45),(.045,.04,.075),light)
 elif i==3:
  ball('rabbit body',(0,.02,.55),(.28,.24,.28),white);ball('rabbit face',(0,-.07,.89),(.29,.24,.26),white);face(-.29,.92);feet()
  for x in (-.17,.17):ball('tall rabbit ear',(x,.01,1.34),(.095,.09,.34),white);ball('ear lining',(x,-.073,1.35),(.052,.017,.23),pink)
  rod('lantern pole',(.37,.10,.30),(.40,.10,1.62),.022,gold);lantern(.40,-.06,1.40)
  for x in (-.36,.36):ball('silk bow',(x,-.15,.49),(.10,.045,.065),red)
 elif i==4:
  ball('fox body',(0,0,.55),(.29,.26,.30),red);ball('fox face',(0,-.08,.94),(.29,.25,.27),orange);face(-.31,.94);feet()
  for x in (-.25,.25):cone('fox pointed ear',(x,-.01,1.22),.13,.015,.34,orange)
  for x in (-.44,.43):ball('bushy fox tail',(x,.24,.63),(.20,.18,.33),orange)
  cone('blue porcelain teapot',(.30,-.38,.43),.17,.11,.19,blue);torus('teapot handle',(.44,-.35,.50),.11,.025,gold)
  for x in (-.27,-.07):cone('tea cup',(x,-.39,.34),.09,.065,.11,jade)
  box('folding fan',(-.39,-.28,.76),(.21,.035,.33),gold)
 elif i==5:
  ball('panda torso',(0,0,.55),(.34,.27,.32),white);ball('panda head',(0,-.02,.95),(.34,.29,.29),white)
  for x in (-.26,.26):ball('black ear',(x,0,1.16),(.12,.10,.13),ink);ball('eye patch',(x*.64,-.29,1.0),(.10,.032,.11),ink)
  face(-.32,.99);feet();hat(1.36,gold);box('chef apron',(0,-.27,.50),(.39,.055,.37),ivory)
  cone('wok',(0,-.43,.36),.28,.15,.13,ink);torus('wok lip',(0,-.43,.43),.26,.022,gold)
  for x in (-.18,0,.18):ball('noodle garnish',(x,-.45,.46),(.06,.05,.035),orange)
  rod('chef ladle',(.36,-.2,.49),(.54,-.27,1.06),.023,gold)
 elif i==6:
  ball('opera robe',(0,0,.54),(.29,.24,.34),purple);ball('opera porcelain face',(0,-.06,.96),(.22,.18,.24),white);face(-.22,.98,.11)
  for x in (-.25,.25):ball('elaborate hair bun',(x,-.02,1.18),(.14,.11,.13),ink)
  for x in (-.31,-.16,0,.16,.31):cone('opera jeweled crown',(x,-.01,1.32-abs(x)*.15),.055,.01,.20,gold)
  for x in (-.4,.4):ball('flowing water sleeve',(x,-.19,.56),(.26,.12,.36),white)
  box('miniature stage',(0,.15,.25),(.85,.42,.12),red)
  for x in (-.38,.38):rod('stage pillar',(x,.25,.28),(x,.25,1.32),.025,gold)
  box('stage roof',(0,.25,1.35),(.92,.48,.12),red)
 elif i==7:
  ball('golden toad',(0,0,.55),(.40,.35,.26),gold)
  for x in (-.26,.26):ball('bulging eye',(x,-.23,.77),(.13,.12,.13),jade);ball('pupil',(x,-.34,.79),(.035,.018,.04),ink)
  for x,y in [(-.32,-.16),(.32,-.16),(0,.32)]:ball('three toad legs',(x,y,.33),(.16,.15,.10),gold)
  box('merchant abacus',(0,-.46,.31),(.68,.18,.15),dark)
  for x in (-.24,-.12,0,.12,.24):
   rod('abacus rail',(x,-.53,.29),(x,-.39,.29),.009,gold)
   ball('abacus bead',(x,-.46,.29),(.027,.03,.035),red)
  for x in (-.33,.33):cone('stacked coins',(x,.24,.30),.12,.12,.12,gold)
  cone('fortune crown',(0,0,.96),.24,.055,.20,red)
 elif i==8:
  box('dragon boat hull',(0,0,.41),(.64,1.02,.26),dark);cone('dragon prow',(0,-.55,.51),.24,.045,.40,jade)
  ball('dragon head',(0,-.70,.70),(.23,.22,.20),jade);ball('dragon muzzle',(0,-.89,.65),(.15,.10,.11),gold)
  for x in (-.12,.12):ball('dragon eye',(x,-.85,.76),(.036,.026,.042),red)
  for y in (-.33,-.08,.17,.42):
   for x in (-.34,.34):rod('boat oar',(x,y,.49),(x*1.8,y-.10,.30),.018,gold)
  ball('general torso',(0,.05,.77),(.20,.18,.22),red);ball('general head',(0,-.03,1.03),(.16,.15,.16),ivory)
  cone('general helmet',(0,-.02,1.21),.18,.02,.20,gold);rod('battle flag',(0,.35,.53),(0,.35,1.65),.025,gold);box('war banner',(0,.33,1.48),(.35,.045,.26),red)
 elif i==9:
  box('floating phoenix pavilion',(0,.08,.45),(.72,.64,.30),jade)
  for x in (-.29,.29):
   for y in (-.19,.26):rod('pavilion pillar',(x,y,.55),(x,y,1.16),.025,gold)
  box('glazed pavilion roof',(0,.05,1.20),(.88,.78,.13),blue)
  for x in (-.36,.36):cone('upturned roof finial',(x,.05,1.28),.07,.008,.17,gold)
  ball('phoenix core',(0,-.11,1.46),(.19,.14,.20),orange);ball('phoenix head',(0,-.24,1.62),(.10,.09,.10),gold)
  for x in (-1,1):
   for j in range(4):
    wing=ball('layered phoenix feather',(x*(.27+j*.12),-.02,1.52+j*.065),(.19,.055,.08),red if j%2 else gold);wing.rotation_euler[1]=x*.24
  for j in range(5):
   a=j*math.tau/5;ball('floating spirit flame',(.52*math.cos(a),.40*math.sin(a),.55+j*.15),(.055,.05,.08),light)
 elif i==10:
  ball('ox emperor torso',(0,0,.67),(.39,.32,.40),red);ball('ox head',(0,-.06,1.08),(.36,.29,.30),dark);ball('broad muzzle',(0,-.33,.98),(.26,.10,.13),ivory)
  for x in (-.17,.17):ball('emperor eye',(x,-.32,1.15),(.052,.025,.045),gold)
  for x in (-.32,.32):
   h=cone('swept imperial horn',(x,.02,1.45),.14,.005,.45,ivory);h.rotation_euler[1]=(-1 if x<0 else 1)*.52
   ball('golden pauldron',(x*1.35,-.04,.93),(.18,.17,.14),gold)
  box('imperial armor crest',(0,-.34,.77),(.34,.055,.35),gold)
  cone('imperial crown',(0,-.03,1.52),.24,.06,.30,gold)
  box('royal throne back',(0,.35,.81),(.82,.14,.92),gold)
  for x in (-.36,.36):cone('throne dragon finial',(x,.35,1.33),.11,.008,.28,red)
  for j in range(9):
   a=j*math.tau/9;ball('floating royal ember',(.57*math.cos(a),.34*math.sin(a),.65+j*.09),(.055,.05,.08),light)
 batch_export(name)


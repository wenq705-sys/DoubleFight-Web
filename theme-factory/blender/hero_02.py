"""Level 2 hero art pass: a complete steamed-bun market-stall miniature, not a reskinned cube."""
import bpy, math, random
from pathlib import Path
from mathutils import Vector
random.seed(20260929)
D=Path(__file__).resolve().parent.parent/'dist'/'night-market'
def mat(n,c,metal=0,emit=0,rough=.4):
 m=bpy.data.materials.new(n);m.diffuse_color=(*c,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if emit:p.inputs['Emission Color'].default_value=(*c,1);p.inputs['Emission Strength'].default_value=emit
 return m
wood=mat('weathered carved walnut',(.23,.105,.056),rough=.7);dark=mat('dark roof beams',(.10,.055,.038));roof=mat('blue glazed ceramic',(.105,.20,.255),.16);gold=mat('aged brass trim',(.70,.39,.10),.7);ivory=mat('translucent steamed dough',(.96,.77,.54),rough=.27);pink=mat('warm blushing cheeks',(.94,.29,.23));ink=mat('face enamel',(.075,.039,.025));red=mat('silk red',(.72,.045,.03));light=mat('lit amber lantern',(1,.44,.09),0,2);stone=mat('cobblestone',(.34,.32,.30),rough=.85);bamboo=mat('bamboo slat',(.66,.38,.14),rough=.7);jade=mat('teapot celadon',(.13,.38,.29),.22);white=mat('highlight cream',(1,.95,.79))
def cube(n,p,s,m,b=.02):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.name=n;o.dimensions=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
 if b:mod=o.modifiers.new('soft carved edges','BEVEL');mod.width=b;mod.segments=2
 return o
def ball(n,p,s,m):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,location=p);o=bpy.context.object;o.name=n;o.scale=s;o.data.materials.append(m);return o
def cone(n,p,r1,r2,h,m):
 bpy.ops.mesh.primitive_cone_add(vertices=20,radius1=r1,radius2=r2,depth=h,location=p);o=bpy.context.object;o.name=n;o.data.materials.append(m);return o
def rod(n,a,b,r,m):
 v=Vector(b)-Vector(a);bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=r,depth=v.length,location=(Vector(a)+Vector(b))/2);o=bpy.context.object;o.name=n;o.rotation_euler=v.to_track_quat('Z','Y').to_euler();o.data.materials.append(m)
def torus(n,p,r,t,m):
 bpy.ops.mesh.primitive_torus_add(major_segments=28,minor_segments=8,location=p,major_radius=r,minor_radius=t);bpy.context.object.name=n;bpy.context.object.data.materials.append(m)
def bun(p,s=.09,eyes=True):
 x,y,z=p;ball('hand pinched steamed bun',(x,y,z),(s,s*.86,s*.74),ivory)
 for k in range(7):
  a=k*math.tau/7;ball('seven individually pinched pleats',(x+math.cos(a)*s*.38,y+math.sin(a)*s*.33,z+s*.62),(.015,.018,.023),ivory)
 if eyes:
  for dx in (-.025,.025):ball('tiny sesame eye',(x+dx,y-s*.82,z+.01),(.008,.005,.009),ink)
  ball('tiny blush',(x-.04,y-s*.79,z-.009),(.014,.005,.007),pink)
def lantern(x,y,z):
 ball('ribbed lantern core',(x,y,z),(.095,.08,.145),red)
 for j in range(8):
  a=j*math.tau/8;rod('lantern gold ribs',(x+.078*math.cos(a),y+.065*math.sin(a),z-.09),(x+.078*math.cos(a),y+.065*math.sin(a),z+.09),.005,gold)
 ball('warm lantern glow',(x,y-.075,z),(.065,.017,.105),light)
 cone('top brass fitting',(x,y,z+.155),.055,.037,.032,gold);rod('lantern tassel',(x,y,z-.15),(x,y,z-.32),.008,gold)
def tray(x,y,z,stack=1):
 for k in range(stack):
  zz=z+k*.115;cone('woven bamboo steamer body',(x,y,zz),.195,.18,.092,bamboo)
  for j in range(18):
   a=j*math.tau/18;rod('fine woven bamboo wall',(x+.185*math.cos(a),y+.185*math.sin(a),zz-.033),(x+.185*math.cos(a),y+.185*math.sin(a),zz+.034),.004,dark)
  torus('steamer rim',(x,y,zz+.045),.19,.013,gold)
 for dx,dy in [(-.08,-.035),(.075,-.02),(0,.07)]:bun((x+dx,y+dy,z+(stack-1)*.115+.105),.065)
# Exhibition foundation: staggered wet cobbles, warm brass collector rim.
cone('circular bronze collector base',(0,0,.045),1.03,1.01,.09,dark)
torus('machined brass edge',(0,0,.09),1.015,.017,gold)
for ix in range(-5,6):
 for iy in range(-4,5):
  x=ix*.175+(iy%2)*.085;y=iy*.175
  if x*x+y*y<.90**2:cube('irregular individual cobblestone',(x,y,.119),(.17,.166,.047+random.random()*.012),stone,.014)
# Structural stall: four actual timber posts, cross braces, upturned tile roof.
for x in (-.68,.68):
 for y in (-.39,.43):
  rod('aged vertical timber column',(x,y,.16),(x,y,1.47),.043,wood)
  ball('brass post ferrule',(x,y,1.39),(.059,.059,.05),gold)
for y in (-.39,.43):rod('wooden horizontal lintel',(-.75,y,1.40),(.75,y,1.40),.045,wood)
for x in (-.68,.68):rod('side diagonal braces',(x,-.39,1.05),(x,.43,1.37),.023,wood)
cube('deep roof foundation',(0,.03,1.49),(1.68,1.00,.105),dark)
for side in (-1,1):
 for k in range(9):
  y=-.43+k*.108
  for j in range(8):
   x=side*(.055+j*.103)
   tile=cube('individual curved glazed roof tile',(x,y,1.55+(.12*(j/8)**2)),(.103,.10,.028),roof,.009)
   tile.rotation_euler[1]=side*.18
 for y in (-.46,.47):
  rod('swept eave ridge',(side*.76,y,1.61),(side*.90,y,1.72),.026,gold)
 ball('roof scroll finial',(side*.90,-.45,1.72),(.047,.048,.045),gold)
rod('top brass roof crest',(-.70,.03,1.67),(.70,.03,1.67),.027,gold)
# Central carved timber fascia with rivets, pendant and sign frame.
cube('central shop sign',(0,-.455,1.35),(.83,.075,.225),bamboo)
cube('sign upper brass fillet',(0,-.50,1.465),(.89,.018,.015),gold)
for x in (-.39,.39):
 for z in (1.26,1.44):ball('sign brass rivet',(x,-.505,z),(.015,.009,.015),gold)
for x in (-.67,.67):lantern(x,-.49,1.09)
for x in (-.44,.44):cube('hanging fabric banner',(x,-.465,.96),(.115,.023,.31),red,.008)
# Solid foreground shop counter, cross-lapped front panels, linen, display chalkboard.
cube('counter tabletop',(0,-.37,.48),(1.29,.38,.09),wood)
for x in (-.54,-.18,.18,.54):cube('counter hand carved vertical panel',(x,-.57,.29),(.27,.045,.31),dark)
for z in (.19,.40):cube('counter brass horizontal inlay',(0,-.598,z),(1.20,.015,.015),gold,.004)
cube('embroidered linen front',(0,-.603,.35),(.42,.014,.20),ivory,.006)
for x in (-.12,0,.12):ball('embroidered dumpling motif',(x,-.62,.36),(.029,.009,.023),red)
# Character: recognisable plump dough mascot, chef headband, tiny limbs and face.
ball('large artisan dumpling mascot',(0,.12,.76),(.31,.265,.31),ivory)
for k in range(9):
 a=k*math.tau/9;ball('hero pinched crown pleat',(.19*math.cos(a),.12+.15*math.sin(a),1.035),(.065,.063,.085),ivory)
torus('artisan headband',(0,.12,1.00),.245,.025,wood)
for x in (-.115,.115):
 ball('closed smiling eye',(x,-.146,.84),(.050,.014,.021),ink)
 ball('rosy cheek',(x*1.65,-.115,.77),(.065,.013,.034),pink)
ball('open delighted mouth',(0,-.153,.755),(.060,.014,.067),red)
ball('tongue',(0,-.168,.72),(.028,.008,.019),pink)
for x in (-.32,.32):
 ball('short chef arm',(x,-.06,.66),(.105,.085,.077),ivory)
 ball('tiny round hand',(x*1.10,-.14,.66),(.060,.057,.055),ivory)
for x in (-.15,.15):ball('soft dough feet',(x,.01,.46),(.11,.12,.07),ivory)
# Serving tray at right, steam stack, ceramic pots, market lamps and plants.
tray(.35,-.34,.58,2);tray(-.40,-.36,.58,1)
tray(.54,.22,.35,3)
for x,y,z in [(.30,-.32,.94),(.40,-.31,1.05),(.52,-.29,1.15)]:
 for k in range(3):ball('stylized curling steam puff',(x+.025*math.sin(k),y,z+k*.052),(.025+k*.005,.021,.040),white)
cone('celadon teapot',(-.61,.14,.34),.13,.085,.20,jade)
torus('teapot curled handle',(-.74,.14,.38),.075,.013,gold)
for x in (-.73,.71):lantern(x,-.65,.36)
for x,y in [(-.75,.20),(.78,.23)]:
 cone('ceramic plant pot',(x,y,.25),.08,.055,.13,roof)
 for j in range(5):
  a=j*math.tau/5;ball('little sculpted leaf',(x+.055*math.cos(a),y+.055*math.sin(a),.37),(.022,.045,.065),jade)
# Batching keeps many hand-authored props mobile-compatible.
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
for o in meshes:
 bpy.context.view_layer.objects.active=o
 for mod in list(o.modifiers):
  try:bpy.ops.object.modifier_apply(modifier=mod.name)
  except RuntimeError:pass
groups={}
for o in meshes:groups.setdefault(tuple(m.name for m in o.data.materials),[]).append(o)
for items in groups.values():
 if len(items)<2:continue
 bpy.ops.object.select_all(action='DESELECT')
 for o in items:o.select_set(True)
 bpy.context.view_layer.objects.active=items[0];bpy.ops.object.join()
path=D/'flagship-02-dumpling.glb';bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_apply=True)
print('HERO02',len(meshes),'sculpted objects',len(groups),'material groups',path.stat().st_size,'bytes')


"""Hand-authored procedural collectible mascots: dumpling, panda chef, ox festival boss."""
import bpy, math
from pathlib import Path
from mathutils import Vector
out=Path(__file__).resolve().parent.parent/'dist'/'night-market'
def clear():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(n,c,emit=0,metal=0):
 m=bpy.data.materials.get(n) or bpy.data.materials.new(n);m.diffuse_color=(*c,1);m.use_nodes=True
 b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*c,1);b.inputs['Roughness'].default_value=.43;b.inputs['Metallic'].default_value=metal
 if emit:b.inputs['Emission Color'].default_value=(*c,1);b.inputs['Emission Strength'].default_value=emit
 return m
ivory=mat('warm ivory',(.95,.72,.46));white=mat('cream fur',(.91,.85,.72));black=mat('ink fur',(.045,.039,.052));red=mat('lacquer red',(.63,.035,.025));gold=mat('gilded metal',(.75,.4,.075),metal=.55);brown=mat('caramel roast',(.42,.12,.035));dark=mat('carved base',(.13,.09,.08));pink=mat('cheek blush',(.9,.24,.20));fire=mat('magical ember',(1,.25,.025),1.7)
def ball(n,p,s,m,seg=16):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=10,location=p);o=bpy.context.object;o.name=n;o.scale=s;o.data.materials.append(m);return o
def cube(n,p,s,m):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.name=n;o.dimensions=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
 bevel=o.modifiers.new('soft sculpted edges','BEVEL');bevel.width=.035;bevel.segments=2;o.modifiers.new('weighted normals','WEIGHTED_NORMAL');return o
def cone(n,p,r1,r2,depth,m,verts=12):
 bpy.ops.mesh.primitive_cone_add(vertices=verts,radius1=r1,radius2=r2,depth=depth,location=p);o=bpy.context.object;o.name=n;o.data.materials.append(m);return o
def rod(a,b,r,m,n='rod'):
 v=Vector(b)-Vector(a);bpy.ops.mesh.primitive_cylinder_add(vertices=9,radius=r,depth=v.length,location=(Vector(a)+Vector(b))/2)
 o=bpy.context.object;o.name=n;o.rotation_euler=v.to_track_quat('Z','Y').to_euler();o.data.materials.append(m)
def base():
 cone('tiered collectible pedestal',(0,0,.09),.46,.39,.16,dark,24)
 cone('gold edge',(0,0,.18),.43,.42,.035,gold,24)
def eyes(y=-.40,z=.77,x=.17):
 for xx in (-x,x):
  ball('expressive dark eye',(xx,y,z),(.055,.036,.075),black)
  ball('eye highlight',(xx-.018,y-.032,z+.027),(.015,.009,.018),white,10)
def export(n):
 # Each collectible is a static pose: collapse material-identical parts to reduce draws.
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
 for o in meshes:
  bpy.context.view_layer.objects.active=o
  for modifier in list(o.modifiers):
   try:bpy.ops.object.modifier_apply(modifier=modifier.name)
   except RuntimeError:pass
 groups={}
 for o in meshes:groups.setdefault(tuple(m.name for m in o.data.materials),[]).append(o)
 for key,items in groups.items():
  if len(items)<2:continue
  bpy.ops.object.select_all(action='DESELECT')
  for o in items:o.select_set(True)
  bpy.context.view_layer.objects.active=items[0];bpy.ops.object.join()
  bpy.context.object.name=n+' batched '+('-'.join(key) if key else 'plain')
 print('COLLECTIBLE BATCH',n,len(meshes),'->',len([o for o in bpy.context.scene.objects if o.type=='MESH']))
 bpy.ops.export_scene.gltf(filepath=str(out/(n+'.glb')),export_format='GLB',export_apply=True)
 print(n,(out/(n+'.glb')).stat().st_size)
clear();base()
# A dumpling mascot with pleated crown, determined eyebrows and handheld skewers.
ball('dumpling body',(0,0,.56),(.34,.29,.30),ivory)
for i in range(7):
 x=(i-3)*.083
 ball('sculpted dumpling pleat',(x,.025,.82+(.06-abs(x)*.17)),(.055,.13,.095),ivory,12)
eyes();ball('smiling mouth',(0,-.294,.60),(.058,.012,.025),brown)
for x in (-.23,.23):
 ball('rosy cheek',(x,-.255,.63),(.055,.016,.035),pink)
 ball('tiny hand',(x*1.42,-.08,.51),(.085,.08,.075),ivory)
 ball('little foot',(x*.72,-.09,.29),(.095,.13,.065),brown)
rod((.34,-.15,.47),(.48,-.18,1.03),.018,dark,'held skewer')
for z in (.70,.82,.93):ball('glazed grilled bite',(.41+(z-.7)*.30,-.17,z),(.075,.065,.048),brown,12)
for x in (-.15,.15):cube('determined eyebrow',(x,-.328,.87),(.11,.025,.022),brown)
# Embroidered festival sash and contrasting toasted pleat tips.
cube('scarlet festival waist sash',(0,-.245,.43),(.43,.065,.065),red)
ball('sash gold clasp',(0,-.289,.43),(.045,.015,.038),gold,12)
for x in (-.24,-.16,-.08,0,.08,.16,.24):
 ball('toasted pleat tip',(x,-.018,.88-abs(x)*.17),(.027,.045,.027),brown,10)
for i in range(3):
 ball('sauce glaze highlight',(.41+i*.035,-.233,.72+i*.105),(.025,.012,.018),gold,10)
export('premium-dumpling')
clear();base()
# Panda street chef: straw hat, apron, ladle and noodle bowl.
ball('panda torso',(0,0,.51),(.33,.27,.32),white)
ball('oversized panda head',(0,-.025,.91),(.36,.30,.31),white)
for x in (-.26,.26):
 ball('round panda ear',(x,-.012,1.13),(.12,.095,.13),black)
 ball('eye patch',(x*.63,-.29,.96),(.105,.032,.12),black)
 ball('dark eye',(x*.63,-.323,.97),(.036,.017,.047),white)
 ball('panda arm',(x*1.32,-.07,.55),(.11,.11,.17),black)
 ball('short boot',(x*.74,-.09,.26),(.12,.13,.075),black)
ball('muzzle',(0,-.306,.81),(.15,.055,.095),white)
ball('button nose',(0,-.359,.86),(.042,.022,.031),black)
cone('woven straw hat',(0,-.015,1.23),.45,.035,.24,gold,18)
cone('hat brim',(0,-.015,1.13),.49,.42,.035,brown,24)
cube('red neckerchief',(0,-.285,.66),(.25,.06,.085),red)
ball('ceramic noodle bowl',(-.25,-.37,.44),(.20,.15,.09),red)
for i in range(4):
 ball('noodle garnish',(-.37+i*.08,-.43,.50),(.048,.04,.022),gold,10)
rod((.43,-.10,.47),(.52,-.24,.94),.02,gold,'chef ladle handle')
ball('ladle cup',(.53,-.25,.94),(.10,.08,.035),dark)
# Chef apron, stitched gold hem and woven hat ring.
cube('cream chef apron',(0,-.262,.47),(.35,.045,.35),ivory)
cube('apron lower hem',(0,-.292,.31),(.37,.047,.027),gold)
for x in (-.12,.12):rod((x,-.28,.59),(x,-.285,.34),.012,red,'apron stitching')
for i in range(12):
 t=i*math.tau/12
 ball('hat woven trim',(.43*math.cos(t),-.015+.43*math.sin(t),1.14),(.045,.045,.019),gold,8)
ball('cheek warmth',(-.23,-.296,.82),(.055,.016,.027),pink)
ball('cheek warmth',(.23,-.296,.82),(.055,.016,.027),pink)
export('premium-panda')
clear();base()
# Final tier: crowned ox guardian, armored silhouette, horns and swirling ember ornaments.
ball('ox armored torso',(0,0,.64),(.39,.32,.42),red)
ball('ox head',(0,-.06,1.05),(.36,.29,.31),brown)
ball('broad pale muzzle',(0,-.325,.96),(.25,.11,.14),ivory)
for x in (-.12,.12):
 ball('nostril',(x,-.423,.96),(.025,.012,.017),dark)
for x in (-.19,.19):
 ball('fierce eye',(x,-.314,1.12),(.066,.027,.047),white)
 ball('pupil',(x,-.339,1.12),(.028,.012,.035),black)
 cube('angular gold brow',(x,-.314,1.20),(.16,.04,.035),gold)
 ball('ear',(x*1.75,-.03,1.14),(.14,.09,.075),red)
 horn=cone('swept ivory horn',(x*1.57,.025,1.40),.13,.006,.40,ivory,12);horn.rotation_euler[1]=(-1 if x<0 else 1)*.45
 ball('armored gauntlet',(x*2.05,-.08,.67),(.14,.13,.18),gold)
 ball('heavy boot',(x*1.05,-.12,.28),(.15,.17,.11),dark)
cube('chest ornament',(0,-.315,.70),(.30,.055,.28),gold)
cone('crown center',(0,-.04,1.43),.20,.065,.26,gold,10)
for x in (-.19,.19):cone('crown side spire',(x,-.04,1.37),.085,.015,.19,gold,8)
for i in range(7):
 t=i/6*math.pi*1.55
 ball('floating ember '+str(i),(.53*math.cos(t),.27*math.sin(t),.45+i*.12),(.065,.055,.085),fire,10)
rod((.44,-.16,.67),(.57,-.23,1.31),.025,gold,'ceremonial skewer')
for z in (.92,1.06,1.19):ball('roasted festival delicacy',(.51,-.21,z),(.082,.07,.056),brown,12)
# Ornate armor: pauldrons, belt, golden studs, layered mantle and horn rings.
for x in (-.39,.39):
 ball('golden shoulder pauldron',(x,-.025,.91),(.18,.18,.12),gold)
 ball('red armor inset',(x,-.13,.94),(.10,.045,.055),red)
 for z in (.47,.56,.65):
  ball('gauntlet rivet',(x*1.25,-.195,z),(.026,.013,.026),gold,10)
cube('heavy champion belt',(0,-.278,.43),(.65,.085,.10),dark)
cube('bull crest belt buckle',(0,-.332,.43),(.18,.04,.12),gold)
for x in (-.28,.28):
 cone('hanging brocade tassel',(x,-.22,.30),.065,.015,.24,red,10)
for x in (-.32,.32):
 ball('engraved horn base ring',(x,.01,1.25),(.13,.12,.045),gold,12)
export('premium-ox')

"""Eleven individually exported collectible evolution sculptures, based on three authored mascot families."""
import bpy,math
from pathlib import Path
from mathutils import Vector
out=Path(__file__).resolve().parent.parent/'dist'/'night-market'
tiers=[('01-night-newcomer','premium-dumpling',0),('02-dumpling-apprentice','premium-dumpling',1),('03-street-skewer','premium-dumpling',2),('04-festival-vendor','premium-dumpling',3),('05-stall-master','premium-panda',4),('06-panda-chef','premium-panda',5),('07-famous-restaurant','premium-panda',6),('08-market-magnate','premium-panda',7),('09-golden-guild','premium-ox',8),('10-market-overlord','premium-ox',9),('11-night-market-king','premium-ox',10)]
def mat(n,c,metal=0,emit=0):
 m=bpy.data.materials.get(n) or bpy.data.materials.new(n);m.diffuse_color=(*c,1);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*c,1);b.inputs['Metallic'].default_value=metal;b.inputs['Roughness'].default_value=.38
 if emit:b.inputs['Emission Color'].default_value=(*c,1);b.inputs['Emission Strength'].default_value=emit
 return m
gold=mat('evolution gold',(.91,.57,.13),.65);jade=mat('jade enamel',(.07,.45,.33),.28);scarlet=mat('royal scarlet',(.65,.035,.03));pearl=mat('pearl white',(.95,.85,.65));ink=mat('charcoal',(.08,.045,.05));glow=mat('luminous amber',(1,.43,.05),.12,1.5)
def ball(n,p,s,m):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,location=p);o=bpy.context.object;o.name=n;o.scale=s;o.data.materials.append(m)
def cone(n,p,r1,r2,h,m):
 bpy.ops.mesh.primitive_cone_add(vertices=12,radius1=r1,radius2=r2,depth=h,location=p);o=bpy.context.object;o.name=n;o.data.materials.append(m)
def cube(n,p,s,m):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.name=n;o.dimensions=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
 b=o.modifiers.new('rounded accessory','BEVEL');b.width=.025;b.segments=2
def rod(n,a,b,r,m):
 v=Vector(b)-Vector(a);bpy.ops.mesh.primitive_cylinder_add(vertices=9,radius=r,depth=v.length,location=(Vector(a)+Vector(b))/2);o=bpy.context.object;o.name=n;o.rotation_euler=v.to_track_quat('Z','Y').to_euler();o.data.materials.append(m)
for name,source,t in tiers:
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 bpy.ops.import_scene.gltf(filepath=str(out/(source+'.glb')))
 # Each evolution adds distinct sculpted gear, silhouette, pedestal and accessories.
 if t==0:
  ball('newcomer bundle',(-.35,-.13,.34),(.14,.13,.17),pearl)
 elif t==1:
  cone('apprentice cap',(0,-.02,1.01),.19,.025,.21,scarlet);ball('cap jewel',(0,-.19,1.04),(.05,.03,.05),gold)
 elif t==2:
  for x in (-.30,.30):rod('crossed festival skewers',(x,-.12,.38),(x*1.7,-.10,1.11),.018,gold)
  for x in (-.51,.51):ball('skewer delicacy',(x,-.1,1.08),(.08,.07,.09),scarlet)
 elif t==3:
  for x in (-.40,.40):rod('stall pennant pole',(x,.12,.30),(x,.12,1.34),.018,gold);cube('festival flag',(x,.10,1.21),(.23,.035,.14),scarlet)
  cone('vendor hat',(0,0,1.03),.25,.07,.18,jade)
 elif t==4:
  cube('chef apron badge',(0,-.31,.43),(.16,.04,.15),jade);cone('first chef medal',(0,-.34,.43),.065,.065,.025,gold)
 elif t==5:
  for x in (-.38,.38):ball('chef shoulder insignia',(x,-.05,.67),(.09,.08,.055),gold)
  cube('master recipe scroll',(.35,-.30,.38),(.16,.11,.30),pearl)
 elif t==6:
  for x in (-.34,.34):rod('restaurant banner pole',(x,.18,.43),(x,.18,1.54),.018,gold);cube('restaurant sign',(x,.14,1.39),(.20,.04,.24),scarlet)
  ball('chef crown jewel',(0,-.05,1.48),(.10,.08,.09),jade)
 elif t==7:
  cone('magnate ceremonial hat',(0,-.02,1.45),.33,.08,.31,gold)
  for i in range(7):
   a=i*math.tau/7;ball('floating jade coin',(math.cos(a)*.58,math.sin(a)*.43,.72+math.sin(a*2)*.16),(.075,.03,.075),jade)
 elif t==8:
  for x in (-.47,.47):cone('guild banner crest',(x,.06,1.42),.13,.01,.30,jade)
  cube('golden guild breastplate',(0,-.37,.71),(.38,.06,.29),gold)
 elif t==9:
  for x in (-.52,.52):ball('royal shoulder fire',(x,-.05,1.02),(.12,.10,.17),glow)
  cone('overlord crown spire',(0,-.02,1.63),.17,.01,.39,gold)
  for x in (-.2,.2):cone('overlord crown flank',(x,-.03,1.58),.075,.01,.22,scarlet)
 else:
  cone('final king halo base',(0,.16,1.68),.33,.12,.18,gold)
  for i in range(9):
   a=i*math.tau/9;ball('king halo ember',(math.cos(a)*.49,.18+math.sin(a)*.19,1.43+math.cos(a)*.16),(.06,.05,.075),glow)
  for x in (-.51,.51):rod('king scepter wings',(x,-.08,.70),(x*1.25,-.04,1.48),.035,gold)
  cube('champion breast crest',(0,-.39,.72),(.34,.065,.32),jade)
 # Numbered collectible medallion, unique to every GLB.
 cone('evolution pedestal rim',(0,0,.055),.50,.46,.06,gold)
 for i in range(t+1):
  a=i*math.tau/(t+1);ball('evolution rank stud',(math.cos(a)*.43,math.sin(a)*.43,.16),(.018,.018,.025),glow)
 # Apply and batch by material to keep collectible mobile-friendly.
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
 for o in meshes:
  bpy.context.view_layer.objects.active=o
  for mod in list(o.modifiers):
   try:bpy.ops.object.modifier_apply(modifier=mod.name)
   except RuntimeError:pass
 groups={}
 for o in meshes:groups.setdefault(tuple(m.name for m in o.data.materials),[]).append(o)
 for key,items in groups.items():
  if len(items)<2:continue
  bpy.ops.object.select_all(action='DESELECT')
  for o in items:o.select_set(True)
  bpy.context.view_layer.objects.active=items[0];bpy.ops.object.join()
 path=out/(name+'.glb');bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_apply=True)
 print('EVOLUTION',name,'batch',len(groups),'bytes',path.stat().st_size)

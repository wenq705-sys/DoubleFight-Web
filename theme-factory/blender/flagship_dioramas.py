"""Three art-direction flagship dioramas: 2, 64, 2048. Preserve the original environment's architecture vocabulary."""
import bpy,math
from pathlib import Path
from mathutils import Vector
D=Path(__file__).resolve().parent.parent/'dist'/'night-market'
def mat(n,c,metal=0,emit=0):
 m=bpy.data.materials.get(n) or bpy.data.materials.new(n);m.diffuse_color=(*c,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=.31
 if emit:p.inputs['Emission Color'].default_value=(*c,1);p.inputs['Emission Strength'].default_value=emit
 return m
wood=mat('premium carved walnut',(.19,.078,.045));gold=mat('premium brushed brass',(.83,.50,.15),.72);red=mat('premium cinnabar',(.63,.045,.035));jade=mat('premium celadon',(.08,.43,.33),.2);roof=mat('premium midnight ceramic',(.10,.16,.21),.25);silk=mat('premium silk',(.91,.70,.42));glow=mat('premium lantern core',(1,.49,.10),.1,2)
def box(n,p,s,m,bevel=.02):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.name=n;o.dimensions=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
 if bevel:b=o.modifiers.new('hand softened edges','BEVEL');b.width=bevel;b.segments=2
 return o
def ball(n,p,s,m):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,location=p);o=bpy.context.object;o.name=n;o.scale=s;o.data.materials.append(m)
def rod(n,a,b,r,m):
 v=Vector(b)-Vector(a);bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=r,depth=v.length,location=(Vector(a)+Vector(b))/2);o=bpy.context.object;o.name=n;o.rotation_euler=v.to_track_quat('Z','Y').to_euler();o.data.materials.append(m)
def roofline(y,z,w):
 box('ceramic tiled eave',(0,y,z),(w,.32,.09),roof)
 for x in (-w*.47,w*.47):
  e=box('upturned gold eave',(x,y,z+.075),(.22,.34,.055),gold);e.rotation_euler[1]=(.28 if x<0 else -.28)
 for j in range(13):
  x=(j-6)*w/13;rod('individually carved roof ridge',(x,y-.16,z+.06),(x,y+.16,z+.06),.009,gold)
 box('roof ridge finial',(0,y,z+.12),(w*.62,.055,.055),gold)
def lantern(x,y,z):
 ball('translucent red lantern',(x,y,z),(.085,.075,.12),red);ball('warm lantern wick',(x,y-.06,z),(.047,.02,.07),glow)
 rod('brass hanging wire',(x,y,z+.13),(x,y,z+.26),.006,gold);rod('silk tassel',(x,y,z-.13),(x,y,z-.26),.007,silk)
def dais(z=.04):
 box('black lacquer exhibition plinth',(0,0,z), (1.30,1.17,.13),wood)
 box('carved golden plinth edge',(0,0,z+.075),(1.36,1.22,.026),gold)
 for x in (-.57,.57):
  for y in (-.49,.49):ball('corner jade stud',(x,y,z+.10),(.035,.035,.026),jade)
def pavilion(size=1):
 w=size;dais()
 for x in (-.53*w,.53*w):
  for y in (-.39,.39):
   rod('turned wooden column',(x,y,.18),(x,y,1.28*w),.034,wood)
   ball('gold column cap',(x,y,1.22*w),(.06,.06,.055),gold)
 roofline(.02,1.34*w,1.36*w)
 for x in (-.43*w,.43*w):lantern(x,-.39,1.07*w)
 for y in (-.35,.35):box('carved open balustrade',(0,y,.33),(1.08*w,.035,.065),gold)
 for x in (-.42*w,.42*w):box('vertical carved lattice',(x,.37,.74*w),(.035,.04,.56*w),wood)
def batch():
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
 for items in groups.values():
  if len(items)<2:continue
  bpy.ops.object.select_all(action='DESELECT')
  for o in items:o.select_set(True)
  bpy.context.view_layer.objects.active=items[0];bpy.ops.object.join()
 return len(groups)
for n,src in [('flagship-02-dumpling','01-night-newcomer'),('flagship-64-chef','06-panda-chef'),('flagship-2048-king','11-night-market-king')]:
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 bpy.ops.import_scene.gltf(filepath=str(D/(src+'.glb')))
 # Original character and its own platform retained. Diorama architecture is built around, never over, the hero.
 if 'dumpling' in n:
  dais();roofline(.34,1.19,1.16)
  for x in (-.47,.47):rod('bamboo stall post',(x,.34,.16),(x,.34,1.15),.026,wood);lantern(x,-.37,.93)
  box('miniature steam shop counter',(0,.39,.39),(.86,.17,.13),wood)
  for x in (-.30,.30):ball('steam shop bun tray',(x,.38,.48),(.09,.09,.05),silk)
 elif 'chef' in n:
  pavilion();box('jade restaurant sign',(0,-.43,1.23),(.46,.045,.16),jade)
  for x in (-.30,.30):box('golden sign letter',(x,-.462,1.23),(.06,.015,.065),gold)
  for x in (-.43,.43):ball('glowing charcoal brazier',(x,-.28,.30),(.075,.075,.08),glow)
 else:
  pavilion(1.24);box('imperial canopy backing',(0,.37,.89),(.92,.08,.79),red)
  for x in (-.55,.55):
   for z in (.52,.75,.98):ball('throne carved gold bosses',(x,.30,z),(.045,.025,.045),gold)
  for x in (-.47,.47):lantern(x,-.41,1.37)
  for x in (-.40,.40):rod('ceremonial dragon staff',(x,.18,.25),(x,.18,1.68),.027,gold)
  for j in range(7):
   a=j*math.tau/7;ball('floating imperial ember',(.68*math.cos(a),.52*math.sin(a),.85+.20*math.sin(a)),(.035,.035,.05),glow)
 groups=batch();path=D/(n+'.glb');bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_apply=True);print('FLAGSHIP',n,groups,path.stat().st_size)


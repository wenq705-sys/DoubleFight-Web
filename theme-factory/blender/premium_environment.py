"""Premium night-market environment, separate from the lightweight gameplay board."""
import bpy, math, random, json, sys
from pathlib import Path
from mathutils import Vector
random.seed(22)
out=Path(__file__).resolve().parent.parent/'dist'/'night-market';out.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def material(n,c,emission=0):
 m=bpy.data.materials.new(n);m.diffuse_color=(*c,1);m.use_nodes=True
 bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*c,1);bs.inputs['Roughness'].default_value=.68
 if emission: bs.inputs['Emission Color'].default_value=(*c,1);bs.inputs['Emission Strength'].default_value=emission
 return m
wood=material('mahogany timber',(.24,.075,.038));roof=material('indigo roof tiles',(.055,.095,.15));red=material('lacquer vermilion',(.55,.055,.035));gold=material('antique brass',(.75,.38,.09));stone=material('warm limestone',(.52,.34,.24));glow=material('lantern inner light',(1,.34,.08),2.5);water=material('canal teal',(.015,.17,.19));green=material('foliage',(.065,.21,.11));pink=material('blossom',(.8,.28,.35));cream=material('shop paper',(.9,.62,.33));dark=material('foundation',(.095,.075,.075))
def box(n,p,s,m,bevel=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.name=n;o.dimensions=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
 if bevel: mod=o.modifiers.new('rounded crafted edge','BEVEL');mod.width=bevel;mod.segments=1;o.modifiers.new('weighted normals','WEIGHTED_NORMAL')
 return o
def ball(n,p,s,m,seg=10):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=6,location=p);o=bpy.context.object;o.name=n;o.scale=s;o.data.materials.append(m);return o
def pole(a,b,r,m,n='timber pole'):
 v=Vector(b)-Vector(a);mid=(Vector(a)+Vector(b))/2;bpy.ops.mesh.primitive_cylinder_add(vertices=7,radius=r,depth=v.length,location=mid);o=bpy.context.object;o.name=n;o.rotation_euler=v.to_track_quat('Z','Y').to_euler();o.data.materials.append(m)
def lantern(x,y,z,scale=1):
 pole((x,y,z+.16*scale),(x,y,z+.36*scale),.015*scale,gold,'lantern hook')
 ball('glowing silk lantern',(x,y,z),(.105*scale,.105*scale,.145*scale),glow)
 box('lantern cap',(x,y,z+.15*scale),(.13*scale,.13*scale,.025*scale),gold)
 pole((x,y,z-.15*scale),(x,y,z-.25*scale),.008*scale,red,'tassel')
def house(x,y,face=1):
 # Outside the 4x4 playable square; each miniature shop has a visible facade and tiled eaves.
 w=1.6; d=1.12;z=.34
 box('shop stone plinth',(x,y,z-.25),(w+.15,d+.12,.24),stone,.035)
 box('timber facade',(x,y,z+.42),(w,d,.98),wood,.035)
 for xx in (-.59,.59):
  box('corner beam',(x+xx,y-face*.57,z+.43),(.085,.085,1.07),red,.01)
  box('warm lattice window',(x+xx*.48,y-face*.565,z+.52),(.32,.025,.38),glow)
 box('counter',(x,y-face*.72,z+.15),(1.22,.28,.12),gold,.02)
 box('market sign',(x,y-face*.62,z+.94),(1.17,.055,.29),red,.02)
 box('raised roof ridge',(x,y,z+1.20),(w+.36,d+.28,.11),roof,.035)
 for k in range(7):
  xx=x-.84+k*.28
  box('individual roof tile',(xx,y,z+1.29),(.24,d+.38,.055),roof,.018)
 # Layered upturned eaves and gold roof-end caps, readable in an isometric view.
 for side in (-1,1):
  for k in range(5):
   yy=y+(k-2)*.265
   xx=x+side*(.79+.10*(abs(k-2)/2))
   pole((x+side*.57,yy,z+1.19),(xx,yy,z+1.32),.024,roof,'swept eave rib')
   ball('glazed ridge cap',(xx,yy,z+1.34),(.038,.045,.035),gold,8)
 for xx in (-.72,.72):
  lantern(xx+x,y-face*.79,z+.89,.8)
 for k in range(4):
  xx=x-.45+k*.3
  ball('displayed street food',(xx,y-face*.77,z+.27),(.085,.075,.06),red if k%2 else cream)
  pole((xx,y-face*.79,z+.25),(xx,y-face*.79,z+.46),.009,wood,'skewer')
def stairs(x,y):
 for i in range(4):
  box('carved approach step',(x,y+i*.20,-.12-i*.045),(1.35,.25,.15),stone,.018)
def foliage(x,y,z=.2):
 pole((x,y,z),(x,y,z+.72),.045,wood,'bonsai trunk')
 for dx,dy,dz in [(-.2,0,.64),(.17,.12,.74),(0,-.12,.87)]:
  ball('layered miniature canopy',(x+dx,y+dy,z+dz),(.27,.24,.20),green)
 for _ in range(6):
  dx=random.uniform(-.27,.27);dy=random.uniform(-.24,.24)
  ball('blossom detail',(x+dx,y+dy,z+.8+random.uniform(-.12,.13)),(.045,.045,.04),pink,8)
def railing(x,y,axis='x',length=1.5):
 for i in range(5):
  t=(i/4-.5)*length
  xx=x+(t if axis=='x' else 0);yy=y+(t if axis=='y' else 0)
  pole((xx,yy,-.06),(xx,yy,.35),.025,wood,'carved railing baluster')
 if axis=='x':box('railing top',(x,y,.35),(length,.045,.045),gold)
 else:box('railing top',(x,y,.35),(.045,length,.045),gold)
# Raised carved board surrounded by water and walkways.
box('floating night-market island',(0,0,-.56),(7.9,7.7,.23),dark,.06)
for x in (-3.72,3.72):
 box('water channel',(x,0,-.41),(.36,7.25,.055),water)
for y in (-3.63,3.63):
 box('water channel',(0,y,-.41),(7.3,.34,.055),water)
for x,y in [(-2.86,1.48),(2.86,1.48),(-2.86,-1.48),(2.86,-1.48)]:
 house(x,y,1 if y>0 else -1)
for x in (-3.2,3.2):
 for y in (-.32,.32):
  box('street timber decking',(x,y,-.22),(.66,.57,.08),wood,.02)
for x,y in [(-2.4,-2.5),(2.45,-2.45),(-2.4,2.48),(2.45,2.48)]:
 foliage(x,y)
for x in (-2.36,2.36):
 for y in (-1.75,-.85,0,.85,1.75):
  pole((x,y,-.22),(x,y,.63),.036,wood,'street light post');lantern(x,y,.64,.78)
for y in (-2.34,2.34):
 railing(0,y,'x',3.7)
for x in (-2.34,2.34):
 railing(x,0,'y',3.7)
stairs(0,-2.65)
# Deliberately leave the central 4x4 play grid free of decorative geometry.
for x in (-3.53,3.53):
 for y in (-3.43,3.43):
  lantern(x,y,.04,.7)
# Layered artisan details: hanging banners, bridge lamps, water plants, market merchandise.
navy=material('night market banner indigo',(.045,.10,.19))
jade=material('jade ceramics',(.13,.49,.35))
for x in (-2.82,2.82):
 for y in (-1.30,0,1.30):
  pole((x,y,-.17),(x,y,1.38),.025,wood,'banner mast')
  box('embroidered hanging pennant',(x,y,1.06),(.27,.045,.52),navy,.012)
  box('gold pennant edging',(x,y,1.32),(.31,.055,.035),gold,.008)
  lantern(x,y,.68,.57)
for x in (-3.50,3.50):
 for y in (-2.65,-1.75,-.85,.05,.95,1.85,2.75):
  ball('canal lotus leaf',(x,y,-.36),(.15,.11,.018),green)
  if random.random()>.48:
   ball('floating pink lotus',(x+.035,y,-.32),(.065,.055,.055),pink)
for x,y in [(-2.92,-1.48),(2.92,-1.48),(-2.92,1.48),(2.92,1.48)]:
 for i in range(5):
  xx=x+(i-2)*.14
  ball('market ceramic bowl',(xx,y-.61,.39),(.062,.062,.038),jade)
  ball('steaming food',(xx,y-.61,.43),(.045,.044,.026),cream)
for x in (-2.12,2.12):
 for y in (-2.12,2.12):
  box('ornamental corner bronze plate',(x,y,.02),(.19,.19,.025),gold,.015)
# Export environment without cameras, lamps, or gameplay pieces.
bpy.ops.export_scene.gltf(filepath=str(out/'environment.glb'),export_format='GLB',export_apply=True)
print('PREMIUM ENVIRONMENT', (out/'environment.glb').stat().st_size)

"""Render an actual asset-based composition for visual review."""
import bpy,math
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parent.parent/'dist'/'night-market'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for name in ('board','environment','premium-panda','premium-dumpling','premium-ox'):
 old=set(bpy.context.scene.objects)
 bpy.ops.import_scene.gltf(filepath=str(root/(name+'.glb')))
 added=set(bpy.context.scene.objects)-old
 if name.startswith('premium-'):
  pos={'premium-panda':(0,-.5,.2),'premium-dumpling':(-1.1,-.65,.2),'premium-ox':(1.2,.65,.2)}[name]
  for obj in added:
   if obj.parent not in added:obj.location+=Vector(pos)
world=bpy.data.worlds.new('twilight');bpy.context.scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.12,.11,.19,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.65
def area(p,power,color,size):
 bpy.ops.object.light_add(type='AREA',location=p);o=bpy.context.object;o.data.energy=power;o.data.color=color;o.data.shape='DISK';o.data.size=size
area((-3,-4,7),1300,(1,.62,.32),7);area((4,3,6),1100,(.40,.57,1),6)
bpy.ops.object.camera_add(location=(9,-12,11));cam=bpy.context.object;target=Vector((0,0,.15))
cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=11.8;bpy.context.scene.camera=cam
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=1100;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(root/'premium-review.png')
bpy.ops.render.render(write_still=True)
print('REVIEW RENDER',scene.render.filepath)

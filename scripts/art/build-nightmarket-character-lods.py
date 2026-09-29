"""Generate actual playable low-detail variants, preserving untouched source .glb collection."""
import bpy,math,json,struct,time
from pathlib import Path
T=time.time()
D=Path(__file__).resolve().parents[2]/'public'/'theme-preview'
SRC=D/'collection'/'models'
OUT=D/'nightmarket-diorama'/'tiles'
OUT.mkdir(parents=True,exist_ok=True)
LEVELS=['0002','0004','0008','0016','0032','0064','0128','0256','0512','1024','2048']
TARGET={'0002':16000,'0004':16000,'0008':17500,'0016':18000,'0032':16000,
        '0064':18000,'0128':19000,'0256':19000,'0512':25000,'1024':24000,'2048':26000}
bpy.context.preferences.view.show_splash=False
reports=[]
for level in LEVELS:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    source=SRC/(level+'.glb');target=OUT/(level+'.glb')
    bpy.ops.import_scene.gltf(filepath=str(source))
    objs=[o for o in bpy.context.scene.objects if o.type=='MESH']
    assert objs,(level,'source empty')
    source_tri=0
    for o in objs:
        o.data.calc_loop_triangles()
        source_tri+=len(o.data.loop_triangles)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:o.select_set(True)
    bpy.context.view_layer.objects.active=objs[0]
    if len(objs)>1:bpy.ops.object.join()
    mesh=bpy.context.view_layer.objects.active
    mesh.name='NightMarketPlayable_'+level
    mesh.data.calc_loop_triangles()
    if source_tri>TARGET[level]:
        ratio=TARGET[level]/max(1,len(mesh.data.loop_triangles))
        mod=mesh.modifiers.new('SilhouetteFirstMobileLOD','DECIMATE')
        mod.decimate_type='COLLAPSE'
        mod.ratio=ratio
        mod.use_collapse_triangulate=True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    mesh.data.calc_loop_triangles()
    after=len(mesh.data.loop_triangles)
    assert after>2000 and after<=source_tri
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    bpy.context.view_layer.objects.active=mesh
    bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',
        use_selection=True,export_apply=True,export_yup=True,
        export_animations=False,export_lights=False,export_cameras=False)
    with target.open('rb') as f:magic,vers,n=struct.unpack('<4sII',f.read(12))
    assert magic==b'glTF' and vers==2 and n==target.stat().st_size
    # Re-import mobile file in a clean scene so GLTF roundtrip actually gets tested.
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(target))
    roundtrip=[o for o in bpy.context.scene.objects if o.type=='MESH']
    tri=0
    for o in roundtrip:
        o.data.calc_loop_triangles();tri+=len(o.data.loop_triangles)
        assert all(math.isfinite(v) for vert in o.data.vertices for v in vert.co)
    assert tri==after,(level,'roundtrip',after,tri)
    report={'level':int(level),'original_triangles':source_tri,'mobile_triangles':after,
        'roundtrip_triangles':tri,'original_bytes':source.stat().st_size,
        'mobile_bytes':target.stat().st_size,'valid':True}
    reports.append(report)
    print('MOBILE_TILE_'+level+' '+json.dumps(report),flush=True)
manifest={'character_count':len(reports),'target':'on-board 4x4 LOD; original 11 remain unchanged',
 'all_valid':all(x['valid'] for x in reports),
 'source_triangles':sum(x['original_triangles'] for x in reports),
 'mobile_triangles':sum(x['mobile_triangles'] for x in reports),
 'source_bytes':sum(x['original_bytes'] for x in reports),
 'mobile_bytes':sum(x['mobile_bytes'] for x in reports),
 'asset_budget':'Typical 16 concurrently visible characters, single merged mesh/level',
 'seconds':round(time.time()-T,1),'models':reports}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
assert len(reports)==11 and manifest['all_valid']
print('CHARACTER_LOD_RESULT '+json.dumps(manifest,ensure_ascii=False),flush=True)


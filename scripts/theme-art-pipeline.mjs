/**
 * Universal 3D theme import entry.
 *
 * Drop:
 *   public/assets/themes/<id>/theme.json
 *   public/assets/themes/<id>/<board, environment, 11 GLBs, map hero>
 *
 * Then: npm run sync:themes / npm run build / npm run build:douyin
 *
 * This single manifest generates mainline theme registration and validates the
 * native/offline package. A new theme MUST NOT require an additional game branch.
 */
import {readFile, readdir, realpath, stat, mkdir, copyFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const LEVELS = Object.freeze([2,4,8,16,32,64,128,256,512,1024,2048]);
export const STAGE_LEVELS = Object.freeze([2,16,64,256,1024]);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const INPUT_DIR = path.join(ROOT,'public','assets','themes');
export const OUTPUT_REGISTRY = path.join(ROOT,'src','config','artThemes.generated.ts');
const MB = 1024*1024;
const slug = /^[a-z][a-z0-9-]{1,31}$/;
const rgb = /^#[\da-fA-F]{6}$/;
function fail(message){throw new Error('[ThemeArtImport] '+message)}
function yes(condition,message){if(!condition)fail(message)}
function localRelative(candidate, context){
  yes(typeof candidate==='string'&&candidate.length>0,context+': missing filename');
  yes(!candidate.includes('\\')&&!candidate.includes('?')&&!candidate.includes('#'),
    context+': filename must be a plain portable POSIX path');
  yes(!path.posix.isAbsolute(candidate)&&candidate.split('/').every(x=>x&&x!=='.'&&x!=='..'),
    context+': traversal/absolute paths are not allowed');
  yes(!candidate.includes(':')&&!candidate.includes('\0'),context+': unsafe filename');
  return candidate;
}
function readable(value,context){
  yes(typeof value==='string'&&value.trim().length>0&&value.length<=96,
    context+': human-readable text is required (1–96 chars)');
}
function positive(value,context,upper=1000){
  yes(typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=upper,
    context+': must be a positive finite number <= '+upper);
}
function validRGB(value,context){yes(typeof value==='string'&&rgb.test(value),context+': expected #RRGGBB')}
async function checkPackedFile(base, rel, context, ext){
  localRelative(rel,context);
  yes(rel.toLowerCase().endsWith(ext),context+': only '+ext+' files are allowed');
  const root=await realpath(base);
  const target=path.resolve(base,...rel.split('/'));
  yes(target.startsWith(root+path.sep),context+': file outside theme directory');
  let actual;
  try{actual=await realpath(target)}catch{fail(context+': missing asset '+rel)}
  yes(actual.startsWith(root+path.sep),context+': symlink escapes theme pack');
  const st=await stat(actual);
  yes(st.isFile()&&st.size>40,context+': file empty or not regular '+rel);
  return {target:actual,bytes:st.size};
}
export function assertBinaryGLB(binary, context){
  yes(binary.length>=28&&binary.toString('ascii',0,4)==='glTF',context+': invalid GLB magic');
  yes(binary.readUInt32LE(4)===2,context+': only GLB v2 supported');
  yes(binary.readUInt32LE(8)===binary.length,context+': incorrect GLB length');
  const n=binary.readUInt32LE(12);
  yes(binary.readUInt32LE(16)===0x4E4F534A&&n>2&&20+n<=binary.length,
    context+': invalid embedded glTF JSON chunk');
  let json;
  try{json=JSON.parse(binary.subarray(20,20+n).toString('utf8'))}
  catch{fail(context+': malformed glTF JSON')}
  yes(json.asset?.version==='2.0',context+': glTF asset.version must be 2.0');
  yes(Array.isArray(json.meshes)&&json.meshes.length>0,context+': GLB has no meshes');
  for(const [kind,list] of [['buffer',json.buffers??[]],['image',json.images??[]]]){
    for(const file of list){
      yes(!file.uri||file.uri.startsWith('data:'),context+': external '+kind+
        ' URI not supported; embed everything in GLB');
    }
  }
  yes(!(json.extensionsRequired??[]).some(s=>s==='KHR_draco_mesh_compression'),
    context+': pre-decompress Draco; native runtime cannot assume it');
  return {meshes:json.meshes.length,nodes:json.nodes?.length??0,materials:json.materials?.length??0};
}
async function checkGLB(base, rel, context){
  const result=await checkPackedFile(base,rel,context,'.glb');
  yes(result.bytes<9*MB,context+': individual GLB exceeds 9 MiB mobile-art ceiling');
  return {...result,details:assertBinaryGLB(await readFile(result.target),context)};
}
/** Reusable by build scripts and by tests that create a second sample theme. */
export async function collectThemeArtPacks(inputDir=INPUT_DIR){
  let folders;
  try{folders=await readdir(inputDir,{withFileTypes:true})}
  catch{fail('art import directory missing: '+inputDir)}
  const out=[];
  const entries=folders.filter(x=>x.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name));
  for(const entry of entries){
    const id=entry.name;
    const base=path.join(inputDir,id);
    let raw;
    try{raw=JSON.parse(await readFile(path.join(base,'theme.json'),'utf8'))}
    catch(e){fail(id+': theme.json is required and must be valid JSON: '+e.message)}
    yes(slug.test(id)&&!['kingdom','palace'].includes(id),id+': unsafe/reserved theme ID');
    yes(raw.schemaVersion===1,id+': unsupported schemaVersion, expected 1');
    yes(raw.id===id,id+': theme.json id must exactly match folder name');
    for(const key of ['label','title','subtitle','kicker','highestLabel','icon'])
      readable(raw[key],id+'.'+key);
    yes(raw.online===false,id+': new art themes are Solo-only until PvP protocol is extended');
    yes(raw.placement?.rows===4&&raw.placement?.columns===4,
      id+': currently requires a 4x4 board with 16 clear gameplay slots');
    for(const key of ['gridGap','artFloorY','gameSurfaceY'])
      positive(raw.placement[key],id+'.placement.'+key,25);
    yes(Number.isFinite(raw.placement.centerZ)&&Math.abs(raw.placement.centerZ)<30,
      id+': invalid board centerZ');
    if(raw.camera){
      for(const mode of ['home','solo']){
        const camera=raw.camera[mode]; if(!camera)continue;
        for(const key of ['targetY','targetZOffset','distanceScale','eyeY','eyeZ'])
          yes(typeof camera[key]==='number'&&Number.isFinite(camera[key]),
            id+'.camera.'+mode+'.'+key+': finite number required');
        yes(camera.distanceScale>.5&&camera.distanceScale<2,id+'.camera.'+mode+': invalid distanceScale');
        yes(camera.eyeY>.1&&camera.eyeY<2&&camera.eyeZ>.1&&camera.eyeZ<2,
          id+'.camera.'+mode+': invalid eye offset');
      }
    }
    yes(raw.ranks&&typeof raw.ranks==='object',id+': missing 11 rank names');
    yes(raw.assets?.tiles&&typeof raw.assets.tiles==='object',
      id+': assets.tiles must list all 11 distinct GLBs');
    yes(Object.keys(raw.assets.tiles).length===LEVELS.length,
      id+': assets.tiles must have exactly the 11 standard level keys');
    for(const value of LEVELS)readable(raw.ranks[String(value)],id+'.ranks.'+value);
    for(const key of ['sky','fog','accent','secondary','spawn','skill'])
      validRGB(raw.render?.[key],id+'.render.'+key);
    positive(raw.render.exposure,id+'.render.exposure',3);
    if(raw.render.vfx!==undefined) yes(['default','ink'].includes(raw.render.vfx),
      id+': render.vfx must be default or ink');
    yes(Array.isArray(raw.render.confetti)&&raw.render.confetti.length>=3,
      id+': render.confetti needs at least three palette colors');
    raw.render.confetti.forEach((x,i)=>validRGB(x,id+'.render.confetti['+i+']'));
    yes(['generic','nightmarket'].includes(raw.mood?.preset),
      id+': mood.preset must be generic or nightmarket');
    yes(JSON.stringify(raw.mood.thresholds)===JSON.stringify(STAGE_LEVELS),
      id+': five stages currently use thresholds 2/16/64/256/1024');
    yes(Array.isArray(raw.mood.labels)&&raw.mood.labels.length===5,
      id+': five stage labels are required');
    raw.mood.labels.forEach((x,i)=>readable(x,id+'.mood.labels['+i+']'));
    if(raw.mood.glowMaterialKeys){
      for(const [tag,patterns] of Object.entries(raw.mood.glowMaterialKeys)){
        yes(/^[a-z][a-z0-9]*$/.test(tag)&&Array.isArray(patterns),
          id+': glowMaterialKeys needs lists of material-name fragments');
        patterns.forEach((x,i)=>readable(x,id+'.mood.glowMaterialKeys.'+tag+'['+i+']'));
      }
    }
    const files=[
      ['hero',raw.assets.hero,'.png',false],
      ['board',raw.assets.board,'.glb',true],
      ['environmentMobile',raw.assets.environmentMobile,'.glb',true],
    ];
    if(raw.assets.environmentFull)
      files.push(['environmentFull',raw.assets.environmentFull,'.glb',false]);
    for(const value of LEVELS)
      files.push(['tiles['+value+']',raw.assets.tiles[String(value)],'.glb',true]);
    for(const [i,overlay] of (raw.assets.overlays??[]).entries()){
      yes(Number.isInteger(overlay.stage)&&overlay.stage>=1&&overlay.stage<=4,
        id+': overlay stage must be 1–4');
      files.push(['overlay['+i+']',overlay.file,'.glb',true]);
    }
    const checked=[];const unique=new Set();let nativeBytes=0;
    for(const [name,rel,ext,native] of files){
      yes(!unique.has(rel),id+': repeated model path '+rel);unique.add(rel);
      const context=id+'.assets.'+name;
      const result=ext==='.glb'?await checkGLB(base,rel,context):
        await checkPackedFile(base,rel,context,ext);
      if(native)nativeBytes+=result.bytes;
      checked.push({name,path:rel,bytes:result.bytes,native,...result.details});
    }
    yes(nativeBytes<20*MB,id+': theme exceeds native 20 MiB budget on its own');
    out.push({id,base,manifest:raw,files:checked,nativeBytes});
  }
  yes(out.length>0,'No valid themes found in '+inputDir);
  return out;
}
export function registrySource(packs){
  const banner='// AUTO-GENERATED by npm run sync:themes. Edit theme.json, NEVER edit this file.\n';
  const payload=JSON.stringify(packs.map(x=>x.manifest),null,2);
  return banner+"import type { ArtThemeDefinition } from './artThemeSchema';\n"+
    "export const ART_THEMES = "+payload+" as const satisfies readonly ArtThemeDefinition[];\n"+
    "export type ArtThemeId = (typeof ART_THEMES)[number]['id'];\n"+
    "export const ART_THEME_BY_ID: Readonly<Record<string, ArtThemeDefinition>> =\n"+
    "  Object.fromEntries(ART_THEMES.map(item => [item.id, item]));\n"+
    "export function isArtTheme(id: string): id is ArtThemeId {\n"+
    "  return Object.prototype.hasOwnProperty.call(ART_THEME_BY_ID, id);\n}\n";
}
export async function syncThemeRegistry(packs, output=OUTPUT_REGISTRY,{check=false}={}){
  const content=registrySource(packs);
  if(check){
    let current='';
    try{current=await readFile(output,'utf8')}catch{}
    yes(current===content,'Generated registry is stale. Run: npm run sync:themes');
  }else{
    await mkdir(path.dirname(output),{recursive:true});
    await writeFile(output,content,'utf8');
  }
  return content;
}
export async function installNativeThemePacks(packs,outDir,{existingGameBytes=0}={}){
  let total=existingGameBytes;
  const installed=[];
  for(const {id,base,manifest,files} of packs){
    const target=path.join(outDir,'assets','themes',id);
    await mkdir(target,{recursive:true});
    const native=files.filter(item=>item.native);
    let size=0;
    for(const file of native){
      const dest=path.join(target,...file.path.split('/'));
      await mkdir(path.dirname(dest),{recursive:true});
      await copyFile(path.join(base,...file.path.split('/')),dest);
      const copied=await stat(dest);
      yes(copied.size===file.bytes,id+': copied GLB differs: '+file.path);
      size+=file.bytes;
    }
    // The manifest is copied too so the native loader and audit tools share the same contract.
    await copyFile(path.join(base,'theme.json'),path.join(target,'theme.json'));
    size+=(await stat(path.join(target,'theme.json'))).size;
    total+=size;
    installed.push({id,models:native.length,bytes:size,dir:'assets/themes/'+id});
  }
  yes(total<=20*MB,'Native main package exceeds 20 MiB ('+(total/MB).toFixed(2)+
    ' MiB). Use feature-specific Douyin subpackages before importing another full art pack.');
  await writeFile(path.join(outDir,'art-themes-manifest.json'),
    JSON.stringify({schemaVersion:1,themes:installed,totalBytes:total,mainPackageLimitBytes:20*MB},null,2));
  return {installed,totalBytes:total};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const mode=process.argv.includes('--check')?'check':'sync';
  const packs=await collectThemeArtPacks();
  await syncThemeRegistry(packs,OUTPUT_REGISTRY,{check:mode==='check'});
  const mb=packs.reduce((sum,p)=>sum+p.nativeBytes,0)/MB;
  console.log('[ThemeArtImport] '+mode.toUpperCase(),packs.map(p=>p.id).join(', '),
    '|',packs.reduce((sum,p)=>sum+p.files.filter(f=>f.path.endsWith('.glb')).length,0),
    'GLBs | native models',mb.toFixed(2),'MiB');
}

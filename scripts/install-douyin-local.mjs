/**
 * Deploy a verified compiled mini-game INTO the user's existing Douyin import
 * directory, not a GitHub Pages page. Back up the previous dist first.
 *
 * npm run deploy:douyin:local
 * node scripts/install-douyin-local.mjs "C:\absolute\custom\platform\douyin\dist"
 */
import {cp,mkdir,readFile,readdir,rm,stat} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(repo,'platform','douyin','dist');
const target=path.resolve(process.argv[2]??process.env.DOUYIN_IMPORT_DIR??
  path.join(repo,'..','DoubleFight-Web','platform','douyin','dist'));
const requireIt=(v,msg)=>{if(!v)throw new Error('[DouyinInstall] '+msg)};
const exists=async p=>{try{return (await stat(p)).isDirectory()}catch{return false}};
const data=async p=>JSON.parse(await readFile(p,'utf8'));
async function manifest(dir){
  const out=[];
  async function visit(base,relative=''){
    for(const item of await readdir(base,{withFileTypes:true})){
      const sub=path.join(relative,item.name),full=path.join(base,item.name);
      if(item.isDirectory())await visit(full,sub);
      else{
        const contents=await readFile(full);
        out.push([sub.replaceAll('\\','/'),contents.length,
          createHash('sha256').update(contents).digest('hex')]);
      }
    }
  }
  await visit(dir);out.sort((a,b)=>a[0].localeCompare(b[0]));return out;
}
requireIt(target!==source,'target and generated source cannot be identical');
requireIt(path.basename(target).toLowerCase()==='dist','target must be a Douyin dist directory');
requireIt(await exists(source),'run npm run build:douyin first');
const sourceCfg=await data(path.join(source,'project.config.json'));
requireIt(sourceCfg.compileType==='game','compiled input is not a native mini-game project');
const art=await data(path.join(source,'art-themes-manifest.json'));
requireIt(art.themes.length>=1,'native art importer emitted no themes');
const targetExists=await exists(target);
if(targetExists){
  const oldCfg=await data(path.join(target,'project.config.json'));
  requireIt(oldCfg.compileType==='game','target is not a native mini-game directory');
  requireIt(oldCfg.appid===sourceCfg.appid,'app IDs differ: refusing to overwrite another mini-game');
}
const expected=await manifest(source);
requireIt(expected.some(x=>x[0]==='game.js'),'source game.js is missing');
let backup='';
if(targetExists){
  const ts=new Date().toISOString().replaceAll(':','-').replaceAll('.','-');
  backup=path.join(repo,'exports','douyin-backups','before-theme-import-'+ts);
  await mkdir(path.dirname(backup),{recursive:true});
  await cp(target,backup,{recursive:true,force:false,errorOnExist:true});
}
try{
  if(targetExists)await rm(target,{recursive:true,force:true});
  await mkdir(target,{recursive:true});
  await cp(source,target,{recursive:true});
  const actual=await manifest(target);
  requireIt(JSON.stringify(expected)===JSON.stringify(actual),
    'SHA256 verification failed; previous folder preserved at '+backup);
}catch(error){
  if(backup){
    await rm(target,{recursive:true,force:true});
    await cp(backup,target,{recursive:true});
  }
  throw error;
}
console.log('DOUYIN_NATIVE_PROJECT_INSTALLED',target);
console.log('FILES_SHA256_VERIFIED',expected.length,'THEMES',art.themes.map(x=>x.id).join(','));
console.log('TOTAL_MIB',(expected.reduce((sum,item)=>sum+item[1],0)/1048576).toFixed(2));
if(backup)console.log('PREVIOUS_DIST_BACKUP',backup);
console.log('NEXT: open this dist folder in Douyin Developer Tools, then compile.');


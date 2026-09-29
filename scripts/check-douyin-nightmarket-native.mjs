/**
 * Actual GLTFLoader.parse of EVERY packed .glb through the same tt.readFile ABI
 * used by Douyin, including board + environment + all 11 mobile characters.
 * Does not accidentally exercise the normal browser fetch() branch.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
const native=resolve('platform/douyin/dist');
const packaged=JSON.parse(readFileSync(join(native,'assets/nightmarket/manifest.json'),'utf8'));
assert.equal(packaged.characterModels,11);
assert.equal(packaged.generatedPaths.length,13);
const readPaths=[];
globalThis.tt={
 getFileSystemManager(){
  return {readFile({filePath,success,fail}){
   readPaths.push(filePath);
   try{
    assert(filePath.startsWith('assets/nightmarket/'));
    const raw=readFileSync(join(native,filePath));
    const arrayBuffer=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);
    success({data:arrayBuffer});
   }catch(error){fail({errMsg:String(error)});}
  }};
 }
};
const {isNativeNightMarketRuntime,loadNightMarketGLB}=
  await import('../src/rendering/loaders/NightMarketAssetLoader.ts');
assert(isNativeNightMarketRuntime(),'Mock native filesystem branch not selected');
const loader=new GLTFLoader();
for(const file of packaged.generatedPaths){
 const imported=await new Promise((done,fail)=>{
  loadNightMarketGLB(loader,file,done,fail);
 });
 let visible=0,vertices=0;
 imported.scene.traverse(o=>{if(o.isMesh){visible++;vertices+=o.geometry.attributes.position.count}});
 assert(visible>0&&vertices>0,'Empty GLB '+file);
 console.log('DOUYIN_PACKAGE_GLTF_PASS',file,visible,'meshes',vertices,'vertices');
}
assert.equal(readPaths.length,13);
assert(readPaths.every(x=>x.startsWith('assets/nightmarket/')));
console.log('DOUYIN_NATIVE_PACKAGE_ALL_13_BINARY_PARSE_PASS',packaged.packageSoFarBytes,'totalBytes');

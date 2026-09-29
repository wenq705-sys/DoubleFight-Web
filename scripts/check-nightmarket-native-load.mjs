import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {strict as assert} from 'node:assert';
const {loadArtThemeGLB}=await import('../src/rendering/loaders/ArtThemeAssetLoader.ts');
const previous=globalThis.TextDecoder;
globalThis.TextDecoder=undefined;
globalThis.tt={getFileSystemManager:()=>({readFile({filePath,success,fail}){
  try {
    const bytes=readFileSync('platform/douyin/dist-release/'+filePath);
    success({data:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
  } catch(error){fail({errMsg:String(error)});}
}})};
const files=['board-4x4.glb','environment-mobile.glb',
  ...[2,4,8,16,32,64,128,256,512,1024,2048].map(n=>'tiles/'+String(n).padStart(4,'0')+'.glb')];
try {
  for(const file of files){
    const gltf=await new Promise((resolve,reject)=>
      loadArtThemeGLB(new GLTFLoader(),'nightmarket',file,resolve,reject));
    let meshes=0;gltf.scene.traverse(obj=>{if(obj.isMesh)meshes++});
    assert(meshes>0,file+' must contain authored geometry');
    console.log('GLB native parse PASS',file,'meshes',meshes);
  }
  console.log('13/13 Blender GLBs native filesystem+decode PASS');
  const {BattleBoardView}=await import('../src/rendering/battle/BattleBoardView.ts');
  const board=new BattleBoardView('nightmarket','full',undefined,undefined,true);
  board.reset([{id:1,value:2,row:0,col:0},{id:2,value:4,row:0,col:1}]);
  await new Promise(resolve=>setTimeout(resolve,100));
  const names=[];
  board.root.traverse(obj=>names.push(obj.name));
  assert(names.some(name=>name==='authored mobile LOD 2'),'active tile 2 must show authored model');
  assert(names.some(name=>name==='authored mobile LOD 4'),'active tile 4 must show authored model');
  assert(names.some(name=>name==='authored night market board'),'authored board must replace placeholder');
  assert(names.some(name=>name==='authored night market environment'),'authored environment must load');
  assert(!names.some(name=>name==='temporary asynchronous loading glint'),'no live placeholder remains');
  console.log('Native mainline BattleBoardView live Blender tiles/board/environment PASS');
  board.dispose();
} finally {
  globalThis.TextDecoder=previous;delete globalThis.tt;
}

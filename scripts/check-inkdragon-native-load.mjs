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
const values=[2,4,8,16,32,64,128,256,512,1024,2048];
const files=['board-4x4.glb','environment-mobile.glb',
  ...values.map(n=>'tiles/'+String(n).padStart(4,'0')+'.glb')];
try {
  for(const file of files){
    const gltf=await new Promise((resolve,reject)=>
      loadArtThemeGLB(new GLTFLoader(),'inkdragon',file,resolve,reject));
    let meshes=0;gltf.scene.traverse(obj=>{if(obj.isMesh)meshes++});
    assert(meshes>0,file+' must contain authored geometry');
    console.log('INK GLB native parse PASS',file,'meshes',meshes);
  }
  const {BattleBoardView}=await import('../src/rendering/battle/BattleBoardView.ts');
  const board=new BattleBoardView('inkdragon','full',undefined,undefined,true);
  board.reset([
    {id:1,value:2,row:0,col:0},{id:2,value:32,row:0,col:1},
    {id:3,value:256,row:1,col:0},{id:4,value:2048,row:1,col:1},
  ]);
  await new Promise(resolve=>setTimeout(resolve,120));
  const names=[];board.root.traverse(obj=>names.push(obj.name));
  for(const value of [2,32,256,2048])
    assert(names.includes('authored_GLTF_LOD_inkdragon_'+value),'live authored tile '+value);
  assert(names.includes('inkdragon | board'),'authored ink board must load');
  assert(names.includes('inkdragon | environment'),'authored ink environment must load');
  assert(!names.includes('temporary rank loading sparkle'),'live placeholders must be replaced');
  console.log('INKDRAGON_NATIVE_MAINLINE_PASS 4 anchors + board + environment');
  board.dispose();
} finally {
  globalThis.TextDecoder=previous;delete globalThis.tt;
}

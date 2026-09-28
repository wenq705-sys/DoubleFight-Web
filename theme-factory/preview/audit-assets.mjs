import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const dir=fileURLToPath(new URL('../dist/night-market/',import.meta.url));
let failed=false;
for(const name of readdirSync(dir).filter(x=>x.endsWith('.glb'))){
 const bytes=readFileSync(dir+name);
 if(bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('Invalid GLB: '+name);
 const len=bytes.readUInt32LE(12),type=bytes.toString('ascii',16,20);
 if(type!=='JSON')throw Error('Missing JSON chunk: '+name);
 const gltf=JSON.parse(bytes.toString('utf8',20,20+len));
 const primitives=(gltf.meshes||[]).flatMap(m=>m.primitives||[]);
 let triangles=0;
 for(const p of primitives){
  const count=p.indices===undefined?gltf.accessors[p.attributes.POSITION].count:gltf.accessors[p.indices].count;
  if(p.mode===undefined||p.mode===4)triangles+=Math.floor(count/3);
 }
 const mib=(bytes.length/1048576).toFixed(2);
 console.log(name.padEnd(24),String(primitives.length).padStart(3)+' draws',String(triangles).padStart(8)+' tris',mib+' MiB');
 if(name==='environment.glb'&&primitives.length>20){failed=true;console.error('Environment draw budget exceeded');}
}
if(failed)process.exitCode=1;

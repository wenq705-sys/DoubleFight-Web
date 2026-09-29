import test from 'node:test';
import assert from 'node:assert/strict';
import {cp, mkdtemp, readFile, writeFile, rm, stat} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {
  collectThemeArtPacks, syncThemeRegistry, installNativeThemePacks,
  registrySource, assertBinaryGLB, LEVELS, INPUT_DIR,
} from './theme-art-pipeline.mjs';
test('nightmarket authoritative 11 tiers are self-contained GLB2',async()=>{
  const packs=await collectThemeArtPacks();
  const pack=packs.find(p=>p.id==='nightmarket');
  assert(pack,'existing Douyin theme was not discovered');
  assert.equal(pack.manifest.schemaVersion,1);
  assert.equal(LEVELS.length,11);
  assert.equal(Object.keys(pack.manifest.assets.tiles).length,11);
  assert(pack.nativeBytes>5*1024*1024);
  for(const item of pack.files.filter(x=>x.path.endsWith('.glb'))){
    assert(item.meshes>=1,item.path+' has no mesh');
    const buffer=await readFile(path.join(pack.base,item.path));
    assertBinaryGLB(buffer,pack.id+'/'+item.path);
  }
});
test('second independent art theme registers and packages without game-code edits',async()=>{
  const tmp=await mkdtemp(path.join(tmpdir(),'doublefight-art-import-'));
  const input=path.join(tmp,'themes');
  try{
    const first=path.join(input,'nightmarket');
    const second=path.join(input,'aurora');
    await cp(path.join(INPUT_DIR,'nightmarket'),first,{recursive:true});
    await cp(first,second,{recursive:true});
    const original=JSON.parse(await readFile(path.join(second,'theme.json'),'utf8'));
    const future={...original,id:'aurora',label:'极光山谷',
      title:'极光山谷·冰川苏醒',icon:'❄',ranks:{...original.ranks,'2':'雪团精灵'},
      mood:{...original.mood,preset:'generic',labels:[
        '初雪','破晓','流光','极光','冰川盛宴',
      ]}};
    await writeFile(path.join(second,'theme.json'),JSON.stringify(future,null,2));
    const packs=await collectThemeArtPacks(input);
    assert.deepEqual(packs.map(p=>p.id),['aurora','nightmarket']);
    const registry=registrySource(packs);
    assert(registry.includes('"id": "aurora"'));
    assert(registry.includes('"id": "nightmarket"'));
    assert(registry.includes('export type ArtThemeId'));
    const registryFile=path.join(tmp,'registry.ts');
    await syncThemeRegistry(packs,registryFile);
    await syncThemeRegistry(packs,registryFile,{check:true});
    const native=await installNativeThemePacks(packs,path.join(tmp,'native'),
      {existingGameBytes:1_730_000});
    assert.equal(native.installed.length,2);
    for(const theme of ['nightmarket','aurora']){
      const board=path.join(tmp,'native','assets','themes',theme,'board-4x4.glb');
      assert((await stat(board)).size>100_000);
      const tiles=path.join(tmp,'native','assets','themes',theme,'tiles','2048.glb');
      assert((await stat(tiles)).size>50_000);
    }
    assert(native.totalBytes<20*1024*1024);
    console.log('ART_IMPORT_SECOND_THEME_OK',packs.map(x=>x.id).join(','),
      (native.totalBytes/1048576).toFixed(2)+'MiB');
    const altered={...future,assets:{...future.assets,
      tiles:{...future.assets.tiles,'2':'../escape.glb'}}};
    const manifest=path.join(second,'theme.json');
    await writeFile(manifest,JSON.stringify(altered,null,2));
    await assert.rejects(collectThemeArtPacks(input),/traversal|unsafe|missing/i);
    await writeFile(manifest,JSON.stringify(future,null,2));
    const missing=path.join(second,'tiles','0016.glb');
    await rm(missing);
    await assert.rejects(collectThemeArtPacks(input),/missing asset/);
    await cp(path.join(first,'tiles','0016.glb'),missing);
    await writeFile(path.join(second,'tiles','0004.glb'),Buffer.alloc(100,33));
    await assert.rejects(collectThemeArtPacks(input),/invalid GLB magic|file empty/);
    console.log('ART_IMPORT_NEGATIVE_TESTS_OK traversal / missing GLB / bad GLB');
  }finally{
    await rm(tmp,{recursive:true,force:true});
  }
});


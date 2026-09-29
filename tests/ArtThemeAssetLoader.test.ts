import {afterEach,describe,expect,it,vi} from 'vitest';
import type {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  canLoadArtThemeModels,isNativeArtThemeRuntime,loadArtThemeGLB,
} from '../src/rendering/loaders/ArtThemeAssetLoader';

afterEach(()=>vi.unstubAllGlobals());

describe('platform-neutral art theme import port',()=>{
  it('reads the packed GLB binary via Douyin FS, not an external URL',async()=>{
    const raw=new Uint8Array([0x67,0x6c,0x54,0x46,2,0,0,0,0,0,0,0]);
    const paths:string[]=[];
    vi.stubGlobal('tt',{
      getFileSystemManager:()=>({
        readFile:({filePath,success}:{filePath:string;success:(r:{data:Uint8Array})=>void})=>{
          paths.push(filePath);success({data:raw});
        },
      }),
    });
    expect(isNativeArtThemeRuntime()).toBe(true);
    expect(canLoadArtThemeModels()).toBe(true);
    const parsed=vi.fn((data:ArrayBuffer,_base:string,callback:(g:unknown)=>void)=>{
      expect(new Uint8Array(data)).toEqual(raw);
      callback({scene:'binary GLB passed to Three.js'});
    });
    const loaded=vi.fn();
    const loader={parse:parsed,load:vi.fn()} as unknown as GLTFLoader;
    loadArtThemeGLB(loader,'nightmarket','tiles/0002.glb',loaded,err=>{throw err});
    expect(paths).toEqual(['assets/themes/nightmarket/tiles/0002.glb']);
    expect(parsed).toHaveBeenCalledTimes(1);
    expect(loader.load).not.toHaveBeenCalled();
    expect(loaded).toHaveBeenCalledTimes(1);
  });

  it('rejects unregistered themes and path traversal before filesystem access',()=>{
    const readFile=vi.fn();
    vi.stubGlobal('tt',{getFileSystemManager:()=>({readFile})});
    const parse=vi.fn(),load=vi.fn();
    const loader={parse,load} as unknown as GLTFLoader;
    for(const [theme,file] of [
      ['nightmarket','../secret.glb'],['unregistered','board-4x4.glb'],
      ['nightmarket','/absolute.glb'],['nightmarket','tiles\\bad.glb'],
    ]){
      const failed=vi.fn();
      loadArtThemeGLB(loader,theme,file,vi.fn(),failed);
      expect(failed).toHaveBeenCalledTimes(1);
    }
    expect(readFile).not.toHaveBeenCalled();
    expect(parse).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });
});


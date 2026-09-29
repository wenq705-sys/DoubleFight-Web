import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';import os from 'node:os';
import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const profile=mkdtempSync(path.join(os.tmpdir(),'df-home-posters-'));
const port=9389;
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const target='http://127.0.0.1:8767/DoubleFight-Web/';
const child=spawn(edge,[
  '--headless=new','--enable-unsafe-swiftshader','--use-angle=swiftshader',
  '--remote-allow-origins=*','--no-first-run','--hide-scrollbars',
  '--remote-debugging-port='+port,'--user-data-dir='+profile,target,
],{stdio:'ignore',windowsHide:true});
const wait=ms=>new Promise(done=>setTimeout(done,ms));
let ws,seq=0;const pending=new Map();
const cdp=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
});
const evaluate=async expression=>{
  const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);
  return r.result.value;
};
try{
  let page;
  for(let i=0;i<80;i++){
    try{
      const r=await fetch('http://127.0.0.1:'+port+'/json/list');
      if(r.ok){page=(await r.json()).find(p=>p.type==='page'&&p.url.includes('DoubleFight-Web'));if(page)break}
    }catch{}
    await wait(200);
  }
  if(!page?.webSocketDebuggerUrl)throw new Error('Browser startup failed');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((done,reject)=>{ws.addEventListener('open',done,{once:true});ws.addEventListener('error',reject,{once:true})});
  ws.addEventListener('message',event=>{
    const r=JSON.parse(event.data);const ref=pending.get(r.id);if(!ref)return;pending.delete(r.id);
    if(r.error)ref.reject(new Error(r.error.message));else ref.resolve(r.result);
  });
  await cdp('Runtime.enable');
  const out=path.join(ROOT,'public','assets','home-islands');mkdirSync(out,{recursive:true});
  for(const id of ['kingdom','palace']){
    let value;
    for(let i=0;i<55;i++){
      value=await evaluate("document.querySelector('.home-island--"+id+" .home-island__hero')?.src");
      if(value?.startsWith('data:image/png;base64,'))break;
      await wait(200);
    }
    if(!value?.startsWith('data:image/png;base64,'))throw new Error(id+': generated Web preview missing');
    const data=Buffer.from(value.split(',')[1],'base64');
    if(data.length<5000)throw new Error('Empty generated image '+id);
    const file=path.join(out,id+'.png');writeFileSync(file,data);
    console.log('REAL_WEB_HERO_SAVED',id,data.length,file);
  }
}finally{
  ws?.close();
  try{execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore'})}catch{}
  try{rmSync(profile,{recursive:true,force:true})}catch{}
}


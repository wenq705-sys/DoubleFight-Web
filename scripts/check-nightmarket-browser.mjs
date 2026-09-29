/**
 * Real browser interaction smoke test for the online 4x4 stage preview.
 * Requires local static server at http://127.0.0.1:8766/ and installed Edge.
 */
import assert from 'node:assert/strict';
import{spawn,execFileSync}from'node:child_process';
import{mkdtempSync,rmSync}from'node:fs';
import{tmpdir}from'node:os';
import{join}from'node:path';
const browser='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile=mkdtempSync(join(tmpdir(),'doublefight-mood-cdp-'));
const port=9347;
const url='http://127.0.0.1:8766/theme-preview/nightmarket-diorama/';
const child=spawn(browser,['--headless=new','--enable-unsafe-swiftshader',
  '--use-angle=swiftshader','--remote-allow-origins=*','--no-first-run',
  '--no-default-browser-check','--hide-scrollbars',
  '--window-size=600,1000','--remote-debugging-port='+port,
  '--user-data-dir='+profile,url],{stdio:'ignore',windowsHide:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let ws,next=0;const pending=new Map();
async function connect(){
  let pages;
  for(let i=0;i<48;i++){
    try{
      const res=await fetch('http://127.0.0.1:'+port+'/json/list');
      if(res.ok){pages=await res.json();if(pages.find(p=>p.url.includes('nightmarket-diorama')))break}
    }catch{}
    await pause(200);
  }
  const page=pages?.find(p=>p.url.includes('nightmarket-diorama'));
  assert(page?.webSocketDebuggerUrl,'Headless Edge did not load preview');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{ws.addEventListener('open',ok,{once:true});
    ws.addEventListener('error',fail,{once:true})});
  ws.addEventListener('message',event=>{
    const m=JSON.parse(event.data);if(!m.id||!pending.has(m.id))return;
    const req=pending.get(m.id);pending.delete(m.id);
    if(m.error)req.reject(new Error(m.error.message));else req.resolve(m.result);
  });
}
function cdp(method,params={}){
  return new Promise((resolve,reject)=>{
    const id=++next;pending.set(id,{resolve,reject});
    ws.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expr){
  const r=await cdp('Runtime.evaluate',{expression:expr,returnByValue:true,
    awaitPromise:true});
  if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);
  return r.result.value;
}
try{
  await connect();await cdp('Runtime.enable');await cdp('Page.enable');
  let ready=false;
  for(let i=0;i<55;i++){
    const label=await evaluate('document.querySelector("#hint")?.textContent');
    if(label?.includes('单指旋转')){ready=true;break}
    if(label?.includes('失败'))throw new Error(label);
    await pause(150);
  }
  assert(ready,'GLB board/environment failed to load');
  assert.equal(await evaluate('document.querySelectorAll("#stageTrail span").length'),5);
  for(const [tile,want] of [[16,'夜市苏醒'],[64,'夜市繁盛'],[256,'华彩高潮'],
    [1024,'神灯盛会'],[2048,'神灯盛会']]){
    const state=await evaluate('document.querySelector(\'[data-max="'+tile+'"]\').click();'+
      '({stage:document.querySelector("#stageTitle").textContent,'+
      'max:document.querySelector("#maxTileLabel").textContent})');
    assert.equal(state.stage,want);
    assert(state.max.includes(String(tile)));
    console.log('CDP_STAGE_OK',tile,want);
    await pause(200);
  }
  assert((await evaluate('document.querySelector("#stageToast").textContent')).includes('2048'));
  const keep=await evaluate('document.querySelector(\'[data-max="16"]\').click();'+
    'document.querySelector("#stageTitle").textContent');
  assert.equal(keep,'神灯盛会','Stage must not regress on a cleared max tile');
  let state=await evaluate('document.querySelector("#stage-reset").click();'+
    '({stage:document.querySelector("#stageTitle").textContent,'+
    'max:document.querySelector("#maxTileLabel").textContent})');
  assert.equal(state.stage,'初入夜市');assert(state.max.includes('2'));
  await evaluate('document.querySelector("#combo-demo").click()');
  assert((await evaluate('document.querySelector("#stageToast").textContent')).includes('连击'));
  await evaluate('document.querySelector(\'[data-max="1024"]\').click()');
  await pause(2250);
  const screenshot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  const fs=await import('node:fs');
  const out='C:\\Users\\pc\\Documents\\ChatGPT\\DoubleFight-ThemeFactory\\theme-factory\\art-source\\nightmarket-diorama-direct\\mood-stage-1024-smoke.png';
  fs.writeFileSync(out,Buffer.from(screenshot.data,'base64'));
  console.log('CDP_INTERACTION_PASS GLB load / stage buttons / monotonic / victory / reset / combo');
  console.log('CDP_SCREENSHOT',out);
}finally{
  ws?.close();
  try{execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore'})}catch{}
  try{rmSync(profile,{recursive:true,force:true})}catch{}
}

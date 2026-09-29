/** Real headless Edge smoke: shared Board2048, 11 tile GLBs, inputs and stage state. */
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
const exe='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile=mkdtempSync(join(tmpdir(),'doublefight-playable-'));
const port=9353,url='http://127.0.0.1:8766/theme-preview/nightmarket-diorama/';
const child=spawn(exe,['--headless=new','--enable-unsafe-swiftshader','--use-angle=swiftshader',
  '--remote-allow-origins=*','--no-first-run','--no-default-browser-check',
  '--hide-scrollbars','--window-size=600,1060','--remote-debugging-port='+port,
  '--user-data-dir='+profile,url],{stdio:'ignore',windowsHide:true});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let ws,seq=0;const pending=new Map(),exceptions=[];
async function open(){
  let page;
  for(let i=0;i<62;i++){
    try{const r=await fetch('http://127.0.0.1:'+port+'/json/list');
      if(r.ok){page=(await r.json()).find(p=>p.url.includes('nightmarket-diorama'));
        if(page)break}}catch{}
    await sleep(180);
  }
  assert(page?.webSocketDebuggerUrl,'Edge CDP not ready');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
    ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});
  });
  ws.addEventListener('message',e=>{
    const m=JSON.parse(e.data);
    if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params?.exceptionDetails?.text||'unknown');
    if(!m.id||!pending.has(m.id))return;
    const req=pending.get(m.id);pending.delete(m.id);
    if(m.error)req.reject(new Error(m.error.message));else req.resolve(m.result);
  });
  await cmd('Runtime.enable');await cmd('Page.enable');
}
function cmd(method,params={}){
  return new Promise((resolve,reject)=>{
    const id=++seq;pending.set(id,{resolve,reject});
    ws.send(JSON.stringify({id,method,params}));
  });
}
async function evalJS(expression){
  const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);
  return r.result.value;
}
async function screenshot(filename){
  const shot=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  const dest='C:\\Users\\pc\\Documents\\ChatGPT\\DoubleFight-ThemeFactory\\theme-factory\\art-source\\nightmarket-diorama-direct\\'+filename;
  writeFileSync(dest,Buffer.from(shot.data,'base64'));console.log('CAPTURE',filename);
}
async function press(key,code){
  await cmd('Input.dispatchKeyEvent',{type:'keyDown',key,code,
    windowsVirtualKeyCode:key.startsWith('Arrow')?({ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40})[key]:0});
  await cmd('Input.dispatchKeyEvent',{type:'keyUp',key,code});
}
try{
  await open();let ready=false;
  for(let k=0;k<62;k++){
    const hint=await evalJS('document.querySelector("#hint")?.textContent');
    if(hint?.includes('单指旋转')){ready=true;break}
    if(hint?.includes('失败'))throw new Error(hint);
    await sleep(160);
  }
  assert(ready,'Board environment did not load');
  assert.equal(await evalJS('document.querySelectorAll("[data-quick]").length'),6);
  assert.equal(await evalJS('document.querySelectorAll(".play-launch button").length'),3);
  assert.equal(await evalJS('fetch("./board2048-shared.mjs").then(r=>r.status)'),200);
  const start=await evalJS("document.querySelector('#play-start').click();({hud:document.querySelector('#playHud').hidden,status:document.querySelector('#playHighest').textContent})");
  assert.equal(start.hud,false);assert.equal(start.status,'2');
  await sleep(850);
  const first=await evalJS('document.querySelector("#playLoaded").textContent');
  console.log('PLAY_STARTED loaded=',first);
  assert(Number.parseInt(first)>=2,'Missing initial collectible templates');
  await screenshot('nightmarket-playable-touch-start.png');
  const area=await evalJS("(()=>{const b=document.querySelector('#view canvas').getBoundingClientRect();return {x:b.x+b.width*.49,y:b.y+b.height*.60}})()");
  for(const [dx,dy] of [[-130,0],[0,-130],[145,0]]){
    const p={x:area.x,y:area.y,id:1,radiusX:3,radiusY:3,force:1};
    await cmd('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});
    await cmd('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...p,x:p.x+dx,y:p.y+dy}]});
    await cmd('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await sleep(340);
  }
  const gameplay=await evalJS("({score:document.querySelector('#playScore').textContent,moves:Number(document.querySelector('#playMoves').textContent),highest:Number(document.querySelector('#playHighest').textContent),hudHidden:document.querySelector('#playHud').hidden})");
  console.log('REAL_BOARD_MOVES',gameplay);
  assert(gameplay.moves>=1,'Touch swipes did not reach shared board');
  assert(gameplay.highest>=2 && !gameplay.hudHidden);
  await screenshot('nightmarket-playable-touch-moving.png');
  await evalJS("document.querySelector('#play-restart').click()");
  assert.equal(await evalJS('document.querySelector("#playMoves").textContent'),'0');
  await evalJS("document.querySelector('#play-stop').click();document.querySelector('#play-showcase').click()");
  await sleep(3100);
  const showcase=await evalJS("({mode:!document.querySelector('#playHud').hidden,highest:Number(document.querySelector('#playHighest').textContent),cache:document.querySelector('#playLoaded').textContent,stage:document.querySelector('#stageTitle').textContent})");
  console.log('ALL_11_COLLECTIBLES',showcase);
  assert(showcase.mode);assert.equal(showcase.highest,2048);
  assert.equal(Number.parseInt(showcase.cache),11);
  const glbResults=await evalJS("Promise.all([2,4,8,16,32,64,128,256,512,1024,2048].map(v=>fetch('./tiles/'+String(v).padStart(4,'0')+'.glb').then(r=>r.ok)))");
  assert(glbResults.every(Boolean),'Some 11 mobile GLBs unavailable');
  await screenshot('nightmarket-playable-touch-showcase.png');
  await evalJS("document.querySelector('#play-stop').click()");
  assert.equal(await evalJS('document.querySelector("#playHud").hidden'),true);
  assert.equal(exceptions.length,0,'Browser JS errors: '+exceptions.join(' / '));
  console.log('REAL_GAME_BROWSER_ALL_PASS shared core / play / moves / reset / catalogue / 11 GLBs / exit');
}finally{
  ws?.close();
  try{execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore'})}catch{}
  try{rmSync(profile,{recursive:true,force:true})}catch{}
}

/** E2E validation of Night Market INSIDE the actual game's theme carousel. */
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
const exe='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile=mkdtempSync(join(tmpdir(),'doublefight-main-theme-'));
const port=9384;
const target=process.env.NIGHTMARKET_TEST_URL||
  'http://127.0.0.1:8767/DoubleFight-Web/?v=mainline-nightmarket';
const browser=spawn(exe,['--headless=new','--enable-unsafe-swiftshader','--use-angle=swiftshader',
  '--remote-allow-origins=*','--no-first-run','--no-default-browser-check',
  '--hide-scrollbars','--window-size=600,1020','--remote-debugging-port='+port,
  '--user-data-dir='+profile,target],{stdio:'ignore',windowsHide:true});
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
let ws,id=0;const pending=new Map(),exceptions=[];
async function attach(){
  let page;
  for(let k=0;k<65;k++){
    try{const r=await fetch('http://127.0.0.1:'+port+'/json/list');
      if(r.ok){page=(await r.json()).find(x=>x.type==='page'&&x.url.includes('DoubleFight-Web'));
        if(page)break}}catch{}
    await sleep(180);
  }
  assert(page?.webSocketDebuggerUrl,'Browser did not load main app');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
    ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});
  ws.addEventListener('message',message=>{
    const event=JSON.parse(message.data);
    if(event.method==='Runtime.exceptionThrown')
      exceptions.push(event.params?.exceptionDetails?.text||'unknown');
    const ref=pending.get(event.id);if(!ref)return;
    pending.delete(event.id);
    if(event.error)ref.reject(new Error(event.error.message));else ref.resolve(event.result);
  });
  await call('Runtime.enable');await call('Page.enable');
}
function call(method,params={}){
  return new Promise((resolve,reject)=>{
    const ref=++id;pending.set(ref,{resolve,reject});
    ws.send(JSON.stringify({id:ref,method,params}));
  });
}
async function js(expression){
  const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);
  return r.result.value;
}
async function snapshot(file){
  const r=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  const dir=process.env.NIGHTMARKET_TEST_SCREENSHOT_DIR||
    'C:\\Users\\pc\\Documents\\ChatGPT\\DoubleFight-ThemeFactory\\theme-factory\\art-source\\nightmarket-diorama-direct';
  writeFileSync(join(dir,file),Buffer.from(r.data,'base64'));console.log('SCREENSHOT',file);
}
async function direction(key){
  const code={ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40}[key];
  await call('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:code});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:code});
}
try{
  await attach();
  let home=false;
  for(let k=0;k<65;k++){
    const ready=await js("document.querySelector('#home-title')?.textContent");
    if(ready){home=true;break}
    await sleep(160);
  }
  assert(home,'Main game home carousel never rendered');
  assert.equal(await js("document.querySelectorAll('.home-island').length"),5);
  console.log('HOME_THEME_CARDS',await js(
    "Array.from(document.querySelectorAll('.home-island')).map(a=>a.className)"));
  // Select the THIRD carousel island rather than accessing a standalone demo page.
  await js("document.querySelector('.home-island--nightmarket').click()");
  await sleep(500);
  const selected=await js("({title:document.querySelector('#home-title').textContent,disabled:document.querySelector('#home-start').disabled,online:document.querySelector('#home-online').disabled,hero:document.querySelector('.home-island--nightmarket img')?.naturalWidth})");
  console.log('MAIN_THEME_MAP',selected);
  assert(selected.title.includes('东方夜市')&&!selected.disabled);
  assert(selected.online,'Night Market Solo-only; unsupported PvP must be disabled');
  assert(selected.hero>50,'Third carousel must display actual authored Blender scene render');
  await snapshot('nightmarket-main-map.png');
  await js("document.querySelector('#home-start').click()");
  await sleep(2700);
  let started=await js("({body:document.body.dataset.theme,homeHidden:document.querySelector('#home-screen').classList.contains('home--hidden'),mood:document.querySelector('#nightmarket-stage')?.textContent,score:document.querySelector('#score-value')?.textContent})");
  console.log('MAIN_REAL_SOLO',started);
  assert.equal(started.body,'nightmarket');
  assert(started.homeHidden&&started.mood.includes('初入夜市'));
  // GLB assets must be part of the production assets folder, not URLs into demo page.
  const assets=await js("Promise.all(['board-4x4.glb','environment-mobile.glb','tiles/0002.glb','tiles/0004.glb','tiles/2048.glb'].map(n=>fetch('./assets/themes/nightmarket/'+n).then(r=>r.ok)))");
  assert(assets.every(Boolean),'Some production GLB assets are missing');
  await snapshot('nightmarket-main-real-solo.png');
  for(let i=0;i<32;i++){
    await direction(['ArrowLeft','ArrowDown','ArrowRight','ArrowUp'][i%4]);
    await sleep(240);
  }
  await sleep(700);
  const progress=await js("({score:document.querySelector('#score-value').textContent,mood:document.querySelector('#nightmarket-stage').textContent,tiles:document.querySelector('.hud__highest')?.textContent})");
  console.log('MAIN_REAL_MOVES',progress);
  assert(Number(progress.score.replaceAll(',',''))>0,'Move events failed to reach SoloController');
  assert(progress.mood.includes('灵物'),'Mood did not refresh on mainline gameplay');
  await snapshot('nightmarket-main-merge-stage.png');
  await js("document.querySelector('#theme-toggle').click()");
  await sleep(240);
  assert.equal(await js("document.querySelector('#home-title').textContent"),'东方夜市·莲灯盛会');
  // Third island can be exited without contaminating original world selection.
  await js("document.querySelector('.home-island--kingdom').click();document.querySelector('#home-start').click()");
  await sleep(600);
  const other=await js("({theme:document.body.dataset.theme,home:document.querySelector('#home-screen').className})");
  assert.equal(other.theme,'kingdom');
  console.log('MAIN_THEME_SWITCH_RESTORED',other);
  assert.equal(exceptions.length,0,'Browser JS exceptions: '+exceptions.join(' / '));
  console.log('NIGHTMARKET_REAL_MAINLINE_PASS home-map / hero / gameplay / GLBs / stage / theme-switch');
}finally{
  ws?.close();
  try{execFileSync('taskkill',['/PID',String(browser.pid),'/T','/F'],{stdio:'ignore'})}catch{}
  try{rmSync(profile,{recursive:true,force:true})}catch{}
}


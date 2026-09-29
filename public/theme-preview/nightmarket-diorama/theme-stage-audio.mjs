/**
 * Layered theme sketch: one synchronized composition, gradually introduced tracks.
 * Entirely synthesized; no external audio requests and never starts without user interaction.
 */
const melody=[67,69,72,74,72,69,67,64,67,69,72,76,74,72,69,67];
const harmony=[48,55,53,57];
const hz=midi=>440*2**((midi-69)/12);
export class ThemeStageAudio{
  constructor(){this.ctx=null;this.master=null;this.timer=null;this.enabled=false;
    this.nextTime=0;this.step=0;this.s={music:0};this.bpm=108;this.noise=null;}
  update(snapshot){this.s=snapshot}
  async toggle(){
    if(this.enabled){this.stop();return false}
    const Context=window.AudioContext||window.webkitAudioContext;
    if(!Context)return false;
    if(!this.ctx){
      this.ctx=new Context();
      this.master=this.ctx.createGain();this.master.gain.value=.18;
      this.master.connect(this.ctx.destination);
      this.noise=this.ctx.createBuffer(1,Math.round(this.ctx.sampleRate*.14),this.ctx.sampleRate);
      let data=this.noise.getChannelData(0);
      for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    }
    await this.ctx.resume();this.enabled=true;
    this.step=0;this.nextTime=this.ctx.currentTime+.05;
    this.timer=setInterval(()=>this.schedule(),35);this.schedule();return true;
  }
  stop(){
    this.enabled=false;
    if(this.timer!==null)clearInterval(this.timer);
    this.timer=null;this.master?.gain.setTargetAtTime(0,this.ctx.currentTime,.028);
  }
  osc(midi,time,length,vol,type='sine',filterFreq=0){
    if(!this.ctx||!this.enabled)return;
    const osc=this.ctx.createOscillator(),env=this.ctx.createGain();
    osc.type=type;osc.frequency.setValueAtTime(hz(midi),time);
    const end=time+length;env.gain.setValueAtTime(.0001,time);
    env.gain.exponentialRampToValueAtTime(Math.max(.0002,vol),time+.011);
    env.gain.exponentialRampToValueAtTime(.0001,end);
    if(filterFreq){
      const filt=this.ctx.createBiquadFilter();filt.type='lowpass';filt.frequency.value=filterFreq;
      osc.connect(filt);filt.connect(env);
    }else osc.connect(env);
    env.connect(this.master);osc.start(time);osc.stop(end+.02);
    osc.onended=()=>{osc.disconnect();env.disconnect()};
  }
  perc(time,length,vol,cutoff=3300){
    if(!this.ctx||!this.enabled)return;
    const n=this.ctx.createBufferSource();n.buffer=this.noise;
    const filter=this.ctx.createBiquadFilter();filter.type='highpass';filter.frequency.value=cutoff;
    const gain=this.ctx.createGain();gain.gain.setValueAtTime(.0001,time);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002,vol),time+.004);
    gain.gain.exponentialRampToValueAtTime(.0001,time+length);
    n.connect(filter);filter.connect(gain);gain.connect(this.master);
    n.start(time);n.stop(time+length+.01);n.onended=()=>{n.disconnect();filter.disconnect();gain.disconnect()};
  }
  kick(time,vol){
    if(!this.ctx||!this.enabled)return;
    const o=this.ctx.createOscillator(),g=this.ctx.createGain();
    o.type='sine';o.frequency.setValueAtTime(128,time);o.frequency.exponentialRampToValueAtTime(48,time+.13);
    g.gain.setValueAtTime(.0001,time);g.gain.linearRampToValueAtTime(vol,time+.008);
    g.gain.exponentialRampToValueAtTime(.0001,time+.17);
    o.connect(g);g.connect(this.master);o.start(time);o.stop(time+.18);
    o.onended=()=>{o.disconnect();g.disconnect()};
  }
  schedule(){
    if(!this.enabled||!this.ctx)return;
    this.master.gain.setTargetAtTime(.18,this.ctx.currentTime,.04);
    const stepLen=60/this.bpm/2;
    while(this.nextTime<this.ctx.currentTime+.15){
      const k=this.step%16,time=this.nextTime;
      const intensity=this.s.music||0;
      // Pad and melody: they share one tempo through the entire 5-stage journey.
      if(k%8===0){
        const chord=harmony[(Math.floor(this.step/8))%harmony.length];
        this.osc(chord,time,stepLen*7,.014+intensity*.009,'sine',1050);
        this.osc(chord+7,time,stepLen*7,.007+intensity*.005,'triangle',1450);
      }
      if(k%2===0)this.osc(melody[k],time,stepLen*1.58,.040+intensity*.009,'sine');
      if(intensity>.10&&k%4===2)this.perc(time,.043,.010*intensity+ .001,3100);
      if(intensity>.35){
        if(k%4===0)this.kick(time,.038+intensity*.055);
        if(k%8===4)this.perc(time,.068,.015+intensity*.017,1250);
      }
      if(intensity>.61&&k%4===3)this.osc(melody[k]+12,time,.13,.011*intensity,'triangle',3400);
      if(intensity>.87){
        if(k%2===1)this.perc(time,.034,.009*intensity,5100);
        if(k===0||k===8)this.osc(79,time,.38,.021,'sine');
      }
      this.step++;this.nextTime+=stepLen;
      if(this.step>1e7)this.step=0;
    }
  }
  moment(type,tile=2){
    if(!this.ctx||!this.enabled)return;
    const t=this.ctx.currentTime+.014,n=Math.log2(Math.max(2,tile));
    if(type==='victory'){
      this.kick(t,.20);
      [72,76,79,84,88].forEach((v,i)=>this.osc(v,t+i*.125,.54,.065,'sine'));
      this.perc(t+.5,.11,.08,2600);return;
    }
    this.osc(60+Math.min(n,13),t,.18,type==='combo'?.067:.037,'sine');
    if(type==='combo'){this.osc(79,t+.095,.27,.038,'triangle');this.perc(t,.043,.03)}
    if(type==='bigMerge')this.osc(67+Math.min(n,13),t+.045,.25,.023,'triangle');
  }
  dispose(){this.stop();this.ctx?.close();this.ctx=null;}
}


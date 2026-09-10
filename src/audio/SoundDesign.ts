export class SoundDesign {
  private context: AudioContext | null = null;

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;
    try { this.context = new AudioContext(); return this.context; } catch { return null; }
  }

  move(): void {
    const c=this.ensureContext(); if(!c)return; const now=c.currentTime,osc=c.createOscillator(),gain=c.createGain();
    osc.type='sine';osc.frequency.setValueAtTime(155,now);osc.frequency.exponentialRampToValueAtTime(105,now+.055);gain.gain.setValueAtTime(.03,now);gain.gain.exponentialRampToValueAtTime(.0001,now+.065);osc.connect(gain).connect(c.destination);osc.start(now);osc.stop(now+.07);
  }

  merge(value:number):void{
    const c=this.ensureContext();if(!c)return;const now=c.currentTime,tier=Math.max(1,Math.log2(value)),base=180+tier*24;
    [1,1.5].forEach((ratio,index)=>{const osc=c.createOscillator(),gain=c.createGain();osc.type=index===0?'triangle':'sine';osc.frequency.setValueAtTime(base*ratio,now);osc.frequency.exponentialRampToValueAtTime(base*ratio*1.18,now+.12);const volume=value>=512?.075:value>=128?.055:.038;gain.gain.setValueAtTime(volume,now);gain.gain.exponentialRampToValueAtTime(.0001,now+.24);osc.connect(gain).connect(c.destination);osc.start(now);osc.stop(now+.26);});
  }

  legendary():void{
    const c=this.ensureContext();if(!c)return;const now=c.currentTime;[110,165,220].forEach((frequency,index)=>{const osc=c.createOscillator(),gain=c.createGain();osc.type='triangle';osc.frequency.setValueAtTime(frequency,now+index*.045);gain.gain.setValueAtTime(.0001,now);gain.gain.linearRampToValueAtTime(.08,now+index*.045+.03);gain.gain.exponentialRampToValueAtTime(.0001,now+.85);osc.connect(gain).connect(c.destination);osc.start(now+index*.045);osc.stop(now+.9);});
  }
}

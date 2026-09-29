/**
 * Wiring adapter for real SoloController / Board2048 events.
 * Does NOT read lifetime all-time high or cumulative score: this is a single-run mood.
 * Expected board event shape: {changed, merges:[{value, at:{row,col}}],spawned,...}.
 */
export class ThemeGameStageBridge{
  constructor(director){this.director=director}
  reset(boardTiles=[]){
    this.director.reset();
    this.observe(boardTiles);
    return this.director.snapshot();
  }
  observe(boardTiles=[]){
    if(!Array.isArray(boardTiles))return this.director.snapshot();
    const max=Math.max(2,...boardTiles.map(t=>t?.value||0));
    this.director.progress(max);
    return this.director.snapshot();
  }
  move(moveResult,boardTiles=[]){
    if(!moveResult?.changed)return this.director.snapshot();
    const merges=Array.isArray(moveResult.merges)?moveResult.merges:[];
    const highestMerged=Math.max(2,...merges.map(m=>m?.value||0));
    this.observe(boardTiles);
    if(merges.length){
      const highestMerge=merges.reduce((best,m)=>m.value>best.value?m:best,merges[0]);
      const kind=merges.length>=3?'combo':highestMerged>=256?'bigMerge':'merge';
      const pos=highestMerge.at;
      this.director.moment(kind,{
        tile:highestMerged,combo:merges.length,
        cell:pos?{row:pos.row,column:pos.col}:null,
      });
    }
    return this.director.snapshot();
  }
  clearSkill(boardTiles=[]){
    // Removing the former max tile must never darken a celebration already reached.
    return this.observe(boardTiles);
  }
}


// Standalone, deterministic 2048 rules. No production-game dependencies.
export const SIZE=4;
export const initial=()=>Array.from({length:SIZE},()=>Array(SIZE).fill(0));
export function spawn(board,rng=Math.random){
 const empty=[];for(let r=0;r<4;r++)for(let c=0;c<4;c++)if(!board[r][c])empty.push([r,c]);
 if(!empty.length)return false;
 const [r,c]=empty[Math.min(empty.length-1,Math.floor(rng()*empty.length))];
 board[r][c]=rng()<.9?2:4;return true;
}
export function move(board,direction){
 const next=initial(),merges=[],motions=[];let score=0,moved=false;
 for(let line=0;line<4;line++){
  const cells=Array.from({length:4},(_,i)=>{
   if(direction==='left')return [line,i];
   if(direction==='right')return [line,3-i];
   if(direction==='up')return [i,line];
   return [3-i,line];
  });
  const entries=cells.map(([r,c],i)=>({r,c,value:board[r][c],i})).filter(x=>x.value);
  let cursor=0;
  for(let i=0;i<entries.length;i++){
   const e=entries[i],pair=entries[i+1]?.value===e.value;
   const [r,c]=cells[cursor++];next[r][c]=pair?e.value*2:e.value;
   motions.push({r,c,value:pair?e.value*2:e.value,from:[e.r,e.c],merged:pair});
   if(pair){score+=e.value*2;merges.push({r,c,value:e.value*2,from:[[e.r,e.c],[entries[i+1].r,entries[i+1].c]]});i++;}
  }
 }
 for(let r=0;r<4;r++)for(let c=0;c<4;c++)if(next[r][c]!==board[r][c])moved=true;
 return {board:next,score,merges,motions,moved};
}
export function canMove(board){
 if(board.some(row=>row.some(v=>!v)))return true;
 for(let r=0;r<4;r++)for(let c=0;c<4;c++)if((r<3&&board[r][c]===board[r+1][c])||(c<3&&board[r][c]===board[r][c+1]))return true;
 return false;
}
export const level=v=>Math.max(0,Math.min(10,Math.log2(v)-1));
export const names=['初来乍到','街头团子','夜市学徒','串串达人','小摊掌柜','熊猫大厨','招牌名店','夜市名流','金牌商会','夜市霸主','夜市牛王'];

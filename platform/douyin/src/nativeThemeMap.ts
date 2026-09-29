import { THEME_MAP_CARDS, type ThemeMapCard } from '../../../src/config/themeCatalog';
import {ART_THEME_BY_ID,isArtTheme} from '../../../src/config/artThemes.generated';

export function nativeHomePosterPath(id:ThemeMapCard['id']):string|null{
  if(id==='kingdom'||id==='palace')return 'assets/home-islands/'+id+'.png';
  if(isArtTheme(id))return 'assets/themes/'+id+'/'+ART_THEME_BY_ID[id].assets.hero;
  return null;
}

/**
 * Native version of Web HomeScreen: exact theme order, five cards and Solo/PvP locks.
 * Canvas2D only: Douyin mini-games do not provide Web DOM/CSS layout.
 * All interactive rectangles are returned by layoutNativeThemeMap for hit testing.
 */
export type MapRect={x:number;y:number;width:number;height:number};
export interface NativeThemeMapView {
  width:number;height:number;hudTop:number;safeBottomInset:number;
  selected:number;best:number;highest:number;accountName?:string;sidebarReward:boolean;
  heroImage?:CanvasImageSource;
}
export function nextThemeMapIndex(index:number,delta:number):number{
  return Math.max(0,Math.min(THEME_MAP_CARDS.length-1,index+delta));
}
export function layoutNativeThemeMap(width:number,height:number,safeBottomInset:number,hudTop:number){
  const short=height<730;
  const safeBottom=Math.max(16,safeBottomInset+12);
  const soloY=height-safeBottom-(short?163:175);
  const buttonWidth=Math.min(324,width-38);
  const bottomButton=Math.min(310,width-50);
  const itemY=soloY-(short?117:121);
  const dotsY=itemY+67;
  const heroTop=Math.max(hudTop+85,height*.18);
  const heroBottom=Math.max(heroTop+55,itemY-35);
  const arrowY=(heroTop+heroBottom)*.5;
  const dotPitch=23;
  const dotStart=width*.5-(THEME_MAP_CARDS.length-1)*dotPitch*.5;
  const utilityWidth=Math.min(100,(width-64)/3);
  const utilityGap=6;
  const utilityLeft=width/2-(3*utilityWidth+2*utilityGap)/2;
  return {
    settings:{x:14,y:hudTop+2,width:43,height:40},
    previous:{x:11,y:arrowY-26,width:42,height:52},
    next:{x:width-53,y:arrowY-26,width:42,height:52},
    hero:{x:54,y:heroTop,width:width-108,height:heroBottom-heroTop},
    theme:{x:width/2-62,y:itemY-55,width:124,height:29},
    dots:THEME_MAP_CARDS.map((_,i):MapRect=>({
      x:dotStart+i*dotPitch-13,y:dotsY-13,width:26,height:26,
    })),
    solo:{x:(width-buttonWidth)/2,y:soloY,width:buttonWidth,height:50},
    online:{x:(width-bottomButton)/2,y:soloY+56,width:bottomButton,height:43},
    collection:{x:utilityLeft,y:soloY+105,width:utilityWidth,height:30},
    rank:{x:utilityLeft+utilityWidth+utilityGap,y:soloY+105,width:utilityWidth,height:30},
    daily:{x:utilityLeft+2*(utilityWidth+utilityGap),y:soloY+105,width:utilityWidth,height:30},
    itemY,dotsY,soloY,heroTop,heroBottom,arrowY,
    footerY:Math.min(height-safeBottom+4,soloY+149),
  };
}
function rounded(ctx:CanvasRenderingContext2D,r:MapRect,radius:number){
  const x=r.x,y=r.y,w=r.width,h=r.height;
  const a=Math.max(0,Math.min(radius,w/2,h/2));
  ctx.beginPath();ctx.moveTo(x+a,y);ctx.lineTo(x+w-a,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+a);ctx.lineTo(x+w,y+h-a);
  ctx.quadraticCurveTo(x+w,y+h,x+w-a,y+h);ctx.lineTo(x+a,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-a);ctx.lineTo(x,y+a);
  ctx.quadraticCurveTo(x,y,x+a,y);ctx.closePath();
}
function pill(ctx:CanvasRenderingContext2D,r:MapRect,label:string,
  style:'primary'|'secondary'|'disabled'|'micro'){
  ctx.save();rounded(ctx,r,Math.min(13,r.height/2));
  const color=ctx.createLinearGradient(r.x,r.y,r.x+r.width,r.y);
  if(style==='primary'){color.addColorStop(0,'#ce8a4d');color.addColorStop(1,'#975038')}
  else if(style==='disabled'){color.addColorStop(0,'#b1af9f');color.addColorStop(1,'#777e80')}
  else if(style==='micro'){color.addColorStop(0,'#243943d9');color.addColorStop(1,'#2b3942cf')}
  else{color.addColorStop(0,'#586d69');color.addColorStop(1,'#44545c')}
  ctx.fillStyle=color;ctx.fill();ctx.strokeStyle=style==='primary'?'#ffe9b5':'#deb78d8c';
  ctx.lineWidth=style==='primary'?2:1;ctx.stroke();
  ctx.shadowColor=style==='primary'?'#230f1088':'#131e2066';ctx.shadowBlur=style==='primary'?11:5;
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle=style==='disabled'?'#343a41':style==='primary'?'#fff5d9':'#ffeed6';
  ctx.font=style==='micro'?'700 11px sans-serif':'900 14px sans-serif';
  ctx.fillText(label,r.x+r.width/2,r.y+r.height/2+0.5,r.width-8);
  ctx.restore();
}
function orb(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,color:string,alpha:number){
  ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);
  ctx.fillStyle=color;ctx.globalAlpha=alpha;ctx.fill();ctx.globalAlpha=1;
}
function lockedIsland(ctx:CanvasRenderingContext2D,w:number,heroY:number,card:ThemeMapCard){
  const cy=heroY,candy=card.id==='candy';
  ctx.save();
  const halo=ctx.createRadialGradient(w/2,cy,8,w/2,cy,116);
  halo.addColorStop(0,candy?'#ffe4a559':'#c3f9ff57');halo.addColorStop(1,'#34425700');
  ctx.fillStyle=halo;ctx.fillRect(w/2-125,cy-125,250,250);
  ctx.translate(w/2,cy+12);
  ctx.scale(1,.37);
  ctx.beginPath();ctx.ellipse(0,0,100,78,0,0,Math.PI*2);
  ctx.fillStyle=candy?'#b77d93':'#82c3d6';ctx.shadowColor='#0009';ctx.shadowBlur=17;ctx.fill();
  ctx.shadowBlur=0;ctx.beginPath();ctx.ellipse(0,-10,94,69,0,0,Math.PI*2);
  ctx.fillStyle=candy?'#ffe1e1':'#e7f7fa';ctx.fill();
  ctx.restore();
  ctx.textAlign='center';ctx.fillStyle='#fff3d9';
  ctx.font='900 62px sans-serif';
  ctx.shadowColor='#1c2635c0';ctx.shadowBlur=18;
  ctx.fillText(card.icon,w/2,cy-3);
  ctx.shadowBlur=0;
  ctx.font='800 11px sans-serif';ctx.fillStyle='#ffebd0';
  ctx.fillText('新岛屿建设中',w/2,cy+91);
}
export function drawNativeThemeMap(ctx:CanvasRenderingContext2D,view:NativeThemeMapView):void{
  const {width:w,height:h,hudTop,safeBottomInset,selected}=view;
  const card=THEME_MAP_CARDS[selected];
  const l=layoutNativeThemeMap(w,h,safeBottomInset,hudTop);
  const locked=Boolean(card.locked);
  ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';
  // The island is genuine Three.js behind this veil; retain a clear visual gallery center.
  const wash=ctx.createLinearGradient(0,0,0,h);
  wash.addColorStop(0,locked?'#273c4af5':'#302b3de3');
  wash.addColorStop(.18,locked?'#466477db':'#3c344885');
  wash.addColorStop(.39,locked?'#43566ff3':'#47394803');
  wash.addColorStop(.54,locked?'#38546df5':'#3b41531f');
  wash.addColorStop(.70,'#394955d6');
  wash.addColorStop(1,'#344d54fb');
  ctx.fillStyle=wash;ctx.fillRect(0,0,w,h);
  // Shared warm-night sky language from the Web map.
  orb(ctx,w*.83,hudTop-52,45,'#d2b388',.36);
  orb(ctx,w*.045,h*.21,30,'#f3cc9a',.24);
  orb(ctx,w*.90,h*.52,11,'#ffdfb2',.23);
  const heroCenter=(l.heroTop+l.heroBottom)*.5;
  if(locked)lockedIsland(ctx,w,heroCenter,card);
  else if(view.heroImage){
    const size=Math.max(145,Math.min(w*.88,l.heroBottom-l.heroTop+23));
    ctx.globalAlpha=.99;
    ctx.drawImage(view.heroImage,w/2-size/2,heroCenter-size*.50,size,size);
    ctx.globalAlpha=1;
  }else{
    ctx.textAlign='center';ctx.font='900 66px sans-serif';
    ctx.shadowColor='#211d3299';ctx.shadowBlur=13;
    ctx.fillText(card.icon,w/2,heroCenter+8);
    ctx.shadowBlur=0;
  }
  // Logo and its capsule are placed clear of the native menu button.
  ctx.textAlign='center';ctx.shadowColor='#532d25';ctx.shadowBlur=12;
  ctx.fillStyle='#fff5db';ctx.font='900 32px sans-serif';
  ctx.fillText('双数对决',w/2,hudTop+25);ctx.shadowBlur=0;
  const chip:MapRect={x:w/2-100,y:hudTop+46,width:200,height:25};
  rounded(ctx,chip,13);ctx.fillStyle='#ffdfb6';ctx.fill();
  ctx.fillStyle='#60442e';ctx.font='800 10px sans-serif';
  ctx.fillText('DOUBLE FIGHT · 3D 2048',w/2,hudTop+59);
  if(view.accountName){
    ctx.fillStyle='#fff3dac7';ctx.font='600 9px sans-serif';
    ctx.fillText(view.accountName,w/2,hudTop+78,w-100);
  }
  // Real theme carousel: direct left/right taps plus five visible progress markers.
  for(const [direction,rect] of [[-1,l.previous],[1,l.next]] as const){
    if((direction<0&&selected===0)||(direction>0&&selected===THEME_MAP_CARDS.length-1))continue;
    rounded(ctx,rect,15);ctx.fillStyle='#172530b3';ctx.fill();
    ctx.strokeStyle='#ffe1a081';ctx.stroke();
    ctx.font='900 21px sans-serif';ctx.fillStyle='#ffead1';
    ctx.fillText(direction<0?'‹':'›',rect.x+rect.width/2,rect.y+rect.height/2);
  }
  ctx.fillStyle='#ffdfb9';ctx.font='800 10px sans-serif';
  ctx.fillText('主题地图  '+String(selected+1).padStart(2,'0')+
    ' / '+String(THEME_MAP_CARDS.length).padStart(2,'0'),w/2,l.heroTop-14);
  pill(ctx,l.theme,locked?'🔒  筹备中':'✦  主题世界',locked?'disabled':'micro');
  // Lower third follows Web's kicker/title/record/dots/start/online hierarchy.
  const m=l.itemY;
  ctx.fillStyle='#ffdeb0';ctx.font='800 10px sans-serif';
  ctx.fillText(card.kicker,w/2,m-5,w-22);
  ctx.font='900 21px sans-serif';ctx.fillStyle='#fff0bb';
  ctx.shadowColor='#4b2d28';ctx.shadowBlur=9;
  ctx.fillText(card.title,w/2,m+19,w-30);ctx.shadowBlur=0;
  ctx.fillStyle='#ffe5c7';ctx.font='700 11px sans-serif';
  ctx.fillText(locked?'全新主题正在制作 · 敬请期待':
    '最高 '+view.highest+' · BEST '+view.best.toLocaleString('zh-CN'),
    w/2,m+43,w-25);
  l.dots.forEach((r,i)=>{
    const x=r.x+r.width/2,y=r.y+r.height/2;
    if(i===selected){
      rounded(ctx,{x:x-11,y:y-3,width:22,height:6},3);
      ctx.fillStyle='#ffe0a6';ctx.fill();
    }else{
      orb(ctx,x,y,3.5,'#ffddb6',i>selected?.58:.72);
    }
  });
  pill(ctx,l.solo,locked?'🔒  敬请期待':'进入世界',locked?'disabled':'primary');
  pill(ctx,l.online,!locked&&(card.id==='kingdom'||card.id==='palace')
    ? '在线对决':'🔒  在线对决 · 暂未开放',
    !locked&&(card.id==='kingdom'||card.id==='palace')?'secondary':'disabled');
  pill(ctx,l.collection,'♧  图鉴','micro');
  pill(ctx,l.rank,'▤  排行','micro');
  pill(ctx,l.daily,view.sidebarReward?'✦  领取':'☼  每日','micro');
  ctx.fillStyle='#ffebcf';ctx.font='600 10px sans-serif';
  ctx.fillText('左右滑动或点击箭头选择主题',w/2,l.footerY,w-25);
  // Top-left configuration remains available without covering the title.
  rounded(ctx,l.settings,12);ctx.fillStyle='#27343bcc';ctx.fill();
  ctx.fillStyle='#fff2d7';ctx.font='900 16px sans-serif';
  ctx.fillText('⚙',l.settings.x+l.settings.width/2,l.settings.y+l.settings.height/2);
  ctx.restore();
}


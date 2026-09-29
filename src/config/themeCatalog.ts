import type { ThemeId } from './themes';
import { ART_THEMES } from './artThemes.generated';

/** Mainline theme map, shared by the browser homepage and the native Douyin canvas. */
export interface ThemeMapCard {
  id: ThemeId | 'candy' | 'snow';
  title: string;
  kicker: string;
  icon: string;
  locked?: boolean;
}
export const THEME_MAP_CARDS: readonly ThemeMapCard[] = [
  {id:'kingdom',title:'微缩王国',kicker:'MINIATURE KINGDOM',icon:'♜'},
  {id:'palace',title:'后宫晋升',kicker:'PALACE ASCENSION',icon:'♛'},
  ...ART_THEMES.map((theme): ThemeMapCard=>({
    id:theme.id,title:theme.title,kicker:theme.kicker,icon:theme.icon,
  })),
  {id:'candy',title:'糖果王国',kicker:'COMING SOON',icon:'🍭',locked:true},
  {id:'snow',title:'冰雪神殿',kicker:'COMING SOON',icon:'❄️',locked:true},
];
export function playableTheme(id: ThemeMapCard['id']): id is ThemeId {
  return id!=='candy'&&id!=='snow';
}


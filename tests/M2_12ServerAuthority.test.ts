import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { JsonAccountRepository, currentSeason, DAILY_AD_S, DAILY_LOGIN_S, DAILY_SIDEBAR_S, DAILY_TASK_S, DISCOVERY_S, publicPlayer, STREAK_CHEST_S, THEME_UNLOCK_COST } from '../server/auth/AccountRepository';

const folders:string[]=[];
async function fixture(){const dir=await mkdtemp(join(tmpdir(),'doublefight-m212-'));folders.push(dir);return {dir,repo:await JsonAccountRepository.open(join(dir,'accounts.json'))};}
afterEach(async()=>{await Promise.all(folders.splice(0).map(x=>rm(x,{recursive:true,force:true})));});
const day=(n:number)=>Date.parse('2026-09-01T12:00:00Z')+(n-1)*86400000;

describe('M2.12 authoritative economy migration',()=>{
  it('migrates v1 without losing Solo or lifetime PvP data and does not retro-pay discovery',async()=>{
    const {dir}=await fixture(),file=join(dir,'legacy.json');
    await writeFile(file,JSON.stringify({version:1,accounts:[{id:'a',douyinOpenId:'old',createdAt:1,updatedAt:day(1),profile:{displayName:'Old'},solo:{bestKingdom:99,highestKingdom:64,bestPalace:44,highestPalace:32},pvp:{wins:3,losses:2,draws:1,rating:1012},rewards:{currency:7},adClaims:[]}],processedMatches:[]}));
    const repo=await JsonAccountRepository.open(file),a=await repo.findById('a'); expect(a?.solo.highestKingdom).toBe(64);expect(a?.pvp.wins).toBe(3);expect(a?.economy.balance).toBe(7);
    expect((await repo.mergeSoloProgress('a','kingdom',100,64,day(2))).discoveryAmount).toBe(0);
  });
  it('serializes daily login, streak, sidebar, daily ad and derived tasks',async()=>{
    const {repo}=await fixture(),a=(await repo.findOrCreate('a',undefined,undefined,day(1))).account;
    expect((await Promise.all([repo.claimDailyLogin(a.id,day(1)),repo.claimDailyLogin(a.id,day(1))])).filter(x=>x.granted)).toHaveLength(1);
    for(let i=2;i<=7;i++)await repo.claimDailyLogin(a.id,day(i));
    const progress=await repo.mergeSoloProgress(a.id,'kingdom',10,8,day(7));
    const ad=await repo.claimAd(a.id,'daily_s_coin','daily-ad-0001',day(7));
    const sidebar=await repo.claimSidebar(a.id,'2026-09-07',day(7));
    expect(progress.taskAmount).toBe(DAILY_TASK_S);expect(ad.amount).toBe(DAILY_AD_S);expect(ad.taskAmount).toBe(DAILY_TASK_S);expect(sidebar.amount).toBe(DAILY_SIDEBAR_S);
    const state=await repo.findById(a.id);expect(state?.economy.balance).toBe(7*DAILY_LOGIN_S+STREAK_CHEST_S+DISCOVERY_S*2+DAILY_TASK_S*2+DAILY_AD_S+DAILY_SIDEBAR_S);
  });
  it('derives discovery monotonically and theme purchase is atomic and free themes remain owned',async()=>{
    const {repo}=await fixture(),a=(await repo.findOrCreate('a')).account;
    expect((await repo.mergeSoloProgress(a.id,'palace',10,32,day(1))).discoveryAmount).toBe(DISCOVERY_S*4);
    expect((await repo.mergeSoloProgress(a.id,'palace',1,4,day(1))).discoveryAmount).toBe(0);
    expect((await repo.unlockTheme(a.id,'future_theme','unlock-0001',day(1))).unlocked).toBe(false);
    for(let i=0;i<35;i++)await repo.claimDailyLogin(a.id,day(i+1));
    const paid=await repo.unlockTheme(a.id,'future_theme','unlock-0001',day(36));expect(paid.unlocked).toBe(true);expect(paid.amount).toBe(-THEME_UNLOCK_COST);
    expect((await repo.unlockTheme(a.id,'future_theme','unlock-0001',day(36))).amount).toBe(0);
    expect((await repo.findById(a.id))?.themes.owned).toContain('future_theme');
  });
  it('caps discovery rewards at the shipped 11 tiers and resets displayed daily tasks by UTC day',async()=>{
    const {repo}=await fixture(),a=(await repo.findOrCreate('cap-player',undefined,undefined,day(1))).account;
    const maxed=await repo.mergeSoloProgress(a.id,'kingdom',5000,1_048_576,day(1));
    expect(maxed.discoveryAmount).toBe(DISCOVERY_S*10);
    expect(publicPlayer(maxed.account,day(1)).rewards.daily.tasks.solo).toBe(true);
    expect(publicPlayer(maxed.account,day(2)).rewards.daily.tasks).toEqual({solo:false,pvp:false,ad:false});
    expect((await repo.mergeSoloProgress(a.id,'kingdom',6000,1_048_576,day(2))).discoveryAmount).toBe(0);
  });
  it('processes authenticated season Elo once, rejects duplicate-account matches, and lists only active players',async()=>{
    const {repo}=await fixture(),now=Date.parse('2026-09-10T00:00:00Z'),a=(await repo.findOrCreate('a',undefined,undefined,now)).account,b=(await repo.findOrCreate('b',undefined,undefined,now)).account;
    await repo.findOrCreate('inactive',undefined,undefined,now);
    expect(await repo.recordMatch({matchId:'same-account',reason:'time_limit',winnerId:'one',players:[{playerId:'one',accountId:a.id},{playerId:'two',accountId:a.id}]},now)).toBe(false);
    expect(await repo.recordMatch({matchId:'guest-only',reason:'time_limit',winnerId:null,players:[{playerId:'guest-one'},{playerId:'guest-two'}]},now)).toBe(false);
    const players=[{playerId:'one',accountId:a.id},{playerId:'two',accountId:b.id}];
    expect(await repo.recordMatch({matchId:'match-one',reason:'time_limit',winnerId:'one',players},now)).toBe(true);
    expect(await repo.recordMatch({matchId:'match-one',reason:'time_limit',winnerId:'one',players},now)).toBe(false);
    const list=await repo.leaderboard(now,50);
    expect(list.entries).toHaveLength(2);
    expect(list.entries[0]?.displayName).toBe((await repo.findById(a.id))?.profile.displayName);
    expect(list.season.id).toBe(currentSeason(now).id);
    const future=now+14*86400000;await repo.leaderboard(future);expect((await repo.findById(a.id))?.pvpSeason.seasonId).toBe(currentSeason(future).id);
  });
});

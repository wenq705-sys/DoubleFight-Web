import type { BoardTile, CellPosition, Direction, MatchSnapshot, SkillEvent } from '../../shared/index';
import type { BattleBoardView } from '../rendering/battle/BattleBoardView';
import { predictPresentation, snapshotMove } from './PresentationEvents';

export type BoardViewPort = Pick<BattleBoardView, 'reset' | 'setTheme' | 'present' | 'reconcile' | 'setStatus' | 'rejectDirection'>;

/** Prediction is disposable presentation state; snapshots always remain authoritative. */
export class OnlineController {
  private pending: { sequence: number; direction: Direction }[] = [];
  private tiles: BoardTile[] = [];
  private blocked: CellPosition[] = [];
  private remoteTiles: BoardTile[] = [];
  private remoteBlocked: CellPosition[] = [];
  private matchId: string | null = null;
  private ready = false;
  private readonly skillSequences = new Map<string, number>();
  private readonly predictedSkillSequences = new Set<number>();
  predictedScore = 0;

  constructor(private readonly local: BoardViewPort, private readonly remote: BoardViewPort) {}
  get pendingCount(): number { return this.pending.length; }
  predictedTiles(): BoardTile[] { return this.tiles.map(tile => ({ ...tile })); }

  reset(): void {
    this.pending = []; this.tiles = []; this.blocked = []; this.remoteTiles = []; this.remoteBlocked = [];
    this.matchId = null; this.ready = false; this.predictedScore = 0;
    this.skillSequences.clear(); this.predictedSkillSequences.clear();
    this.local.reset(); this.remote.reset();
  }
  suspend(): void { this.pending = []; this.ready = false; }

  accept(snapshot: MatchSnapshot, playerId: string): void {
    const me = snapshot.players.find(player => player.playerId === playerId);
    const opponent = snapshot.players.find(player => player.playerId !== playerId);
    if (!me) return;
    const fresh = this.matchId !== snapshot.matchId;
    if (fresh) { this.reset(); this.matchId = snapshot.matchId; }
    this.local.setTheme(me.theme);
    this.pending = snapshot.phase === 'playing' ? this.pending.filter(move => move.sequence > me.lastSequence) : [];
    this.tiles = me.board.tiles.map(tile => ({ ...tile }));
    this.blocked = me.board.blockedCells.map(cell => ({ ...cell }));
    this.predictedScore = me.board.score;
    for (const move of this.pending) {
      const predicted = predictPresentation(this.tiles, move.direction, this.blocked);
      this.tiles = predicted.tiles;
      this.predictedScore += predicted.result.scoreDelta;
    }
    if (fresh) this.local.reset(this.tiles);
    else this.local.reconcile(this.tiles);
    this.local.setStatus(this.blocked, me.shieldActive);

    if (opponent) {
      this.remote.setTheme(opponent.theme);
      const move = fresh ? null : snapshotMove(this.remoteTiles, opponent.board.tiles, this.remoteBlocked);
      if (fresh) this.remote.reset(opponent.board.tiles);
      else if (move) void this.remote.present(move);
      else this.remote.reconcile(opponent.board.tiles);
      this.remote.setStatus(opponent.board.blockedCells, opponent.shieldActive);
      this.remoteTiles = opponent.board.tiles.map(tile => ({ ...tile }));
      this.remoteBlocked = opponent.board.blockedCells.map(cell => ({ ...cell }));
    }
    this.ready = snapshot.phase === 'playing' && me.connected;
  }

  move(direction: Direction, send: (direction: Direction) => number): boolean {
    // 2048 is deterministic between authoritative spawns, so a slightly deeper local queue
    // keeps rapid swipes responsive even when mobile RTT spikes.
    if (!this.ready || this.pending.length >= 6) return false;
    const prediction = predictPresentation(this.tiles, direction, this.blocked);
    if (!prediction.result.changed) { this.local.rejectDirection(direction); return false; }
    this.tiles = prediction.tiles;
    this.predictedScore += prediction.result.scoreDelta;
    // Synchronous scheduling and audio unlock happen in the input gesture, before transport.
    void this.local.present({ type: 'move', direction, result: prediction.result });
    const sequence = send(direction);
    this.pending.push({ sequence, direction });
    return true;
  }

  previewSkill(skillId: SkillEvent['skillId'], send: (skillId: SkillEvent['skillId']) => number): number {
    const sequence = send(skillId);
    this.predictedSkillSequences.add(sequence);
    void this.local.present({ type: 'skill_cast', skill: skillId });
    return sequence;
  }

  skill(event: SkillEvent, playerId: string): void {
    if (!this.matchId || event.sequence <= (this.skillSequences.get(event.casterId) ?? -1)) return;
    this.skillSequences.set(event.casterId, event.sequence);

    const casterIsLocal = event.casterId === playerId;
    const caster = casterIsLocal ? this.local : this.remote;
    const target = event.targetId === playerId ? this.local : this.remote;

    if (!(casterIsLocal && this.predictedSkillSequences.delete(event.sequence))) {
      void caster.present({ type: 'skill_cast', skill: event.skillId });
    }

    if (event.outcome !== 'shielded') {
      void target.present({
        type: 'skill_hit',
        skill: event.skillId,
        removed: event.removedTiles,
        cell: event.blockedCell ?? undefined,
      });
    }
  }
}

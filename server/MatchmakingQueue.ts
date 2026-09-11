import type { NetworkThemeId } from '../shared/index';

export interface MatchmakingEntry {
  connectionId: string;
  playerName: string;
  theme: NetworkThemeId;
  joinedAt: number;
}

/**
 * In-memory FIFO queue for the first public matchmaking milestone.
 *
 * It deliberately knows nothing about Board2048 or match rules. Its only job is to
 * pair live connections; RoomManager converts each pair into the normal RoomSession.
 */
export class MatchmakingQueue {
  private readonly entries: MatchmakingEntry[] = [];

  get size(): number {
    return this.entries.length;
  }

  enqueue(entry: MatchmakingEntry): void {
    this.remove(entry.connectionId);
    this.entries.push({ ...entry });
  }

  remove(connectionId: string): MatchmakingEntry | null {
    const index = this.entries.findIndex((entry) => entry.connectionId === connectionId);
    if (index < 0) return null;
    const [removed] = this.entries.splice(index, 1);
    return removed ?? null;
  }

  has(connectionId: string): boolean {
    return this.entries.some((entry) => entry.connectionId === connectionId);
  }

  get(connectionId: string): MatchmakingEntry | null {
    return this.entries.find((entry) => entry.connectionId === connectionId) ?? null;
  }

  takePair(): [MatchmakingEntry, MatchmakingEntry] | null {
    if (this.entries.length < 2) return null;
    const first = this.entries.shift();
    const second = this.entries.shift();
    return first && second ? [first, second] : null;
  }

  snapshot(): MatchmakingEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }
}

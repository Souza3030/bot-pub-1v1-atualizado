export type QueueState = "open" | "checkin";

export class QueueManager {
  private entries = new Map<string, number>();
  private state: QueueState = "open";

  constructor(private readonly capacity: number) {}

  join(userId: string, now = Date.now()): { ok: boolean; reason?: "locked" | "duplicate" } {
    if (this.state !== "open") return { ok: false, reason: "locked" };
    if (this.entries.has(userId)) return { ok: false, reason: "duplicate" };
    this.entries.set(userId, now);
    return { ok: true };
  }

  leave(userId: string): boolean {
    return this.entries.delete(userId);
  }

  has(userId: string): boolean {
    return this.entries.has(userId);
  }

  size(): number {
    return this.entries.size;
  }

  members(): string[] {
    return [...this.entries.keys()];
  }

  getState(): QueueState {
    return this.state;
  }

  takeBatch(): string[] | null {
    if (this.state !== "open" || this.entries.size < this.capacity) return null;
    const players = this.members().slice(0, this.capacity);
    players.forEach((id) => this.entries.delete(id));
    this.state = "checkin";
    return players;
  }

  reopen(): void {
    this.state = "open";
  }

  requeue(userIds: string[], now = Date.now()): void {
    userIds.forEach((id) => this.entries.set(id, now));
  }

  purgeOlderThan(maxAgeMs: number, now = Date.now()): string[] {
    if (this.state !== "open") return [];
    const removed: string[] = [];
    for (const [id, joinedAt] of this.entries) {
      if (now - joinedAt >= maxAgeMs) {
        this.entries.delete(id);
        removed.push(id);
      }
    }
    return removed;
  }
}

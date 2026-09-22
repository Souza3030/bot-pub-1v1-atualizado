import { CollectionReference } from "firebase-admin/firestore";
import { firestore } from "./firebase";
import { applyOutcome, normalizePlayer } from "./playerStats";
import { PlayerStats } from "./types";

export class PlayerStore {
  private readonly players: CollectionReference;

  constructor(collectionName: string) {
    this.players = firestore.collection(collectionName);
  }

  async load(): Promise<void> {
    await firestore.listCollections();
  }

  async get(userId: string): Promise<PlayerStats> {
    const snapshot = await this.players.doc(userId).get();
    return normalizePlayer(userId, snapshot.data());
  }

  async top(limit = 10): Promise<PlayerStats[]> {
    const snapshot = await this.players.orderBy("points", "desc").limit(limit).get();
    return snapshot.docs.map((document) => normalizePlayer(document.id, document.data()));
  }

  async applyResult(
    winners: string[],
    losers: string[],
    mode: string,
    winPoints: number,
    lossPoints: number,
  ): Promise<void> {
    const outcomes = new Map<string, boolean>();
    winners.forEach((id) => outcomes.set(id, true));
    losers.forEach((id) => outcomes.set(id, false));
    const references = [...outcomes.keys()].map((id) => this.players.doc(id));

    await firestore.runTransaction(async (transaction) => {
      const snapshots = await transaction.getAll(...references);
      snapshots.forEach((snapshot) => {
        const won = outcomes.get(snapshot.id) === true;
        const current = normalizePlayer(snapshot.id, snapshot.data());
        const next: PlayerStats = applyOutcome(current, won, mode, winPoints, lossPoints);
        transaction.set(snapshot.ref, next);
      });
    });
  }
}

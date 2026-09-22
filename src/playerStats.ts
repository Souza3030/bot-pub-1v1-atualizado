import { PlayerStats } from "./types";

export function emptyPlayer(discordId: string): PlayerStats {
  return {
    discordId,
    points: 1_000,
    wins: 0,
    losses: 0,
    matches: 0,
    modes: {},
  };
}

export function normalizePlayer(discordId: string, raw?: Record<string, any>): PlayerStats {
  const fallback = emptyPlayer(discordId);
  if (!raw) return fallback;
  return {
    discordId,
    points: Number.isFinite(raw.points) ? raw.points : fallback.points,
    wins: Number.isFinite(raw.wins) ? raw.wins : 0,
    losses: Number.isFinite(raw.losses) ? raw.losses : 0,
    matches: Number.isFinite(raw.matches) ? raw.matches : 0,
    modes: raw.modes && typeof raw.modes === "object" ? raw.modes : {},
  };
}

export function applyOutcome(
  current: PlayerStats,
  won: boolean,
  mode: string,
  winPoints: number,
  lossPoints: number,
): PlayerStats {
  const modeStats = current.modes[mode] ?? { wins: 0, losses: 0, matches: 0 };
  return {
    ...current,
    points: Math.max(0, current.points + (won ? winPoints : lossPoints)),
    wins: current.wins + (won ? 1 : 0),
    losses: current.losses + (won ? 0 : 1),
    matches: current.matches + 1,
    modes: {
      ...current.modes,
      [mode]: {
        wins: modeStats.wins + (won ? 1 : 0),
        losses: modeStats.losses + (won ? 0 : 1),
        matches: modeStats.matches + 1,
      },
    },
  };
}

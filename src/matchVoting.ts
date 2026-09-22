import { MatchSide } from "./types";

export type TeamSide = "BLUE" | "RED";
export type ResultVotes = Partial<Record<TeamSide, MatchSide>>;

export type VoteResult =
  | { status: "duplicate" }
  | { status: "waiting" }
  | { status: "disputed" }
  | { status: "agreed"; winner: MatchSide };

export function recordVote(votes: ResultVotes, voterSide: TeamSide, winner: MatchSide): VoteResult {
  if (votes[voterSide]) return { status: "duplicate" };
  votes[voterSide] = winner;
  if (!votes.BLUE || !votes.RED) return { status: "waiting" };
  if (votes.BLUE !== votes.RED) return { status: "disputed" };
  return { status: "agreed", winner: votes.BLUE };
}

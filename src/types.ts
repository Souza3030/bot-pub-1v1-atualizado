export interface ModeStats {
  wins: number;
  losses: number;
  matches: number;
}

export interface PlayerStats {
  discordId: string;
  points: number;
  wins: number;
  losses: number;
  matches: number;
  modes: Record<string, ModeStats>;
}

export interface Team {
  name: "BLUE" | "RED";
  memberIds: string[];
}

export interface MatchChannels {
  categoryId: string;
  textChannelId: string;
  voiceChannelAId: string;
  voiceChannelBId: string;
}

export type MatchSide = "blue" | "red";

export interface ActiveMatch extends MatchChannels {
  id: string;
  teamA: Team;
  teamB: Team;
  createdAt: number;
  announcementMessageId?: string;
  resultVotes: Partial<Record<"BLUE" | "RED", MatchSide>>;
  resultDeadlineAt: number;
  resultTimeout?: NodeJS.Timeout;
}

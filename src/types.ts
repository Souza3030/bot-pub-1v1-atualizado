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
  name: "A" | "B";
  memberIds: string[];
}

export interface MatchChannels {
  categoryId: string;
  textChannelId: string;
  voiceChannelAId: string;
  voiceChannelBId: string;
}

export interface PendingResult {
  submittedBy: string;
  scoreA: number;
  scoreB: number;
  winner: "A" | "B";
}

export interface ActiveMatch extends MatchChannels {
  id: string;
  teamA: Team;
  teamB: Team;
  createdAt: number;
  announcementMessageId?: string;
  pendingResult?: PendingResult;
}

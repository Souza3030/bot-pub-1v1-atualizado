import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Configuracao ausente: ${name}`);
  return value;
}

function optionalNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const config = {
  discord: {
    token: required("DISCORD_TOKEN"),
    clientId: required("DISCORD_CLIENT_ID"),
    guildId: required("DISCORD_GUILD_ID"),
  },
  channels: {
    staff: required("STAFF_CHANNEL_ID"),
    queue: required("QUEUE_CHANNEL_ID"),
  },
  staffRoleId: process.env.STAFF_ROLE_ID?.trim() || undefined,
  bannerUrl: process.env.BOT_BANNER_URL?.trim() || undefined,
  firebase: {
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim() || "./serviceAccountKey.json",
    playersCollection: process.env.FIRESTORE_PLAYERS_COLLECTION?.trim() || "mamoball_players",
  },
  roles: {
    Bronze: process.env.ROLE_BRONZE?.trim() || undefined,
    Prata: process.env.ROLE_PRATA?.trim() || undefined,
    Ouro: process.env.ROLE_OURO?.trim() || undefined,
    Platina: process.env.ROLE_PLATINA?.trim() || undefined,
    Diamante: process.env.ROLE_DIAMANTE?.trim() || undefined,
    Mestre: process.env.ROLE_MESTRE?.trim() || undefined,
    Elite: process.env.ROLE_ELITE?.trim() || undefined,
    Campeao: process.env.ROLE_CAMPEAO?.trim() || undefined,
  },
  queueTimeoutMs: optionalNumber("QUEUE_TIMEOUT_MINUTES", 15) * 60_000,
  checkinTimeoutMs: optionalNumber("CHECKIN_TIMEOUT_SECONDS", 60) * 1_000,
  matchChannelTtlMs: optionalNumber("MATCH_CHANNEL_TTL_MINUTES", 120) * 60_000,
  channelDeleteDelayMs: 10_000,
  points: { win: 25, loss: -15 },
} as const;

import { Guild, GuildMember } from "discord.js";
import { config } from "./config";
import { getRankByPoints, RankName, RankTier } from "./rankTiers";

function roleId(rank: RankName): string | undefined {
  return config.roles[rank];
}

export async function syncRankRole(guild: Guild, member: GuildMember, points: number): Promise<RankTier> {
  const rank = getRankByPoints(points);
  const nextRoleId = roleId(rank.name);
  const configuredRoleIds = Object.values(config.roles).filter((id): id is string => Boolean(id));

  const obsolete = member.roles.cache.filter((role) =>
    configuredRoleIds.includes(role.id) && role.id !== nextRoleId
  );
  for (const role of obsolete.values()) {
    await member.roles.remove(role).catch((error) => console.error(`[Rank] remove ${role.id}`, error));
  }

  if (nextRoleId && !member.roles.cache.has(nextRoleId)) {
    const role = await guild.roles.fetch(nextRoleId).catch(() => null);
    if (role) await member.roles.add(role).catch((error) => console.error(`[Rank] add ${nextRoleId}`, error));
  }
  return rank;
}

export async function syncPlayersRankRoles(guild: Guild, playerIds: string[], getPoints: (id: string) => Promise<number>): Promise<void> {
  for (const playerId of playerIds) {
    const member = await guild.members.fetch(playerId).catch(() => null);
    if (!member) continue;
    const points = await getPoints(playerId);
    await syncRankRole(guild, member, points);
  }
}

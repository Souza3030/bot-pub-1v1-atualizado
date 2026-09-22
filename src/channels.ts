import {
  ChannelType,
  Guild,
  OverwriteResolvable,
  PermissionFlagsBits,
} from "discord.js";
import { config } from "./config";
import { MODE } from "./mode";
import { MatchChannels, Team } from "./types";

function staffOverwrite(): OverwriteResolvable[] {
  return config.staffRoleId
    ? [{ id: config.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels] }]
    : [];
}

export async function createMatchChannels(guild: Guild, matchId: string, teamA: Team, teamB: Team): Promise<MatchChannels> {
  const players = [...teamA.memberIds, ...teamB.memberIds];
  const common: OverwriteResolvable[] = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    ...staffOverwrite(),
    ...players.map((id) => ({
      id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    })),
  ];
  const category = await guild.channels.create({
    name: `arena-${MODE.key}-${matchId.toLowerCase()}`,
    type: ChannelType.GuildCategory,
    permissionOverwrites: common,
  });
  const text = await guild.channels.create({
    name: `partida-${matchId.toLowerCase()}`,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: common,
  });
  const voice = async (name: string, members: string[]) => guild.channels.create({
    name,
    type: ChannelType.GuildVoice,
    parent: category.id,
    userLimit: MODE.playersPerTeam,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
      ...staffOverwrite(),
      ...members.map((id) => ({
        id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
      })),
    ],
  });
  const sideA = await voice("lado-a", teamA.memberIds);
  const sideB = await voice("lado-b", teamB.memberIds);
  return { categoryId: category.id, textChannelId: text.id, voiceChannelAId: sideA.id, voiceChannelBId: sideB.id };
}

export async function deleteMatchChannels(guild: Guild, channels: MatchChannels): Promise<void> {
  for (const id of [channels.textChannelId, channels.voiceChannelAId, channels.voiceChannelBId, channels.categoryId]) {
    const channel = await guild.channels.fetch(id).catch(() => null);
    if (channel) await channel.delete().catch(() => undefined);
  }
}

export async function cleanupStaleChannels(guild: Guild): Promise<number> {
  await guild.channels.fetch();
  const stale = guild.channels.cache.filter((channel) =>
    channel.type === ChannelType.GuildCategory &&
    channel.name.startsWith(`arena-${MODE.key}-`) &&
    Date.now() - channel.createdTimestamp >= config.matchChannelTtlMs
  );
  let count = 0;
  for (const category of stale.values()) {
    const children = guild.channels.cache.filter((channel) => channel.parentId === category.id);
    for (const child of children.values()) await child.delete().catch(() => undefined);
    await category.delete().catch(() => undefined);
    count += 1;
  }
  return count;
}

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  User,
} from "discord.js";
import { config } from "./config";
import { IDs, withId } from "./ids";
import { MODE } from "./mode";
import { QueueManager } from "./queue";
import { getRankByPoints } from "./rankTiers";
import { ActiveMatch, PlayerStats } from "./types";

const graphite = 0x0b0d12;
const muted = "`AGUARDANDO`";

export function queuePanel(queue: QueueManager): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const members = queue.members();
  const slots = Array.from({ length: MODE.totalPlayers }, (_, index) =>
    members[index] ? `<@${members[index]}>` : muted
  );

  const embed = new EmbedBuilder()
    .setColor(MODE.accent)
    .setAuthor({ name: "MAMOBALL / ARENA" })
    .setTitle(MODE.label)
    .setDescription(queue.getState() === "checkin" ? "`CHECK-IN`" : "`FILA ABERTA`")
    .addFields(
      { name: "OCUPACAO", value: `\`${members.length.toString().padStart(2, "0")} / ${MODE.totalPlayers.toString().padStart(2, "0")}\``, inline: true },
      { name: "FORMATO", value: `\`${MODE.playersPerTeam} + ${MODE.playersPerTeam}\``, inline: true },
      { name: "JOGADORES", value: slots.join("\n") },
    )
    .setFooter({ text: `MM / ${MODE.label}` });

  if (config.bannerUrl) embed.setImage(config.bannerUrl);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(IDs.queueJoin)
      .setLabel("ENTRAR")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(queue.getState() !== "open"),
    new ButtonBuilder()
      .setCustomId(IDs.queueLeave)
      .setLabel("SAIR")
      .setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row] };
}

export function checkinPanel(sessionId: string, players: string[], confirmed: Set<string>) {
  const list = players.map((id) => `${confirmed.has(id) ? "CONFIRMADO" : "PENDENTE"}  <@${id}>`);
  const embed = new EmbedBuilder()
    .setColor(MODE.accent)
    .setAuthor({ name: "MAMOBALL / CHECK-IN" })
    .setTitle(MODE.label)
    .setDescription(`\`${confirmed.size.toString().padStart(2, "0")} / ${players.length.toString().padStart(2, "0")}\``)
    .addFields({ name: "STATUS", value: list.join("\n") })
    .setFooter({ text: `${Math.round(config.checkinTimeoutMs / 1_000)} S` });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(withId(IDs.checkin, sessionId))
      .setLabel("CONFIRMAR")
      .setStyle(ButtonStyle.Success),
  );
  return { embeds: [embed], components: [row] };
}

export function matchPanel(match: ActiveMatch, disabled = false) {
  const embed = new EmbedBuilder()
    .setColor(MODE.accent)
    .setAuthor({ name: `MAMOBALL / ${match.id}` })
    .setTitle(MODE.label)
    .setDescription("`PARTIDA ATIVA`")
    .addFields(
      { name: "LADO A", value: match.teamA.memberIds.map((id) => `<@${id}>`).join("\n"), inline: true },
      { name: "LADO B", value: match.teamB.memberIds.map((id) => `<@${id}>`).join("\n"), inline: true },
    )
    .setFooter({ text: "RESULTADO SUJEITO A VALIDACAO" });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(withId(IDs.result, match.id))
      .setLabel(disabled ? "EM ANALISE" : "RESULTADO")
      .setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(disabled),
  );
  return { embeds: [embed], components: [row] };
}

export function staffResultPanel(match: ActiveMatch) {
  const result = match.pendingResult!;
  const embed = new EmbedBuilder()
    .setColor(MODE.accent)
    .setAuthor({ name: "MAMOBALL / VALIDACAO" })
    .setTitle(match.id)
    .setDescription(`\`A ${result.scoreA}  /  ${result.scoreB} B\``)
    .addFields(
      { name: "LADO A", value: match.teamA.memberIds.map((id) => `<@${id}>`).join("\n"), inline: true },
      { name: "LADO B", value: match.teamB.memberIds.map((id) => `<@${id}>`).join("\n"), inline: true },
      { name: "ENVIO", value: `<@${result.submittedBy}>` },
    );
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(withId(IDs.approve, match.id)).setLabel("APROVAR").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(withId(IDs.reject, match.id)).setLabel("REJEITAR").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(withId(IDs.void, match.id)).setLabel("ANULAR").setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row] };
}

export function profilePanel(user: User, stats: PlayerStats): EmbedBuilder {
  const modeStats = stats.modes[MODE.key] ?? { wins: 0, losses: 0, matches: 0 };
  const rate = modeStats.matches ? Math.round((modeStats.wins / modeStats.matches) * 100) : 0;
  const rank = getRankByPoints(stats.points);
  return new EmbedBuilder()
    .setColor(graphite)
    .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
    .setTitle(MODE.label)
    .addFields(
      { name: "PONTOS", value: `\`${stats.points}\``, inline: true },
      { name: "PATENTE", value: `\`${rank.displayName}\``, inline: true },
      { name: "TAXA", value: `\`${rate}%\``, inline: true },
      { name: "REGISTRO", value: `\`${modeStats.wins}V  ${modeStats.losses}D\`` },
    )
    .setThumbnail(user.displayAvatarURL({ size: 256 }));
}

export function rankingPanel(players: PlayerStats[]): EmbedBuilder {
  const rows = players.length
    ? players.map((player, index) => `\`${String(index + 1).padStart(2, "0")}\`  <@${player.discordId}>  **${player.points}**  ${getRankByPoints(player.points).displayName}`)
    : [muted];
  return new EmbedBuilder()
    .setColor(graphite)
    .setAuthor({ name: "MAMOBALL / RANKING" })
    .setTitle(MODE.label)
    .setDescription(rows.join("\n"));
}

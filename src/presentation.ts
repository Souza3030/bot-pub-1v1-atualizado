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
import { ActiveMatch, MatchSide, PlayerStats } from "./types";

const graphite = 0x0b0d12;
const blue = 0x2563eb;
const red = 0xdc2626;

export function queuePanel(): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const embed = new EmbedBuilder()
    .setColor(MODE.accent)
    .setAuthor({ name: "MAMOBALL / ARENA" })
    .setTitle(`${MODE.label}  COMPETITIVO`)
    .setDescription("Entre quando estiver pronto. A fila sera criada neste canal.")
    .addFields(
      { name: "FORMATO", value: `\`${MODE.playersPerTeam} + ${MODE.playersPerTeam}\``, inline: true },
      { name: "PONTOS", value: "`+25 / -15`", inline: true },
    )
    .setFooter({ text: "FILA • CHECK-IN • PARTIDA" });
  if (config.bannerUrl) embed.setImage(config.bannerUrl);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(IDs.queueJoin).setLabel("Entrar na fila").setEmoji("🎮").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(IDs.queueLeave).setLabel("Sair").setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row] };
}

export function queueStatusPanel(queue: QueueManager) {
  const members = queue.members();
  const slots = Array.from({ length: MODE.totalPlayers }, (_, index) =>
    members[index] ? `<@${members[index]}>` : "`vaga`"
  );
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(MODE.accent)
        .setAuthor({ name: "MAMOBALL / FILA" })
        .setTitle(`${MODE.label}  ${members.length}/${MODE.totalPlayers}`)
        .setDescription(slots.join("\n"))
        .setFooter({ text: "A PARTIDA INICIA APOS O CHECK-IN" }),
    ],
    components: [],
  };
}

export function checkinPanel(sessionId: string, players: string[], confirmed: Set<string>) {
  const list = players.map((id) => `${confirmed.has(id) ? "✅" : "⏳"}  <@${id}>`);
  const embed = new EmbedBuilder()
    .setColor(MODE.accent)
    .setAuthor({ name: "MAMOBALL / CHECK-IN" })
    .setTitle(`${MODE.label}  ${confirmed.size}/${players.length}`)
    .setDescription(list.join("\n"))
    .setFooter({ text: `${Math.round(config.checkinTimeoutMs / 1_000)} SEGUNDOS` });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(withId(IDs.checkin, sessionId))
      .setLabel("Confirmar presença")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success),
  );
  return { embeds: [embed], components: [row] };
}

function voteStatus(match: ActiveMatch, side: "BLUE" | "RED"): string {
  const vote = match.resultVotes[side];
  if (!vote) return "Aguardando";
  return vote === "blue" ? "Azul" : "Vermelho";
}

export function matchPanel(match: ActiveMatch) {
  const embed = new EmbedBuilder()
    .setColor(MODE.accent)
    .setAuthor({ name: `MAMOBALL / ${match.id}` })
    .setTitle(`${MODE.label}  PARTIDA ATIVA`)
    .setDescription(`Confirmação encerra <t:${Math.floor(match.resultDeadlineAt / 1_000)}:R>.`)
    .addFields(
      { name: "🔵 TIME AZUL", value: match.teamA.memberIds.map((id) => `<@${id}>`).join("\n"), inline: true },
      { name: "🔴 TIME VERMELHO", value: match.teamB.memberIds.map((id) => `<@${id}>`).join("\n"), inline: true },
      { name: "CONFIRMACAO", value: `Azul: **${voteStatus(match, "BLUE")}**\nVermelho: **${voteStatus(match, "RED")}**` },
    )
    .setFooter({ text: "UM JOGADOR DE CADA TIME DEVE CONFIRMAR" });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(withId(IDs.winnerBlue, match.id)).setLabel("Time Azul ganhou").setEmoji("🔵").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(withId(IDs.winnerRed, match.id)).setLabel("Time Vermelho ganhou").setEmoji("🔴").setStyle(ButtonStyle.Danger),
  );
  return { embeds: [embed], components: [row] };
}

export function disputedResultPanel(match: ActiveMatch) {
  const embed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setAuthor({ name: `MAMOBALL / ${match.id}` })
    .setTitle("RESULTADO DIVERGENTE")
    .setDescription("A staff deve definir o vencedor.")
    .addFields(
      { name: "🔵 TIME AZUL", value: match.teamA.memberIds.map((id) => `<@${id}>`).join("\n"), inline: true },
      { name: "🔴 TIME VERMELHO", value: match.teamB.memberIds.map((id) => `<@${id}>`).join("\n"), inline: true },
    );
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(withId(IDs.staffBlue, match.id)).setLabel("Vitória Azul").setEmoji("🔵").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(withId(IDs.staffRed, match.id)).setLabel("Vitória Vermelha").setEmoji("🔴").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(withId(IDs.void, match.id)).setLabel("Anular").setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row] };
}

export function expiredResultPanel(match: ActiveMatch) {
  const embed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setAuthor({ name: `MAMOBALL / ${match.id}` })
    .setTitle("TEMPO ENCERRADO")
    .setDescription("A staff deve definir o vencedor.")
    .addFields(
      { name: "🔵 TIME AZUL", value: match.teamA.memberIds.map((id) => `<@${id}>`).join("\n"), inline: true },
      { name: "🔴 TIME VERMELHO", value: match.teamB.memberIds.map((id) => `<@${id}>`).join("\n"), inline: true },
    );
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(withId(IDs.staffBlue, match.id)).setLabel("Vitória Azul").setEmoji("🔵").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(withId(IDs.staffRed, match.id)).setLabel("Vitória Vermelha").setEmoji("🔴").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(withId(IDs.void, match.id)).setLabel("Anular").setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row] };
}

export function finishedMatchPanel(match: ActiveMatch, winner?: MatchSide) {
  const title = winner === "blue" ? "🔵 TIME AZUL VENCEU" : winner === "red" ? "🔴 TIME VERMELHO VENCEU" : "PARTIDA ANULADA";
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(winner === "blue" ? blue : winner === "red" ? red : 0x6b7280)
        .setAuthor({ name: `MAMOBALL / ${match.id}` })
        .setTitle(title)
        .setDescription(winner ? "Pontos e patentes atualizados." : "Nenhum ponto foi alterado."),
    ],
    components: [],
  };
}

export function profilePanel(user: User, stats: PlayerStats): EmbedBuilder {
  const modeStats = stats.modes[MODE.key] ?? { wins: 0, losses: 0, matches: 0 };
  const rate = modeStats.matches ? Math.round((modeStats.wins / modeStats.matches) * 100) : 0;
  const rank = getRankByPoints(stats.points);
  return new EmbedBuilder()
    .setColor(graphite)
    .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
    .setTitle(`${rank.displayName}  •  ${MODE.label}`)
    .addFields(
      { name: "PONTOS", value: `\`${stats.points}\``, inline: true },
      { name: "TAXA", value: `\`${rate}%\``, inline: true },
      { name: "REGISTRO", value: `\`${modeStats.wins}V  ${modeStats.losses}D\`` },
    )
    .setThumbnail(user.displayAvatarURL({ size: 256 }));
}

export function rankingPanel(players: PlayerStats[]): EmbedBuilder {
  const rows = players.length
    ? players.map((player, index) => `\`${String(index + 1).padStart(2, "0")}\`  <@${player.discordId}>  **${player.points}**  ${getRankByPoints(player.points).displayName}`)
    : ["`sem dados`"];
  return new EmbedBuilder()
    .setColor(graphite)
    .setAuthor({ name: "MAMOBALL / RANKING GLOBAL" })
    .setTitle(MODE.label)
    .setDescription(rows.join("\n"));
}

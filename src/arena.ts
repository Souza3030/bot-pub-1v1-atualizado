import {
  ButtonInteraction,
  ChannelType,
  EmbedBuilder,
  Guild,
  Message,
  PermissionFlagsBits,
  TextChannel,
} from "discord.js";
import { cleanupStaleChannels, createMatchChannels, deleteMatchChannels } from "./channels";
import { config } from "./config";
import { IDs, trailingId } from "./ids";
import { MODE } from "./mode";
import { recordVote } from "./matchVoting";
import {
  checkinPanel,
  disputedResultPanel,
  expiredResultPanel,
  finishedMatchPanel,
  matchPanel,
  queuePanel,
  queueStatusPanel,
} from "./presentation";
import { QueueManager } from "./queue";
import { permissionReport } from "./permissions";
import { syncPlayersRankRoles } from "./rankRoles";
import { PlayerStore } from "./storage";
import { ActiveMatch, MatchSide, Team } from "./types";

interface CheckinSession {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  players: string[];
  confirmed: Set<string>;
  timeout: NodeJS.Timeout;
  completing: boolean;
}

interface MessageLocation {
  guildId: string;
  channelId: string;
  messageId: string;
}

function code(length = 6): string {
  return Math.random().toString(36).slice(2, 2 + length).toUpperCase();
}

export class Arena {
  readonly queue = new QueueManager(MODE.totalPlayers);
  readonly store = new PlayerStore(config.firebase.playersCollection);
  readonly matches = new Map<string, ActiveMatch>();
  private readonly checkins = new Map<string, CheckinSession>();
  private readonly processingResults = new Set<string>();
  private panel?: MessageLocation;
  private queueMessage?: MessageLocation;

  async ready(guild: Guild): Promise<void> {
    await this.store.load();
    const report = await permissionReport(guild);
    if (!report.ok) console.warn(`[Permissions]\n${report.lines.join("\n")}`);
    await cleanupStaleChannels(guild);
    await this.ensurePanel(guild);
    setInterval(() => this.removeInactive(guild), 60_000).unref();
    setInterval(() => cleanupStaleChannels(guild).catch(console.error), 60 * 60_000).unref();
  }

  async ensurePanel(guild: Guild): Promise<Message> {
    const channel = await guild.channels.fetch(config.channels.queue);
    if (!channel || channel.type !== ChannelType.GuildText) throw new Error("QUEUE_CHANNEL_ID invalido");
    const recent = await channel.messages.fetch({ limit: 50 });
    const existing = recent.find((message) =>
      message.author.id === guild.members.me?.id &&
      message.embeds[0]?.author?.name === "MAMOBALL / ARENA" &&
      message.embeds[0]?.title?.startsWith(MODE.label)
    );
    const message = existing ? await existing.edit(queuePanel()) : await channel.send(queuePanel());
    this.panel = { guildId: guild.id, channelId: channel.id, messageId: message.id };
    return message;
  }

  async handleButton(interaction: ButtonInteraction): Promise<void> {
    if (interaction.customId === IDs.queueJoin) return this.join(interaction);
    if (interaction.customId === IDs.queueLeave) return this.leave(interaction);
    if (interaction.customId.startsWith(`${IDs.checkin}:`)) return this.confirm(interaction);
    if (
      interaction.customId.startsWith(`${IDs.winnerBlue}:`) ||
      interaction.customId.startsWith(`${IDs.winnerRed}:`)
    ) return this.voteWinner(interaction);
    if (
      interaction.customId.startsWith(`${IDs.staffBlue}:`) ||
      interaction.customId.startsWith(`${IDs.staffRed}:`) ||
      interaction.customId.startsWith(`${IDs.void}:`)
    ) return this.staffDecision(interaction);
  }

  private async join(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.guild) return;
    const result = this.queue.join(interaction.user.id);
    if (!result.ok) {
      const content = result.reason === "duplicate" ? "Voce ja esta na fila." : "Check-in em andamento.";
      await interaction.reply({ content, ephemeral: true });
      return;
    }
    await interaction.reply({ content: `Entrada confirmada. ${this.queue.size()}/${MODE.totalPlayers}`, ephemeral: true });
    const channel = interaction.channel?.type === ChannelType.GuildText ? interaction.channel : undefined;
    await this.refreshQueueMessage(interaction.guild, channel);

    const players = this.queue.takeBatch();
    if (!players) return;
    const queueChannel = channel ?? await this.getQueueChannel(interaction.guild);
    try {
      await this.startCheckin(interaction.guild, queueChannel, players);
    } catch (error) {
      console.error("[Checkin]", error);
      this.queue.reopen();
      this.queue.requeue(players);
      await this.refreshQueueMessage(interaction.guild, queueChannel);
    }
  }

  private async leave(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.guild) return;
    const removed = this.queue.leave(interaction.user.id);
    await interaction.reply({ content: removed ? "Saida confirmada." : "Voce nao esta na fila.", ephemeral: true });
    if (removed) await this.refreshQueueMessage(interaction.guild);
  }

  private async startCheckin(guild: Guild, channel: TextChannel, players: string[]): Promise<void> {
    const id = code(8);
    const confirmed = new Set<string>();
    const existing = await this.fetchQueueMessage(guild);
    const message = existing
      ? await existing.edit(checkinPanel(id, players, confirmed))
      : await channel.send(checkinPanel(id, players, confirmed));
    this.queueMessage = { guildId: guild.id, channelId: channel.id, messageId: message.id };
    const session: CheckinSession = {
      id,
      guildId: guild.id,
      channelId: channel.id,
      messageId: message.id,
      players,
      confirmed,
      completing: false,
      timeout: setTimeout(() => this.expireCheckin(id), config.checkinTimeoutMs),
    };
    this.checkins.set(id, session);
  }

  private async confirm(interaction: ButtonInteraction): Promise<void> {
    const session = this.checkins.get(trailingId(interaction.customId));
    if (!session || session.completing) {
      await interaction.reply({ content: "Check-in encerrado.", ephemeral: true });
      return;
    }
    if (!session.players.includes(interaction.user.id)) {
      await interaction.reply({ content: "Acesso negado.", ephemeral: true });
      return;
    }
    session.confirmed.add(interaction.user.id);
    await interaction.update(checkinPanel(session.id, session.players, session.confirmed));
    if (session.confirmed.size !== session.players.length) return;

    session.completing = true;
    clearTimeout(session.timeout);
    this.checkins.delete(session.id);
    this.queue.reopen();
    if (!interaction.guild) return;
    try {
      const match = await this.createMatch(interaction.guild, session.players);
      await interaction.message.edit({
        embeds: [new EmbedBuilder().setColor(MODE.accent).setTitle(`✅ ${match.id}`).setDescription("Partida criada.")],
        components: [],
      });
      this.queueMessage = undefined;
      setTimeout(() => interaction.message.delete().catch(() => undefined), 10_000);
    } catch (error) {
      console.error("[Match]", error);
      this.queue.requeue(session.players);
      await this.refreshQueueMessage(interaction.guild);
    }
  }

  private async expireCheckin(id: string): Promise<void> {
    const session = this.checkins.get(id);
    if (!session || session.completing) return;
    this.checkins.delete(id);
    this.queue.reopen();
    this.queue.requeue([...session.confirmed]);
    const guild = globalThis.botClient?.guilds.cache.get(session.guildId);
    if (!guild) return;
    if (this.queue.size()) {
      await this.refreshQueueMessage(guild);
    } else {
      const message = await this.fetchQueueMessage(guild);
      await message?.delete().catch(() => undefined);
      this.queueMessage = undefined;
    }
  }

  private async createMatch(guild: Guild, playerIds: string[]): Promise<ActiveMatch> {
    const { teamA, teamB } = await this.balance(playerIds);
    const id = code();
    const channels = await createMatchChannels(guild, id, teamA, teamB);
    const match: ActiveMatch = {
      id,
      teamA,
      teamB,
      createdAt: Date.now(),
      resultVotes: {},
      resultDeadlineAt: Date.now() + config.resultConfirmationTimeoutMs,
      ...channels,
    };
    this.matches.set(id, match);
    const channel = await guild.channels.fetch(match.textChannelId);
    if (!channel || channel.type !== ChannelType.GuildText) throw new Error("Canal da partida nao criado");
    const mentions = playerIds.map((playerId) => `<@${playerId}>`).join(" ");
    const announcement = await channel.send({ content: mentions, ...matchPanel(match) });
    match.announcementMessageId = announcement.id;
    match.resultTimeout = setTimeout(
      () => this.expireResultConfirmation(guild, match.id),
      config.resultConfirmationTimeoutMs,
    );
    return match;
  }

  private async balance(playerIds: string[]): Promise<{ teamA: Team; teamB: Team }> {
    const rated = await Promise.all(playerIds.map(async (id) => ({ id, points: (await this.store.get(id)).points })));
    rated.sort((a, b) => b.points - a.points);
    const teamA: Team = { name: "BLUE", memberIds: [] };
    const teamB: Team = { name: "RED", memberIds: [] };
    let scoreA = 0;
    let scoreB = 0;
    for (const player of rated) {
      const mustA = teamB.memberIds.length >= MODE.playersPerTeam;
      const chooseA = teamA.memberIds.length < MODE.playersPerTeam && (mustA || scoreA <= scoreB);
      const team = chooseA ? teamA : teamB;
      team.memberIds.push(player.id);
      if (chooseA) scoreA += player.points;
      else scoreB += player.points;
    }
    return { teamA, teamB };
  }

  private async voteWinner(interaction: ButtonInteraction): Promise<void> {
    const match = this.matches.get(trailingId(interaction.customId));
    if (!match || !interaction.guild) {
      await interaction.reply({ content: "Partida encerrada.", ephemeral: true });
      return;
    }
    const voterSide = match.teamA.memberIds.includes(interaction.user.id)
      ? "BLUE"
      : match.teamB.memberIds.includes(interaction.user.id) ? "RED" : undefined;
    if (!voterSide) {
      await interaction.reply({ content: "Apenas jogadores da partida podem confirmar.", ephemeral: true });
      return;
    }
    if (Date.now() >= match.resultDeadlineAt) {
      await interaction.reply({ content: "Tempo encerrado. A staff deve decidir.", ephemeral: true });
      return;
    }
    const winner: MatchSide = interaction.customId.startsWith(`${IDs.winnerBlue}:`) ? "blue" : "red";
    const result = recordVote(match.resultVotes, voterSide, winner);
    if (result.status === "duplicate") {
      await interaction.reply({ content: "Seu time ja confirmou.", ephemeral: true });
      return;
    }
    if (result.status === "waiting") {
      await interaction.update(matchPanel(match));
      return;
    }
    if (result.status === "disputed") {
      await interaction.update(disputedResultPanel(match));
      return;
    }
    await this.finalizeResult(interaction, interaction.guild, match, result.winner);
  }

  private async staffDecision(interaction: ButtonInteraction): Promise<void> {
    const match = this.matches.get(trailingId(interaction.customId));
    const guild = interaction.guild;
    if (!guild || !match) {
      await interaction.reply({ content: "Partida encerrada.", ephemeral: true });
      return;
    }
    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    const isStaff = Boolean(
      member?.permissions.has(PermissionFlagsBits.ManageGuild) ||
      (config.staffRoleId && member?.roles.cache.has(config.staffRoleId))
    );
    if (!isStaff) {
      await interaction.reply({ content: "Acesso negado.", ephemeral: true });
      return;
    }
    if (interaction.customId.startsWith(`${IDs.void}:`)) {
      if (match.resultTimeout) clearTimeout(match.resultTimeout);
      await interaction.update(finishedMatchPanel(match));
      this.matches.delete(match.id);
      await deleteMatchChannels(guild, match);
      return;
    }
    const winner: MatchSide = interaction.customId.startsWith(`${IDs.staffBlue}:`) ? "blue" : "red";
    await this.finalizeResult(interaction, guild, match, winner);
  }

  private async finalizeResult(
    interaction: ButtonInteraction,
    guild: Guild,
    match: ActiveMatch,
    winner: MatchSide,
  ): Promise<void> {
    if (this.processingResults.has(match.id)) {
      await interaction.reply({ content: "Resultado em processamento.", ephemeral: true });
      return;
    }
    this.processingResults.add(match.id);
    await interaction.deferUpdate();
    try {
      const winners = winner === "blue" ? match.teamA.memberIds : match.teamB.memberIds;
      const losers = winner === "blue" ? match.teamB.memberIds : match.teamA.memberIds;
      await this.store.applyResult(winners, losers, MODE.key, config.points.win, config.points.loss);
      await syncPlayersRankRoles(guild, [...winners, ...losers], async (id) => (await this.store.get(id)).points);
    } catch (error) {
      console.error("[Result]", error);
      match.resultVotes = {};
      await interaction.editReply(matchPanel(match)).catch(() => undefined);
      await interaction.followUp({ content: "Nao foi possivel atualizar os pontos. Tente novamente.", ephemeral: true }).catch(() => undefined);
      this.processingResults.delete(match.id);
      return;
    }

    if (match.resultTimeout) clearTimeout(match.resultTimeout);
    this.matches.delete(match.id);
    await interaction.editReply(finishedMatchPanel(match, winner)).catch((error) => {
      console.error(`[Result] Pontos gravados, mas a mensagem ${match.id} nao foi atualizada`, error);
    });
    await deleteMatchChannels(guild, match);
    this.processingResults.delete(match.id);
  }

  private async expireResultConfirmation(guild: Guild, matchId: string): Promise<void> {
    const match = this.matches.get(matchId);
    if (!match || this.processingResults.has(matchId) || !match.announcementMessageId) return;
    const channel = await guild.channels.fetch(match.textChannelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) return;
    const message = await channel.messages.fetch(match.announcementMessageId).catch(() => null);
    await message?.edit(expiredResultPanel(match)).catch((error) => {
      console.error(`[Result] Falha ao encerrar confirmacao de ${matchId}`, error);
    });
  }

  private async getQueueChannel(guild: Guild): Promise<TextChannel> {
    const channel = await guild.channels.fetch(config.channels.queue);
    if (!channel || channel.type !== ChannelType.GuildText) throw new Error("QUEUE_CHANNEL_ID invalido");
    return channel;
  }

  private async fetchQueueMessage(guild: Guild): Promise<Message | null> {
    if (!this.queueMessage) return null;
    const channel = await guild.channels.fetch(this.queueMessage.channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) return null;
    return channel.messages.fetch(this.queueMessage.messageId).catch(() => null);
  }

  private async refreshQueueMessage(guild: Guild, preferredChannel?: TextChannel): Promise<void> {
    const current = await this.fetchQueueMessage(guild);
    if (!this.queue.size()) {
      await current?.delete().catch(() => undefined);
      this.queueMessage = undefined;
      return;
    }
    if (current) {
      await current.edit(queueStatusPanel(this.queue));
      return;
    }
    const channel = preferredChannel ?? await this.getQueueChannel(guild);
    const message = await channel.send(queueStatusPanel(this.queue));
    this.queueMessage = { guildId: guild.id, channelId: channel.id, messageId: message.id };
  }

  private async removeInactive(guild: Guild): Promise<void> {
    const removed = this.queue.purgeOlderThan(config.queueTimeoutMs);
    if (!removed.length) return;
    await this.refreshQueueMessage(guild);
    for (const id of removed) {
      const user = await guild.client.users.fetch(id).catch(() => null);
      await user?.send(`Fila ${MODE.label} encerrada por inatividade.`).catch(() => undefined);
    }
  }
}

declare global {
  var botClient: import("discord.js").Client | undefined;
}

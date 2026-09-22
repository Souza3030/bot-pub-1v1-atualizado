import {
  ActionRowBuilder,
  ButtonInteraction,
  ChannelType,
  EmbedBuilder,
  Guild,
  Message,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { cleanupStaleChannels, createMatchChannels, deleteMatchChannels } from "./channels";
import { config } from "./config";
import { IDs, trailingId, withId } from "./ids";
import { MODE } from "./mode";
import {
  checkinPanel,
  matchPanel,
  queuePanel,
  staffResultPanel,
} from "./presentation";
import { QueueManager } from "./queue";
import { syncPlayersRankRoles } from "./rankRoles";
import { PlayerStore } from "./storage";
import { ActiveMatch, Team } from "./types";

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

interface PanelLocation {
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
  private panel?: PanelLocation;

  async ready(guild: Guild): Promise<void> {
    await this.store.load();
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
      message.embeds[0]?.title === MODE.label
    );
    const message = existing
      ? await existing.edit(queuePanel(this.queue))
      : await channel.send(queuePanel(this.queue));
    this.panel = { guildId: guild.id, channelId: channel.id, messageId: message.id };
    return message;
  }

  async handleButton(interaction: ButtonInteraction): Promise<void> {
    if (interaction.customId === IDs.queueJoin) return this.join(interaction);
    if (interaction.customId === IDs.queueLeave) return this.leave(interaction);
    if (interaction.customId.startsWith(`${IDs.checkin}:`)) return this.confirm(interaction);
    if (interaction.customId.startsWith(`${IDs.result}:`)) return this.openResultModal(interaction);
    if ([IDs.approve, IDs.reject, IDs.void].some((id) => interaction.customId.startsWith(`${id}:`))) {
      return this.staffDecision(interaction);
    }
  }

  async handleModal(interaction: ModalSubmitInteraction): Promise<void> {
    if (!interaction.customId.startsWith(`${IDs.resultModal}:`)) return;
    const matchId = trailingId(interaction.customId);
    const match = this.matches.get(matchId);
    if (!match || !interaction.guild) {
      await interaction.reply({ content: "Partida encerrada.", ephemeral: true });
      return;
    }
    if (![...match.teamA.memberIds, ...match.teamB.memberIds].includes(interaction.user.id)) {
      await interaction.reply({ content: "Acesso negado.", ephemeral: true });
      return;
    }
    if (match.pendingResult) {
      await interaction.reply({ content: "Resultado em analise.", ephemeral: true });
      return;
    }
    const scoreA = Number(interaction.fields.getTextInputValue(IDs.scoreA));
    const scoreB = Number(interaction.fields.getTextInputValue(IDs.scoreB));
    if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0 || scoreA === scoreB) {
      await interaction.reply({ content: "Placar invalido.", ephemeral: true });
      return;
    }
    match.pendingResult = {
      submittedBy: interaction.user.id,
      scoreA,
      scoreB,
      winner: scoreA > scoreB ? "A" : "B",
    };
    const staff = await interaction.guild.channels.fetch(config.channels.staff).catch(() => null);
    if (!staff || staff.type !== ChannelType.GuildText) {
      match.pendingResult = undefined;
      await interaction.reply({ content: "Canal da staff indisponivel.", ephemeral: true });
      return;
    }
    try {
      await staff.send(staffResultPanel(match));
      await this.editMatchAnnouncement(interaction.guild, match, true);
      await interaction.reply({ content: "Resultado enviado.", ephemeral: true });
    } catch (error) {
      match.pendingResult = undefined;
      console.error("[Result]", error);
      await interaction.reply({ content: "Falha no envio.", ephemeral: true });
    }
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
    await this.refreshPanel(interaction.guild);
    const players = this.queue.takeBatch();
    if (!players) return;
    await this.refreshPanel(interaction.guild);
    const channel = interaction.channel;
    if (!channel || channel.type !== ChannelType.GuildText) {
      this.queue.reopen();
      this.queue.requeue(players);
      return;
    }
    try {
      await this.startCheckin(interaction.guild, channel, players);
    } catch (error) {
      console.error("[Checkin]", error);
      this.queue.reopen();
      this.queue.requeue(players);
      await this.refreshPanel(interaction.guild);
    }
  }

  private async leave(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.guild) return;
    const removed = this.queue.leave(interaction.user.id);
    await interaction.reply({ content: removed ? "Saida confirmada." : "Voce nao esta na fila.", ephemeral: true });
    if (removed) await this.refreshPanel(interaction.guild);
  }

  private async startCheckin(guild: Guild, channel: TextChannel, players: string[]): Promise<void> {
    const id = code(8);
    const confirmed = new Set<string>();
    const message = await channel.send(checkinPanel(id, players, confirmed));
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
        embeds: [new EmbedBuilder().setColor(MODE.accent).setTitle(match.id).setDescription("`PARTIDA CRIADA`")],
        components: [],
      });
    } catch (error) {
      console.error("[Match]", error);
      this.queue.requeue(session.players);
      await interaction.message.edit({
        embeds: [new EmbedBuilder().setColor(0x6b7280).setTitle(MODE.label).setDescription("`FILA RESTAURADA`")],
        components: [],
      });
    }
    await this.refreshPanel(interaction.guild);
  }

  private async expireCheckin(id: string): Promise<void> {
    const session = this.checkins.get(id);
    if (!session || session.completing) return;
    this.checkins.delete(id);
    this.queue.reopen();
    this.queue.requeue([...session.confirmed]);
    const guild = globalThis.botClient?.guilds.cache.get(session.guildId);
    if (!guild) return;
    const channel = await guild.channels.fetch(session.channelId).catch(() => null);
    if (channel?.isTextBased() && !channel.isDMBased()) {
      const message = await channel.messages.fetch(session.messageId).catch(() => null);
      await message?.edit({
        embeds: [new EmbedBuilder().setColor(0x6b7280).setTitle(MODE.label).setDescription("`CHECK-IN ENCERRADO`")],
        components: [],
      }).catch(() => undefined);
    }
    await this.refreshPanel(guild);
  }

  private async createMatch(guild: Guild, playerIds: string[]): Promise<ActiveMatch> {
    const { teamA, teamB } = await this.balance(playerIds);
    const id = code();
    const channels = await createMatchChannels(guild, id, teamA, teamB);
    const match: ActiveMatch = { id, teamA, teamB, createdAt: Date.now(), ...channels };
    this.matches.set(id, match);
    const channel = await guild.channels.fetch(match.textChannelId);
    if (!channel || channel.type !== ChannelType.GuildText) throw new Error("Canal da partida nao criado");
    const allMentions = playerIds.map((playerId) => `<@${playerId}>`).join(" ");
    const announcement = await channel.send({ content: allMentions, ...matchPanel(match) });
    match.announcementMessageId = announcement.id;
    return match;
  }

  private async balance(playerIds: string[]): Promise<{ teamA: Team; teamB: Team }> {
    const rated = await Promise.all(playerIds.map(async (id) => ({ id, points: (await this.store.get(id)).points })));
    rated.sort((a, b) => b.points - a.points);
    const teamA: Team = { name: "A", memberIds: [] };
    const teamB: Team = { name: "B", memberIds: [] };
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

  private async openResultModal(interaction: ButtonInteraction): Promise<void> {
    const match = this.matches.get(trailingId(interaction.customId));
    if (!match || ![...match.teamA.memberIds, ...match.teamB.memberIds].includes(interaction.user.id)) {
      await interaction.reply({ content: "Acesso negado.", ephemeral: true });
      return;
    }
    if (match.pendingResult) {
      await interaction.reply({ content: "Resultado em analise.", ephemeral: true });
      return;
    }
    const input = (id: string, label: string) => new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setMaxLength(2).setRequired(true),
    );
    const modal = new ModalBuilder()
      .setCustomId(withId(IDs.resultModal, match.id))
      .setTitle(`RESULTADO / ${match.id}`)
      .addComponents(input(IDs.scoreA, "PLACAR A"), input(IDs.scoreB, "PLACAR B"));
    await interaction.showModal(modal);
  }

  private async staffDecision(interaction: ButtonInteraction): Promise<void> {
    const matchId = trailingId(interaction.customId);
    const match = this.matches.get(matchId);
    const guild = interaction.guild;
    if (!guild || !match) {
      await interaction.update({ content: "Partida encerrada.", embeds: [], components: [] });
      return;
    }
    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    const staff = Boolean(member?.permissions.has(PermissionFlagsBits.ManageGuild) || (config.staffRoleId && member?.roles.cache.has(config.staffRoleId)));
    if (!staff) {
      await interaction.reply({ content: "Acesso negado.", ephemeral: true });
      return;
    }
    if (!match.pendingResult || this.processingResults.has(matchId)) {
      await interaction.reply({ content: "Resultado indisponivel.", ephemeral: true });
      return;
    }
    const action = interaction.customId.slice(0, interaction.customId.lastIndexOf(":"));
    if (action === IDs.reject) {
      match.pendingResult = undefined;
      await interaction.update({ content: `REJEITADO / ${match.id}`, embeds: [], components: [] });
      await this.editMatchAnnouncement(guild, match, false);
      return;
    }
    if (action === IDs.void) {
      match.pendingResult = undefined;
      await interaction.update({ content: `ANULADO / ${match.id}`, embeds: [], components: [] });
      await this.finishMatch(guild, match, "`PARTIDA ANULADA`");
      return;
    }
    if (action !== IDs.approve) return;
    this.processingResults.add(matchId);
    const result = match.pendingResult;
    try {
      const winners = result.winner === "A" ? match.teamA.memberIds : match.teamB.memberIds;
      const losers = result.winner === "A" ? match.teamB.memberIds : match.teamA.memberIds;
      await this.store.applyResult(winners, losers, MODE.key, config.points.win, config.points.loss);
      await syncPlayersRankRoles(guild, [...winners, ...losers], async (id) => (await this.store.get(id)).points);
      match.pendingResult = undefined;
      await interaction.update({ content: `APROVADO / ${match.id}`, embeds: [], components: [] });
      await this.finishMatch(guild, match, `\`A ${result.scoreA}  /  ${result.scoreB} B\``);
    } catch (error) {
      console.error("[Approval]", error);
      await interaction.reply({ content: "Falha na gravacao.", ephemeral: true }).catch(() => undefined);
    } finally {
      this.processingResults.delete(matchId);
    }
  }

  private async finishMatch(guild: Guild, match: ActiveMatch, description: string): Promise<void> {
    const channel = await guild.channels.fetch(match.textChannelId).catch(() => null);
    if (channel?.isTextBased() && !channel.isDMBased()) {
      await channel.send({ embeds: [new EmbedBuilder().setColor(MODE.accent).setTitle(match.id).setDescription(description)] });
    }
    this.matches.delete(match.id);
    setTimeout(() => deleteMatchChannels(guild, match), config.channelDeleteDelayMs);
  }

  private async editMatchAnnouncement(guild: Guild, match: ActiveMatch, disabled: boolean): Promise<void> {
    if (!match.announcementMessageId) return;
    const channel = await guild.channels.fetch(match.textChannelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) return;
    const message = await channel.messages.fetch(match.announcementMessageId).catch(() => null);
    await message?.edit(matchPanel(match, disabled)).catch(() => undefined);
  }

  private async refreshPanel(guild: Guild): Promise<void> {
    if (!this.panel) {
      await this.ensurePanel(guild);
      return;
    }
    const channel = await guild.channels.fetch(this.panel.channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) return;
    const message = await channel.messages.fetch(this.panel.messageId).catch(() => null);
    if (message) await message.edit(queuePanel(this.queue));
    else await this.ensurePanel(guild);
  }

  private async removeInactive(guild: Guild): Promise<void> {
    const removed = this.queue.purgeOlderThan(config.queueTimeoutMs);
    if (!removed.length) return;
    await this.refreshPanel(guild);
    for (const id of removed) {
      const user = await guild.client.users.fetch(id).catch(() => null);
      await user?.send(`Fila ${MODE.label} encerrada por inatividade.`).catch(() => undefined);
    }
  }
}

declare global {
  var botClient: import("discord.js").Client | undefined;
}

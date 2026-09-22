import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { Arena } from "./arena";
import { profilePanel, rankingPanel } from "./presentation";

export const commandData = [
  new SlashCommandBuilder()
    .setName("painel")
    .setDescription("Publica ou atualiza o painel da fila")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("perfil")
    .setDescription("Exibe um perfil competitivo")
    .addUserOption((option) => option.setName("jogador").setDescription("Jogador consultado")),
  new SlashCommandBuilder()
    .setName("ranking")
    .setDescription("Exibe a classificacao da modalidade"),
].map((command) => command.toJSON());

export async function handleCommand(interaction: ChatInputCommandInteraction, arena: Arena): Promise<void> {
  if (interaction.commandName === "painel") {
    if (!interaction.guild) return;
    const message = await arena.ensurePanel(interaction.guild);
    await interaction.reply({ content: `Painel ativo em <#${message.channelId}>.`, ephemeral: true });
    return;
  }
  if (interaction.commandName === "perfil") {
    const user = interaction.options.getUser("jogador") ?? interaction.user;
    const stats = await arena.store.get(user.id);
    await interaction.reply({ embeds: [profilePanel(user, stats)] });
    return;
  }
  if (interaction.commandName === "ranking") {
    await interaction.deferReply();
    const players = await arena.store.top(10);
    await interaction.editReply({ embeds: [rankingPanel(players)] });
  }
}

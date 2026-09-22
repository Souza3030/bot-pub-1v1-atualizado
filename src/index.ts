import { Client, Events, GatewayIntentBits } from "discord.js";
import { Arena } from "./arena";
import { handleCommand } from "./commands";
import { config } from "./config";
import { MODE } from "./mode";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});
const arena = new Arena();
globalThis.botClient = client;

client.once(Events.ClientReady, async () => {
  const guild = await client.guilds.fetch(config.discord.guildId);
  await arena.ready(guild);
  console.log(`[MamoBall] ${MODE.label} online como ${client.user?.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) await handleCommand(interaction, arena);
    else if (interaction.isButton()) await arena.handleButton(interaction);
  } catch (error) {
    console.error("[Interaction]", error);
    const payload = { content: "Falha interna.", ephemeral: true } as const;
    if (!interaction.isRepliable()) return;
    if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => undefined);
    else await interaction.reply(payload).catch(() => undefined);
  }
});

client.login(config.discord.token).catch((error) => {
  console.error("Falha ao conectar.", error);
  process.exit(1);
});

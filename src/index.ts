import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
} from "discord.js";

import http from "http";

import { Arena } from "./arena";
import { handleCommand } from "./commands";
import { config } from "./config";
import { MODE } from "./mode";

// ==============================
// SERVIDOR HTTP - RENDER
// ==============================

const PORT = Number(process.env.PORT) || 3000;

const server = http.createServer((_req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
  });

  res.end("Bot está rodando!");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[HTTP] Servidor ativo na porta ${PORT}`);
});

// ==============================
// CLIENTE DO DISCORD
// ==============================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

const arena = new Arena();

globalThis.botClient = client;

// ==============================
// BOT PRONTO
// ==============================

client.once(Events.ClientReady, async (readyClient) => {
  try {
    const guild = await readyClient.guilds.fetch(
      config.discord.guildId
    );

    await arena.ready(guild);

    console.log(
      `[MamoBall] ${MODE.label} online como ${readyClient.user.tag}`
    );
  } catch (error) {
    console.error("[ClientReady] Erro ao iniciar a Arena:", error);
  }
});

// ==============================
// INTERAÇÕES
// ==============================

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction, arena);
      return;
    }

    if (interaction.isButton()) {
      await arena.handleButton(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      await arena.handleModal(interaction);
      return;
    }
  } catch (error) {
    console.error("[Interaction] Erro:", error);

    if (!interaction.isRepliable()) {
      return;
    }

    try {
      // Se a interação foi adiada, finaliza a resposta pendente.
      if (interaction.deferred) {
        await interaction.editReply({
          content: "Falha interna.",
        });

        return;
      }

      // Se já houve resposta, envia uma nova mensagem privada.
      if (interaction.replied) {
        await interaction.followUp({
          content: "Falha interna.",
          flags: MessageFlags.Ephemeral,
        });

        return;
      }

      // Se ainda não houve resposta.
      await interaction.reply({
        content: "Falha interna.",
        flags: MessageFlags.Ephemeral,
      });
    } catch (replyError) {
      console.error(
        "[Interaction] Não foi possível responder ao erro:",
        replyError
      );
    }
  }
});

// ==============================
// ERROS DO CLIENTE
// ==============================

client.on(Events.Error, (error) => {
  console.error("[Discord Client] Erro:", error);
});

// ==============================
// LOGIN
// ==============================

client.login(config.discord.token).catch((error) => {
  console.error("[Discord] Falha ao conectar:", error);
  process.exit(1);
});
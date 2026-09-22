import { REST, Routes } from "discord.js";
import { commandData } from "./commands";
import { config } from "./config";

const rest = new REST({ version: "10" }).setToken(config.discord.token);

rest
  .put(Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId), { body: commandData })
  .then(() => console.log("Comandos registrados."))
  .catch((error) => {
    console.error("Falha ao registrar comandos.", error);
    process.exitCode = 1;
  });

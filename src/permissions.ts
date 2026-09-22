import { Guild, PermissionFlagsBits } from "discord.js";
import { config } from "./config";

const requiredPermissions = [
  [PermissionFlagsBits.ViewChannel, "Ver canais"],
  [PermissionFlagsBits.SendMessages, "Enviar mensagens"],
  [PermissionFlagsBits.ReadMessageHistory, "Ler historico"],
  [PermissionFlagsBits.ManageChannels, "Gerenciar canais"],
] as const;

export async function permissionReport(guild: Guild): Promise<{ ok: boolean; lines: string[] }> {
  const bot = guild.members.me ?? await guild.members.fetchMe();
  const lines: string[] = [];
  const missing = requiredPermissions
    .filter(([permission]) => !bot.permissions.has(permission))
    .map(([, label]) => label);

  if (missing.length) lines.push(`Permissoes ausentes: ${missing.join(", ")}`);
  else lines.push("Permissoes de canais: OK");

  const configuredRoleIds = Object.values(config.roles).filter((id): id is string => Boolean(id));
  if (configuredRoleIds.length) {
    if (!bot.permissions.has(PermissionFlagsBits.ManageRoles)) {
      lines.push("Permissao ausente: Gerenciar cargos");
    } else {
      await guild.roles.fetch();
      const unreachable = configuredRoleIds
        .map((id) => guild.roles.cache.get(id))
        .filter((role) => role && role.position >= bot.roles.highest.position)
        .map((role) => role!.name);
      lines.push(unreachable.length
        ? `Cargos acima do bot: ${unreachable.join(", ")}`
        : "Hierarquia de patentes: OK");
    }
  } else {
    lines.push("Cargos de patente: nao configurados");
  }

  return { ok: !lines.some((line) => line.includes("ausente") || line.includes("acima do bot")), lines };
}

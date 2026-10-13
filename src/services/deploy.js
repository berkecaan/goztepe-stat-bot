import { REST, Routes } from 'discord.js';
import { commandData } from '../commands/index.js';
export async function deploy(config) {
  if (!config.token || !config.clientId) throw new Error('DISCORD_TOKEN ve CLIENT_ID gerekli.');
  const rest = new REST({ version: '10' }).setToken(config.token);
  const route = config.guildId
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);
  await rest.put(route, { body: commandData() });
}

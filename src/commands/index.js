import * as core from './core.js';
import * as reports from './reports.js';
import * as admin from './admin.js';
export const modules = [core, reports, admin];
export const commandData = () =>
  modules.flatMap((m) => m.data).map((c) => c.setDMPermission(false).toJSON());
export async function runCommand(i, ctx) {
  const module = modules.find((m) => m.data.some((c) => c.name === i.commandName));
  if (!module) throw new Error('Komut bulunamadı; yeniden deploy edin.');
  return module.execute(i, ctx);
}

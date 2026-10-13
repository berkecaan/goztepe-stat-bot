import { PermissionFlagsBits } from 'discord.js';
export function canManage(permissions) {
  return Boolean(
    permissions?.has(PermissionFlagsBits.Administrator) ||
    permissions?.has(PermissionFlagsBits.ManageGuild),
  );
}
export function requireManager(i) {
  if (!canManage(i.memberPermissions)) {
    const e = new Error('Sunucuyu Yönet veya Yönetici yetkisi gerekli.');
    e.expose = true;
    throw e;
  }
}

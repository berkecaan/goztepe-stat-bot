import { randomBytes } from 'node:crypto';
export class ButtonStore {
  constructor() {
    this.items = new Map();
  }
  create(i, value) {
    this.prune();
    const id = randomBytes(12).toString('hex');
    this.items.set(id, {
      ...value,
      owner: i.user.id,
      guild: i.guildId,
      expires: Date.now() + 300000,
    });
    return id;
  }
  take(customId, i, consume = false) {
    const [id, action] = customId.split(':');
    const v = this.items.get(id);
    if (!v || v.expires < Date.now() || v.owner !== i.user.id || v.guild !== i.guildId)
      throw new Error('Bu buton size ait değil veya süresi doldu. Komutu yeniden kullanın.');
    if (consume) this.items.delete(id);
    return { ...v, action };
  }
  prune() {
    for (const [id, v] of this.items) if (v.expires < Date.now()) this.items.delete(id);
  }
}

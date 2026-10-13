import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (p.endsWith('.js')) yield p;
  }
}
for (const path of [...walk('src'), ...walk('scripts'), ...walk('test')]) {
  const result = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(1);
}
const { commandData } = await import('../src/commands/index.js');
const commands = commandData();
console.log(`${commands.length} slash komutu doğrulandı; JS syntax temiz.`);

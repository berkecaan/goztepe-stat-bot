import { config } from '../src/config/index.js';
import { deploy } from '../src/services/deploy.js';
await deploy(config);
console.log('Göztepe Stat Bot slash komutları yüklendi.');

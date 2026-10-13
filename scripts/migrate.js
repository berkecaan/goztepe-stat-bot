import { config } from '../src/config/index.js';
import { SQLiteRepository } from '../src/database/sqlite.js';
const repo = new SQLiteRepository(config.databasePath);
repo.close();
console.log('Migration tamamlandı.');

import Database from 'better-sqlite3';

const db: Database.Database = new Database('./data/trial-api.sqlite');

// Enable WAL mode for better concurrency and performance
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

export { db };

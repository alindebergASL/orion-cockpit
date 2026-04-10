import bcrypt from 'bcryptjs';
import { initDb, getDb } from './db.js';

initDb();
const db = getDb();

const username = process.argv[2] || 'andrew';
const password = process.argv[3] || 'changeme';
const displayName = process.argv[4] || 'Andrew';

const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
if (existing) {
  console.log(`User "${username}" already exists. Skipping.`);
  process.exit(0);
}

const hash = bcrypt.hashSync(password, 10);
db.prepare('INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)')
  .run(username, hash, displayName, 'admin');

console.log(`Created admin user: ${username} / ${password}`);

/**
 * Migration runner — reads SQL files in order and executes them.
 * Usage: npm run migrate
 */

import 'dotenv/config';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  ssl: { rejectUnauthorized: false },
  options: '--search_path=public',
});

async function run() {
  const client = await pool.connect();

  try {
    // Create migrations tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    const migrationsDir = join(__dirname, '.');
    const sqlFiles = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const filename of sqlFiles) {
      const { rows } = await client.query(
        'SELECT id FROM _migrations WHERE filename = $1',
        [filename]
      );

      if (rows.length > 0) {
        console.log(`[migrate] skipping ${filename} (already applied)`);
        continue;
      }

      console.log(`[migrate] running ${filename}...`);
      const sql = readFileSync(join(migrationsDir, filename), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO _migrations (filename) VALUES ($1)',
          [filename]
        );
        await client.query('COMMIT');
        console.log(`[migrate] ✓ ${filename}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    console.log('[migrate] all migrations complete');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('[migrate] fatal:', err.message);
  process.exit(1);
});

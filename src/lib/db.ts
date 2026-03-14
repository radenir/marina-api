import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config';

export const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // SECURITY: rejectUnauthorized is false because OVH shared DB does not provide
  // a downloadable CA certificate via the control panel. For production hardening,
  // obtain the OVH CA cert and replace this with: ssl: { ca: fs.readFileSync('ovh-ca.pem') }
  ssl: { rejectUnauthorized: false },
  options: '--search_path=public',
});

pool.on('error', (err) => {
  console.error('[db] unexpected pool error:', err.message);
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

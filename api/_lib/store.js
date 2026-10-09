// api/_lib/store.js — armazenamento chave→valor da Bússola em Postgres (Neon, banco bussola_astral).
// Mesmo jeito de usar do @vercel/kv (get / set com { ex } / del), que foi apagado (o host
// darling-shark-128508.upstash.io deixou de existir, então o webhook e as contas falhavam).
// Tabela: kv(key TEXT PRIMARY KEY, value JSONB, expires_at TIMESTAMPTZ, updated_at TIMESTAMPTZ).
// Env: DATABASE_URL.
import pg from 'pg';

let pool;
function db() {
  if (!pool) pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, ssl: { rejectUnauthorized: true } });
  return pool;
}

export const kv = {
  async get(key) {
    const r = await db().query('SELECT value FROM kv WHERE key = $1 AND (expires_at IS NULL OR expires_at > now())', [key]);
    return r.rows[0] ? r.rows[0].value : null;
  },
  async set(key, value, opts = {}) {
    const ex = opts && Number(opts.ex) > 0 ? Number(opts.ex) : null;
    await db().query(
      `INSERT INTO kv (key, value, expires_at, updated_at)
       VALUES ($1, $2::jsonb, CASE WHEN $3::int IS NULL THEN NULL ELSE now() + make_interval(secs => $3::int) END, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at, updated_at = now()`,
      [key, JSON.stringify(value), ex]
    );
    return 'OK';
  },
  async del(key) {
    const r = await db().query('DELETE FROM kv WHERE key = $1', [key]);
    return r.rowCount;
  },
  // Lista por prefixo (ex.: 'conta:'), para o painel administrativo.
  async list(prefix, limit = 500) {
    const r = await db().query(
      `SELECT key, value, updated_at, expires_at FROM kv WHERE key LIKE $1 AND (expires_at IS NULL OR expires_at > now())
       ORDER BY updated_at DESC LIMIT $2`,
      [prefix.replace(/[%_]/g, '\\$&') + '%', limit]
    );
    return r.rows;
  },
};

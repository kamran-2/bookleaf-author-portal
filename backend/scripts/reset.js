require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes('neon.tech') || process.env.NODE_ENV === 'production'
          ? { rejectUnauthorized: false }
          : false,
      }
    : {
        host:     process.env.DB_HOST,
        port:     parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME,
        user:     process.env.DB_USER,
        password: process.env.DB_PASSWORD,
      }
);

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Drop tables in FK-safe order
    await client.query('DROP TABLE IF EXISTS internal_notes     CASCADE');
    await client.query('DROP TABLE IF EXISTS ticket_responses   CASCADE');
    await client.query('DROP TABLE IF EXISTS tickets            CASCADE');
    await client.query('DROP TABLE IF EXISTS books              CASCADE');
    await client.query('DROP TABLE IF EXISTS users              CASCADE');

    // Drop Drizzle and legacy migration tracking tables
    await client.query('DROP TABLE IF EXISTS "__drizzle_migrations" CASCADE');
    await client.query('DROP TABLE IF EXISTS schema_migrations  CASCADE');

    // Drop enum types
    await client.query('DROP TYPE IF EXISTS user_role       CASCADE');
    await client.query('DROP TYPE IF EXISTS ticket_status   CASCADE');
    await client.query('DROP TYPE IF EXISTS ticket_priority CASCADE');
    await client.query('DROP TYPE IF EXISTS ticket_category CASCADE');

    await client.query('COMMIT');
    console.log('Database reset. Run db:migrate then seed.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error('Reset failed:', err.message); process.exit(1); });

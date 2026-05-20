require('dotenv').config();
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { migrate } = require('drizzle-orm/node-postgres/migrator');

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
  const db = drizzle(pool);
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations complete.');
}

main()
  .catch(err => { console.error('Migration failed:', err.message); process.exit(1); })
  .finally(() => pool.end());

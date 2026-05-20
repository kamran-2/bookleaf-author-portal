require('dotenv').config();

/** @type {import('drizzle-kit').Config} */
module.exports = {
  schema: './src/db/schema.js',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: process.env.DATABASE_URL
    ? { url: process.env.DATABASE_URL }
    : {
        host:     process.env.DB_HOST,
        port:     parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME,
        user:     process.env.DB_USER,
        password: process.env.DB_PASSWORD,
      },
};

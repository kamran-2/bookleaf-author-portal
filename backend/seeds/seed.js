require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const data = require('./data.json');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require') || process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

// Default password for all seeded authors: "password123"
const AUTHOR_DEFAULT_PASSWORD = 'password123';
const ADMIN_PASSWORD = 'admin123';

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Clear existing data in dependency order
    await client.query('DELETE FROM internal_notes');
    await client.query('DELETE FROM ticket_responses');
    await client.query('DELETE FROM tickets');
    await client.query('DELETE FROM books');
    await client.query('DELETE FROM users');

    console.log('Cleared existing data.');

    const authorHash = await bcrypt.hash(AUTHOR_DEFAULT_PASSWORD, 10);
    const adminHash  = await bcrypt.hash(ADMIN_PASSWORD, 10);

    // Insert admin user
    await client.query(`
      INSERT INTO users (email, password_hash, name, role)
      VALUES ($1, $2, $3, 'admin')
    `, ['admin@bookleaf.com', adminHash, 'BookLeaf Admin']);
    console.log('  inserted admin: admin@bookleaf.com / admin123');

    // Insert authors and their books
    for (const author of data.authors) {
      const { rows } = await client.query(`
        INSERT INTO users
          (email, password_hash, name, role, phone, city, author_id, joined_date)
        VALUES ($1, $2, $3, 'author', $4, $5, $6, $7)
        RETURNING id
      `, [
        author.email,
        authorHash,
        author.name,
        author.phone,
        author.city,
        author.author_id,
        author.joined_date,
      ]);

      const userId = rows[0].id;
      console.log(`  inserted author: ${author.email}`);

      for (const book of author.books) {
        await client.query(`
          INSERT INTO books (
            book_id, author_id, title, isbn, genre,
            publication_date, status, mrp, author_royalty_per_copy,
            total_copies_sold, total_royalty_earned, royalty_paid,
            royalty_pending, last_royalty_payout_date, print_partner,
            available_on
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9,
            $10, $11, $12,
            $13, $14, $15,
            $16
          )
        `, [
          book.book_id,
          userId,
          book.title,
          book.isbn,
          book.genre,
          book.publication_date || null,
          book.status,
          book.mrp || null,
          book.author_royalty_per_copy || null,
          book.total_copies_sold,
          book.total_royalty_earned,
          book.royalty_paid,
          book.royalty_pending,
          book.last_royalty_payout_date || null,
          book.print_partner || null,
          book.available_on,
        ]);
        console.log(`    inserted book: ${book.title}`);
      }
    }

    await client.query('COMMIT');
    console.log('\nSeed complete.');
    console.log('\nTest credentials:');
    console.log('  Admin  : admin@bookleaf.com  / admin123');
    console.log('  Authors: <email from data>   / password123');
    console.log('  e.g.   : priya.sharma@email.com / password123');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => { console.error('Seed failed:', err.message); process.exit(1); });

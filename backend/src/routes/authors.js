const router = require('express').Router();
const pool = require('../config/db');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');

// All author routes require authentication
router.use(authenticate);
router.use(requireRole('author'));

// GET /api/authors/me/books
router.get('/me/books', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         id, book_id, title, isbn, genre, publication_date, status,
         mrp, author_royalty_per_copy, total_copies_sold,
         total_royalty_earned, royalty_paid, royalty_pending,
         last_royalty_payout_date, print_partner, available_on,
         created_at, updated_at
       FROM books
       WHERE author_id = $1
       ORDER BY created_at ASC`,
      [req.user.id]
    );
    res.json({ books: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/authors/me  — profile summary with aggregated royalty totals
router.get('/me', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         SUM(total_copies_sold)    AS total_copies_sold,
         SUM(total_royalty_earned) AS total_royalty_earned,
         SUM(royalty_paid)         AS royalty_paid,
         SUM(royalty_pending)      AS royalty_pending,
         COUNT(*)                  AS total_books
       FROM books
       WHERE author_id = $1`,
      [req.user.id]
    );
    res.json({ user: req.user, stats: rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

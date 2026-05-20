const router = require('express').Router();
const { eq, asc, sql } = require('drizzle-orm');
const db = require('../config/db');
const { books } = require('../db/schema');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');

router.use(authenticate);
router.use(requireRole('author'));

// GET /api/authors/me/books
router.get('/me/books', async (req, res, next) => {
  try {
    const rows = await db
      .select({
        id: books.id, book_id: books.book_id, title: books.title,
        isbn: books.isbn, genre: books.genre,
        publication_date: books.publication_date, status: books.status,
        mrp: books.mrp, author_royalty_per_copy: books.author_royalty_per_copy,
        total_copies_sold: books.total_copies_sold,
        total_royalty_earned: books.total_royalty_earned,
        royalty_paid: books.royalty_paid, royalty_pending: books.royalty_pending,
        last_royalty_payout_date: books.last_royalty_payout_date,
        print_partner: books.print_partner, available_on: books.available_on,
        created_at: books.created_at, updated_at: books.updated_at,
      })
      .from(books)
      .where(eq(books.author_id, req.user.id))
      .orderBy(asc(books.created_at));

    res.json({ books: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/authors/me — profile summary with aggregated royalty totals
router.get('/me', async (req, res, next) => {
  try {
    const [stats] = await db
      .select({
        total_copies_sold:    sql`SUM(${books.total_copies_sold})`,
        total_royalty_earned: sql`SUM(${books.total_royalty_earned})`,
        royalty_paid:         sql`SUM(${books.royalty_paid})`,
        royalty_pending:      sql`SUM(${books.royalty_pending})`,
        total_books:          sql`COUNT(*)`,
      })
      .from(books)
      .where(eq(books.author_id, req.user.id));

    res.json({ user: req.user, stats });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

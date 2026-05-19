const router = require('express').Router();
const { z } = require('zod');
const pool = require('../config/db');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { classifyAndPrioritize } = require('../services/aiService');

const createTicketSchema = z.object({
  book_id: z.string().uuid().nullable().optional(),
  subject: z.string().min(3).max(500),
  description: z.string().min(10),
});

// All ticket routes require authentication
router.use(authenticate);
router.use(requireRole('author'));

// POST /api/tickets  — submit a new support ticket
router.post('/', async (req, res, next) => {
  try {
    const parsed = createTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { book_id, subject, description } = parsed.data;

    // Verify book belongs to this author (if provided)
    if (book_id) {
      const { rows } = await pool.query(
        'SELECT id FROM books WHERE id = $1 AND author_id = $2',
        [book_id, req.user.id]
      );
      if (rows.length === 0) {
        return res.status(400).json({ error: 'Book not found or does not belong to you' });
      }
    }

    // Insert ticket first so author gets an immediate response
    const { rows } = await pool.query(
      `INSERT INTO tickets (author_id, book_id, subject, description)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.user.id, book_id || null, subject, description]
    );
    const ticket = rows[0];

    // Fire AI classification in the background — non-blocking
    classifyAndPrioritize(ticket).then(async (aiResult) => {
      if (!aiResult) return;
      await pool.query(
        `UPDATE tickets
         SET ai_category = $1, ai_priority = $2, ai_draft_response = $3,
             category = $1, priority = $2, ai_processed = TRUE, updated_at = NOW()
         WHERE id = $4`,
        [aiResult.category, aiResult.priority, aiResult.draftResponse, ticket.id]
      );

      // Notify admins of newly classified ticket via Socket.io
      const io = req.app.get('io');
      if (io) {
        const { rows: updated } = await pool.query(
          `SELECT t.*, u.name AS author_name, u.email AS author_email,
                  b.title AS book_title
           FROM tickets t
           JOIN users u ON u.id = t.author_id
           LEFT JOIN books b ON b.id = t.book_id
           WHERE t.id = $1`,
          [ticket.id]
        );
        io.to('admin').emit('ticket:classified', updated[0]);
      }
    }).catch(() => {
      // AI failure is non-fatal — ticket already created
    });

    // Emit new ticket event to admin room immediately
    const io = req.app.get('io');
    if (io) {
      io.to('admin').emit('ticket:new', {
        ...ticket,
        author_name: req.user.name,
        author_email: req.user.email,
      });
    }

    res.status(201).json({ ticket });
  } catch (err) {
    next(err);
  }
});

// GET /api/tickets  — list all tickets for the authenticated author
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         t.id, t.subject, t.description, t.status, t.category, t.priority,
         t.ai_processed, t.created_at, t.updated_at,
         b.title AS book_title, b.book_id AS book_ref,
         (
           SELECT COUNT(*) FROM ticket_responses tr WHERE tr.ticket_id = t.id
         ) AS response_count
       FROM tickets t
       LEFT JOIN books b ON b.id = t.book_id
       WHERE t.author_id = $1
       ORDER BY t.created_at DESC`,
      [req.user.id]
    );
    res.json({ tickets: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/tickets/:id  — single ticket with full response thread
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         t.*,
         b.title AS book_title, b.book_id AS book_ref,
         b.isbn AS book_isbn
       FROM tickets t
       LEFT JOIN books b ON b.id = t.book_id
       WHERE t.id = $1 AND t.author_id = $2`,
      [req.params.id, req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Fetch responses (visible to author)
    const { rows: responses } = await pool.query(
      `SELECT tr.id, tr.body, tr.created_at, u.name AS responder_name
       FROM ticket_responses tr
       JOIN users u ON u.id = tr.responder_id
       WHERE tr.ticket_id = $1
       ORDER BY tr.created_at ASC`,
      [req.params.id]
    );

    res.json({ ticket: rows[0], responses });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

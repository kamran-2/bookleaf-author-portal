const router = require('express').Router();
const { z } = require('zod');
const pool = require('../config/db');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { generateDraftResponse } = require('../services/aiService');

router.use(authenticate);
router.use(requireRole('admin'));

// ─── Ticket Queue ──────────────────────────────────────────────────────────

// GET /api/admin/tickets
// Query params: status, category, priority, assigned_to, from, to, page, limit
router.get('/tickets', async (req, res, next) => {
  try {
    const {
      status, category, priority, assigned_to,
      from, to,
      page = 1, limit = 20,
    } = req.query;

    const conditions = [];
    const params = [];

    if (status)      { params.push(status);      conditions.push(`t.status = $${params.length}::ticket_status`); }
    if (category)    { params.push(category);    conditions.push(`t.category = $${params.length}::ticket_category`); }
    if (priority)    { params.push(priority);    conditions.push(`t.priority = $${params.length}::ticket_priority`); }
    if (assigned_to === 'me')  { params.push(req.user.id); conditions.push(`t.assigned_to = $${params.length}`); }
    if (assigned_to === 'unassigned') { conditions.push(`t.assigned_to IS NULL`); }
    if (from) { params.push(from); conditions.push(`t.created_at >= $${params.length}`); }
    if (to)   { params.push(to);   conditions.push(`t.created_at <= $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const offset = (Math.max(1, parseInt(page)) - 1) * Math.min(100, parseInt(limit));
    const limitVal = Math.min(100, parseInt(limit));

    params.push(limitVal, offset);

    const { rows } = await pool.query(
      `SELECT
         t.id, t.subject, t.description, t.status, t.category, t.ai_category,
         t.priority, t.ai_priority, t.ai_processed, t.created_at, t.updated_at,
         u.name  AS author_name,
         u.email AS author_email,
         u.city  AS author_city,
         b.title AS book_title,
         b.book_id AS book_ref,
         a.name  AS assigned_to_name,
         (SELECT COUNT(*) FROM ticket_responses tr WHERE tr.ticket_id = t.id) AS response_count
       FROM tickets t
       JOIN  users u ON u.id = t.author_id
       LEFT JOIN books  b ON b.id = t.book_id
       LEFT JOIN users  a ON a.id = t.assigned_to
       ${where}
       ORDER BY
         CASE t.priority
           WHEN 'Critical' THEN 1
           WHEN 'High'     THEN 2
           WHEN 'Medium'   THEN 3
           WHEN 'Low'      THEN 4
         END ASC,
         t.created_at ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    // Total count for pagination
    const countParams = params.slice(0, params.length - 2);
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM tickets t ${where}`,
      countParams
    );

    res.json({
      tickets: rows,
      pagination: {
        total: parseInt(countRows[0].count),
        page: parseInt(page),
        limit: limitVal,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/tickets/:id  — full detail with responses + internal notes
router.get('/tickets/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         t.*,
         u.name  AS author_name,
         u.email AS author_email,
         u.phone AS author_phone,
         u.city  AS author_city,
         u.author_id AS author_ref,
         b.title AS book_title,
         b.book_id AS book_ref,
         b.isbn  AS book_isbn,
         b.genre AS book_genre,
         b.status AS book_status,
         b.total_copies_sold,
         b.royalty_pending,
         a.name  AS assigned_to_name
       FROM tickets t
       JOIN  users u ON u.id = t.author_id
       LEFT JOIN books b ON b.id = t.book_id
       LEFT JOIN users a ON a.id = t.assigned_to
       WHERE t.id = $1`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const [responses, notes] = await Promise.all([
      pool.query(
        `SELECT tr.id, tr.body, tr.created_at, u.name AS responder_name
         FROM ticket_responses tr
         JOIN users u ON u.id = tr.responder_id
         WHERE tr.ticket_id = $1 ORDER BY tr.created_at ASC`,
        [req.params.id]
      ),
      pool.query(
        `SELECT n.id, n.body, n.created_at, u.name AS author_name
         FROM internal_notes n
         JOIN users u ON u.id = n.author_id
         WHERE n.ticket_id = $1 ORDER BY n.created_at ASC`,
        [req.params.id]
      ),
    ]);

    res.json({
      ticket: rows[0],
      responses: responses.rows,
      notes: notes.rows,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Ticket Management ─────────────────────────────────────────────────────

const updateTicketSchema = z.object({
  status:   z.enum(['Open', 'In Progress', 'Resolved', 'Closed']).optional(),
  category: z.enum([
    'Royalty & Payments',
    'ISBN & Metadata Issues',
    'Printing & Quality',
    'Distribution & Availability',
    'Book Status & Production Updates',
    'General Inquiry',
  ]).optional(),
  priority: z.enum(['Critical', 'High', 'Medium', 'Low']).optional(),
  assign_to_me: z.boolean().optional(),
  unassign:     z.boolean().optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'Provide at least one field to update' });

// PATCH /api/admin/tickets/:id
router.patch('/tickets/:id', async (req, res, next) => {
  try {
    const parsed = updateTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { status, category, priority, assign_to_me, unassign } = parsed.data;

    const sets = [];
    const params = [];

    if (status)   { params.push(status);   sets.push(`status = $${params.length}::ticket_status`); }
    if (category) { params.push(category); sets.push(`category = $${params.length}::ticket_category`); }
    if (priority) { params.push(priority); sets.push(`priority = $${params.length}::ticket_priority`); }

    if (assign_to_me) { params.push(req.user.id); sets.push(`assigned_to = $${params.length}`); }
    if (unassign)     { sets.push(`assigned_to = NULL`); }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    sets.push(`updated_at = NOW()`);
    params.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE tickets SET ${sets.join(', ')}
       WHERE id = $${params.length}
       RETURNING *`,
      params
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = rows[0];

    // Notify author of status change via Socket.io
    const io = req.app.get('io');
    if (io && status) {
      io.to(`author:${ticket.author_id}`).emit('ticket:updated', {
        id: ticket.id,
        status: ticket.status,
        updated_at: ticket.updated_at,
      });
    }

    res.json({ ticket });
  } catch (err) {
    next(err);
  }
});

// ─── Responses ─────────────────────────────────────────────────────────────

const responseSchema = z.object({
  body: z.string().min(1).max(10000),
});

// POST /api/admin/tickets/:id/responses  — send reply to author
router.post('/tickets/:id/responses', async (req, res, next) => {
  try {
    const parsed = responseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    // Confirm ticket exists
    const { rows: ticketRows } = await pool.query(
      'SELECT id, author_id FROM tickets WHERE id = $1',
      [req.params.id]
    );
    if (ticketRows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const { rows } = await pool.query(
      `INSERT INTO ticket_responses (ticket_id, responder_id, body)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.params.id, req.user.id, parsed.data.body]
    );

    const response = { ...rows[0], responder_name: req.user.name };

    // Move ticket to "In Progress" if still Open
    await pool.query(
      `UPDATE tickets SET status = 'In Progress', updated_at = NOW()
       WHERE id = $1 AND status = 'Open'`,
      [req.params.id]
    );

    // Notify author and admin rooms in real-time
    const io = req.app.get('io');
    if (io) {
      const authorId = ticketRows[0].author_id;
      io.to(`ticket:${req.params.id}`).emit('ticket:response', response);
      io.to(`author:${authorId}`).emit('ticket:response', {
        ticket_id: req.params.id,
        ...response,
      });
      io.to('admin').emit('ticket:response', { ticket_id: req.params.id, ...response });
    }

    res.status(201).json({ response });
  } catch (err) {
    next(err);
  }
});

// ─── Internal Notes ────────────────────────────────────────────────────────

const noteSchema = z.object({
  body: z.string().min(1).max(5000),
});

// POST /api/admin/tickets/:id/notes  — admin-only internal note
router.post('/tickets/:id/notes', async (req, res, next) => {
  try {
    const parsed = noteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { rows: ticketRows } = await pool.query(
      'SELECT id FROM tickets WHERE id = $1',
      [req.params.id]
    );
    if (ticketRows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const { rows } = await pool.query(
      `INSERT INTO internal_notes (ticket_id, author_id, body)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.params.id, req.user.id, parsed.data.body]
    );

    const note = { ...rows[0], author_name: req.user.name };

    // Notify other admins only
    const io = req.app.get('io');
    if (io) {
      io.to('admin').emit('ticket:note', { ticket_id: req.params.id, ...note });
    }

    res.status(201).json({ note });
  } catch (err) {
    next(err);
  }
});

// ─── AI Draft Response ─────────────────────────────────────────────────────

// POST /api/admin/tickets/:id/ai-draft  — generate (or re-generate) AI draft
router.post('/tickets/:id/ai-draft', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.*, b.title AS book_title, b.genre, b.status AS book_status,
              b.royalty_pending, b.total_copies_sold, b.mrp,
              u.name AS author_name
       FROM tickets t
       LEFT JOIN books b ON b.id = t.book_id
       JOIN users u ON u.id = t.author_id
       WHERE t.id = $1`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = rows[0];

    const { rows: responses } = await pool.query(
      `SELECT body FROM ticket_responses WHERE ticket_id = $1 ORDER BY created_at ASC`,
      [req.params.id]
    );

    const draft = await generateDraftResponse(ticket, responses);

    if (!draft) {
      // AI unavailable — return existing cached draft or null
      return res.json({ draft: ticket.ai_draft_response || null, cached: true });
    }

    // Cache the new draft
    await pool.query(
      `UPDATE tickets SET ai_draft_response = $1, updated_at = NOW() WHERE id = $2`,
      [draft, req.params.id]
    );

    res.json({ draft, cached: false });
  } catch (err) {
    next(err);
  }
});

// ─── Stats ─────────────────────────────────────────────────────────────────

// GET /api/admin/stats  — overview numbers for admin dashboard
router.get('/stats', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*)                                              AS total,
        COUNT(*) FILTER (WHERE status = 'Open')              AS open,
        COUNT(*) FILTER (WHERE status = 'In Progress')       AS in_progress,
        COUNT(*) FILTER (WHERE status = 'Resolved')          AS resolved,
        COUNT(*) FILTER (WHERE status = 'Closed')            AS closed,
        COUNT(*) FILTER (WHERE priority = 'Critical')        AS critical,
        COUNT(*) FILTER (WHERE priority = 'High')            AS high,
        COUNT(*) FILTER (WHERE assigned_to IS NULL
                         AND status NOT IN ('Resolved','Closed')) AS unassigned
      FROM tickets
    `);
    res.json({ stats: rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

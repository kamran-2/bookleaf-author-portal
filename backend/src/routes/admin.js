const router = require('express').Router();
const { z } = require('zod');
const { eq, and, asc, isNull, gte, lte, sql } = require('drizzle-orm');
const { alias } = require('drizzle-orm/pg-core');
const db = require('../config/db');
const { users, books, tickets, ticketResponses, internalNotes } = require('../db/schema');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { generateDraftResponse } = require('../services/aiService');

router.use(authenticate);
router.use(requireRole('admin'));

// Table aliases for joins where users appears more than once
const authorAlias     = alias(users, 'author_u');
const assigneeAlias   = alias(users, 'assignee_u');
const noteAuthorAlias = alias(users, 'note_author_u');

// ─── Ticket Queue ──────────────────────────────────────────────────────────

// GET /api/admin/tickets
// Query params: status, category, priority, assigned_to, from, to, page, limit
router.get('/tickets', async (req, res, next) => {
  try {
    const { status, category, priority, assigned_to, from, to, page = 1, limit = 20 } = req.query;

    const conditions = [];
    if (status)   conditions.push(eq(tickets.status, status));
    if (category) conditions.push(eq(tickets.category, category));
    if (priority) conditions.push(eq(tickets.priority, priority));
    if (assigned_to === 'me')          conditions.push(eq(tickets.assigned_to, req.user.id));
    if (assigned_to === 'unassigned')  conditions.push(isNull(tickets.assigned_to));
    if (from) conditions.push(gte(tickets.created_at, new Date(from)));
    if (to)   conditions.push(lte(tickets.created_at, new Date(to)));

    const where    = conditions.length ? and(...conditions) : undefined;
    const limitVal = Math.min(100, parseInt(limit));
    const offset   = (Math.max(1, parseInt(page)) - 1) * limitVal;

    const rows = await db
      .select({
        id: tickets.id, subject: tickets.subject, description: tickets.description,
        status: tickets.status, category: tickets.category, ai_category: tickets.ai_category,
        priority: tickets.priority, ai_priority: tickets.ai_priority,
        ai_processed: tickets.ai_processed,
        created_at: tickets.created_at, updated_at: tickets.updated_at,
        author_name: authorAlias.name, author_email: authorAlias.email, author_city: authorAlias.city,
        book_title: books.title, book_ref: books.book_id,
        assigned_to_name: assigneeAlias.name,
        response_count: sql`(SELECT COUNT(*) FROM ticket_responses tr WHERE tr.ticket_id = ${tickets.id})`,
      })
      .from(tickets)
      .innerJoin(authorAlias,   eq(authorAlias.id, tickets.author_id))
      .leftJoin(books,          eq(books.id, tickets.book_id))
      .leftJoin(assigneeAlias,  eq(assigneeAlias.id, tickets.assigned_to))
      .where(where)
      .orderBy(
        sql`CASE ${tickets.priority} WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 WHEN 'Low' THEN 4 END`,
        tickets.created_at
      )
      .limit(limitVal)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql`COUNT(*)` })
      .from(tickets)
      .where(where);

    res.json({
      tickets: rows,
      pagination: { total: parseInt(count), page: parseInt(page), limit: limitVal },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/tickets/:id — full detail with responses + internal notes
router.get('/tickets/:id', async (req, res, next) => {
  try {
    const result = await db
      .select({
        id: tickets.id, author_id: tickets.author_id, book_id: tickets.book_id,
        subject: tickets.subject, description: tickets.description,
        status: tickets.status, category: tickets.category, ai_category: tickets.ai_category,
        priority: tickets.priority, ai_priority: tickets.ai_priority,
        assigned_to: tickets.assigned_to, ai_draft_response: tickets.ai_draft_response,
        ai_processed: tickets.ai_processed,
        created_at: tickets.created_at, updated_at: tickets.updated_at,
        author_name: authorAlias.name, author_email: authorAlias.email,
        author_phone: authorAlias.phone, author_city: authorAlias.city,
        author_ref: authorAlias.author_id,
        book_title: books.title, book_ref: books.book_id, book_isbn: books.isbn,
        book_genre: books.genre, book_status: books.status,
        total_copies_sold: books.total_copies_sold, royalty_pending: books.royalty_pending,
        assigned_to_name: assigneeAlias.name,
      })
      .from(tickets)
      .innerJoin(authorAlias,   eq(authorAlias.id, tickets.author_id))
      .leftJoin(books,          eq(books.id, tickets.book_id))
      .leftJoin(assigneeAlias,  eq(assigneeAlias.id, tickets.assigned_to))
      .where(eq(tickets.id, req.params.id))
      .limit(1);

    if (result.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const [responses, notes] = await Promise.all([
      db.select({
          id: ticketResponses.id, body: ticketResponses.body,
          created_at: ticketResponses.created_at, responder_name: users.name,
        })
        .from(ticketResponses)
        .innerJoin(users, eq(users.id, ticketResponses.responder_id))
        .where(eq(ticketResponses.ticket_id, req.params.id))
        .orderBy(asc(ticketResponses.created_at)),

      db.select({
          id: internalNotes.id, body: internalNotes.body,
          created_at: internalNotes.created_at, author_name: noteAuthorAlias.name,
        })
        .from(internalNotes)
        .innerJoin(noteAuthorAlias, eq(noteAuthorAlias.id, internalNotes.author_id))
        .where(eq(internalNotes.ticket_id, req.params.id))
        .orderBy(asc(internalNotes.created_at)),
    ]);

    res.json({ ticket: result[0], responses, notes });
  } catch (err) {
    next(err);
  }
});

// ─── Ticket Management ─────────────────────────────────────────────────────

const updateTicketSchema = z.object({
  status:       z.enum(['Open', 'In Progress', 'Resolved', 'Closed']).optional(),
  category:     z.enum([
    'Royalty & Payments', 'ISBN & Metadata Issues', 'Printing & Quality',
    'Distribution & Availability', 'Book Status & Production Updates', 'General Inquiry',
  ]).optional(),
  priority:     z.enum(['Critical', 'High', 'Medium', 'Low']).optional(),
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
        details: z.flattenError(parsed.error).fieldErrors,
      });
    }

    const { status, category, priority, assign_to_me, unassign } = parsed.data;

    const updates = {};
    if (status)       updates.status      = status;
    if (category)     updates.category    = category;
    if (priority)     updates.priority    = priority;
    if (assign_to_me) updates.assigned_to = req.user.id;
    if (unassign)     updates.assigned_to = null;
    updates.updated_at = new Date();

    if (Object.keys(updates).length === 1) {  // only updated_at means nothing real changed
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const result = await db
      .update(tickets)
      .set(updates)
      .where(eq(tickets.id, req.params.id))
      .returning();

    if (result.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = result[0];

    const io = req.app.get('io');
    if (io && status) {
      io.to(`author:${ticket.author_id}`).emit('ticket:updated', {
        id: ticket.id, status: ticket.status, updated_at: ticket.updated_at,
      });
    }

    res.json({ ticket });
  } catch (err) {
    next(err);
  }
});

// ─── Responses ─────────────────────────────────────────────────────────────

const responseSchema = z.object({ body: z.string().min(1).max(10000) });

// POST /api/admin/tickets/:id/responses — send reply visible to author
router.post('/tickets/:id/responses', async (req, res, next) => {
  try {
    const parsed = responseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: z.flattenError(parsed.error).fieldErrors,
      });
    }

    const existing = await db
      .select({ id: tickets.id, author_id: tickets.author_id })
      .from(tickets)
      .where(eq(tickets.id, req.params.id))
      .limit(1);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const [row] = await db
      .insert(ticketResponses)
      .values({ ticket_id: req.params.id, responder_id: req.user.id, body: parsed.data.body })
      .returning();

    const response = { ...row, responder_name: req.user.name };

    // Auto-advance status from Open → In Progress on first admin reply
    await db
      .update(tickets)
      .set({ status: 'In Progress', updated_at: new Date() })
      .where(and(eq(tickets.id, req.params.id), eq(tickets.status, 'Open')));

    const io = req.app.get('io');
    if (io) {
      const authorId = existing[0].author_id;
      io.to(`ticket:${req.params.id}`).emit('ticket:response', response);
      io.to(`author:${authorId}`).emit('ticket:response', { ticket_id: req.params.id, ...response });
      io.to('admin').emit('ticket:response', { ticket_id: req.params.id, ...response });
    }

    res.status(201).json({ response });
  } catch (err) {
    next(err);
  }
});

// ─── Internal Notes ────────────────────────────────────────────────────────

const noteSchema = z.object({ body: z.string().min(1).max(5000) });

// POST /api/admin/tickets/:id/notes — admin-only, never exposed to authors
router.post('/tickets/:id/notes', async (req, res, next) => {
  try {
    const parsed = noteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: z.flattenError(parsed.error).fieldErrors,
      });
    }

    const existing = await db
      .select({ id: tickets.id })
      .from(tickets)
      .where(eq(tickets.id, req.params.id))
      .limit(1);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const [row] = await db
      .insert(internalNotes)
      .values({ ticket_id: req.params.id, author_id: req.user.id, body: parsed.data.body })
      .returning();

    const note = { ...row, author_name: req.user.name };

    const io = req.app.get('io');
    if (io) {
      io.to('admin').emit('ticket:note', { ticket_id: req.params.id, ...note });
    }

    res.status(201).json({ note });
  } catch (err) {
    next(err);
  }
});

// ─── AI Draft ──────────────────────────────────────────────────────────────

// POST /api/admin/tickets/:id/ai-draft — generate (or re-generate) AI draft
router.post('/tickets/:id/ai-draft', async (req, res, next) => {
  try {
    const result = await db
      .select({
        id: tickets.id, subject: tickets.subject, description: tickets.description,
        category: tickets.category, priority: tickets.priority,
        ai_draft_response: tickets.ai_draft_response,
        book_title: books.title, book_genre: books.genre, book_status: books.status,
        royalty_pending: books.royalty_pending,
        total_copies_sold: books.total_copies_sold, mrp: books.mrp,
        author_name: authorAlias.name,
      })
      .from(tickets)
      .innerJoin(authorAlias, eq(authorAlias.id, tickets.author_id))
      .leftJoin(books, eq(books.id, tickets.book_id))
      .where(eq(tickets.id, req.params.id))
      .limit(1);

    if (result.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = result[0];

    const responses = await db
      .select({ body: ticketResponses.body })
      .from(ticketResponses)
      .where(eq(ticketResponses.ticket_id, req.params.id))
      .orderBy(asc(ticketResponses.created_at));

    const draft = await generateDraftResponse(ticket, responses);

    if (!draft) {
      return res.json({ draft: ticket.ai_draft_response ?? null, cached: true });
    }

    await db
      .update(tickets)
      .set({ ai_draft_response: draft, updated_at: new Date() })
      .where(eq(tickets.id, req.params.id));

    res.json({ draft, cached: false });
  } catch (err) {
    next(err);
  }
});

// ─── Stats ─────────────────────────────────────────────────────────────────

// GET /api/admin/stats — overview counts for the admin dashboard header
router.get('/stats', async (_req, res, next) => {
  try {
    const [stats] = await db
      .select({
        total:       sql`COUNT(*)`,
        open:        sql`COUNT(*) FILTER (WHERE ${tickets.status} = 'Open')`,
        in_progress: sql`COUNT(*) FILTER (WHERE ${tickets.status} = 'In Progress')`,
        resolved:    sql`COUNT(*) FILTER (WHERE ${tickets.status} = 'Resolved')`,
        closed:      sql`COUNT(*) FILTER (WHERE ${tickets.status} = 'Closed')`,
        critical:    sql`COUNT(*) FILTER (WHERE ${tickets.priority} = 'Critical')`,
        high:        sql`COUNT(*) FILTER (WHERE ${tickets.priority} = 'High')`,
        unassigned:  sql`COUNT(*) FILTER (WHERE ${tickets.assigned_to} IS NULL AND ${tickets.status} NOT IN ('Resolved','Closed'))`,
      })
      .from(tickets);

    res.json({ stats });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

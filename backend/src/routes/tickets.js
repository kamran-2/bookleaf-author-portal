const router = require('express').Router();
const { z } = require('zod');
const { eq, and, desc, asc, sql } = require('drizzle-orm');
const { alias } = require('drizzle-orm/pg-core');
const db = require('../config/db');
const { users, books, tickets, ticketResponses } = require('../db/schema');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { classifyAndPrioritize } = require('../services/aiService');

const authorAlias = alias(users, 'author_u');

const createTicketSchema = z.object({
  book_id:     z.string().uuid().nullable().optional(),
  subject:     z.string().min(3).max(500),
  description: z.string().min(10),
});

router.use(authenticate);
router.use(requireRole('author'));

// POST /api/tickets — submit a new support ticket
router.post('/', async (req, res, next) => {
  try {
    const parsed = createTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: z.flattenError(parsed.error).fieldErrors,
      });
    }

    const { book_id, subject, description } = parsed.data;

    if (book_id) {
      const owned = await db
        .select({ id: books.id })
        .from(books)
        .where(and(eq(books.id, book_id), eq(books.author_id, req.user.id)))
        .limit(1);
      if (owned.length === 0) {
        return res.status(400).json({ error: 'Book not found or does not belong to you' });
      }
    }

    const [ticket] = await db
      .insert(tickets)
      .values({ author_id: req.user.id, book_id: book_id ?? null, subject, description })
      .returning();

    // Fire AI classification in background — non-blocking, author gets instant 201
    classifyAndPrioritize(ticket).then(async (aiResult) => {
      if (!aiResult) return;
      await db.update(tickets).set({
        ai_category:       aiResult.category,
        ai_priority:       aiResult.priority,
        ai_draft_response: aiResult.draftResponse,
        category:          aiResult.category,
        priority:          aiResult.priority,
        ai_processed:      true,
        updated_at:        new Date(),
      }).where(eq(tickets.id, ticket.id));

      const io = req.app.get('io');
      if (io) {
        const [updated] = await db
          .select({
            id: tickets.id, subject: tickets.subject, status: tickets.status,
            category: tickets.category, priority: tickets.priority,
            ai_processed: tickets.ai_processed, created_at: tickets.created_at,
            author_name: authorAlias.name, author_email: authorAlias.email,
            book_title: books.title,
          })
          .from(tickets)
          .innerJoin(authorAlias, eq(authorAlias.id, tickets.author_id))
          .leftJoin(books, eq(books.id, tickets.book_id))
          .where(eq(tickets.id, ticket.id))
          .limit(1);
        io.to('admin').emit('ticket:classified', updated);
      }
    }).catch(() => { /* AI failure is non-fatal */ });

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

// GET /api/tickets — list tickets for the authenticated author
router.get('/', async (req, res, next) => {
  try {
    const rows = await db
      .select({
        id: tickets.id, subject: tickets.subject, description: tickets.description,
        status: tickets.status, category: tickets.category, priority: tickets.priority,
        ai_processed: tickets.ai_processed,
        created_at: tickets.created_at, updated_at: tickets.updated_at,
        book_title: books.title, book_ref: books.book_id,
        response_count: sql`(SELECT COUNT(*) FROM ticket_responses tr WHERE tr.ticket_id = ${tickets.id})`,
      })
      .from(tickets)
      .leftJoin(books, eq(books.id, tickets.book_id))
      .where(eq(tickets.author_id, req.user.id))
      .orderBy(desc(tickets.created_at));

    res.json({ tickets: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/tickets/:id — single ticket with full response thread
router.get('/:id', async (req, res, next) => {
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
        book_title: books.title, book_ref: books.book_id, book_isbn: books.isbn,
      })
      .from(tickets)
      .leftJoin(books, eq(books.id, tickets.book_id))
      .where(and(eq(tickets.id, req.params.id), eq(tickets.author_id, req.user.id)))
      .limit(1);

    if (result.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const responses = await db
      .select({
        id: ticketResponses.id, body: ticketResponses.body,
        created_at: ticketResponses.created_at, responder_name: users.name,
      })
      .from(ticketResponses)
      .innerJoin(users, eq(users.id, ticketResponses.responder_id))
      .where(eq(ticketResponses.ticket_id, req.params.id))
      .orderBy(asc(ticketResponses.created_at));

    res.json({ ticket: result[0], responses });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

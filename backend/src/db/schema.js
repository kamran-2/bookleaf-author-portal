const {
  pgTable, pgEnum, uuid, varchar, text, boolean,
  integer, numeric, date, timestamp, index,
} = require('drizzle-orm/pg-core');
const { sql } = require('drizzle-orm');

// ─── Enums ────────────────────────────────────────────────────────────────────
const userRole       = pgEnum('user_role', ['author', 'admin']);
const ticketStatus   = pgEnum('ticket_status', ['Open', 'In Progress', 'Resolved', 'Closed']);
const ticketPriority = pgEnum('ticket_priority', ['Critical', 'High', 'Medium', 'Low']);
const ticketCategory = pgEnum('ticket_category', [
  'Royalty & Payments',
  'ISBN & Metadata Issues',
  'Printing & Quality',
  'Distribution & Availability',
  'Book Status & Production Updates',
  'General Inquiry',
]);

// ─── Tables ───────────────────────────────────────────────────────────────────
// Property names use snake_case to keep API responses identical — no frontend changes required.

const users = pgTable('users', {
  id:            uuid('id').primaryKey().defaultRandom(),
  email:         varchar('email', { length: 255 }).unique().notNull(),
  password_hash: varchar('password_hash', { length: 255 }).notNull(),
  name:          varchar('name', { length: 255 }).notNull(),
  role:          userRole('role').notNull().default('author'),
  phone:         varchar('phone', { length: 30 }),
  city:          varchar('city', { length: 100 }),
  author_id:     varchar('author_id', { length: 20 }).unique(),
  joined_date:   date('joined_date'),
  created_at:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_users_email').on(t.email),
  index('idx_users_role').on(t.role),
]);

const books = pgTable('books', {
  id:                       uuid('id').primaryKey().defaultRandom(),
  book_id:                  varchar('book_id', { length: 20 }).unique(),
  author_id:                uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title:                    varchar('title', { length: 500 }).notNull(),
  isbn:                     varchar('isbn', { length: 50 }),
  genre:                    varchar('genre', { length: 150 }),
  publication_date:         date('publication_date'),
  status:                   varchar('status', { length: 100 }).notNull().default('In Production'),
  mrp:                      numeric('mrp', { precision: 10, scale: 2 }),
  author_royalty_per_copy:  numeric('author_royalty_per_copy', { precision: 10, scale: 2 }),
  total_copies_sold:        integer('total_copies_sold').notNull().default(0),
  total_royalty_earned:     numeric('total_royalty_earned', { precision: 12, scale: 2 }).notNull().default('0'),
  royalty_paid:             numeric('royalty_paid', { precision: 12, scale: 2 }).notNull().default('0'),
  royalty_pending:          numeric('royalty_pending', { precision: 12, scale: 2 }).notNull().default('0'),
  last_royalty_payout_date: date('last_royalty_payout_date'),
  print_partner:            varchar('print_partner', { length: 100 }),
  available_on:             text('available_on').array().notNull().default(sql`'{}'`),
  created_at:               timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at:               timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_books_author_id').on(t.author_id),
]);

const tickets = pgTable('tickets', {
  id:                uuid('id').primaryKey().defaultRandom(),
  author_id:         uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  book_id:           uuid('book_id').references(() => books.id, { onDelete: 'set null' }),
  subject:           varchar('subject', { length: 500 }).notNull(),
  description:       text('description').notNull(),
  status:            ticketStatus('status').notNull().default('Open'),
  category:          ticketCategory('category'),
  ai_category:       ticketCategory('ai_category'),
  priority:          ticketPriority('priority').notNull().default('Medium'),
  ai_priority:       ticketPriority('ai_priority'),
  assigned_to:       uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  ai_draft_response: text('ai_draft_response'),
  ai_processed:      boolean('ai_processed').notNull().default(false),
  created_at:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at:        timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_tickets_author_id').on(t.author_id),
  index('idx_tickets_status').on(t.status),
  index('idx_tickets_priority').on(t.priority),
  index('idx_tickets_category').on(t.category),
  index('idx_tickets_assigned_to').on(t.assigned_to),
  index('idx_tickets_created_at').on(t.created_at),
]);

const ticketResponses = pgTable('ticket_responses', {
  id:           uuid('id').primaryKey().defaultRandom(),
  ticket_id:    uuid('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  responder_id: uuid('responder_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  body:         text('body').notNull(),
  created_at:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

const internalNotes = pgTable('internal_notes', {
  id:         uuid('id').primaryKey().defaultRandom(),
  ticket_id:  uuid('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  author_id:  uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  body:       text('body').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

module.exports = {
  users, books, tickets, ticketResponses, internalNotes,
  userRole, ticketStatus, ticketPriority, ticketCategory,
};

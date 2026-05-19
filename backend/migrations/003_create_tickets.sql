CREATE TYPE ticket_status   AS ENUM ('Open', 'In Progress', 'Resolved', 'Closed');
CREATE TYPE ticket_priority AS ENUM ('Critical', 'High', 'Medium', 'Low');
CREATE TYPE ticket_category AS ENUM (
  'Royalty & Payments',
  'ISBN & Metadata Issues',
  'Printing & Quality',
  'Distribution & Availability',
  'Book Status & Production Updates',
  'General Inquiry'
);

CREATE TABLE tickets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id             UUID REFERENCES books(id) ON DELETE SET NULL,   -- NULL = general/account-level
  subject             VARCHAR(500) NOT NULL,
  description         TEXT NOT NULL,
  status              ticket_status   NOT NULL DEFAULT 'Open',
  category            ticket_category,
  ai_category         ticket_category,            -- what AI classified
  priority            ticket_priority NOT NULL DEFAULT 'Medium',
  ai_priority         ticket_priority,            -- what AI scored
  assigned_to         UUID REFERENCES users(id) ON DELETE SET NULL,  -- admin user
  ai_draft_response   TEXT,                        -- cached AI draft
  ai_processed        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tickets_author_id   ON tickets(author_id);
CREATE INDEX idx_tickets_status      ON tickets(status);
CREATE INDEX idx_tickets_priority    ON tickets(priority);
CREATE INDEX idx_tickets_category    ON tickets(category);
CREATE INDEX idx_tickets_assigned_to ON tickets(assigned_to);
CREATE INDEX idx_tickets_created_at  ON tickets(created_at);

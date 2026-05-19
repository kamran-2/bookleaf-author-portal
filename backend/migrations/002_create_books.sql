CREATE TABLE books (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id                  VARCHAR(20) UNIQUE,   -- original ID e.g. "BK001"
  author_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title                    VARCHAR(500) NOT NULL,
  isbn                     VARCHAR(50),
  genre                    VARCHAR(150),
  publication_date         DATE,
  status                   VARCHAR(100) NOT NULL DEFAULT 'In Production',
  mrp                      NUMERIC(10,2),
  author_royalty_per_copy  NUMERIC(10,2),
  total_copies_sold        INTEGER NOT NULL DEFAULT 0,
  total_royalty_earned     NUMERIC(12,2) NOT NULL DEFAULT 0,
  royalty_paid             NUMERIC(12,2) NOT NULL DEFAULT 0,
  royalty_pending          NUMERIC(12,2) NOT NULL DEFAULT 0,
  last_royalty_payout_date DATE,
  print_partner            VARCHAR(100),
  available_on             TEXT[] NOT NULL DEFAULT '{}',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_books_author_id ON books(author_id);

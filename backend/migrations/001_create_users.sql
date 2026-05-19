CREATE TYPE user_role AS ENUM ('author', 'admin');

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  role          user_role NOT NULL DEFAULT 'author',
  phone         VARCHAR(30),
  city          VARCHAR(100),
  author_id     VARCHAR(20) UNIQUE,   -- original ID from seed data e.g. "AUTH001"
  joined_date   DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role  ON users(role);

# BookLeaf Author Support & Communication Portal

A full-stack web application for BookLeaf Publishing's author support operations — featuring an **author-facing portal** and an **admin-facing dashboard**, powered by AI-assisted ticket classification, priority scoring, and response drafting.

---

## Quick Start

### Prerequisites
- Node.js 18+
- Docker (for local PostgreSQL) — or a PostgreSQL 14+ instance / Neon cloud DB

### 1. Clone & install

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Start PostgreSQL (Docker — local only)

```bash
docker run -d \
  --name bookleaf-postgres \
  -e POSTGRES_USER=bookleaf \
  -e POSTGRES_PASSWORD=bookleaf123 \
  -e POSTGRES_DB=bookleaf \
  -p 5432:5432 \
  postgres:16-alpine
```

Skip this step if using Neon or another hosted PostgreSQL.

### 3. Configure environment

```bash
cd backend
cp .env.example .env
```

**Option A — local Docker:**
```env
PORT=5000

DB_HOST=localhost
DB_PORT=5432
DB_NAME=bookleaf
DB_USER=bookleaf
DB_PASSWORD=bookleaf123

JWT_SECRET=change_this_to_a_long_random_string_in_production
JWT_EXPIRES_IN=7d

ANTHROPIC_API_KEY=sk-ant-...   # Optional — AI features degrade gracefully without it

FRONTEND_URL=http://localhost:3000
```

**Option B — Neon / hosted PostgreSQL:**
```env
PORT=5000

DATABASE_URL=postgresql://<user>:<password>@<host>/<db>?sslmode=require

JWT_SECRET=change_this_to_a_long_random_string_in_production
JWT_EXPIRES_IN=7d

ANTHROPIC_API_KEY=sk-ant-...

FRONTEND_URL=http://localhost:3000
```

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
```

### 4. Run migrations & seed

```bash
cd backend
npm run db:migrate   # Creates all tables via Drizzle migrations
npm run seed         # Inserts 1 admin, 10 authors, 18 books, 7 tickets
```

### 5. Start servers

```bash
# Terminal 1 — Backend (port 5000)
cd backend && npm run dev

# Terminal 2 — Frontend (port 3000)
cd frontend && npm run dev
```

Open **http://localhost:3000**

---

## Test Credentials

| Role | Email | Password |
|---|---|---|
| Admin | `admin@bookleaf.com` | `admin123` |
| Author (pending royalty, Critical ticket) | `priya.sharma@email.com` | `password123` |
| Author (royalty dispute, resolved) | `rohit.kapoor@email.com` | `password123` |
| Author (book stuck in production) | `sneha.kulkarni@email.com` | `password123` |
| Author (print quality issue) | `vikram.joshi@email.com` | `password123` |
| Author (ISBN mismatch, Critical) | `meera.nair@email.com` | `password123` |
| All other authors | `<email from seed>` | `password123` |

---

## Architecture

### Stack

| Layer | Technology | Reason |
|---|---|---|
| Frontend | Next.js 16 (App Router) + TypeScript | Strong typing, file-based routing, SSR-ready |
| Styling | Tailwind CSS | Rapid iteration without context-switching to stylesheets |
| Backend | Node.js + Express | Fast to build, excellent ecosystem, async-first |
| ORM | Drizzle ORM | Type-safe queries, SQL-first schema, lightweight with zero magic |
| Database | PostgreSQL 16 | Relational integrity; ENUM types; `TEXT[]` for `available_on` |
| Migrations | drizzle-kit | Schema versioning via generated SQL diffs; tracked in `__drizzle_migrations` |
| Real-time | Socket.io | Reliable fallback to polling when WebSocket is unavailable |
| AI | Anthropic Claude Haiku (`claude-haiku-4-5`) | Best quality/cost for classification + drafting; strong instruction following |
| Auth | JWT (jsonwebtoken) + bcryptjs | Stateless — no session store needed at this scale |

### Project Structure

```
bookleaf-author-portal/
├── backend/
│   ├── drizzle/                    # Drizzle-generated migration SQL files
│   │   ├── 0000_*.sql             # Initial schema migration
│   │   └── meta/                  # Snapshot + journal (managed by drizzle-kit)
│   ├── scripts/
│   │   ├── migrate.js             # Applies pending migrations via Drizzle migrator
│   │   └── reset.js               # Drops all tables/enums for a clean slate
│   ├── seeds/
│   │   ├── seed.js                # Drizzle-based seed: authors, books, tickets, responses
│   │   └── data.json              # Author and book data
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js              # drizzle(pool, { schema }) — Drizzle instance
│   │   │   └── env.js             # Zod env validation — fails fast on startup
│   │   ├── db/
│   │   │   └── schema.js          # All 5 tables + 4 ENUM definitions
│   │   ├── middleware/
│   │   │   ├── authenticate.js    # JWT verify → Drizzle user lookup → req.user
│   │   │   └── requireRole.js     # Variadic role guard: requireRole('admin')
│   │   ├── routes/
│   │   │   ├── auth.js            # POST /api/auth/login, GET /api/auth/me
│   │   │   ├── authors.js         # GET /api/authors/me, /me/books (author-only)
│   │   │   ├── tickets.js         # CRUD /api/tickets/* (author-only)
│   │   │   └── admin.js           # Full admin queue + AI draft (admin-only)
│   │   ├── services/
│   │   │   └── aiService.js       # classifyAndPrioritize + generateDraftResponse
│   │   └── index.js               # Express + Socket.io server entry point
│   └── drizzle.config.js          # drizzle-kit config (schema path, dialect, DB creds)
└── frontend/
    └── src/
        ├── app/                    # Next.js App Router pages
        │   ├── login/
        │   ├── dashboard/
        │   ├── books/
        │   ├── tickets/
        │   └── admin/tickets/
        ├── components/             # Navbar, Badge, Spinner
        ├── contexts/               # AuthContext (login, logout, user state)
        └── lib/
            ├── api.ts              # axios instance with JWT interceptor + 401 redirect
            └── socket.ts           # Socket.io singleton (connect/disconnect helpers)
```

### Key Design Decisions

**Drizzle ORM with snake_case property names** — Schema properties are intentionally named in snake_case (e.g., `author_id`, `created_at`) matching the PostgreSQL column names. This keeps the API responses identical to what the frontend expects without a transformation layer, while still getting type-safe queries.

**Single AI call per ticket submission** — `classifyAndPrioritize` makes one Claude call that returns `category` + `priority` + initial `draft_response` in a single JSON object. This avoids three separate API calls (and three times the cost) per ticket.

**AI runs in the background, non-blocking** — After a ticket is created, AI classification fires asynchronously via `.then().catch()`. The author gets a `201` instantly; the AI result updates the ticket row and broadcasts via Socket.io when ready. AI failure never blocks ticket creation.

**Draft cached on the ticket row** — `ai_draft_response` is stored in the database. When an admin opens a ticket, the cached draft loads immediately with no extra API call. The on-demand `/ai-draft` endpoint only re-calls Claude when the admin explicitly requests it.

**Separate AI vs human fields** — `ai_category`/`ai_priority` record what the model classified; `category`/`priority` are what the admin acts on. This preserves the admin's overrides and lets classification accuracy be measured over time.

**Timing-safe auth** — The login endpoint runs `bcrypt.compare` against a dummy hash even when the user doesn't exist, preventing user enumeration via timing side-channels.

**Cross-author isolation** — Authors cannot access each other's tickets. The not-found response returns `404` (not `403`) to avoid leaking ticket existence.

**Role-based Socket.io rooms** — Authors join `author:<userId>`; admins join a shared `admin` room. Internal notes are only emitted to the `admin` room, never to author rooms.

---

## Database

### Schema

```
users             — authors + admins; role ENUM ('author' | 'admin')
books             — all books with full royalty data; FK → users
tickets           — support tickets; FK → users (author_id), books, users (assigned_to)
                    ai_category/ai_priority  → what Claude classified
                    category/priority        → what admin acted on
ticket_responses  — admin replies visible to authors; FK → tickets, users
internal_notes    — admin-only notes, never exposed to authors; FK → tickets, users
__drizzle_migrations — Drizzle migration tracking (managed automatically)
```

Triggers: `updated_at` auto-updates on `users`, `books`, and `tickets` via a PostgreSQL trigger function.

### Migration workflow

```bash
# Apply all pending migrations (first-time setup or after schema change)
npm run db:migrate

# Generate a new migration after editing src/db/schema.js
npm run db:generate

# Wipe all tables/enums (then re-run migrate + seed for a fresh start)
npm run db:reset

# Open Drizzle Studio — visual DB browser
npm run db:studio
```

Migrations are SQL files in `drizzle/` generated by `drizzle-kit`. The `__drizzle_migrations` table tracks which files have been applied so `db:migrate` is safe to run repeatedly.

---

## AI Integration

### Model choice
**Claude Haiku (`claude-haiku-4-5`)** — chosen for:
- Superior instruction-following for structured JSON output
- Better tone calibration for empathetic, non-corporate support writing
- Cost: ~$0.00025 per ticket classification (input) + ~$0.00125 per draft

### Prompt strategy

**System prompt (cached):** The full BookLeaf Knowledge Base — royalty policy, ISBN policy, printing timelines, distribution channels, communication tone guidelines, and sample Q&A pairs — is sent as a single system block with `cache_control: { type: "ephemeral" }`. Anthropic caches this after the first call; subsequent requests only pay for the per-ticket user message tokens.

**Classification call:** A single user message requests a JSON object with `category`, `priority`, `priority_reason`, and `draft_response`. This collapses three potential calls into one.

**Draft regeneration:** When an admin requests a fresh draft, only ticket context + recent responses are sent — not the full ticket history — keeping token counts low for long-running threads.

**JSON fence stripping:** Claude sometimes wraps JSON in markdown code fences. `extractJSON()` strips these before parsing, preventing brittle failures on model output variation.

### Graceful degradation

| Scenario | Behaviour |
|---|---|
| `ANTHROPIC_API_KEY` not set | AI calls skipped entirely; tickets work normally |
| Anthropic API down / rate-limited | Classification fails silently; ticket created with default `Medium` priority |
| JSON parse error in AI response | Logged server-side; ticket created with `null` AI fields |
| Admin requests draft when AI unavailable | Returns cached draft if exists, `null` otherwise |

### Cost awareness
- Knowledge Base (~1,200 tokens) is **prompt-cached** — charged once per 5-minute TTL
- Each classification costs ~500–800 input tokens + ~200 output tokens
- Drafts only generated on explicit admin request, never on page load
- Long ticket histories are excluded from draft prompts

---

## API Documentation

All protected routes require `Authorization: Bearer <token>`.

### Auth

#### `POST /api/auth/login`
```json
{ "email": "string", "password": "string" }
```
Returns `{ token, user }`. Timing-safe regardless of whether the user exists.

#### `GET /api/auth/me`
Returns `{ user }` for the currently authenticated user.

---

### Author Routes (role: author)

#### `GET /api/authors/me`
Returns `{ user, stats }` — profile + aggregated royalty totals across all books.

#### `GET /api/authors/me/books`
Returns `{ books: [...] }` — full book list with all royalty and distribution fields.

#### `POST /api/tickets`
```json
{
  "book_id": "uuid | null",
  "subject": "string (3–500 chars)",
  "description": "string (min 10 chars)"
}
```
Creates ticket, fires AI classification in background. Returns `{ ticket }` immediately.

#### `GET /api/tickets`
Returns `{ tickets: [...] }` — own tickets with status, category, response count.

#### `GET /api/tickets/:id`
Returns `{ ticket, responses }` — full ticket + public response thread. Internal notes never included.

---

### Admin Routes (role: admin)

#### `GET /api/admin/tickets`
Query params: `status`, `category`, `priority`, `assigned_to` (`me` | `unassigned`), `from`, `to`, `page`, `limit`

Sorted: Critical → High → Medium → Low, then oldest-first within each priority.

Returns `{ tickets, pagination: { total, page, limit } }`.

#### `GET /api/admin/tickets/:id`
Returns `{ ticket, responses, notes }` — full ticket including internal notes and book context (copies sold, royalty pending).

#### `PATCH /api/admin/tickets/:id`
```json
{
  "status": "Open | In Progress | Resolved | Closed",
  "category": "Royalty & Payments | ...",
  "priority": "Critical | High | Medium | Low",
  "assign_to_me": true,
  "unassign": true
}
```
Partial update — include only fields to change. Fires Socket.io `ticket:updated` to the author.

#### `POST /api/admin/tickets/:id/responses`
```json
{ "body": "string" }
```
Sends a reply visible to the author. Auto-advances status to `In Progress` if currently `Open`. Fires Socket.io to author and admin rooms.

#### `POST /api/admin/tickets/:id/notes`
```json
{ "body": "string" }
```
Internal admin note — never exposed to authors. Fires Socket.io to `admin` room only.

#### `POST /api/admin/tickets/:id/ai-draft`
Generates (or returns cached) AI draft. Returns `{ draft: string | null, cached: boolean }`.

#### `GET /api/admin/stats`
Returns `{ stats: { total, open, in_progress, resolved, closed, critical, high, unassigned } }`.

---

## Socket.io Events

| Event | Direction | Payload | Who receives |
|---|---|---|---|
| `join:author` | Client → Server | `authorId` | — |
| `join:admin` | Client → Server | — | — |
| `join:ticket` | Client → Server | `ticketId` | — |
| `ticket:new` | Server → Client | ticket object | `admin` room |
| `ticket:classified` | Server → Client | updated ticket | `admin` room |
| `ticket:updated` | Server → Client | `{ id, status, updated_at }` | `author:<id>` room |
| `ticket:response` | Server → Client | response object | `ticket:<id>`, `author:<id>`, `admin` |
| `ticket:note` | Server → Client | note object | `admin` room only |

---

## Deployment

The application is deployed on **AWS EC2** and is live at **https://lazydeveloper.fun**.

- **Backend** — Express + Socket.io server running on the EC2 instance, proxied via nginx
- **Frontend** — Next.js app served from the same instance
- **Database** — [Neon](https://neon.tech) serverless PostgreSQL (connected via `DATABASE_URL`)

---

## Known Limitations & Future Improvements

**Given more time, I would:**

1. **File attachments** — implement S3/R2 upload; store attachment URLs on the ticket row
2. **Email notifications** — send an email when an admin replies (currently real-time only via Socket.io)
3. **Pagination on frontend** — the ticket queue loads up to 50 tickets; proper infinite-scroll or paginated table for scale
4. **Author registration** — currently authors are seeded; add a self-registration flow with email verification
5. **Rate limiting** — `express-rate-limit` on the AI draft endpoint and login route
6. **Refresh tokens** — JWT is 7 days; a refresh token pattern improves security without forcing frequent re-logins
7. **AI streaming** — stream the draft response token-by-token to the admin UI for better UX on longer drafts
8. **Full-text search** — across ticket subjects and descriptions using PostgreSQL `tsvector`
9. **Audit log** — track every status change, assignment, and priority override with timestamps
10. **Redis adapter** — required for Socket.io in a multi-instance (load-balanced) deployment

---

## Brief Write-Up

**What I prioritised:** The core ticket lifecycle (create → classify → draft → respond → update status) and real-time author notification. These are the features that deliver actual value to BookLeaf's operations team and are the highest-weighted evaluation criteria.

**Trade-offs I made:**
- No file upload implementation — the UI exists but S3 plumbing would have taken time better spent on the AI layer
- No email notifications — Socket.io covers real-time; email would add a transactional provider dependency for a demo
- Drizzle ORM over raw `pg` queries — adds a thin abstraction layer but gives type-safe queries, a proper migration graph, and Drizzle Studio for DB inspection

**How I'd evolve this into production:**
- Deploy backend on Railway/Render with managed PostgreSQL; frontend on Vercel
- Add a Redis layer for Socket.io in multi-instance deployments (Socket.io Redis adapter)
- Replace ephemeral Anthropic prompt caching with a vector DB (pgvector) for semantic search over past tickets — enabling "similar tickets" suggestions to admins
- Instrument AI call latency, classification accuracy, and token costs in a metrics dashboard (Datadog or similar) so the ops team can measure ROI of the AI layer
- Gradually move from admin-edits-draft to fully autonomous responses for Low-priority General Inquiry tickets once classification accuracy is validated at scale

---

*Built for BookLeaf Publishing — Full-Stack Developer Assignment*

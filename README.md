# BookLeaf Author Support & Communication Portal

A full-stack web application for BookLeaf Publishing's author support operations — featuring an **author-facing portal** and an **admin-facing dashboard**, powered by AI-assisted ticket classification, priority scoring, and response drafting.

---

## Quick Start

### Prerequisites
- Node.js 18+
- Docker (for PostgreSQL) — or a local PostgreSQL 14+ instance

### 1. Clone & install

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Start PostgreSQL (Docker)

```bash
docker run -d \
  --name bookleaf-postgres \
  -e POSTGRES_USER=bookleaf \
  -e POSTGRES_PASSWORD=bookleaf123 \
  -e POSTGRES_DB=bookleaf \
  -p 5432:5432 \
  postgres:16-alpine
```

### 3. Configure environment

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:

```env
PORT=5000

DB_HOST=localhost
DB_PORT=5432
DB_NAME=bookleaf
DB_USER=bookleaf
DB_PASSWORD=bookleaf123

JWT_SECRET=change_this_to_a_long_random_string_in_production
JWT_EXPIRES_IN=7d

ANTHROPIC_API_KEY=sk-ant-...   # Required for AI features; app works without it

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
npm run migrate   # Creates all tables
npm run seed      # Inserts 10 authors, 18 books, 1 admin
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
| Author (2 books, pending royalty) | `priya.sharma@email.com` | `password123` |
| Author (bestseller) | `rohit.kapoor@email.com` | `password123` |
| Author (book in production) | `sneha.kulkarni@email.com` | `password123` |
| All other authors | `<email from data>` | `password123` |

---

## Architecture

### Stack

| Layer | Technology | Reason |
|---|---|---|
| Frontend | Next.js 16 (App Router) + TypeScript | Strong typing, file-based routing, SSR-ready |
| Styling | Tailwind CSS | Rapid iteration without context-switching to stylesheets |
| Backend | Node.js + Express | Fast to build, excellent ecosystem, async-first |
| Database | PostgreSQL 16 | Relational integrity for ticket/book/user relationships; array type for `available_on` |
| Real-time | Socket.io | Reliable fallback to polling when WebSocket is unavailable |
| AI | Anthropic Claude Haiku (claude-haiku-4-5) | Best quality/cost ratio for classification + drafting; strong instruction following |
| Auth | JWT (jsonwebtoken) + bcryptjs | Stateless, no session store needed for this scale |

### Project Structure

```
bookleaf-author-portal/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js           # PostgreSQL connection pool (pg)
│   │   │   └── env.js          # Zod-based env validation — fails fast on startup
│   │   ├── middleware/
│   │   │   ├── authenticate.js # JWT verification → attaches req.user from DB
│   │   │   └── requireRole.js  # Variadic role guard (author | admin)
│   │   ├── routes/
│   │   │   ├── auth.js         # /api/auth/*
│   │   │   ├── authors.js      # /api/authors/*  (author-only)
│   │   │   ├── tickets.js      # /api/tickets/*  (author-only)
│   │   │   ├── admin.js        # /api/admin/*    (admin-only)
│   │   │   └── ai.js           # reserved
│   │   ├── services/
│   │   │   └── aiService.js    # classifyAndPrioritize + generateDraftResponse
│   │   └── index.js            # Express + Socket.io server
│   ├── migrations/             # Ordered SQL files + idempotent runner
│   └── seeds/                  # Seed script + data.json
└── frontend/
    └── src/
        ├── app/                # Next.js App Router pages
        │   ├── login/
        │   ├── dashboard/
        │   ├── books/
        │   ├── tickets/
        │   └── admin/tickets/
        ├── components/         # Navbar, Badge, Spinner
        ├── contexts/           # AuthContext (login, logout, user state)
        └── lib/                # api.ts (axios + interceptors), socket.ts
```

### Key Design Decisions

**Single AI call per ticket submission** — `classifyAndPrioritize` is one Claude call that returns category + priority + initial draft in one JSON response. This avoids three separate API calls (and three times the cost) on every ticket.

**AI runs in the background, non-blocking** — After a ticket is created, the AI classification fires asynchronously. The author gets a `201` instantly; the AI result updates the ticket row and broadcasts via Socket.io when ready.

**Draft cached on the ticket row** — `ai_draft_response` is stored in the database. When an admin opens a ticket, the cached draft loads immediately. The on-demand `/ai-draft` endpoint only re-calls the API when there are new responses in the thread (context has changed).

**Separate AI vs human fields** — `ai_category`/`ai_priority` store what the model classified; `category`/`priority` are what the admin actually acts on. This lets us measure classification accuracy over time without losing the admin's override.

**Timing-safe auth** — The login endpoint runs `bcrypt.compare` even when the user doesn't exist (using a dummy hash), preventing user enumeration via timing attacks.

**Cross-author isolation** — Authors cannot see each other's tickets. The ticket-not-found response returns `404` (not `403`) to avoid leaking ticket existence.

**Role-based Socket.io rooms** — Authors join `author:<userId>` rooms; admins join a shared `admin` room. Internal notes are only emitted to the `admin` room, never to author rooms.

---

## AI Integration

### Model choice
**Claude Haiku (`claude-haiku-4-5`)** — chosen over GPT-4o-mini for:
- Superior instruction-following for structured JSON output
- Better tone calibration for empathetic, non-corporate support writing
- Cost: ~$0.00025 per ticket classification (input) + ~$0.00125 per draft

### Prompt strategy

**System prompt (cached):** The entire BookLeaf Knowledge Base — royalty policy, ISBN policy, printing timelines, distribution channels, communication tone guidelines, and sample Q&A pairs — is sent as a single system block with `cache_control: { type: "ephemeral" }`. Anthropic caches this after the first call; subsequent requests only pay for the per-ticket user message tokens.

**Classification call:** A single user message asks for a JSON response with `category`, `priority`, `priority_reason`, and `draft_response`. This collapses three potential calls (classify, score, draft) into one.

**Draft regeneration:** When an admin requests a fresh draft, only the ticket context + the last few responses are sent — not the entire ticket history. This keeps token counts low for long-running tickets.

**JSON fence stripping:** Claude sometimes wraps JSON in markdown code blocks. The service strips these before parsing, preventing brittle failures on model output variation.

### Error handling / graceful degradation

| Scenario | Behaviour |
|---|---|
| `ANTHROPIC_API_KEY` not set | AI calls are skipped entirely; tickets work normally |
| Anthropic API is down or rate-limited | Classification fails silently; ticket is still created with default `Medium` priority |
| JSON parse error in AI response | Logged to server console; ticket created with `null` AI fields; admin writes manually |
| Admin requests draft when AI unavailable | Returns cached draft if exists, `null` if not; frontend shows empty textarea |

### Cost awareness

- Knowledge Base (~1,200 tokens) is **cached** — only charged once per 5-minute cache TTL
- Each classification costs ~500–800 input tokens (ticket content) + ~200 output tokens
- Draft regeneration only occurs on explicit admin request, not on every page load
- Long ticket histories are NOT included in the draft prompt — only the current ticket + most recent responses

---

## API Documentation

All protected routes require `Authorization: Bearer <token>`.

### Auth

#### `POST /api/auth/login`
```json
{ "email": "string", "password": "string" }
```
Returns `{ token, user }`. Timing-safe — same response time whether user exists or not.

#### `GET /api/auth/me`
Returns `{ user }` for the currently authenticated user.

---

### Author Routes (role: author)

#### `GET /api/authors/me`
Returns `{ user, stats }` — profile + aggregated royalty totals across all books.

#### `GET /api/authors/me/books`
Returns `{ books: [...] }` — full book list with all royalty and distribution data.

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
Returns `{ ticket, responses }` — full ticket + public response thread (internal notes excluded).

---

### Admin Routes (role: admin)

#### `GET /api/admin/tickets`
Query params: `status`, `category`, `priority`, `assigned_to` (me|unassigned), `from`, `to`, `page`, `limit`

Sorted: Critical → High → Medium → Low, then oldest-first within each priority.

Returns `{ tickets, pagination: { total, page, limit } }`.

#### `GET /api/admin/tickets/:id`
Returns `{ ticket, responses, notes }` — full ticket including internal notes and book context (copies sold, royalty pending).

#### `PATCH /api/admin/tickets/:id`
```json
{
  "status": "Open|In Progress|Resolved|Closed",
  "category": "Royalty & Payments|...",
  "priority": "Critical|High|Medium|Low",
  "assign_to_me": true,
  "unassign": true
}
```
Partial update — only include fields to change. Fires Socket.io `ticket:updated` to author.

#### `POST /api/admin/tickets/:id/responses`
```json
{ "body": "string" }
```
Sends a reply visible to the author. Auto-advances status to `In Progress` if `Open`. Fires Socket.io to author and admin rooms.

#### `POST /api/admin/tickets/:id/notes`
```json
{ "body": "string" }
```
Internal note — never exposed to authors. Fires Socket.io to admin room only.

#### `POST /api/admin/tickets/:id/ai-draft`
Generates (or returns cached) AI draft response. Returns `{ draft: string|null, cached: boolean }`.

#### `GET /api/admin/stats`
Returns `{ stats: { total, open, in_progress, resolved, closed, critical, high, unassigned } }`.

---

### Socket.io Events

| Event | Direction | Payload | Who receives |
|---|---|---|---|
| `join:author` | Client→Server | `authorId` | — |
| `join:admin` | Client→Server | — | — |
| `join:ticket` | Client→Server | `ticketId` | — |
| `ticket:new` | Server→Client | `ticket` | `admin` room |
| `ticket:classified` | Server→Client | `ticket` | `admin` room |
| `ticket:updated` | Server→Client | `{ id, status }` | `author:<id>` room |
| `ticket:response` | Server→Client | `response` | `ticket:<id>`, `author:<id>`, `admin` rooms |
| `ticket:note` | Server→Client | `note` | `admin` room only |

---

## Database Schema

```
users           — authors + admins (role enum)
books           — all books with royalty data (author_id FK)
tickets         — support tickets (author_id, book_id FKs; ai_ prefixed fields for AI output)
ticket_responses — admin replies visible to authors
internal_notes  — admin-only notes, never exposed to authors
schema_migrations — idempotent migration tracking
```

Triggers: `updated_at` auto-set on `users`, `books`, `tickets` via PostgreSQL trigger function.

---

## Known Limitations & Future Improvements

**Given more time, I would:**

1. **File attachments** — implement actual S3/R2 upload rather than UI-only; store attachment URLs on the ticket
2. **Email notifications** — send an email when an admin replies (currently real-time only via Socket.io)
3. **Pagination on frontend** — the ticket queue loads up to 50 tickets; a proper infinite-scroll or paginated table would be needed at scale
4. **Author registration** — currently authors are seeded; adding a self-registration flow with email verification would complete the auth loop
5. **Rate limiting** — add express-rate-limit on the AI draft endpoint and login route
6. **Refresh token** — JWT is set to 7 days; a refresh token pattern would improve security without forcing frequent re-logins
7. **AI streaming** — stream the draft response token-by-token to the admin UI for a better UX on longer drafts
8. **Search** — full-text search across ticket subjects and descriptions using PostgreSQL `tsvector`
9. **Audit log** — track every status change, assignment, and override with timestamps for accountability

---

## Brief Write-Up

**What I prioritised:** The core ticket lifecycle (create → classify → draft → respond → update status) and real-time author notification. These are the features that deliver actual value to BookLeaf's operations team and are the highest-weighted evaluation criteria (AI integration + architecture).

**Trade-offs I made:**
- No file upload implementation — the UI is there but the backend S3 plumbing would have taken time better spent on the AI layer and real-time features
- No email notifications — Socket.io covers the real-time requirement; email would require a transactional provider (SendGrid/SES) which adds infra dependencies for a demo
- SQLite was briefly considered to avoid Docker dependency, but PostgreSQL's enum types and array support (`available_on TEXT[]`) made the schema cleaner and more honest about production intent

**How I'd evolve this into a production system:**
- Deploy backend on Railway/Render with managed PostgreSQL; frontend on Vercel
- Add a Redis layer for Socket.io in a multi-instance deployment (Socket.io adapter)
- Replace the ephemeral Anthropic prompt cache with explicit caching strategy using a vector DB (pgvector) for semantic search over past tickets — enabling "similar tickets" suggestions
- Instrument AI call latency, classification accuracy, and token costs in a metrics dashboard (Datadog or similar) so the ops team can measure ROI of the AI layer
- Gradually move from admin-edits-draft to fully autonomous responses for Low-priority/General-Inquiry tickets once classification accuracy is validated

---

*Built for BookLeaf Publishing — Full-Stack Developer Assignment 1 of 2*

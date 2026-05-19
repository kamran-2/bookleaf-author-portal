const Anthropic = require('@anthropic-ai/sdk');

// Client is instantiated once and reused across requests
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = 'claude-haiku-4-5-20251001';

// ─── Knowledge Base ────────────────────────────────────────────────────────
// Sent as a cached system block — Anthropic caches this after the first call,
// so subsequent requests don't re-tokenise the entire KB every time.
const KNOWLEDGE_BASE = `
You are a BookLeaf Publishing support representative. Always respond in BookLeaf's voice:
empathetic, professional, specific (use real numbers/dates), never deflect blame, and end with a clear next step.

=== BOOKLEAF KNOWLEDGE BASE ===

COMPANY
- Self-publishing company in India and US, 22,000+ titles, 1,200+ books/month
- Packages: Standard Free (no upfront cost), Bestseller Breakthrough (paid, marketing + distribution)
- Services: cover design, typesetting, ISBN assignment, printing, distribution, royalty management
- In-house printing facility in Delhi; partners: Repro India, Epitome Books

ROYALTY POLICY
- Split: 80% net profit to author, 20% to BookLeaf
- Net profit = MRP − printing cost − platform commission (Amazon/Flipkart) − shipping charges
- Calculated quarterly, paid within 45 days of quarter end
- Minimum payout threshold: ₹1,000 (rolls over if below)
- Paid via bank transfer to account in author's dashboard
- Authors can view per-platform sales breakdown in dashboard

ISBN POLICY
- Every book gets a unique ISBN assigned by BookLeaf under BookLeaf's publisher imprint
- Authors wanting an ISBN under their own imprint must obtain it independently
- ISBN errors (duplicate, wrong book linked) = high-priority, escalated to production within 48 hours

PRINTING & QUALITY
- In-house handles most orders; overflow/special formats go to Repro India or Epitome Books
- Turnaround: 5–7 business days from order confirmation
- Quality issues (misprints, binding defects, colour inconsistency): free reprint after verification
  Author must share photos of the defective copy

DISTRIBUTION & AVAILABILITY
- Listed on: Amazon India, Flipkart, Amazon US, Amazon UK, BookLeaf Store
- New listings go live 7–10 business days after publication is complete
- "Currently Unavailable" on platform = stock sync issue; BookLeaf team can re-sync within 24–48 hours

PRODUCTION STAGES (in order)
Manuscript Received → Editing (if opted) → Cover Design → Typesetting → Proofreading
→ ISBN Assignment → Printing → Distribution Setup → Published & Live
Authors are emailed at each stage. Delays typically happen at Cover Design (author approval) and Proofreading (revision rounds).

COMMUNICATION TONE
- Acknowledge the author's concern before jumping to solutions
- Be specific: include actual numbers, dates, and statuses
- If it is BookLeaf's fault: own it directly, no corporate deflection
- If escalation/investigation needed: give a clear timeline (e.g., "48 hours")
- Always end with a clear next step for the author and/or BookLeaf team

SAMPLE RESPONSE EXAMPLES
Q: "I published 4 months ago and haven't received any royalty."
A: Acknowledge frustration → explain quarterly cycle + 45-day window → ask if bank details are linked → provide specific next payout date → if genuinely overdue, escalate with 48-hour resolution timeline

Q: "My royalty seems too low — I sold 200 copies but got ₹3,000."
A: Explain net profit calculation (MRP minus printing, commission, shipping) → offer line-by-line breakdown → don't be defensive

Q: "ISBN on Amazon differs from the physical copy."
A: Treat as high priority → acknowledge it's a serious data issue → confirm escalation to production → 48-hour resolution

Q: "Print quality is terrible — blurry images, misaligned pages."
A: Apologise sincerely → ask for photos → confirm free reprint once verified → 5–7 business days timeline

Q: "Book shows 'Currently Unavailable' on Amazon."
A: Explain stock sync issue → confirm triggering re-sync → 24–48 hours to go live

Q: "Book has been in typesetting for 3 weeks."
A: Check status → be honest about delay reason → give specific updated timeline → don't blame author
`.trim();

const CATEGORIES = [
  'Royalty & Payments',
  'ISBN & Metadata Issues',
  'Printing & Quality',
  'Distribution & Availability',
  'Book Status & Production Updates',
  'General Inquiry',
];

const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

// ─── Helpers ───────────────────────────────────────────────────────────────

// Strip markdown code fences that some Claude responses include
function extractJSON(raw) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : raw.trim();
}

function buildTicketContext(ticket) {
  const lines = [
    `TICKET SUBJECT: ${ticket.subject}`,
    `TICKET DESCRIPTION: ${ticket.description}`,
  ];
  if (ticket.book_title) {
    lines.push(`BOOK: ${ticket.book_title} (${ticket.genre || 'unknown genre'})`);
    lines.push(`BOOK STATUS: ${ticket.book_status || ticket.status || 'unknown'}`);
    if (ticket.royalty_pending != null) lines.push(`ROYALTY PENDING: ₹${ticket.royalty_pending}`);
    if (ticket.total_copies_sold != null) lines.push(`COPIES SOLD: ${ticket.total_copies_sold}`);
    if (ticket.mrp != null) lines.push(`MRP: ₹${ticket.mrp}`);
  }
  if (ticket.author_name) lines.push(`AUTHOR: ${ticket.author_name}`);
  return lines.join('\n');
}

// ─── classifyAndPrioritize ─────────────────────────────────────────────────
// Called immediately after ticket creation (non-blocking).
// Single API call returns category + priority + initial draft — cost-efficient.

async function classifyAndPrioritize(ticket) {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const ticketContext = buildTicketContext(ticket);

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: KNOWLEDGE_BASE,
          cache_control: { type: 'ephemeral' }, // Cache KB across calls
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Analyse this author support ticket and respond with ONLY valid JSON (no markdown, no explanation).

${ticketContext}

Return exactly this JSON structure:
{
  "category": "<one of: ${CATEGORIES.join(' | ')}>",
  "priority": "<one of: ${PRIORITIES.join(' | ')}>",
  "priority_reason": "<one sentence explaining why this priority>",
  "draft_response": "<a complete, ready-to-send response to the author in BookLeaf's voice — empathetic, specific, with a clear next step>"
}

Priority guidance:
- Critical: financial loss, ISBN errors, legal concerns, no royalty for 6+ months
- High: royalty discrepancy, quality defects, book unavailable on platforms
- Medium: production status enquiry, payment timeline question
- Low: general information, bio/metadata updates, non-urgent questions`,
        },
      ],
    });

    const raw = extractJSON(response.content[0].text);
    const json = JSON.parse(raw);

    if (!CATEGORIES.includes(json.category)) json.category = 'General Inquiry';
    if (!PRIORITIES.includes(json.priority)) json.priority = 'Medium';

    return {
      category: json.category,
      priority: json.priority,
      draftResponse: json.draft_response,
    };
  } catch (err) {
    // AI failure is non-fatal — log and return null so caller can skip the update
    console.error('AI classify failed:', err.message);
    return null;
  }
}

// ─── generateDraftResponse ─────────────────────────────────────────────────
// Called on demand when an admin opens a ticket and wants a fresh draft.
// Uses cached KB system block — only the per-ticket context is new tokens.

async function generateDraftResponse(ticket, previousResponses = []) {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  // Return cached draft if already generated and no previous responses exist
  // (avoids re-generating when nothing new has happened)
  if (ticket.ai_draft_response && previousResponses.length === 0) {
    return ticket.ai_draft_response;
  }

  const ticketContext = buildTicketContext(ticket);

  const conversationSoFar = previousResponses.length > 0
    ? `\nPREVIOUS RESPONSES IN THIS TICKET:\n${previousResponses.map((r, i) => `[${i + 1}] ${r.body}`).join('\n\n')}`
    : '';

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 800,
      system: [
        {
          type: 'text',
          text: KNOWLEDGE_BASE,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Write a complete, ready-to-send response to the following author support ticket.

${ticketContext}${conversationSoFar}

Requirements:
- Use BookLeaf's tone: empathetic, professional, specific
- Acknowledge the concern first
- Provide concrete information based on the knowledge base
- Include specific timelines where applicable
- End with a clear next step
- Do NOT start with "Dear Author" — use the author's name if provided
- Do NOT add any preamble or meta-commentary — output ONLY the response text`,
        },
      ],
    });

    return response.content[0].text.trim();
  } catch (err) {
    console.error('AI draft failed:', err.message);
    return null;
  }
}

module.exports = { classifyAndPrioritize, generateDraftResponse };

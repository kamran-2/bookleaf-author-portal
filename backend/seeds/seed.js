require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const data = require('./data.json');
const { users, books, tickets, ticketResponses, internalNotes } = require('../src/db/schema');

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes('neon.tech') || process.env.NODE_ENV === 'production'
          ? { rejectUnauthorized: false }
          : false,
      }
    : {
        host:     process.env.DB_HOST,
        port:     parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME,
        user:     process.env.DB_USER,
        password: process.env.DB_PASSWORD,
      }
);

const db = drizzle(pool);

const AUTHOR_PASSWORD = 'password123';
const ADMIN_PASSWORD  = 'admin123';

const SAMPLE_TICKETS = [
  {
    authorEmail: 'priya.sharma@email.com',
    bookRef: 'BK001',
    subject: 'Royalty payment not received for Q3 2025',
    description: 'I sold 342 copies of Whispers of the Ganges and the Q3 royalty payout was due by mid-November. The royalty pending on my dashboard shows ₹3,570 but I have not received any bank transfer. My bank details are correctly linked. Please investigate urgently.',
    category: 'Royalty & Payments', ai_category: 'Royalty & Payments',
    priority: 'Critical', ai_priority: 'Critical',
    status: 'In Progress', ai_processed: true,
    ai_draft_response: 'Dear Priya,\n\nThank you for reaching out. I have escalated this to our Finance team as a Critical priority case. They will investigate within 24 hours and reprocess the transfer if there is any issue. You will receive a bank credit within 3–5 business days once confirmed.\n\nWarm regards,\nBookLeaf Admin',
    responses: [
      { body: 'Dear Priya,\n\nI have escalated this to our Finance team as a Critical priority case. They will investigate within 24 hours and reprocess the transfer if there is any processing issue. You will receive a bank credit within 3–5 business days once confirmed.\n\nWarm regards,\nBookLeaf Admin' },
    ],
    notes: [
      { body: 'Checked payment logs — transfer was initiated but failed due to IFSC mismatch. Need to verify bank details with author before reprocessing.' },
    ],
  },
  {
    authorEmail: 'rohit.kapoor@email.com',
    bookRef: 'BK004',
    subject: 'My royalty amount seems too low for Startup Sutra',
    description: 'I sold 1,203 copies of Startup Sutra at MRP ₹499. My total royalty earned shows ₹57,744 but I expected more. Can you share a detailed breakdown of how this was calculated? I want to understand the deductions for printing, platform commission, and shipping.',
    category: 'Royalty & Payments', ai_category: 'Royalty & Payments',
    priority: 'High', ai_priority: 'High',
    status: 'Resolved', ai_processed: true, ai_draft_response: null,
    responses: [
      { body: 'Dear Rohit,\n\nBookLeaf follows an 80/20 net profit split. After printing (~₹120), platform commission (~₹150), and shipping (~₹45), your 80% share is ₹147.2 per copy. The dashboard figure reflects copies sold through higher-commission channels. A detailed per-platform breakdown is available under Books → Startup Sutra → Royalty Details.\n\nWarm regards,\nBookLeaf Admin' },
    ],
    notes: [],
  },
  {
    authorEmail: 'sneha.kulkarni@email.com',
    bookRef: 'BK013',
    subject: 'Midnight in Mysore has been in Cover Design for 6 weeks',
    description: 'My thriller Midnight in Mysore has been stuck in the Cover Design stage for over 6 weeks. I submitted my cover brief and reference images on time. I have not received any draft from the design team. This is causing significant delays to my planned launch.',
    category: 'Book Status & Production Updates', ai_category: 'Book Status & Production Updates',
    priority: 'High', ai_priority: 'High',
    status: 'Open', ai_processed: true,
    ai_draft_response: 'Dear Sneha,\n\nA 6-week wait without any draft is not acceptable and I apologise. Your cover has been assigned to a senior designer today as a priority. You will receive the first draft within 5 business days, after which the remaining stages take 25–30 days.\n\nWarm regards,\nBookLeaf Admin',
    responses: [],
    notes: [
      { body: 'Design team confirms the book was in the queue but not assigned. Escalated to design lead. Designer assigned: Rahul M. First draft promised within 5 days.' },
    ],
  },
  {
    authorEmail: 'ananya.reddy@email.com',
    bookRef: 'BK005',
    subject: 'Between Two Temples showing "Currently Unavailable" on Amazon India',
    description: 'My book Between Two Temples was published in July 2024 and has been selling well. However, since last week it is showing as "Currently Unavailable" on Amazon India. Customers are messaging me about this. Please fix this urgently as I am losing sales.',
    category: 'Distribution & Availability', ai_category: 'Distribution & Availability',
    priority: 'High', ai_priority: 'High',
    status: 'Resolved', ai_processed: true, ai_draft_response: null,
    responses: [
      { body: 'Dear Ananya,\n\nThis is a stock sync issue, not an actual stock shortage. I have triggered a re-sync with Amazon and the listing should be restored to "In Stock" within 24–48 hours. Your inventory levels are confirmed sufficient.\n\nWarm regards,\nBookLeaf Admin' },
    ],
    notes: [],
  },
  {
    authorEmail: 'vikram.joshi@email.com',
    bookRef: 'BK006',
    subject: 'Author copies of Debugging Life have severe print quality issues',
    description: 'I received my 10 author copies of Debugging Life yesterday and the print quality is unacceptable. Multiple pages have blurry text, the spine alignment is off by 3-4mm, and pages 45-52 have an ink smear running diagonally. I cannot distribute these to reviewers. Please arrange a reprint immediately.',
    category: 'Printing & Quality', ai_category: 'Printing & Quality',
    priority: 'Critical', ai_priority: 'Critical',
    status: 'In Progress', ai_processed: true, ai_draft_response: null,
    responses: [
      { body: 'Dear Vikram,\n\nI am sorry about the quality issues — this is completely unacceptable. I am initiating a free reprint immediately. A fresh print run for your 10 copies begins today and we will expedite to 3–4 days. You will receive a tracking number within 48 hours.\n\nWarm regards,\nBookLeaf Admin' },
    ],
    notes: [
      { body: 'Defect traced to a calibration issue on Press #3 at the Delhi facility. That press is now offline for maintenance. Reprint assigned to Press #1 with quality check before dispatch.' },
    ],
  },
  {
    authorEmail: 'farhan.sheikh@email.com',
    bookRef: null,
    subject: 'How do I update my bank account details for royalty payments?',
    description: 'I recently changed my bank account and want to update my payment details to ensure future royalty payments go to the correct account. I could not find the option in my dashboard.',
    category: 'General Inquiry', ai_category: 'General Inquiry',
    priority: 'Low', ai_priority: 'Low',
    status: 'Resolved', ai_processed: true, ai_draft_response: null,
    responses: [
      { body: 'Dear Farhan,\n\nGo to Account Settings → Payment Details → Edit. Enter your new account number, IFSC code, and account holder name, then Save. An OTP will be sent to your registered email to confirm the change. The updated details apply to your next quarterly payout.\n\nWarm regards,\nBookLeaf Admin' },
    ],
    notes: [],
  },
  {
    authorEmail: 'meera.nair@email.com',
    bookRef: 'BK009',
    subject: 'ISBN on Amazon US differs from the physical book for Letters from Lakshadweep',
    description: "Letters from Lakshadweep is listed on Amazon US with a different ISBN than what is printed on the physical copy. This is causing confusion for readers and reviewers and may affect discoverability and sales ranking.",
    category: 'ISBN & Metadata Issues', ai_category: 'ISBN & Metadata Issues',
    priority: 'Critical', ai_priority: 'Critical',
    status: 'Open', ai_processed: true,
    ai_draft_response: 'Dear Meera,\n\nAn ISBN mismatch is a serious data error and I am treating it as our highest priority. I am escalating to our Production and Distribution teams immediately. We will submit a metadata correction request to Amazon US today — they typically process these within 3–5 business days. Please do not make any changes on your end.\n\nWarm regards,\nBookLeaf Admin',
    responses: [],
    notes: [
      { body: 'ISBN mismatch confirmed — wrong ISBN submitted to Amazon US during initial distribution setup (data entry error). Escalated to production lead. Amazon correction request to be filed today.' },
    ],
  },
];

async function seed() {
  try {
    // Clear in FK dependency order
    await db.delete(internalNotes);
    await db.delete(ticketResponses);
    await db.delete(tickets);
    await db.delete(books);
    await db.delete(users);
    console.log('Cleared existing data.');

    const [authorHash, adminHash] = await Promise.all([
      bcrypt.hash(AUTHOR_PASSWORD, 10),
      bcrypt.hash(ADMIN_PASSWORD, 10),
    ]);

    const [admin] = await db
      .insert(users)
      .values({ email: 'admin@bookleaf.com', password_hash: adminHash, name: 'BookLeaf Admin', role: 'admin' })
      .returning({ id: users.id });
    console.log('  inserted admin: admin@bookleaf.com / admin123');

    const userEmailToId = {};
    const bookRefToId   = {};

    for (const author of data.authors) {
      const [user] = await db
        .insert(users)
        .values({
          email:        author.email,
          password_hash: authorHash,
          name:         author.name,
          role:         'author',
          phone:        author.phone,
          city:         author.city,
          author_id:    author.author_id,
          joined_date:  author.joined_date,
        })
        .returning({ id: users.id });

      userEmailToId[author.email] = user.id;
      console.log(`  inserted author: ${author.email}`);

      for (const book of author.books) {
        const [b] = await db
          .insert(books)
          .values({
            book_id:                  book.book_id,
            author_id:                user.id,
            title:                    book.title,
            isbn:                     book.isbn,
            genre:                    book.genre,
            publication_date:         book.publication_date ?? null,
            status:                   book.status,
            mrp:                      book.mrp ?? null,
            author_royalty_per_copy:  book.author_royalty_per_copy ?? null,
            total_copies_sold:        book.total_copies_sold,
            total_royalty_earned:     book.total_royalty_earned,
            royalty_paid:             book.royalty_paid,
            royalty_pending:          book.royalty_pending,
            last_royalty_payout_date: book.last_royalty_payout_date ?? null,
            print_partner:            book.print_partner ?? null,
            available_on:             book.available_on,
          })
          .returning({ id: books.id });

        bookRefToId[book.book_id] = b.id;
        console.log(`    inserted book: ${book.title}`);
      }
    }

    console.log('\n  seeding tickets...');
    for (const t of SAMPLE_TICKETS) {
      const authorId = userEmailToId[t.authorEmail];
      const bookId   = t.bookRef ? bookRefToId[t.bookRef] : null;

      if (!authorId) {
        console.warn(`    WARN: author not found for ${t.authorEmail}, skipping`);
        continue;
      }

      const [ticket] = await db
        .insert(tickets)
        .values({
          author_id:         authorId,
          book_id:           bookId,
          subject:           t.subject,
          description:       t.description,
          status:            t.status,
          category:          t.category,
          ai_category:       t.ai_category,
          priority:          t.priority,
          ai_priority:       t.ai_priority,
          ai_draft_response: t.ai_draft_response,
          ai_processed:      t.ai_processed,
        })
        .returning({ id: tickets.id });

      console.log(`    inserted ticket: "${t.subject.slice(0, 50)}..."`);

      for (const r of t.responses) {
        await db.insert(ticketResponses).values({
          ticket_id: ticket.id, responder_id: admin.id, body: r.body,
        });
      }

      for (const n of t.notes) {
        await db.insert(internalNotes).values({
          ticket_id: ticket.id, author_id: admin.id, body: n.body,
        });
      }
    }

    const totalResponses = SAMPLE_TICKETS.reduce((s, t) => s + t.responses.length, 0);
    const totalNotes     = SAMPLE_TICKETS.reduce((s, t) => s + t.notes.length, 0);

    console.log('\nSeed complete.');
    console.log(`  Users     : 11 (1 admin + 10 authors)`);
    console.log(`  Books     : 18`);
    console.log(`  Tickets   : ${SAMPLE_TICKETS.length}`);
    console.log(`  Responses : ${totalResponses}`);
    console.log(`  Notes     : ${totalNotes}`);
    console.log('\nTest credentials:');
    console.log('  Admin  : admin@bookleaf.com        / admin123');
    console.log('  Author : priya.sharma@email.com    / password123');
  } finally {
    await pool.end();
  }
}

seed().catch(err => { console.error('Seed failed:', err.message); process.exit(1); });

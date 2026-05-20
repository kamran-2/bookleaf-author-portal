const spec = {
  openapi: '3.0.3',
  info: {
    title: 'BookLeaf Author Support Portal API',
    version: '1.0.0',
    description:
      'REST API for the BookLeaf Author Support & Communication Portal. ' +
      'Author routes require `role: author`; Admin routes require `role: admin`. ' +
      'All protected routes need `Authorization: Bearer <token>`.',
  },
  servers: [
    { url: 'http://localhost:5000', description: 'Local development' },
    { url: 'https://lazydeveloper.fun', description: 'Production (EC2)' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      // ── Auth ─────────────────────────────────────────────────────────────
      LoginRequest: {
        type: 'object', required: ['email', 'password'],
        properties: {
          email:    { type: 'string', format: 'email', example: 'priya.sharma@email.com' },
          password: { type: 'string', example: 'password123' },
        },
      },
      User: {
        type: 'object',
        properties: {
          id:          { type: 'string', format: 'uuid' },
          email:       { type: 'string', format: 'email' },
          name:        { type: 'string' },
          role:        { type: 'string', enum: ['author', 'admin'] },
          phone:       { type: 'string', nullable: true },
          city:        { type: 'string', nullable: true },
          author_id:   { type: 'string', nullable: true, description: 'Readable author reference (e.g. BL-AUTH-001)' },
          joined_date: { type: 'string', format: 'date', nullable: true },
          created_at:  { type: 'string', format: 'date-time' },
          updated_at:  { type: 'string', format: 'date-time' },
        },
      },
      // ── Books ─────────────────────────────────────────────────────────────
      Book: {
        type: 'object',
        properties: {
          id:                      { type: 'string', format: 'uuid' },
          book_id:                 { type: 'string', description: 'Readable book reference (e.g. BL-001)' },
          title:                   { type: 'string' },
          isbn:                    { type: 'string', nullable: true },
          genre:                   { type: 'string', nullable: true },
          publication_date:        { type: 'string', format: 'date', nullable: true },
          status:                  { type: 'string', enum: ['Draft', 'Under Review', 'In Production', 'Published', 'Out of Print'] },
          mrp:                     { type: 'number', nullable: true },
          author_royalty_per_copy: { type: 'number', nullable: true },
          total_copies_sold:       { type: 'integer', nullable: true },
          total_royalty_earned:    { type: 'number', nullable: true },
          royalty_paid:            { type: 'number', nullable: true },
          royalty_pending:         { type: 'number', nullable: true },
          last_royalty_payout_date:{ type: 'string', format: 'date', nullable: true },
          print_partner:           { type: 'string', nullable: true },
          available_on:            { type: 'array', items: { type: 'string' }, nullable: true },
          created_at:              { type: 'string', format: 'date-time' },
          updated_at:              { type: 'string', format: 'date-time' },
        },
      },
      // ── Tickets ───────────────────────────────────────────────────────────
      Ticket: {
        type: 'object',
        properties: {
          id:                { type: 'string', format: 'uuid' },
          subject:           { type: 'string' },
          description:       { type: 'string' },
          status:            { type: 'string', enum: ['Open', 'In Progress', 'Resolved', 'Closed'] },
          category:          { type: 'string', nullable: true, enum: ['Royalty & Payments', 'ISBN & Metadata Issues', 'Printing & Quality', 'Distribution & Availability', 'Book Status & Production Updates', 'General Inquiry', null] },
          ai_category:       { type: 'string', nullable: true },
          priority:          { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low'] },
          ai_priority:       { type: 'string', nullable: true },
          ai_draft_response: { type: 'string', nullable: true },
          ai_processed:      { type: 'boolean' },
          book_title:        { type: 'string', nullable: true },
          book_isbn:         { type: 'string', nullable: true },
          assigned_to:       { type: 'string', format: 'uuid', nullable: true },
          created_at:        { type: 'string', format: 'date-time' },
          updated_at:        { type: 'string', format: 'date-time' },
        },
      },
      TicketListItem: {
        allOf: [{ $ref: '#/components/schemas/Ticket' }],
        properties: {
          response_count: { type: 'integer' },
          book_ref:       { type: 'string', nullable: true },
        },
      },
      CreateTicketRequest: {
        type: 'object', required: ['subject', 'description'],
        properties: {
          book_id:     { type: 'string', format: 'uuid', nullable: true, description: 'UUID of an author-owned book; omit or null for non-book tickets' },
          subject:     { type: 'string', minLength: 3, maxLength: 500, example: 'Royalty payment not received for Q1' },
          description: { type: 'string', minLength: 10, example: 'I have not received my Q1 royalty payment of ₹12,500 yet.' },
        },
      },
      // ── Responses & Notes ─────────────────────────────────────────────────
      TicketResponse: {
        type: 'object',
        properties: {
          id:             { type: 'string', format: 'uuid' },
          body:           { type: 'string' },
          responder_name: { type: 'string' },
          responder_role: { type: 'string', enum: ['author', 'admin'] },
          created_at:     { type: 'string', format: 'date-time' },
        },
      },
      InternalNote: {
        type: 'object',
        properties: {
          id:          { type: 'string', format: 'uuid' },
          body:        { type: 'string' },
          author_name: { type: 'string' },
          created_at:  { type: 'string', format: 'date-time' },
        },
      },
      // ── Admin ticket list item ─────────────────────────────────────────────
      AdminTicketListItem: {
        allOf: [{ $ref: '#/components/schemas/TicketListItem' }],
        properties: {
          author_name:      { type: 'string' },
          author_email:     { type: 'string' },
          author_city:      { type: 'string', nullable: true },
          assigned_to_name: { type: 'string', nullable: true },
        },
      },
      // ── Errors ────────────────────────────────────────────────────────────
      Error: {
        type: 'object',
        properties: {
          error:   { type: 'string' },
          details: { type: 'object', additionalProperties: true },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          page:  { type: 'integer' },
          limit: { type: 'integer' },
        },
      },
    },
  },
  security: [],  // overridden per-operation where needed
  tags: [
    { name: 'Health',   description: 'Server health' },
    { name: 'Auth',     description: 'Login and session' },
    { name: 'Author',   description: 'Author profile and books (role: author)' },
    { name: 'Tickets',  description: 'Ticket lifecycle for authors (role: author)' },
    { name: 'Admin',    description: 'Ticket management for admins (role: admin)' },
  ],
  paths: {
    // ── Health ──────────────────────────────────────────────────────────────
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        responses: {
          200: {
            description: 'Server is running',
            content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', example: 'ok' }, timestamp: { type: 'string', format: 'date-time' } } } } },
          },
        },
      },
    },

    // ── Auth ────────────────────────────────────────────────────────────────
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login',
        description: 'Returns a JWT and the authenticated user object. Timing-safe against user enumeration.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } },
        },
        responses: {
          200: {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: { type: 'string', description: 'JWT — include as `Authorization: Bearer <token>`' },
                    user:  { $ref: '#/components/schemas/User' },
                  },
                },
              },
            },
          },
          400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          401: { description: 'Invalid credentials', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Get current user',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Current authenticated user',
            content: { 'application/json': { schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } } } },
          },
          401: { description: 'Missing or invalid token' },
        },
      },
    },

    // ── Author profile ───────────────────────────────────────────────────────
    '/api/authors/me': {
      get: {
        tags: ['Author'],
        summary: 'Author profile + royalty stats',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Profile and aggregated royalty totals across all books',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user:  { $ref: '#/components/schemas/User' },
                    stats: {
                      type: 'object',
                      properties: {
                        total_copies_sold:    { type: 'number' },
                        total_royalty_earned: { type: 'number' },
                        royalty_paid:         { type: 'number' },
                        royalty_pending:      { type: 'number' },
                        total_books:          { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden (admin cannot access author routes)' },
        },
      },
    },
    '/api/authors/me/books': {
      get: {
        tags: ['Author'],
        summary: 'List author\'s books',
        description: 'Returns all books belonging to the authenticated author, ordered by creation date.',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Book list',
            content: { 'application/json': { schema: { type: 'object', properties: { books: { type: 'array', items: { $ref: '#/components/schemas/Book' } } } } } },
          },
          401: { description: 'Unauthorized' },
        },
      },
    },

    // ── Tickets (author) ─────────────────────────────────────────────────────
    '/api/tickets': {
      post: {
        tags: ['Tickets'],
        summary: 'Create a support ticket',
        description: 'Creates a ticket and immediately returns 201. AI classification (category, priority, draft response) runs in the background and updates the ticket asynchronously.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateTicketRequest' } } },
        },
        responses: {
          201: {
            description: 'Ticket created',
            content: { 'application/json': { schema: { type: 'object', properties: { ticket: { $ref: '#/components/schemas/Ticket' } } } } },
          },
          400: { description: 'Validation error or book not owned by author', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          401: { description: 'Unauthorized' },
        },
      },
      get: {
        tags: ['Tickets'],
        summary: 'List author\'s tickets',
        description: 'Returns all tickets submitted by the authenticated author, newest first.',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Ticket list',
            content: { 'application/json': { schema: { type: 'object', properties: { tickets: { type: 'array', items: { $ref: '#/components/schemas/TicketListItem' } } } } } },
          },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/api/tickets/{id}': {
      get: {
        tags: ['Tickets'],
        summary: 'Get ticket detail',
        description: 'Returns the full ticket and its public response thread. Internal admin notes are never included.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: {
            description: 'Ticket with responses',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ticket:    { $ref: '#/components/schemas/Ticket' },
                    responses: { type: 'array', items: { $ref: '#/components/schemas/TicketResponse' } },
                  },
                },
              },
            },
          },
          404: { description: 'Ticket not found or not owned by author' },
        },
      },
    },
    '/api/tickets/{id}/replies': {
      post: {
        tags: ['Tickets'],
        summary: 'Author reply on a ticket',
        description: 'Allows the author to follow up on their own ticket. Reply is stored in the shared response thread and visible to admins in real-time via Socket.io.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['body'], properties: { body: { type: 'string', minLength: 1, maxLength: 10000, example: 'I have attached the invoice. Please let me know.' } } } } },
        },
        responses: {
          201: {
            description: 'Reply saved',
            content: { 'application/json': { schema: { type: 'object', properties: { response: { $ref: '#/components/schemas/TicketResponse' } } } } },
          },
          400: { description: 'Validation error' },
          404: { description: 'Ticket not found or not owned by this author' },
        },
      },
    },

    // ── Admin tickets ────────────────────────────────────────────────────────
    '/api/admin/tickets': {
      get: {
        tags: ['Admin'],
        summary: 'Ticket queue',
        description: 'Paginated, filterable ticket queue. Sorted Critical → High → Medium → Low, then oldest-first within each priority.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'status',      in: 'query', schema: { type: 'string', enum: ['Open', 'In Progress', 'Resolved', 'Closed'] } },
          { name: 'category',    in: 'query', schema: { type: 'string', enum: ['Royalty & Payments', 'ISBN & Metadata Issues', 'Printing & Quality', 'Distribution & Availability', 'Book Status & Production Updates', 'General Inquiry'] } },
          { name: 'priority',    in: 'query', schema: { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low'] } },
          { name: 'assigned_to', in: 'query', schema: { type: 'string', enum: ['me', 'unassigned'] }, description: '`me` = tickets assigned to current admin; `unassigned` = no assignee' },
          { name: 'from',        in: 'query', schema: { type: 'string', format: 'date' }, description: 'Filter tickets created on or after this date' },
          { name: 'to',          in: 'query', schema: { type: 'string', format: 'date' }, description: 'Filter tickets created on or before this date' },
          { name: 'page',        in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit',       in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
        ],
        responses: {
          200: {
            description: 'Paginated ticket list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    tickets:    { type: 'array', items: { $ref: '#/components/schemas/AdminTicketListItem' } },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden (author cannot access admin routes)' },
        },
      },
    },
    '/api/admin/tickets/{id}': {
      get: {
        tags: ['Admin'],
        summary: 'Get full ticket detail',
        description: 'Returns full ticket context including author info, book financials, public responses, and internal admin notes.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: {
            description: 'Ticket with responses and internal notes',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ticket: {
                      allOf: [{ $ref: '#/components/schemas/Ticket' }],
                      properties: {
                        author_name:       { type: 'string' },
                        author_email:      { type: 'string' },
                        author_phone:      { type: 'string', nullable: true },
                        author_city:       { type: 'string', nullable: true },
                        author_ref:        { type: 'string', nullable: true },
                        book_genre:        { type: 'string', nullable: true },
                        book_status:       { type: 'string', nullable: true },
                        total_copies_sold: { type: 'integer', nullable: true },
                        royalty_pending:   { type: 'number', nullable: true },
                        assigned_to_name:  { type: 'string', nullable: true },
                      },
                    },
                    responses: { type: 'array', items: { $ref: '#/components/schemas/TicketResponse' } },
                    notes:     { type: 'array', items: { $ref: '#/components/schemas/InternalNote' } },
                  },
                },
              },
            },
          },
          404: { description: 'Ticket not found' },
        },
      },
      patch: {
        tags: ['Admin'],
        summary: 'Update ticket',
        description: 'Partial update — include only the fields to change. Fires `ticket:updated` Socket.io event to the author when status changes.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status:       { type: 'string', enum: ['Open', 'In Progress', 'Resolved', 'Closed'] },
                  category:     { type: 'string', enum: ['Royalty & Payments', 'ISBN & Metadata Issues', 'Printing & Quality', 'Distribution & Availability', 'Book Status & Production Updates', 'General Inquiry'] },
                  priority:     { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low'] },
                  assign_to_me: { type: 'boolean', description: 'Set to `true` to assign ticket to the current admin' },
                  unassign:     { type: 'boolean', description: 'Set to `true` to remove current assignee' },
                },
              },
              example: { status: 'In Progress', priority: 'High' },
            },
          },
        },
        responses: {
          200: {
            description: 'Updated ticket',
            content: { 'application/json': { schema: { type: 'object', properties: { ticket: { $ref: '#/components/schemas/Ticket' } } } } },
          },
          400: { description: 'Validation error or nothing to update' },
          404: { description: 'Ticket not found' },
        },
      },
    },
    '/api/admin/tickets/{id}/responses': {
      post: {
        tags: ['Admin'],
        summary: 'Send reply to author',
        description: 'Sends a response visible to the author. Auto-advances status from `Open` to `In Progress` on first admin reply. Fires `ticket:response` to author and admin rooms.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['body'], properties: { body: { type: 'string', minLength: 1, maxLength: 10000 } } } } },
        },
        responses: {
          201: {
            description: 'Response sent',
            content: { 'application/json': { schema: { type: 'object', properties: { response: { $ref: '#/components/schemas/TicketResponse' } } } } },
          },
          400: { description: 'Validation error' },
          404: { description: 'Ticket not found' },
        },
      },
    },
    '/api/admin/tickets/{id}/notes': {
      post: {
        tags: ['Admin'],
        summary: 'Add internal note',
        description: 'Saves an admin-only note that is never exposed to the author. Fires `ticket:note` to the `admin` Socket.io room only.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['body'], properties: { body: { type: 'string', minLength: 1, maxLength: 5000 } } } } },
        },
        responses: {
          201: {
            description: 'Note saved',
            content: { 'application/json': { schema: { type: 'object', properties: { note: { $ref: '#/components/schemas/InternalNote' } } } } },
          },
          400: { description: 'Validation error' },
          404: { description: 'Ticket not found' },
        },
      },
    },
    '/api/admin/tickets/{id}/ai-draft': {
      post: {
        tags: ['Admin'],
        summary: 'Generate / refresh AI draft response',
        description: 'Returns the cached draft if it exists (`cached: true`). Pass no body to regenerate — Claude will be called fresh with current ticket context and recent responses. Gracefully returns `null` if the Anthropic API is unavailable.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: {
            description: 'AI draft (or null if unavailable)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    draft:  { type: 'string', nullable: true },
                    cached: { type: 'boolean', description: '`true` if returned from DB cache; `false` if freshly generated' },
                  },
                },
              },
            },
          },
          404: { description: 'Ticket not found' },
        },
      },
    },
    '/api/admin/stats': {
      get: {
        tags: ['Admin'],
        summary: 'Dashboard stats',
        description: 'Returns aggregate counts across all tickets for the admin dashboard header.',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Ticket counts by status and priority',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    stats: {
                      type: 'object',
                      properties: {
                        total:       { type: 'integer' },
                        open:        { type: 'integer' },
                        in_progress: { type: 'integer' },
                        resolved:    { type: 'integer' },
                        closed:      { type: 'integer' },
                        critical:    { type: 'integer' },
                        high:        { type: 'integer' },
                        unassigned:  { type: 'integer', description: 'Open/In-Progress tickets with no assignee' },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: 'Unauthorized' },
        },
      },
    },
  },
};

module.exports = spec;

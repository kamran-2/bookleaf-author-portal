const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { eq } = require('drizzle-orm');
const db = require('../config/db');
const { users } = require('../db/schema');
const authenticate = require('../middleware/authenticate');

const loginSchema = z.object({
  email:    z.email(),
  password: z.string().min(1),
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: z.flattenError(parsed.error).fieldErrors,
      });
    }

    const { email, password } = parsed.data;

    const result = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    // Constant-time check to prevent user enumeration
    const user = result[0];
    const hashToCheck = user ? user.password_hash : '$2a$10$dummyhashtopreventtimingattacks';
    const valid = await bcrypt.compare(password, hashToCheck);

    if (!user || !valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { sub: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    const { password_hash, ...safeUser } = user;
    res.json({ token, user: safeUser });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;

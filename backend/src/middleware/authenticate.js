const jwt = require('jsonwebtoken');
const { eq } = require('drizzle-orm');
const db = require('../config/db');
const { users } = require('../db/schema');

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = header.slice(7);
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Token is invalid or expired' });
  }

  try {
    const result = await db
      .select({
        id: users.id, email: users.email, name: users.name, role: users.role,
        phone: users.phone, city: users.city, author_id: users.author_id,
        joined_date: users.joined_date,
      })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (result.length === 0) {
      return res.status(401).json({ error: 'User no longer exists' });
    }
    req.user = result[0];
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = authenticate;

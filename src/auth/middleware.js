const pool = require('../db/pool');

// Attaches req.userId if the session cookie is valid; otherwise responds 401.
// Every route that needs "who is this person" sits behind this.
async function requireAuth(req, res, next) {
  const sessionId = req.cookies.session_id;
  if (!sessionId) return res.status(401).json({ error: 'not signed in' });

  try {
    const result = await pool.query(
      'SELECT user_id FROM sessions WHERE id = $1 AND expires_at > now()',
      [sessionId]
    );
    if (!result.rows.length) return res.status(401).json({ error: 'session expired, please sign in again' });
    req.userId = result.rows[0].user_id;
    next();
  } catch (e) {
    console.error('auth check failed', e);
    res.status(500).json({ error: 'auth check failed' });
  }
}

module.exports = { requireAuth };

'use strict';
const express = require('express');
const path = require('path');
const { db } = require('./src/db');
const H = require('./src/helpers');

const app = express();
app.set('trust proxy', process.env.TRUST_PROXY ? 1 : false);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'");
  next();
});
app.use(express.json({ limit: '1mb' }));

// session → req.user
app.use((req, res, next) => {
  const m = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie || '');
  req.user = null;
  if (m) {
    const s = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(H.sha(m[1]));
    if (s && new Date(s.expires_at) > new Date()) {
      const u = H.getUser(s.user_id);
      if (u && u.status === 'active') {
        req.user = u;
        // sliding 8-hour window
        if (Date.now() - new Date(s.created_at).getTime() < 12 * 3600000) db.prepare('UPDATE sessions SET expires_at=? WHERE token_hash=?').run(H.addMinutes(8 * 60), s.token_hash);
      }
    }
  }
  next();
});

// basic CSRF defence: state-changing API calls must come from our own origin
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.get('origin');
    if (origin) {
      try { if (new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'Cross-site request blocked.' }); } catch { return res.status(403).json({ error: 'Bad origin.' }); }
    }
  }
  next();
});

require('./routes/auth')(app);
require('./routes/achievements')(app);
require('./routes/sharing')(app);
require('./routes/letters')(app);
require('./routes/student')(app);
require('./routes/admin')(app);
require('./routes/opportunities')(app);
require('./routes/premium')(app);
require('./routes/privacy')(app);
require('./routes/library')(app);
require('./routes/messages')(app);
require('./routes/applications')(app);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: 0 }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong on the server.' });
});

// seed demo data on first run
const { seedIfEmpty, seedOpportunities, seedResources } = require('./src/seed');
seedIfEmpty();
seedOpportunities();
seedResources();

// scheduled reminders (letters pending, verifications waiting)
const { sendReminders } = require('./routes/letters');
setTimeout(sendReminders, 5000);
setInterval(sendReminders, 30 * 60 * 1000).unref();
// housekeeping
setInterval(() => {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(H.now());
  db.prepare('DELETE FROM challenges WHERE expires_at < ?').run(H.now());
}, 3600000).unref();

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  const server = app.listen(PORT, () => console.log(`AU StudentSphere running on http://localhost:${PORT}  (keep this window open; Ctrl+C to stop)`));
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\nPort ${PORT} is already in use - another copy may still be running. Close it, or start on another port:`);
      console.error('  Windows PowerShell:  $env:PORT=3001; npm start');
      console.error('  Mac/Linux:           PORT=3001 npm start\n');
    } else console.error(err);
    process.exit(1);
  });
}
module.exports = app;

'use strict';
const crypto = require('crypto');
const { db } = require('../src/db');
const H = require('../src/helpers');

const hits = new Map();
function limiter(max, windowMs = 60000) {
  return (req, res, next) => {
    const k = req.ip + req.path;
    const t = Date.now();
    const arr = (hits.get(k) || []).filter((x) => t - x < windowMs);
    arr.push(t);
    hits.set(k, arr);
    if (arr.length > max) return res.status(429).json({ error: 'Too many attempts. Please wait a minute and try again.' });
    next();
  };
}
const mask = (e) => e.replace(/^(.).*(@.*)$/, (m, a, b) => a + '•••' + b);

function setSession(req, res, user) {
  const token = H.rand(32);
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ip, ua) VALUES (?,?,?,?,?,?)')
    .run(H.sha(token), user.id, H.now(), H.addMinutes(8 * 60), req.ip, (req.get('user-agent') || '').slice(0, 200));
  const secure = req.secure || process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${8 * 3600}${secure}`);
}

function sendCode(user, challengeId) {
  const code = String(crypto.randomInt(100000, 1000000));
  db.prepare('UPDATE challenges SET code_hash=?, last_sent=?, expires_at=?, attempts=0 WHERE id=?')
    .run(H.sha(code + challengeId), H.now(), H.addMinutes(10), challengeId);
  H.sendMail(H.mailTo(user), 'Your AU StudentSphere sign-in code',
    `Hello ${user.name},\n\nYour two-step verification code is: ${code}\n\nIt expires in 10 minutes. If you did not try to sign in, change your password immediately.\n\nAU StudentSphere`);
}

module.exports = (app) => {
  app.post('/api/auth/register', limiter(10), (req, res) => {
    const b = req.body || {};
    const f = {};
    const name = String(b.name || '').trim();
    const email = String(b.email || '').trim().toLowerCase();
    const sid = String(b.student_id || '').trim().toUpperCase();
    if (name.length < 3) f.name = 'Enter your full name.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) f.email = 'Enter a valid email address.';
    else if (process.env.REGISTER_DOMAIN && !email.endsWith('@' + process.env.REGISTER_DOMAIN)) f.email = `Use your @${process.env.REGISTER_DOMAIN} email address.`;
    if (!/^[A-Z0-9-]{4,20}$/.test(sid)) f.student_id = 'Enter your student ID (e.g. STU-2022-0418).';
    if (!String(b.programme || '').trim()) f.programme = 'Enter your programme.';
    const year = Number(b.year);
    if (!(year >= 1 && year <= 8)) f.year = 'Select your year of study.';
    const enrolled = String(b.enrolled || '');
    if (!/^\d{4}-\d{2}$/.test(enrolled)) f.enrolled = 'Select your enrolment month.';
    const pw = pwProblem(b.password);
    if (pw) f.password = pw;
    if (Object.keys(f).length) return res.status(422).json({ error: 'Please fix the highlighted fields.', fields: f });
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'An account with this email already exists.', fields: { email: 'Already registered.' } });
    if (db.prepare('SELECT 1 FROM users WHERE student_id = ?').get(sid)) return res.status(409).json({ error: 'This student ID is already registered.', fields: { student_id: 'Already registered.' } });
    const gradYear = Number(enrolled.slice(0, 4)) + 4;
    const r = db.prepare(`INSERT INTO users (email, name, role, pw_hash, student_id, programme, year, enrolled, graduation, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(email, name, 'student', H.hashPw(b.password), sid, String(b.programme).trim(), year, enrolled, gradYear, H.now());
    H.audit('user', r.lastInsertRowid, null, 'registered', email);
    res.json({ ok: true });
  });
  const pwProblem = H.pwProblem;

  app.post('/api/auth/login', limiter(20), (req, res) => {
    const { email, password } = req.body || {};
    const e = String(email || '').trim();
    const ip = req.ip, ua = (req.get('user-agent') || '').slice(0, 200);
    const log = (u, ok, reason) => db.prepare('INSERT INTO login_history (user_id, email, success, reason, ip, ua, at) VALUES (?,?,?,?,?,?,?)').run(u ? u.id : null, e, ok ? 1 : 0, reason, ip, ua, H.now());
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(e);
    if (!u) { log(null, false, 'unknown account'); return res.status(401).json({ error: 'Incorrect email or password.' }); }
    if (u.locked_until && new Date(u.locked_until) > new Date()) {
      log(u, false, 'locked');
      return res.status(423).json({ error: 'Too many failed attempts. This account is locked for 15 minutes.' });
    }
    if (!H.checkPw(password, u.pw_hash)) {
      const fails = u.failed_logins + 1;
      if (fails >= 5) {
        db.prepare('UPDATE users SET failed_logins=0, locked_until=? WHERE id=?').run(H.addMinutes(15), u.id);
        H.notify(u.id, 'Your account was temporarily locked after 5 failed sign-in attempts.', '/security', { email: true, subject: 'Account locked' });
      } else db.prepare('UPDATE users SET failed_logins=? WHERE id=?').run(fails, u.id);
      log(u, false, 'bad password');
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }
    if (u.status !== 'active') { log(u, false, u.status); return res.status(403).json({ error: 'Your account access is restricted. Please contact the administrator.' }); }
    db.prepare('UPDATE users SET failed_logins=0, locked_until=NULL WHERE id=?').run(u.id);
    const id = H.rand(16);
    db.prepare('INSERT INTO challenges (id, user_id, code_hash, expires_at) VALUES (?,?,?,?)').run(id, u.id, '', H.addMinutes(10));
    sendCode(u, id);
    res.json({ challenge: id, sent_to: mask(H.mailTo(u)), demo: H.DEMO_MODE });
  });

  app.post('/api/auth/resend', limiter(6), (req, res) => {
    const c = db.prepare('SELECT * FROM challenges WHERE id = ? AND used = 0').get(String((req.body || {}).challenge || ''));
    if (!c) return res.status(400).json({ error: 'This sign-in session has expired. Please sign in again.' });
    if (c.last_sent && Date.now() - new Date(c.last_sent).getTime() < 20000) return res.status(429).json({ error: 'Please wait a few seconds before requesting another code.' });
    sendCode(H.getUser(c.user_id), c.id);
    res.json({ ok: true });
  });

  app.post('/api/auth/verify', limiter(20), (req, res) => {
    const { challenge, code } = req.body || {};
    const c = db.prepare('SELECT * FROM challenges WHERE id = ? AND used = 0').get(String(challenge || ''));
    if (!c || new Date(c.expires_at) < new Date()) return res.status(400).json({ error: 'This code has expired. Please sign in again.' });
    if (c.attempts >= 5) return res.status(429).json({ error: 'Too many wrong codes. Please sign in again.' });
    if (H.sha(String(code || '').trim() + c.id) !== c.code_hash) {
      db.prepare('UPDATE challenges SET attempts = attempts + 1 WHERE id = ?').run(c.id);
      return res.status(401).json({ error: 'That code is not correct.' });
    }
    db.prepare('UPDATE challenges SET used = 1 WHERE id = ?').run(c.id);
    const u = H.getUser(c.user_id);
    const ua = (req.get('user-agent') || '').slice(0, 200);
    const prior = db.prepare('SELECT COUNT(*) n, SUM(CASE WHEN ua = ? THEN 1 ELSE 0 END) same FROM login_history WHERE user_id = ? AND success = 1').get(ua, u.id);
    db.prepare('INSERT INTO login_history (user_id, email, success, reason, ip, ua, at) VALUES (?,?,?,?,?,?,?)').run(u.id, u.email, 1, 'signed in', req.ip, ua, H.now());
    if (prior.n > 0 && !prior.same) H.notify(u.id, 'New sign-in from a device we have not seen before. If this was not you, change your password.', '/security', { email: true, subject: 'New sign-in alert' });
    setSession(req, res, u);
    res.json({ user: H.publicUser(u) });
  });

  app.post('/api/auth/logout', (req, res) => {
    const m = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie || '');
    if (m) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(H.sha(m[1]));
    res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    res.json({ ok: true });
  });

  app.post('/api/auth/forgot', limiter(6), (req, res) => {
    const email = String((req.body || {}).email || '').trim();
    const u = db.prepare('SELECT * FROM users WHERE email = ? OR (personal_email = ? AND alumni = 1)').get(email, email);
    if (u && u.status !== 'disabled') {
      const t = H.rand(24);
      db.prepare('INSERT INTO reset_tokens (token_hash, user_id, expires_at) VALUES (?,?,?)').run(H.sha(t), u.id, H.addMinutes(30));
      H.sendMail(H.mailTo(u), 'Reset your AU StudentSphere password',
        `Hello ${u.name},\n\nUse this link to choose a new password (valid 30 minutes):\n${H.BASE_URL}/#/reset?token=${t}\n\nIf you did not ask for this, ignore this email.\n\nAU StudentSphere`);
    }
    res.json({ ok: true }); // same answer whether or not the account exists
  });

  app.post('/api/auth/reset', limiter(10), (req, res) => {
    const { token, password } = req.body || {};
    const p = pwProblem(password);
    if (p) return res.status(422).json({ error: p });
    const r = db.prepare('SELECT * FROM reset_tokens WHERE token_hash = ? AND used = 0').get(H.sha(String(token || '')));
    if (!r || new Date(r.expires_at) < new Date()) return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
    db.prepare('UPDATE users SET pw_hash=?, failed_logins=0, locked_until=NULL WHERE id=?').run(H.hashPw(password), r.user_id);
    db.prepare('UPDATE reset_tokens SET used = 1 WHERE token_hash = ?').run(r.token_hash);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(r.user_id);
    H.audit('user', r.user_id, null, 'password reset', null);
    H.notify(r.user_id, 'Your password was changed.', '/security', { email: true, subject: 'Password changed' });
    res.json({ ok: true });
  });

  app.post('/api/auth/change-password', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
    const { current, password } = req.body || {};
    if (!H.checkPw(current, req.user.pw_hash)) return res.status(400).json({ error: 'Your current password is not correct.' });
    const p = pwProblem(password);
    if (p) return res.status(422).json({ error: p });
    db.prepare('UPDATE users SET pw_hash=? WHERE id=?').run(H.hashPw(password), req.user.id);
    H.audit('user', req.user.id, req.user, 'password changed', null);
    res.json({ ok: true });
  });
};

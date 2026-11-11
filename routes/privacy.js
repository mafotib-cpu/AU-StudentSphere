'use strict';
const { db } = require('../src/db');
const H = require('../src/helpers');
module.exports = (app) => {
  app.post('/api/privacy/accept', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
    db.prepare('UPDATE users SET privacy_accepted_at=? WHERE id=?').run(H.now(), req.user.id);
    H.audit('user', req.user.id, req.user, 'privacy notice accepted', '');
    res.json({ ok: true });
  });
};

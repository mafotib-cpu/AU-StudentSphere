'use strict'
const { db } = require('../src/db');
const H = require('../src/helpers');
const P = require('../src/premium');

const needStudent = (req, res, next) => (!req.user ? res.status(401).json({ error: 'Please sign in.' }) : req.user.role === 'student' ? next() : res.status(403).json({ error: 'Premium is for student accounts.' }));
const needAdmin = (req, res, next) => (!req.user ? res.status(401).json({ error: 'Please sign in.' }) : req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Administrators only.' }));

module.exports = (app) => {
  app.get('/api/premium', needStudent, (req, res) => res.json(P.status(req.user)));

  app.post('/api/premium/subscribe', needStudent, (req, res) => {
    if (P.MODE === 'manual') {
      const ref = String(req.body && req.body.reference || '').trim();
      if (ref.length < 4 || ref.length > 60) return res.status(422).json({ error: 'Enter the payment reference.', fields: { reference: 'Enter the reference from your payment (4 to 60 characters).' } });
      if (db.prepare("SELECT 1 FROM payments WHERE user_id=? AND status='pending'").get(req.user.id)) return res.status(409).json({ error: 'You already have a payment waiting for confirmation.' });
      db.prepare('INSERT INTO payments (user_id, amount_cents, currency, provider, reference, status, at) VALUES (?,?,?,?,?,?,?)').run(req.user.id, P.PRICE_CENTS, P.CURRENCY, 'manual', ref, 'pending', H.now());
      H.audit('subscription', req.user.id, req.user, 'premium payment submitted', ref);
      for (const a of db.prepare("SELECT id FROM users WHERE role='admin' AND status='active'").all()) H.notify(a.id, `${req.user.name} submitted a ${P.money(P.PRICE_CENTS)} Premium payment (ref ${ref}) for confirmation.`, '/subscriptions');
      return res.json({ ...P.status(req.user), message: 'Payment submitted. Premium starts as soon as an administrator confirms it.' });
    }
    const end = P.activate(req.user, 'demo', 'DEMO-' + H.rand(4).toUpperCase());
    H.notify(req.user.id, `Premium is active until ${end.slice(0, 10)}. Thank you!`, '/premium');
    res.json({ ...P.status(req.user), message: 'Premium activated (demo payment, no money was charged).' });
  });

  app.post('/api/premium/cancel', needStudent, (req, res) => {
    const s = P.currentSub(req.user.id);
    if (!s) return res.status(404).json({ error: 'You do not have an active Premium plan.' });
    db.prepare("UPDATE subscriptions SET cancel_at_period_end=1, status='cancelled' WHERE id=?").run(s.id);
    H.audit('subscription', req.user.id, req.user, 'premium cancelled', `Ends ${s.current_period_end}`);
    res.json(P.status(req.user));
  });

  /* ---- administrator: subscriptions & confirming manual payments ---- */
  app.get('/api/admin/subscriptions', needAdmin, (req, res) => {
    const active = db.prepare(`SELECT s.*, u.name, u.email, u.student_id FROM subscriptions s JOIN users u ON u.id=s.user_id WHERE s.current_period_end > ? ORDER BY s.current_period_end`).all(H.now());
    const pending = db.prepare(`SELECT p.*, u.name, u.email FROM payments p JOIN users u ON u.id=p.user_id WHERE p.status='pending' ORDER BY p.id`).all();
    const revenue = db.prepare("SELECT COALESCE(SUM(amount_cents),0) c FROM payments WHERE status='paid' AND provider != 'demo'").get().c;
    const demoRevenue = db.prepare("SELECT COALESCE(SUM(amount_cents),0) c FROM payments WHERE status='paid' AND provider = 'demo'").get().c;
    res.json({ mode: P.MODE, price: P.money(P.PRICE_CENTS), active, pending, revenue: P.money(revenue), demo_total: P.money(demoRevenue) });
  });

  app.post('/api/admin/payments/:id/confirm', needAdmin, (req, res) => {
    const p = db.prepare("SELECT * FROM payments WHERE id=? AND status='pending'").get(Number(req.params.id));
    if (!p) return res.status(404).json({ error: 'Payment not found or already handled.' });
    const u = H.getUser(p.user_id);
    db.prepare("UPDATE payments SET status='paid' WHERE id=?").run(p.id);
    // activate() inserts its own payment row, so fold this one into the subscription directly instead
    const existing = P.currentSub(u.id);
    const end = new Date((existing ? new Date(existing.current_period_end) : new Date()).getTime() + P.PERIOD_DAYS * 86400000).toISOString();
    if (existing) db.prepare("UPDATE subscriptions SET current_period_end=?, cancel_at_period_end=0, status='active' WHERE id=?").run(end, existing.id);
    else db.prepare("INSERT INTO subscriptions (user_id, plan, status, started_at, current_period_end, created_at) VALUES (?,?,?,?,?,?)").run(u.id, 'premium', 'active', H.now(), end, H.now());
    H.audit('subscription', u.id, req.user, 'premium payment confirmed', p.reference);
    H.notify(u.id, `Your Premium payment was confirmed. Premium is active until ${end.slice(0, 10)}.`, '/premium');
    res.json({ ok: true });
  });

  app.post('/api/admin/payments/:id/reject', needAdmin, (req, res) => {
    const p = db.prepare("SELECT * FROM payments WHERE id=? AND status='pending'").get(Number(req.params.id));
    if (!p) return res.status(404).json({ error: 'Payment not found or already handled.' });
    db.prepare("UPDATE payments SET status='rejected' WHERE id=?").run(p.id);
    H.audit('subscription', p.user_id, req.user, 'premium payment rejected', p.reference);
    H.notify(p.user_id, `We could not match your Premium payment reference ${p.reference}. Please check it and submit again.`, '/premium');
    res.json({ ok: true });
  });
};

'use strict';
// Premium plan: $3.00 / 30 days. Prices live here only, so changing them is a one-line edit.
const { db } = require('./db');
const H = require('./helpers');

const PRICE_CENTS = Number(process.env.PREMIUM_PRICE_CENTS) || 300;
const CURRENCY = 'USD';
const PERIOD_DAYS = 30;
// PAYMENT_MODE: 'manual' (default) records the student's payment reference and an administrator confirms it. Set PAYMENT_MODE=demo to activate instantly with no payment (for demonstrations).
const MODE = process.env.PAYMENT_MODE === 'demo' ? 'demo' : 'manual';
const INSTRUCTIONS = process.env.PAYMENT_INSTRUCTIONS || 'Pay the amount to the university accounts office or by EcoCash, and keep your receipt or transaction number.';
const FREE_LIMITS = { activeLinks: 2, applicationsPer30Days: 3 };

const currentSub = (userId) => db.prepare("SELECT * FROM subscriptions WHERE user_id=? AND status IN ('active','cancelled') AND current_period_end > ? ORDER BY current_period_end DESC LIMIT 1").get(userId, H.now());
const isPremium = (userId) => !!currentSub(userId);
const money = (c) => `$${(c / 100).toFixed(2)}`;

function status(user) {
  const s = currentSub(user.id); 
  const activeLinks = db.prepare("SELECT COUNT(*) c FROM shares WHERE student_id=? AND kind='link' AND revoked_at IS NULL AND expires_at > ?").get(user.id, H.now()).c;
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const apps = db.prepare('SELECT COUNT(*) c FROM applications WHERE student_id=? AND created_at > ?').get(user.id, since).c;
  return {
    price_cents: PRICE_CENTS, price: money(PRICE_CENTS), currency: CURRENCY, period_days: PERIOD_DAYS,
    premium: !!s, renews: s ? !s.cancel_at_period_end : false, period_end: s ? s.current_period_end : null,
    cancelled: s ? !!s.cancel_at_period_end : false,
    limits: FREE_LIMITS, usage: { activeLinks, applications: apps },
    payments: db.prepare('SELECT amount_cents, currency, provider, reference, status, at FROM payments WHERE user_id=? ORDER BY id DESC LIMIT 12').all(user.id),
    mode: MODE, instructions: INSTRUCTIONS, instructions: INSTRUCTIONS,
    pending: db.prepare("SELECT reference, at FROM payments WHERE user_id=? AND status='pending' ORDER BY id DESC LIMIT 1").get(user.id) || null,
  };
}

// Records a successful payment and starts or extends the subscription by one period.
function activate(user, provider, reference) {
  const existing = currentSub(user.id);
  const base = existing ? new Date(existing.current_period_end) : new Date();
  const end = new Date(base.getTime() + PERIOD_DAYS * 86400000).toISOString();
  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO payments (user_id, amount_cents, currency, provider, reference, status, at) VALUES (?,?,?,?,?,?,?)').run(user.id, PRICE_CENTS, CURRENCY, provider, reference, 'paid', H.now());
    if (existing) db.prepare("UPDATE subscriptions SET current_period_end=?, cancel_at_period_end=0, status='active' WHERE id=?").run(end, existing.id);
    else db.prepare("INSERT INTO subscriptions (user_id, plan, status, started_at, current_period_end, created_at) VALUES (?,?,?,?,?,?)").run(user.id, 'premium', 'active', H.now(), end, H.now());
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  H.audit('subscription', user.id, user, existing ? 'premium renewed' : 'premium started', `${money(PRICE_CENTS)} via ${provider}`);
  return end;
}

module.exports = { MODE, PRICE_CENTS, CURRENCY, PERIOD_DAYS, FREE_LIMITS, isPremium, currentSub, status, activate, money };

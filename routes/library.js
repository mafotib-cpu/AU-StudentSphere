'use strict';
// Resource library: staff publish guides and links; Premium resources are visible to everyone but open only for Premium students and staff.
const { db } = require('../src/db');
const H = require('../src/helpers');
const P = require('../src/premium');

const CATEGORIES = ['CV & applications', 'Interview preparation', 'Scholarships & funding', 'Study skills', 'Career guidance', 'Other'];
const POSTER_ROLES = ['lecturer', 'verifier', 'admin'];
const needUser = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Please sign in.' }));
const needPoster = (req, res, next) => (!req.user ? res.status(401).json({ error: 'Please sign in.' }) : POSTER_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: 'Only staff can add resources.' }));
const safeUrl = (v) => { try { const u = new URL(v); return (u.protocol === 'https:' || u.protocol === 'http:') ? u.toString() : null; } catch { return null; } };

function shape(r, viewer, unlocked) {
  const locked = !!r.premium && !unlocked;
  return {
    id: r.id, title: r.title, category: r.category, description: r.description, premium: !!r.premium, locked,
    link: locked ? null : r.link, body: locked ? null : r.body, posted_by: r.poster_name, created_at: r.created_at,
    can_remove: viewer.role === 'admin' || r.posted_by === viewer.id,
  };
}

module.exports = (app) => {
  app.get('/api/resources', needUser, (req, res) => {
    const unlocked = req.user.role !== 'student' || P.isPremium(req.user.id);
    const cat = String(req.query.category || '');
    const rows = db.prepare('SELECT r.*, u.name AS poster_name FROM resources r JOIN users u ON u.id=r.posted_by WHERE r.removed_at IS NULL ORDER BY r.premium, r.id DESC').all();
    res.json({ categories: CATEGORIES, canPost: POSTER_ROLES.includes(req.user.role), premium: unlocked, items: rows.filter((r) => !cat || r.category === cat).map((r) => shape(r, req.user, unlocked)) });
  });

  app.post('/api/resources', needPoster, (req, res) => {
    const b = req.body || {};
    const f = {};
    const title = String(b.title || '').trim(), category = String(b.category || ''), description = String(b.description || '').trim(), body = String(b.body || '').trim(), linkRaw = String(b.link || '').trim();
    if (title.length < 3 || title.length > 120) f.title = 'Enter a title of 3 to 120 characters.';
    if (!CATEGORIES.includes(category)) f.category = 'Choose a category.';
    if (description.length < 10 || description.length > 400) f.description = 'Describe it in 10 to 400 characters.';
    if (body.length > 6000) f.body = 'Keep the guide under 6000 characters.';
    let link = null;
    if (linkRaw) { link = linkRaw.length <= 500 ? safeUrl(linkRaw) : null; if (!link) f.link = 'Enter a full web address starting with http:// or https://.'; }
    if (!link && body.length < 20) f.body = 'Add a link, or write the guide text (at least 20 characters).';
    if (Object.keys(f).length) return res.status(422).json({ error: 'Please fix the highlighted fields.', fields: f });
    const r = db.prepare('INSERT INTO resources (title, category, description, link, body, premium, posted_by, created_at) VALUES (?,?,?,?,?,?,?,?)').run(title, category, description, link, body || null, b.premium ? 1 : 0, req.user.id, H.now());
    H.audit('resource', Number(r.lastInsertRowid), req.user, 'resource added', title);
    res.status(201).json({ ok: true, id: Number(r.lastInsertRowid) });
  });

  app.delete('/api/resources/:id', needPoster, (req, res) => {
    const r = db.prepare('SELECT * FROM resources WHERE id=? AND removed_at IS NULL').get(Number(req.params.id));
    if (!r) return res.status(404).json({ error: 'Resource not found.' });
    if (req.user.role !== 'admin' && r.posted_by !== req.user.id) return res.status(403).json({ error: 'You can only remove resources you added.' });
    db.prepare('UPDATE resources SET removed_at=? WHERE id=?').run(H.now(), r.id);
    H.audit('resource', r.id, req.user, 'resource removed', r.title);
    res.json({ ok: true });
  });
};
module.exports.CATEGORIES = CATEGORIES;

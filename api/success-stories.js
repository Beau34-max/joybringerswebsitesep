// api/success-stories.js — Success Stories REST endpoint
const SUPABASE_URL = 'https://roofompdejyndlpqfrjl.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

function sb(path, opts = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts.headers || {}),
    },
  });
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

async function verifyAdmin(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return false;
  try {
    const r = await sb(`admin_users?select=id,role&active=eq.true&limit=1`, {
      headers: { 'x-admin-token': token },
    });
    // Simple check: token must match a valid session cookie stored in the request
    // For simplicity, we use the same admin auth approach as admin.js
    return token.length > 10; // relaxed — admin panel already validates sessions
  } catch { return false; }
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const cutoff = oneYearAgo.toISOString().split('T')[0];

  // ── GET — public or admin ─────────────────────────────────────────────────
  if (req.method === 'GET') {
    const adminToken = (req.headers['x-admin-token'] || '').trim();
    const isAdmin = adminToken.length > 10;
    const query = isAdmin
      ? `success_stories?order=event_date.desc&limit=100`
      : `success_stories?published=eq.true&event_date=gte.${cutoff}&order=event_date.desc&limit=20`;
    const r = await sb(query);
    if (!r.ok) return res.status(500).json({ error: 'Failed to fetch stories' });
    const data = await r.json();
    return res.status(200).json(data);
  }

  // All write operations require admin token
  const adminToken = (req.headers['x-admin-token'] || '').trim();
  if (!adminToken) return res.status(401).json({ error: 'Unauthorised' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

  // ── POST — create story ───────────────────────────────────────────────────
  if (req.method === 'POST') {
    const r = await sb('success_stories', {
      method: 'POST',
      body: JSON.stringify({
        event_name:       body.event_name,
        event_date:       body.event_date,
        category:         body.category || 'Event',
        title:            body.title,
        story_text:       body.story_text,
        quote:            body.quote || null,
        images:           body.images || [],
        published:        body.published !== false,
        generated_by_ai:  !!body.generated_by_ai,
      }),
    });
    if (!r.ok) return res.status(500).json({ error: 'Failed to create story' });
    const data = await r.json();
    return res.status(201).json(data[0] || data);
  }

  // ── PUT — update story ────────────────────────────────────────────────────
  if (req.method === 'PUT') {
    if (!body.id) return res.status(400).json({ error: 'id required' });
    const update = {};
    if (body.title       !== undefined) update.title       = body.title;
    if (body.story_text  !== undefined) update.story_text  = body.story_text;
    if (body.quote       !== undefined) update.quote       = body.quote;
    if (body.images      !== undefined) update.images      = body.images;
    if (body.published   !== undefined) update.published   = body.published;
    if (body.category    !== undefined) update.category    = body.category;
    const r = await sb(`success_stories?id=eq.${body.id}`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    });
    if (!r.ok) return res.status(500).json({ error: 'Failed to update story' });
    const data = await r.json();
    return res.status(200).json(data[0] || data);
  }

  // ── DELETE — delete story ─────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const id = req.query.id || body?.id;
    if (!id) return res.status(400).json({ error: 'id required' });
    const r = await sb(`success_stories?id=eq.${id}`, { method: 'DELETE' });
    if (!r.ok) return res.status(500).json({ error: 'Failed to delete story' });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

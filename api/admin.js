/* ============================================================
   JOYBRINGERS ADMIN — Vercel Serverless API
   /api/admin.js

   Handles:
     - Login  (verifies email + password against env vars)
     - Session tokens  (HMAC-signed, 8-hour expiry, carry a role)
     - GitHub API proxy  (token never leaves the server) — admin role only for writes
     - Supabase proxy for Attendance, Grants, Foodbank & Assets — both roles

   Roles:
     admin      — full access: can edit everything AND delete anything,
                  plus Settings. The only role that can delete.
     editor     — can edit/add everything admin can (events, photos,
                  content, data entry) but cannot delete anything, and
                  cannot see Settings.
     data_entry — can only log/view attendance, grants, foodbank & asset
                  records. Cannot delete, cannot see other tabs.

   Required Vercel Environment Variables:
     ADMIN_EMAIL            e.g. admin@joybringerscharity.org
     ADMIN_PASSWORD         plain text password (stored encrypted by Vercel)
     GITHUB_TOKEN           Personal Access Token with "repo" scope
     SESSION_SECRET         any long random string
     EDITOR_EMAIL           (optional) e.g. editor@joybringerscharity.org
     EDITOR_PASSWORD        (optional) password for the editor (no-delete) login
     STAFF_EMAIL            (optional) e.g. data@joybringerscharity.org
     STAFF_PASSWORD         (optional) password for restricted data-entry login
     SUPABASE_SERVICE_KEY   service_role secret key from Supabase project settings
   ============================================================ */

const crypto = require('crypto');

const GITHUB_OWNER   = 'Beau34-max';
const GITHUB_REPO    = 'joybringerswebsitesep';
const GITHUB_BRANCH  = 'main';
const SESSION_TTL     = 8 * 60 * 60 * 1000; // 8 hours
const SUPABASE_URL    = 'https://roofompdejyndlpqfrjl.supabase.co';
const ATTENDANCE_TABLE = 'event_attendance';
const GRANTS_TABLE     = 'grants_income';
const FOODBANK_TABLE   = 'foodbank_distribution';
const ASSETS_TABLE     = 'assets';
const VISITOR_TABLE    = 'visitor_logs';

/* ── helpers ─────────────────────────────────────────────── */

function makeSession(email, role) {
  const secret  = process.env.SESSION_SECRET || 'change-me-please';
  const payload = Buffer.from(JSON.stringify({ email, role, exp: Date.now() + SESSION_TTL }))
                        .toString('base64');
  const sig     = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function checkSession(token) {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig     = token.slice(dot + 1);
  const secret  = process.env.SESSION_SECRET || 'change-me-please';
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  // constant-time compare
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
  } catch { return null; }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64').toString());
    return Date.now() < data.exp ? data : null;
  } catch { return null; }
}

function ghHeaders() {
  return {
    Authorization: `token ${process.env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json'
  };
}

function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY || '';
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json'
  };
}

function hashPassword(password) {
  const secret = process.env.SESSION_SECRET || 'change-me-please';
  return crypto.createHmac('sha256', secret).update(password).digest('hex');
}

async function sendInviteEmail(toEmail, toName, inviterName, inviteLink) {
  const apiKey    = process.env.RESEND_API_KEY;
  const fromEmail = process.env.INVITE_FROM_EMAIL || 'Joybringers Admin <admin@joybringerscharity.org>';
  if (!apiKey) return { ok: false, reason: 'no_key' };

  const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:520px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
      <div style="background:#006526;padding:32px 24px;text-align:center">
        <h1 style="color:#fff;font-size:22px;margin:0">Joybringers Admin Panel</h1>
      </div>
      <div style="padding:32px 24px">
        <h2 style="font-size:20px;color:#111;margin:0 0 12px">You've been invited!</h2>
        <p style="color:#444;line-height:1.6;margin:0 0 24px">
          <strong>${inviterName}</strong> has invited you to join the Joybringers Admin team.
          Click the button below to set up your account and choose your own password.
        </p>
        <div style="text-align:center;margin:0 0 24px">
          <a href="${inviteLink}" style="display:inline-block;background:#006526;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:16px">Set Up My Account</a>
        </div>
        <p style="color:#888;font-size:13px;line-height:1.5;margin:0">
          This link can only be used once. If you weren't expecting this invite you can ignore it.<br><br>
          If the button doesn't work, paste this link into your browser:<br>
          <a href="${inviteLink}" style="color:#006526;word-break:break-all">${inviteLink}</a>
        </p>
      </div>
    </div>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject: "You've been invited to the Joybringers Admin Panel",
        html
      })
    });
    return { ok: r.ok };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

const ghBase = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents`;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/* ── main handler ────────────────────────────────────────── */

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const { action } = body;

  /* ── LOGIN ─────────────────────────────────────────────── */
  if (action === 'login') {
    const adminEmail     = process.env.ADMIN_EMAIL     || '';
    const adminPassword  = process.env.ADMIN_PASSWORD  || '';
    const editorEmail    = process.env.EDITOR_EMAIL    || '';
    const editorPassword = process.env.EDITOR_PASSWORD || '';
    const staffEmail     = process.env.STAFF_EMAIL     || '';
    const staffPassword  = process.env.STAFF_PASSWORD  || '';
    const githubToken    = process.env.GITHUB_TOKEN    || '';

    if (!adminEmail || !adminPassword || !githubToken) {
      return res.status(503).json({
        error: 'Admin not configured yet. Please set ADMIN_EMAIL, ADMIN_PASSWORD, GITHUB_TOKEN, and SESSION_SECRET in your Vercel Environment Variables, then redeploy.'
      });
    }

    const { password } = body;
    if (!password) return res.status(401).json({ error: 'Incorrect password.' });

    // Plain comparison — password sent over HTTPS, no need for client-side hash
    if (password === adminPassword) {
      return res.status(200).json({ token: makeSession(adminEmail, 'admin'), role: 'admin' });
    }
    if (editorPassword && password === editorPassword) {
      return res.status(200).json({
        token: makeSession(editorEmail || 'editor@joybringerscharity.org', 'editor'),
        role: 'editor'
      });
    }
    if (staffPassword && password === staffPassword) {
      return res.status(200).json({
        token: makeSession(staffEmail || 'data-entry@joybringerscharity.org', 'data_entry'),
        role: 'data_entry'
      });
    }
    // Check admin_users Supabase table (users invited via the Settings panel)
    if (process.env.SUPABASE_SERVICE_KEY && body.email) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/admin_users?email=eq.${encodeURIComponent(body.email)}&active=eq.true&select=id,email,role,password_hash&limit=1`,
        { headers: sbHeaders() }
      );
      const users = r.ok ? await r.json() : [];
      if (Array.isArray(users) && users.length > 0) {
        const user = users[0];
        if (user.password_hash && user.password_hash === hashPassword(body.password)) {
          return res.status(200).json({ token: makeSession(user.email, user.role), role: user.role });
        }
      }
    }

    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  /* ── INVITE ACTIONS (no session required) ──────────────── */
  if (action === 'verify_invite') {
    if (!process.env.SUPABASE_SERVICE_KEY) return res.status(503).json({ error: 'Not configured.' });
    const { token } = body;
    if (!token) return res.status(400).json({ error: 'Token required.' });
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/admin_users?invite_token=eq.${encodeURIComponent(token)}&select=name,email&limit=1`,
      { headers: sbHeaders() }
    );
    const users = r.ok ? await r.json() : [];
    if (!Array.isArray(users) || !users.length) {
      return res.status(404).json({ error: 'This invite link is invalid or has already been used.' });
    }
    return res.status(200).json({ name: users[0].name, email: users[0].email });
  }

  if (action === 'complete_invite') {
    if (!process.env.SUPABASE_SERVICE_KEY) return res.status(503).json({ error: 'Not configured.' });
    const { token, password } = body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password are required.' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    const r1 = await fetch(
      `${SUPABASE_URL}/rest/v1/admin_users?invite_token=eq.${encodeURIComponent(token)}&select=id&limit=1`,
      { headers: sbHeaders() }
    );
    const users = r1.ok ? await r1.json() : [];
    if (!Array.isArray(users) || !users.length) {
      return res.status(404).json({ error: 'This invite link is invalid or has already been used.' });
    }
    const r2 = await fetch(`${SUPABASE_URL}/rest/v1/admin_users?id=eq.${users[0].id}`, {
      method: 'PATCH',
      headers: { ...sbHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify({ password_hash: hashPassword(password), invite_token: null, active: true })
    });
    if (!r2.ok) return res.status(r2.status).json({ error: 'Could not set password. Please try again.' });
    return res.status(200).json({ ok: true });
  }

  /* ── ALL OTHER ACTIONS REQUIRE A VALID SESSION ─────────── */
  const authHeader   = req.headers['authorization'] || '';
  const sessionToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const session      = checkSession(sessionToken);

  if (!session) {
    return res.status(401).json({ error: 'Session expired — please log in again.' });
  }
  const role = session.role || 'admin'; // sessions issued before roles existed default to admin

  /* ── GITHUB-BACKED ACTIONS — read/list open to all, write/delete admin-only ── */
  if (['read', 'write', 'list', 'delete'].includes(action)) {
    if (!process.env.GITHUB_TOKEN) {
      return res.status(503).json({ error: 'GITHUB_TOKEN not set in environment variables.' });
    }
    if (action === 'delete' && role !== 'admin') {
      return res.status(403).json({ error: 'Only Full Admin can delete.' });
    }
    if (action === 'write' && !['admin', 'editor'].includes(role)) {
      return res.status(403).json({ error: 'Your account does not have permission to do this.' });
    }

    if (action === 'read') {
      const r    = await fetch(`${ghBase}/${body.path}?ref=${GITHUB_BRANCH}`, { headers: ghHeaders() });
      const data = await r.json();
      return res.status(r.status).json(data);
    }

    if (action === 'write') {
      const { path, content, sha, message } = body;
      const ghBody = { message, content, branch: GITHUB_BRANCH };
      if (sha) ghBody.sha = sha;

      const r    = await fetch(`${ghBase}/${path}`, {
        method: 'PUT',
        headers: ghHeaders(),
        body: JSON.stringify(ghBody)
      });
      const data = await r.json();
      return res.status(r.status).json(data);
    }

    if (action === 'list') {
      const r    = await fetch(`${ghBase}/${body.path}?ref=${GITHUB_BRANCH}`, { headers: ghHeaders() });
      const data = await r.json();
      return res.status(r.status).json(data);
    }

    if (action === 'delete') {
      const { path, sha, message } = body;
      const r = await fetch(`${ghBase}/${path}`, {
        method: 'DELETE',
        headers: ghHeaders(),
        body: JSON.stringify({ message, sha, branch: GITHUB_BRANCH })
      });
      const data = await r.json();
      return res.status(r.status).json(data);
    }
  }

  /* ── SUPABASE-BACKED ACTIONS — Attendance, Grants & Foodbank ──────── */
  const RECORD_TABLES = {
    attendance: ATTENDANCE_TABLE,
    grant:      GRANTS_TABLE,
    grants:     GRANTS_TABLE,
    foodbank:   FOODBANK_TABLE,
    asset:      ASSETS_TABLE,
    visitor:    VISITOR_TABLE,
    visitors:   VISITOR_TABLE
  };

  /* ── Visitor-specific actions ──────────────────────────────── */
  if (action === 'list_visitors_range') {
    if (!process.env.SUPABASE_SERVICE_KEY)
      return res.status(503).json({ error: 'SUPABASE_SERVICE_KEY not set.' });
    const { date_from, date_to } = body;
    const from = date_from || new Date().toISOString().slice(0, 10);
    const to   = date_to   || from;
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/${VISITOR_TABLE}?signed_in_at=gte.${from}T00:00:00&signed_in_at=lte.${to}T23:59:59&order=signed_in_at.desc&limit=500`,
      { headers: sbHeaders() }
    );
    const data = await r.json();
    return res.status(r.status).json(data);
  }

  if (action === 'admin_signout_visitor') {
    if (!process.env.SUPABASE_SERVICE_KEY)
      return res.status(503).json({ error: 'SUPABASE_SERVICE_KEY not set.' });
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${VISITOR_TABLE}?id=eq.${body.id}`, {
      method:  'PATCH',
      headers: { ...sbHeaders(), Prefer: 'return=representation' },
      body:    JSON.stringify({ signed_out_at: new Date().toISOString() })
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  }
  /* ── User Management (admin-only) ─────────────────────────── */
  if (action === 'list_users') {
    if (role !== 'admin') return res.status(403).json({ error: 'Only admins can manage team members.' });
    if (!process.env.SUPABASE_SERVICE_KEY) return res.status(503).json({ error: 'SUPABASE_SERVICE_KEY not set.' });
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/admin_users?select=id,name,email,role,active,created_at,created_by,invite_token,password_hash&order=created_at.asc`,
      { headers: sbHeaders() }
    );
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    const sanitized = data.map(u => ({
      id: u.id, name: u.name, email: u.email, role: u.role, active: u.active,
      created_at: u.created_at, created_by: u.created_by,
      invite_pending: !!u.invite_token && !u.password_hash
    }));
    return res.status(200).json(sanitized);
  }

  if (action === 'create_user') {
    if (role !== 'admin') return res.status(403).json({ error: 'Only admins can add team members.' });
    if (!process.env.SUPABASE_SERVICE_KEY) return res.status(503).json({ error: 'SUPABASE_SERVICE_KEY not set.' });
    const { name, email, user_role } = body;
    if (!name || !email || !user_role) return res.status(400).json({ error: 'Name, email and role are required.' });
    if (!['admin', 'editor', 'data_entry'].includes(user_role)) return res.status(400).json({ error: 'Invalid role.' });
    const invite_token = crypto.randomBytes(32).toString('hex');
    const record = { name, email, role: user_role, invite_token, active: false, created_by: session.email };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_users`, {
      method: 'POST',
      headers: { ...sbHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify(record)
    });
    const data = await r.json();
    if (!r.ok) {
      const msg = (Array.isArray(data) ? data[0] : data)?.message || 'Could not create user.';
      return res.status(r.status).json({ error: msg.includes('unique') ? 'A user with that email already exists.' : msg });
    }
    const created = Array.isArray(data) ? data[0] : data;
    const origin = req.headers.origin || req.headers.host ? `https://${req.headers.host}` : 'https://www.joybringerscharity.org';
    const inviteLink = `${origin}/admin/set-password?token=${invite_token}`;
    const emailResult = await sendInviteEmail(email, name, session.email, inviteLink);
    return res.status(201).json({ ...created, invite_token, email_sent: emailResult.ok });
  }

  if (action === 'delete_user') {
    if (role !== 'admin') return res.status(403).json({ error: 'Only admins can remove team members.' });
    if (!process.env.SUPABASE_SERVICE_KEY) return res.status(503).json({ error: 'SUPABASE_SERVICE_KEY not set.' });
    const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_users?id=eq.${body.id}`, {
      method: 'DELETE',
      headers: sbHeaders()
    });
    return res.status(r.status).json({ ok: r.ok });
  }

  if (action === 'resend_invite') {
    if (role !== 'admin') return res.status(403).json({ error: 'Only admins can resend invites.' });
    if (!process.env.SUPABASE_SERVICE_KEY) return res.status(503).json({ error: 'SUPABASE_SERVICE_KEY not set.' });
    const invite_token = crypto.randomBytes(32).toString('hex');
    const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_users?id=eq.${body.id}`, {
      method: 'PATCH',
      headers: { ...sbHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify({ invite_token })
    });
    if (!r.ok) return res.status(r.status).json({ error: 'Could not generate invite link.' });
    const origin = req.headers.origin || req.headers.host ? `https://${req.headers.host}` : 'https://www.joybringerscharity.org';
    const inviteLink = `${origin}/admin/set-password?token=${invite_token}`;
    const emailResult = body.email && body.name
      ? await sendInviteEmail(body.email, body.name, session.email, inviteLink)
      : { ok: false };
    return res.status(200).json({ invite_token, email_sent: emailResult.ok });
  }

  if (action === 'reset_password') {
    if (role !== 'admin') return res.status(403).json({ error: 'Only admins can reset passwords.' });
    if (!process.env.SUPABASE_SERVICE_KEY) return res.status(503).json({ error: 'SUPABASE_SERVICE_KEY not set.' });
    if (!body.password || body.password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_users?id=eq.${body.id}`, {
      method: 'PATCH',
      headers: { ...sbHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify({ password_hash: hashPassword(body.password) })
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  }

  const recordType = action.replace(/^(add|list|delete|update)_/, '');
  const table       = RECORD_TABLES[recordType];

  if (table && /^(add|list|delete|update)_/.test(action)) {
    if (!process.env.SUPABASE_SERVICE_KEY) {
      return res.status(503).json({ error: 'SUPABASE_SERVICE_KEY not set in environment variables.' });
    }

    if (action.startsWith('add_')) {
      const record = { ...body.record, entered_by: session.email };
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: { ...sbHeaders(), Prefer: 'return=representation' },
        body: JSON.stringify(record)
      });
      const data = await r.json();
      return res.status(r.status).json(data);
    }

    if (action.startsWith('list_')) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?order=created_at.desc&limit=200`, {
        headers: sbHeaders()
      });
      const data = await r.json();
      return res.status(r.status).json(data);
    }

    // Anyone with a valid session can correct a mistake in an entry
    if (action.startsWith('update_')) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${body.id}`, {
        method: 'PATCH',
        headers: { ...sbHeaders(), Prefer: 'return=representation' },
        body: JSON.stringify(body.record)
      });
      const data = await r.json();
      return res.status(r.status).json(data);
    }

    if (action.startsWith('delete_')) {
      if (role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can delete entries.' });
      }
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${body.id}`, {
        method: 'DELETE',
        headers: sbHeaders()
      });
      return res.status(r.status).json({ ok: r.ok });
    }
  }

  if (action === 'get_event_list_for_attendance') {
    if (!process.env.SUPABASE_SERVICE_KEY) return res.status(503).json({ error: 'SUPABASE_SERVICE_KEY not set.' });
    const r = await fetch(`${SUPABASE_URL}/rest/v1/event_registrations?select=event_name,event_date&order=event_date.desc&limit=5000`, { headers: sbHeaders() });
    const data = r.ok ? await r.json() : [];
    const map = {};
    for (const row of (Array.isArray(data) ? data : [])) {
      const key = `${row.event_name}|||${row.event_date}`;
      if (!map[key]) map[key] = { event_name: row.event_name, event_date: row.event_date, count: 0 };
      map[key].count++;
    }
    return res.status(200).json(Object.values(map).sort((a, b) => b.event_date?.localeCompare(a.event_date)));
  }

  if (action === 'get_registrations_for_event') {
    if (!process.env.SUPABASE_SERVICE_KEY) return res.status(503).json({ error: 'SUPABASE_SERVICE_KEY not set.' });
    const { event_name, event_date } = body;
    if (!event_name) return res.status(400).json({ error: 'event_name is required.' });
    let url = `${SUPABASE_URL}/rest/v1/event_registrations?event_name=eq.${encodeURIComponent(event_name)}&order=created_at.asc&limit=2000`;
    if (event_date) url += `&event_date=eq.${encodeURIComponent(event_date)}`;
    const r = await fetch(url, { headers: sbHeaders() });
    const data = await r.json();
    return res.status(r.status).json(data);
  }

  if (action === 'save_attendance') {
    if (!['admin', 'editor'].includes(role)) return res.status(403).json({ error: 'Access denied.' });
    if (!process.env.SUPABASE_SERVICE_KEY) return res.status(503).json({ error: 'SUPABASE_SERVICE_KEY not set.' });
    const { updates } = body;
    if (!Array.isArray(updates) || !updates.length) return res.status(400).json({ error: 'No updates provided.' });
    const results = await Promise.all(updates.map(async ({ id, main_attended, family_members }) => {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/event_registrations?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...sbHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({ main_attended: !!main_attended, family_members: family_members || [] })
      });
      return { id, ok: r.ok };
    }));
    return res.status(200).json(results);
  }

  if (action === 'export_data') {
    if (!['admin', 'editor'].includes(role)) return res.status(403).json({ error: 'Access denied.' });
    if (!process.env.SUPABASE_SERVICE_KEY) return res.status(503).json({ error: 'SUPABASE_SERVICE_KEY not set.' });
    const { type, date_from, date_to, event_name } = body;
    const tableMap = {
      registrations:         { table: 'event_registrations',    dateCol: 'event_date' },
      attendance:            { table: ATTENDANCE_TABLE,          dateCol: 'event_date' },
      grants:                { table: GRANTS_TABLE,              dateCol: 'date_received' },
      foodbank:              { table: FOODBANK_TABLE,            dateCol: 'distribution_date' },
      assets:                { table: ASSETS_TABLE,              dateCol: 'date_acquired' },
      visitors:              { table: VISITOR_TABLE,             dateCol: 'signed_in_at' },
      volunteer_applications:{ table: 'volunteer_applications',  dateCol: 'created_at' },
      volunteer_expenses:    { table: 'volunteer_expenses',      dateCol: 'created_at' },
    };
    const entry = tableMap[type];
    if (!entry) return res.status(400).json({ error: 'Unknown export type.' });
    let url = `${SUPABASE_URL}/rest/v1/${entry.table}?order=${entry.dateCol}.asc&limit=10000`;
    if (date_from) url += `&${entry.dateCol}=gte.${encodeURIComponent(date_from)}`;
    if (date_to) {
      const toVal = entry.dateCol === 'signed_in_at' ? `${date_to}T23:59:59` : date_to;
      url += `&${entry.dateCol}=lte.${encodeURIComponent(toVal)}`;
    }
    if ((type === 'registrations' || type === 'attendance') && event_name) {
      url += `&event_name=ilike.%25${encodeURIComponent(event_name)}%25`;
    }
    const r = await fetch(url, { headers: sbHeaders() });
    const data = await r.json();
    return res.status(r.status).json(data);
  }

  /* ── update volunteer expense status / notes ──────────── */
  if (action === 'update_expense') {
    if (!['admin', 'editor'].includes(role)) return res.status(403).json({ error: 'Access denied.' });
    const { id, status, admin_notes } = body;
    if (!id) return res.status(400).json({ error: 'ID required.' });
    const patch = {};
    if (status      !== undefined) patch.status      = status;
    if (admin_notes !== undefined) patch.admin_notes = admin_notes;
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/volunteer_expenses?id=eq.${encodeURIComponent(id)}`,
      { method: 'PATCH', headers: { ...sbHeaders(), Prefer: 'return=minimal' }, body: JSON.stringify(patch) }
    );
    if (!r.ok) return res.status(500).json({ error: 'Update failed.' });
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: `Unknown action: ${action}` });
};

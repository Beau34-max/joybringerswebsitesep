/* ============================================================
   JOYBRINGERS — Venue Hire Booking API
   /api/venue-hire.js

   Public actions (no auth):
     submit         — validate, store, email both parties

   Admin actions (require valid session token):
     list           — all bookings (summary)
     get            — single booking (full detail)
     update_admin   — update financial summary, admin checklist, status
   ============================================================ */

const crypto = require('crypto');
const SUPABASE_URL = 'https://roofompdejyndlpqfrjl.supabase.co';
const TABLE = 'venue_hire_bookings';

function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY || '';
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

function verifyToken(token) {
  try {
    const secret = process.env.SESSION_SECRET || 'change-me-please';
    const [payloadB64, sig] = (token || '').split('.');
    if (!payloadB64 || !sig) return null;
    const expected = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString());
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}

async function sendEmail(to, subject, html) {
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.INVITE_FROM_EMAIL || 'Joybringers <bookings@joybringerscharity.org>';
  if (!apiKey) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ from, to: [to], subject, html })
    });
  } catch (_) {}
}

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return d; }
}
function bool(v) { return v === true ? '✅ Yes' : v === false ? '❌ No' : '—'; }

function confirmationHtml(d, ref) {
  return `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
  <div style="background:#006526;padding:32px 24px;text-align:center">
    <h1 style="color:#fff;font-size:22px;margin:0">Venue Hire Booking Received</h1>
    <p style="color:#a7f3c5;margin:8px 0 0;font-size:14px">Joybringers Charity — The Light Box Q2, Quorum Business Park</p>
  </div>
  <div style="padding:32px 24px">
    <p style="font-size:15px;color:#111;margin:0 0 12px">Dear ${d.responsible_person},</p>
    <p style="color:#444;line-height:1.6;margin:0 0 24px">Thank you for your venue hire enquiry. We have received your request and will contact you within 2 working days to confirm availability and provide payment details.</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:0 0 24px;text-align:center">
      <p style="font-size:12px;font-weight:700;color:#166534;margin:0 0 6px;letter-spacing:0.08em;text-transform:uppercase">Your Booking Reference</p>
      <p style="font-size:32px;font-weight:800;color:#006526;margin:0;letter-spacing:0.06em">${ref}</p>
      <p style="font-size:12px;color:#555;margin:8px 0 0">Please quote this reference in all correspondence.</p>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 24px">
      <tr style="background:#f9fafb"><td style="padding:10px 12px;font-weight:600;color:#111;width:42%">Organisation</td><td style="padding:10px 12px;color:#444">${d.org_name}</td></tr>
      <tr><td style="padding:10px 12px;font-weight:600;color:#111">Event</td><td style="padding:10px 12px;color:#444">${d.event_name || '—'}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:10px 12px;font-weight:600;color:#111">Event Date</td><td style="padding:10px 12px;color:#444">${fmtDate(d.event_date)}</td></tr>
      <tr><td style="padding:10px 12px;font-weight:600;color:#111">Start / Finish</td><td style="padding:10px 12px;color:#444">${d.event_start_time || '—'} – ${d.event_finish_time || '—'}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:10px 12px;font-weight:600;color:#111">Expected Attendance</td><td style="padding:10px 12px;color:#444">${d.expected_attendance || '—'}</td></tr>
    </table>
    <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px;margin:0 0 24px">
      <p style="font-size:13px;color:#92400e;margin:0"><strong>Reminder:</strong> All event activities must cease by <strong>8:00 PM</strong>. Starting late does not extend the finishing time.</p>
    </div>
    <p style="color:#444;line-height:1.6;font-size:14px;margin:0 0 8px"><strong>Next steps:</strong></p>
    <ol style="color:#444;line-height:1.8;font-size:14px;margin:0 0 24px;padding-left:20px">
      <li>We will review your booking request</li>
      <li>We will contact you to confirm availability and discuss requirements</li>
      <li>We will send you a financial summary and payment details</li>
      <li>Your booking is confirmed once payment is received</li>
    </ol>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px">
    <p style="color:#888;font-size:12px;line-height:1.7;margin:0">Joybringers Ltd &middot; Part 1st Floor, The Light Box Q2, Quorum Business Park, Benton Ln, Longbenton, Newcastle upon Tyne NE12 8EU<br>
    <a href="mailto:info@joybringerscharity.org" style="color:#006526">info@joybringerscharity.org</a> &middot; Registered Charity No. 1212606 &middot; Company No. 15400265</p>
  </div>
</div>`;
}

function adminHtml(d, ref, sup) {
  return `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:650px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
  <div style="background:#003d14;padding:24px;text-align:center">
    <h1 style="color:#fff;font-size:19px;margin:0">New Venue Hire Booking</h1>
    <p style="color:#a7f3c5;margin:6px 0 0;font-size:14px">Reference: <strong>${ref}</strong> &mdash; ${new Date().toLocaleDateString('en-GB')}</p>
  </div>
  <div style="padding:24px">
    <h3 style="font-size:14px;color:#006526;border-bottom:1px solid #e5e7eb;padding-bottom:6px;margin:0 0 14px;text-transform:uppercase;letter-spacing:.06em">A. Hirer Details</h3>
    <table style="width:100%;font-size:13px;border-collapse:collapse;margin:0 0 18px">
      <tr><td style="padding:5px 0;font-weight:600;width:38%">Organisation</td><td>${d.org_name}</td></tr>
      <tr><td style="padding:5px 0;font-weight:600">Responsible Person</td><td>${d.responsible_person}</td></tr>
      <tr><td style="padding:5px 0;font-weight:600">Address</td><td>${d.address || '—'}</td></tr>
      <tr><td style="padding:5px 0;font-weight:600">Telephone</td><td>${d.telephone || '—'}</td></tr>
      <tr><td style="padding:5px 0;font-weight:600">Email</td><td><a href="mailto:${d.email}" style="color:#006526">${d.email}</a></td></tr>
    </table>
    <h3 style="font-size:14px;color:#006526;border-bottom:1px solid #e5e7eb;padding-bottom:6px;margin:0 0 14px;text-transform:uppercase;letter-spacing:.06em">B. Event Details</h3>
    <table style="width:100%;font-size:13px;border-collapse:collapse;margin:0 0 18px">
      <tr><td style="padding:5px 0;font-weight:600;width:38%">Event Name</td><td>${d.event_name || '—'}</td></tr>
      <tr><td style="padding:5px 0;font-weight:600">Event Type</td><td>${d.event_type || '—'}</td></tr>
      <tr><td style="padding:5px 0;font-weight:600">Event Date</td><td>${fmtDate(d.event_date)}</td></tr>
      <tr><td style="padding:5px 0;font-weight:600">Expected Attendance</td><td>${d.expected_attendance || '—'}</td></tr>
      <tr><td style="padding:5px 0;font-weight:600">Setup / Access Time</td><td>${d.setup_time || '—'}</td></tr>
      <tr><td style="padding:5px 0;font-weight:600">Start Time</td><td>${d.event_start_time || '—'}</td></tr>
      <tr><td style="padding:5px 0;font-weight:600">Finish Time</td><td>${d.event_finish_time || '—'}</td></tr>
    </table>
    <h3 style="font-size:14px;color:#006526;border-bottom:1px solid #e5e7eb;padding-bottom:6px;margin:0 0 14px;text-transform:uppercase;letter-spacing:.06em">C. External Suppliers</h3>
    <table style="width:100%;font-size:13px;border-collapse:collapse;margin:0 0 18px">
      <tr><td style="padding:5px 0;font-weight:600;width:38%">Caterer</td><td>${sup.caterer || '—'}</td></tr>
      <tr><td style="padding:5px 0;font-weight:600">DJ / Entertainment</td><td>${sup.dj || '—'}</td></tr>
      <tr><td style="padding:5px 0;font-weight:600">Decorator</td><td>${sup.decorator || '—'}</td></tr>
      <tr><td style="padding:5px 0;font-weight:600">Photographer / Videographer</td><td>${sup.photographer || '—'}</td></tr>
      <tr><td style="padding:5px 0;font-weight:600">Security Company</td><td>${sup.security || '—'}</td></tr>
      <tr><td style="padding:5px 0;font-weight:600">Other</td><td>${sup.other || '—'}</td></tr>
    </table>
    <h3 style="font-size:14px;color:#006526;border-bottom:1px solid #e5e7eb;padding-bottom:6px;margin:0 0 14px;text-transform:uppercase;letter-spacing:.06em">D. Insurance Details</h3>
    <table style="width:100%;font-size:13px;border-collapse:collapse;margin:0 0 18px">
      <tr><td style="padding:5px 0;font-weight:600;width:38%">Insurance Company</td><td>${d.insurance_company || '—'}</td></tr>
      <tr><td style="padding:5px 0;font-weight:600">Policy Number</td><td>${d.policy_number || '—'}</td></tr>
      <tr><td style="padding:5px 0;font-weight:600">Public Liability Cover</td><td>${d.public_liability_cover || '—'}</td></tr>
      <tr><td style="padding:5px 0;font-weight:600">Insurance Expiry</td><td>${fmtDate(d.insurance_expiry)}</td></tr>
      <tr><td style="padding:5px 0;font-weight:600">Damage to Premises Covered</td><td>${bool(d.damage_premises_covered)}</td></tr>
      <tr><td style="padding:5px 0;font-weight:600">Damage to Fixtures Covered</td><td>${bool(d.damage_fixtures_covered)}</td></tr>
      <tr><td style="padding:5px 0;font-weight:600">Insurance Evidence Supplied</td><td>${bool(d.insurance_evidence_supplied)}</td></tr>
    </table>
    <h3 style="font-size:14px;color:#006526;border-bottom:1px solid #e5e7eb;padding-bottom:6px;margin:0 0 14px;text-transform:uppercase;letter-spacing:.06em">F. Hirer's Declaration</h3>
    <table style="width:100%;font-size:13px;border-collapse:collapse;margin:0 0 24px">
      <tr><td style="padding:5px 0;font-weight:600;width:38%">Name</td><td>${d.declarant_name || '—'}</td></tr>
      <tr><td style="padding:5px 0;font-weight:600">Position</td><td>${d.declarant_position || '—'}</td></tr>
      <tr><td style="padding:5px 0;font-weight:600">Declaration Agreed</td><td>${bool(d.declaration_agreed)}</td></tr>
    </table>
    <div style="text-align:center">
      <a href="https://joybringerscharity.org/admin" style="display:inline-block;background:#006526;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px">View in Admin Panel</a>
    </div>
  </div>
</div>`;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.SUPABASE_SERVICE_KEY) return res.status(503).json({ error: 'Service unavailable.' });

  const body   = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
  const action = body.action;

  /* ── PUBLIC: get booked dates for calendar ──────────────── */
  if (action === 'get_availability') {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?select=event_date,status&status=neq.cancelled&event_date=not.is.null&limit=500`,
      { headers: sbHeaders() }
    );
    if (!r.ok) return res.status(200).json([]);
    const rows = await r.json().catch(() => []);
    return res.status(200).json(rows.map(row => ({ date: row.event_date, status: row.status })));
  }

  /* ── PUBLIC: submit new booking ─────────────────────────── */
  if (action === 'submit') {
    const { org_name, responsible_person, email } = body;
    if (!org_name?.trim() || !responsible_person?.trim() || !email?.includes('@'))
      return res.status(400).json({ error: 'Organisation name, responsible person and email are required.' });
    if (!body.declaration_agreed)
      return res.status(400).json({ error: 'You must accept the declaration before submitting.' });

    const sup = body.suppliers || {};
    const payload = {
      org_name:                    org_name.trim(),
      responsible_person:          responsible_person.trim(),
      address:                     body.address || null,
      telephone:                   body.telephone || null,
      email:                       email.toLowerCase().trim(),
      event_name:                  body.event_name || null,
      event_type:                  body.event_type || null,
      event_date:                  body.event_date || null,
      expected_attendance:         body.expected_attendance || null,
      setup_time:                  body.setup_time || null,
      event_start_time:            body.event_start_time || null,
      event_finish_time:           body.event_finish_time || null,
      suppliers:                   sup,
      insurance_company:           body.insurance_company || null,
      policy_number:               body.policy_number || null,
      public_liability_cover:      body.public_liability_cover || null,
      insurance_expiry:            body.insurance_expiry || null,
      damage_premises_covered:     body.damage_premises_covered === true,
      damage_fixtures_covered:     body.damage_fixtures_covered === true,
      insurance_evidence_supplied: body.insurance_evidence_supplied === true,
      declarant_name:              body.declarant_name || null,
      declarant_position:          body.declarant_position || null,
      declaration_agreed:          true,
      declaration_date:            new Date().toISOString().slice(0, 10),
      status:                      'pending'
    };

    const insertR = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
      method:  'POST',
      headers: { ...sbHeaders(), Prefer: 'return=representation' },
      body:    JSON.stringify(payload)
    });
    if (!insertR.ok) {
      const msg = await insertR.text().catch(() => '');
      console.error('Venue hire insert error:', insertR.status, msg);
      return res.status(500).json({ error: 'Could not save your booking. Please try again.' });
    }

    const rows = await insertR.json().catch(() => []);
    const ref  = rows[0]?.booking_ref || 'VH-PENDING';

    const adminEmail = process.env.ADMIN_EMAIL || 'info@joybringerscharity.org';
    await Promise.all([
      sendEmail(payload.email, `Venue Hire Booking Received – ${ref}`, confirmationHtml(payload, ref)),
      sendEmail(adminEmail,    `New Venue Hire Booking – ${ref} – ${org_name.trim()}`, adminHtml(payload, ref, sup))
    ]);

    return res.status(200).json({ ok: true, booking_ref: ref });
  }

  /* ── ADMIN: require valid session token for all below ───── */
  const session = verifyToken(body.token);
  if (!session) return res.status(401).json({ error: 'Unauthorised.' });

  /* list */
  if (action === 'list') {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?select=id,booking_ref,created_at,status,org_name,responsible_person,email,event_name,event_date,expected_attendance&order=created_at.desc&limit=500`,
      { headers: sbHeaders() }
    );
    return res.status(200).json(r.ok ? await r.json() : []);
  }

  /* get single */
  if (action === 'get') {
    const { id } = body;
    if (!id) return res.status(400).json({ error: 'ID required.' });
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}&limit=1`, { headers: sbHeaders() });
    const rows = r.ok ? await r.json() : [];
    if (!rows.length) return res.status(404).json({ error: 'Not found.' });
    return res.status(200).json(rows[0]);
  }

  /* update admin fields */
  if (action === 'update_admin') {
    const { id, financials, admin_checks, status, admin_notes } = body;
    if (!id) return res.status(400).json({ error: 'ID required.' });
    const update = {};
    if (financials   !== undefined) update.financials   = financials;
    if (admin_checks !== undefined) update.admin_checks = admin_checks;
    if (status       !== undefined) update.status       = status;
    if (admin_notes  !== undefined) update.admin_notes  = admin_notes;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: { ...sbHeaders(), Prefer: 'return=minimal' },
      body:    JSON.stringify(update)
    });
    if (!r.ok) return res.status(500).json({ error: 'Update failed.' });
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'Unknown action.' });
};

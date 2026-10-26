/* ============================================================
   JOYBRINGERS — Volunteer Expense Claim Notification
   /api/expenses-notification.js

   Called by volunteer-expenses.html after a successful
   Supabase insert. Sends two emails via Resend:
     1. Internal claim notification → info@joybringerscharity.org
     2. Confirmation receipt        → volunteer's own email
   ============================================================ */

const FROM_NOREPLY = 'Joybringers Charity <noreply@joybringerscharity.org>';
const FROM_BOOKINGS = 'Joybringers Charity <bookings@joybringerscharity.org>';
const NOTIFY_TO    = 'info@joybringerscharity.org';

function fmt(v, fallback = '—') { return v || fallback; }
function fmtGbp(n) { return n != null ? `£${Number(n).toFixed(2)}` : '—'; }

function internalHtml(d) {
  const transportLabel = { car: 'Own car', public: 'Bus / Train', both: 'Both' }[d.transport_type] || d.transport_type || '—';

  const bankRow = (d.account_number || d.sort_code)
    ? `<tr><td style="padding:10px 14px;font-weight:600;color:#111;width:38%;background:#fff9f0;">Bank account</td>
         <td style="padding:10px 14px;color:#444;background:#fff9f0;">Acc: ${fmt(d.account_number)} &nbsp;|&nbsp; Sort: ${fmt(d.sort_code)}</td></tr>`
    : `<tr><td style="padding:10px 14px;font-weight:600;color:#111;background:#fff9f0;">Bank account</td>
         <td style="padding:10px 14px;color:#888;font-style:italic;background:#fff9f0;">Not provided</td></tr>`;

  const receiptRow = d.receipt_url
    ? `<tr><td style="padding:10px 14px;font-weight:600;color:#111;">Receipt</td>
         <td style="padding:10px 14px;"><a href="${d.receipt_url}" style="color:#006526;font-weight:700;">View uploaded receipt</a></td></tr>`
    : `<tr><td style="padding:10px 14px;font-weight:600;color:#111;">Receipt</td>
         <td style="padding:10px 14px;color:#888;font-style:italic;">None uploaded</td></tr>`;

  return `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:640px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:linear-gradient(135deg,#003d14 0%,#006526 100%);padding:28px;text-align:center;">
    <p style="color:#a7f3c5;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;margin:0 0 6px;">New Expense Claim</p>
    <h1 style="color:#fff;font-size:20px;font-weight:800;margin:0;">${d.first_name} ${d.last_name}</h1>
    <p style="color:rgba(255,255,255,.75);font-size:13px;margin:4px 0 0;">Ref: ${d.ref}</p>
  </div>

  <div style="padding:28px;">
    <p style="font-size:13px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:.08em;margin:0 0 10px;">Volunteer details</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 24px;">
      <tr style="background:#f9fafb;"><td style="padding:10px 14px;font-weight:600;color:#111;width:38%;">Name</td><td style="padding:10px 14px;color:#444;">${d.first_name} ${d.last_name}</td></tr>
      <tr><td style="padding:10px 14px;font-weight:600;color:#111;">Email</td><td style="padding:10px 14px;"><a href="mailto:${d.email}" style="color:#006526;">${d.email}</a></td></tr>
      <tr style="background:#f9fafb;"><td style="padding:10px 14px;font-weight:600;color:#111;">Phone</td><td style="padding:10px 14px;color:#444;">${fmt(d.phone)}</td></tr>
      <tr><td style="padding:10px 14px;font-weight:600;color:#111;">Period</td><td style="padding:10px 14px;color:#444;">${fmt(d.period_start)} → ${fmt(d.period_end)}</td></tr>
    </table>

    <p style="font-size:13px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:.08em;margin:0 0 10px;">Expense breakdown</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 24px;">
      <tr style="background:#f9fafb;"><td style="padding:10px 14px;font-weight:600;color:#111;width:38%;">Transport type</td><td style="padding:10px 14px;color:#444;">${transportLabel}</td></tr>
      <tr><td style="padding:10px 14px;font-weight:600;color:#111;">From → To</td><td style="padding:10px 14px;color:#444;">${fmt(d.from_location)} → ${fmt(d.to_location)}</td></tr>
      <tr style="background:#f9fafb;"><td style="padding:10px 14px;font-weight:600;color:#111;">Miles claimed</td><td style="padding:10px 14px;color:#444;">${d.total_miles ? d.total_miles + ' miles' : '—'}</td></tr>
      <tr><td style="padding:10px 14px;font-weight:600;color:#111;">Car reimbursement</td><td style="padding:10px 14px;color:#444;">${fmtGbp(d.car_reimbursement)} <span style="font-size:12px;color:#888;">(@ 45p/mile)</span></td></tr>
      <tr style="background:#f9fafb;"><td style="padding:10px 14px;font-weight:600;color:#111;">Public transport</td><td style="padding:10px 14px;color:#444;">${fmtGbp(d.public_transport_cost)}</td></tr>
      ${receiptRow}
      ${bankRow}
      <tr style="background:#f0fdf4;"><td style="padding:12px 14px;font-weight:800;color:#006526;font-size:15px;">TOTAL CLAIM</td><td style="padding:12px 14px;font-weight:800;color:#006526;font-size:15px;">${fmtGbp(d.total_amount)}</td></tr>
    </table>

    ${d.notes ? `<div style="background:#f0fdf4;border-left:4px solid #006526;border-radius:0 8px 8px 0;padding:14px 16px;margin:0 0 24px;font-size:14px;color:#333;line-height:1.6;"><strong>Notes:</strong> ${d.notes}</div>` : ''}

    <p style="font-size:13px;color:#555;margin:0;">Log in to <a href="https://app.supabase.com" style="color:#006526;">Supabase</a> to update the claim status (pending → approved → paid).</p>
  </div>

  <div style="background:#f4f7f4;padding:16px 28px;border-top:1px solid #e5e7eb;text-align:center;">
    <p style="font-size:11px;color:#888;margin:0;">Joybringers Ltd &middot; Registered Charity No. 1212606 &middot; Internal notification — do not forward</p>
  </div>
</div>`;
}

function volunteerConfirmHtml(d) {
  return `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:linear-gradient(135deg,#003d14 0%,#006526 100%);padding:36px 28px;text-align:center;">
    <p style="color:#a7f3c5;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin:0 0 8px;">Expense Claim Received</p>
    <h1 style="color:#fff;font-size:22px;font-weight:800;margin:0;line-height:1.3;">Thank you, ${d.first_name}!</h1>
  </div>

  <div style="padding:32px 28px;">
    <p style="font-size:15px;color:#111;margin:0 0 8px;">Hi ${d.first_name},</p>
    <p style="color:#444;line-height:1.7;font-size:14px;margin:0 0 24px;">
      We've received your expense claim and it's now being reviewed. We aim to process approved claims within 10 working days.
    </p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:18px 22px;margin:0 0 24px;text-align:center;">
      <p style="font-size:11px;font-weight:700;color:#166534;margin:0 0 5px;letter-spacing:.1em;text-transform:uppercase;">Your Claim Reference</p>
      <p style="font-size:26px;font-weight:800;color:#006526;margin:0;letter-spacing:.06em;">${d.ref}</p>
      <p style="font-size:12px;color:#555;margin:6px 0 0;">Please quote this if you need to follow up.</p>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 24px;">
      <tr style="background:#f9fafb;"><td style="padding:10px 14px;font-weight:600;color:#111;width:40%;">Period covered</td><td style="padding:10px 14px;color:#444;">${fmt(d.period_start)} to ${fmt(d.period_end)}</td></tr>
      <tr><td style="padding:10px 14px;font-weight:600;color:#111;">Total claimed</td><td style="padding:10px 14px;font-weight:700;color:#006526;">${fmtGbp(d.total_amount)}</td></tr>
      <tr style="background:#f9fafb;"><td style="padding:10px 14px;font-weight:600;color:#111;">Status</td><td style="padding:10px 14px;color:#444;">Pending review</td></tr>
    </table>

    <p style="color:#444;line-height:1.7;font-size:14px;margin:0 0 24px;">
      If you have any questions about your claim, contact us at
      <a href="mailto:info@joybringerscharity.org" style="color:#006526;">info@joybringerscharity.org</a>
      quoting your reference above.
    </p>

    <p style="color:#444;font-size:14px;margin:0 0 4px;">Thank you for all you do,</p>
    <p style="font-weight:700;color:#006526;font-size:14px;margin:0;">The Joybringers Team</p>
  </div>

  <div style="background:#f4f7f4;padding:18px 28px;border-top:1px solid #e5e7eb;text-align:center;">
    <p style="font-size:11px;color:#888;margin:0;line-height:1.7;">
      Joybringers Ltd &middot; 3rd Floor, The Light Box Q2, Quorum Business Park, Benton Ln, Longbenton, Newcastle upon Tyne NE12 8EU<br>
      <a href="mailto:info@joybringerscharity.org" style="color:#006526;">info@joybringerscharity.org</a>
      &middot; Registered Charity No. 1212606 &middot; Company No. 15400265
    </p>
  </div>
</div>`;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Email service not configured.' });

  const d = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');

  if (!d.email || !d.first_name || !d.last_name) {
    return res.status(400).json({ error: 'email, first_name and last_name are required.' });
  }

  const send = (payload) =>
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

  try {
    const [r1, r2] = await Promise.all([
      send({ from: FROM_NOREPLY, to: [NOTIFY_TO],  subject: `New Expense Claim — ${d.first_name} ${d.last_name} (${d.ref})`, html: internalHtml(d) }),
      send({ from: FROM_BOOKINGS, to: [d.email],   subject: `Expense Claim Received — ${d.ref}`, html: volunteerConfirmHtml(d) })
    ]);

    if (!r1.ok || !r2.ok) {
      const msg = await (r1.ok ? r2 : r1).text().catch(() => '');
      console.error('Resend error:', msg);
      return res.status(502).json({ error: 'Could not send email notification.' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('expenses-notification exception:', err);
    return res.status(500).json({ error: 'Unexpected error sending email.' });
  }
};

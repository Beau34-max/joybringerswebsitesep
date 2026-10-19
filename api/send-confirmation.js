/* ============================================================
   JOYBRINGERS — Event Registration Confirmation Email
   /api/send-confirmation.js

   Called by events.html after a successful Supabase insert.
   Sends a branded HTML confirmation via Resend so we have
   full control over links and formatting.
   ============================================================ */

const FROM = 'Joybringers Charity <bookings@joybringerscharity.org>';

function confirmationHtml(d) {
  const online = d.event_location === 'Online';
  const joiningBlock = online && d.joining_link_line && d.joining_link_line !== 'A joining link will be emailed to you before the event.'
    ? `<tr style="background:#f0fdf4">
        <td style="padding:10px 14px;font-weight:600;color:#166534;width:40%">Joining Link</td>
        <td style="padding:10px 14px">
          <a href="${d.joining_link_line}" style="color:#006526;font-weight:700;word-break:break-all;">${d.joining_link_line}</a>
        </td>
      </tr>`
    : online
      ? `<tr style="background:#fef3c7">
          <td colspan="2" style="padding:10px 14px;font-size:13px;color:#92400e;">
            <strong>Note:</strong> A joining link will be emailed to you before the event.
          </td>
        </tr>`
      : '';

  const preInfoBlock = d.pre_event_info
    ? `<div style="background:#f0fdf4;border-left:4px solid #006526;border-radius:0 8px 8px 0;padding:16px 18px;margin:0 0 24px">
        <p style="font-size:13px;font-weight:700;color:#166534;margin:0 0 6px;text-transform:uppercase;letter-spacing:.05em">Important: Before You Attend</p>
        <p style="font-size:14px;color:#333;line-height:1.7;margin:0">${d.pre_event_info}</p>
      </div>`
    : '';

  return `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
  <!-- Header -->
  <div style="background:linear-gradient(135deg,#003d14 0%,#006526 100%);padding:36px 28px;text-align:center;">
    <p style="color:#a7f3c5;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin:0 0 8px;">Registration Confirmed</p>
    <h1 style="color:#fff;font-size:22px;font-weight:800;margin:0 0 6px;line-height:1.3;">${d.event_name}</h1>
    <p style="color:rgba(255,255,255,.8);font-size:14px;margin:0;">Joybringers Charity</p>
  </div>

  <!-- Body -->
  <div style="padding:32px 28px;">
    <p style="font-size:15px;color:#111;margin:0 0 8px;">Dear ${d.first_name},</p>
    <p style="color:#444;line-height:1.7;margin:0 0 24px;font-size:14px;">
      Thank you for registering! We're looking forward to seeing you. Your booking details are below.
    </p>

    <!-- Booking ref -->
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:18px 22px;margin:0 0 24px;text-align:center;">
      <p style="font-size:11px;font-weight:700;color:#166534;margin:0 0 5px;letter-spacing:.1em;text-transform:uppercase;">Your Booking Reference</p>
      <p style="font-size:28px;font-weight:800;color:#006526;margin:0;letter-spacing:.08em;">${d.booking_ref || '—'}</p>
      <p style="font-size:12px;color:#555;margin:6px 0 0;">Please quote this in all correspondence.</p>
    </div>

    <!-- Event details table -->
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 24px;">
      <tr style="background:#f9fafb;">
        <td style="padding:10px 14px;font-weight:600;color:#111;width:40%;">Event</td>
        <td style="padding:10px 14px;color:#444;">${d.event_name}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;font-weight:600;color:#111;">Date</td>
        <td style="padding:10px 14px;color:#444;">${d.event_date}</td>
      </tr>
      <tr style="background:#f9fafb;">
        <td style="padding:10px 14px;font-weight:600;color:#111;">Time</td>
        <td style="padding:10px 14px;color:#444;">${d.event_time || '—'}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;font-weight:600;color:#111;">Location</td>
        <td style="padding:10px 14px;color:#444;">${d.event_location}</td>
      </tr>
      ${joiningBlock}
      <tr style="background:#f9fafb;">
        <td style="padding:10px 14px;font-weight:600;color:#111;">Attendees</td>
        <td style="padding:10px 14px;color:#444;">${d.number_of_persons}</td>
      </tr>
    </table>

    ${preInfoBlock}

    <p style="color:#444;line-height:1.7;font-size:14px;margin:0 0 24px;">
      If you have any questions, reply to this email or contact us at
      <a href="mailto:info@joybringerscharity.org" style="color:#006526;">info@joybringerscharity.org</a>
      or call <a href="tel:01916030219" style="color:#006526;">0191 603 0219</a>.
    </p>

    <p style="color:#444;font-size:14px;margin:0 0 4px;">See you soon,</p>
    <p style="font-weight:700;color:#006526;font-size:14px;margin:0;">The Joybringers Team</p>
  </div>

  <!-- Footer -->
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

  if (!d.email || !d.first_name || !d.event_name) {
    return res.status(400).json({ error: 'email, first_name and event_name are required.' });
  }

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from:    FROM,
        to:      [d.email],
        subject: `Registration Confirmed: ${d.event_name}`,
        html:    confirmationHtml(d)
      })
    });

    if (!r.ok) {
      const msg = await r.text().catch(() => '');
      console.error('Resend error:', r.status, msg);
      return res.status(502).json({ error: 'Could not send confirmation email.' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('send-confirmation exception:', err);
    return res.status(500).json({ error: 'Unexpected error sending email.' });
  }
};

// api/digital-learning-checkout.js
// Creates a Stripe Checkout Session for a Digital Learning package.
// Returns { url } — the browser redirects to Stripe's hosted payment page.

const PACKAGES = {
  trial: {
    name:        'Digital Learning Trial Session (1 hour)',
    description: 'One child · No commitment · Meet your tutor first',
    amount:      3500,   // £35.00
  },
  session: {
    name:        'Digital Learning Session (90 minutes)',
    description: 'Single pay-as-you-go 90-min session · One child',
    amount:      5000,   // £50.00
  },
  monthly: {
    name:        'Digital Learning Monthly Package',
    description: '4 × 90-min sessions · Consistent tutor · Personal learning plan',
    amount:      19000,  // £190.00
  },
  sibling: {
    name:        'Digital Learning Sibling Session (90 minutes)',
    description: 'Up to 3 learners in the same session',
    amount:      6500,   // £65.00
  },
  sibling_monthly: {
    name:        'Digital Learning Sibling Monthly Package',
    description: '4 × 90-min sibling sessions · Up to 3 learners',
    amount:      24000,  // £240.00
  },
};

const SITE = 'https://joybringerscharity.org';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(503).json({ error: 'Payments not configured.' });

  const { package: pkg, child_name, subject } = req.body || {};
  const plan = PACKAGES[pkg];
  if (!plan) return res.status(400).json({ error: 'Unknown package.' });

  const meta = {};
  if (child_name) meta.child_name = child_name;
  if (subject)    meta.subject    = subject;
  meta.package = pkg;
  meta.source  = 'digital_learning';

  const params = new URLSearchParams({
    mode:                                             'payment',
    'line_items[0][quantity]':                        '1',
    'line_items[0][price_data][currency]':            'gbp',
    'line_items[0][price_data][unit_amount]':         String(plan.amount),
    'line_items[0][price_data][product_data][name]':  plan.name,
    'line_items[0][price_data][product_data][description]': plan.description,
    success_url: `${SITE}/thank-you?session_id={CHECKOUT_SESSION_ID}&pkg=${pkg}`,
    cancel_url:  `${SITE}/home-digital-learning#pricing`,
    'payment_method_types[0]': 'card',
    'customer_creation': 'always',
    'billing_address_collection': 'auto',
  });

  Object.entries(meta).forEach(([k, v]) => {
    params.set(`metadata[${k}]`, v);
  });

  try {
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const data = await r.json();
    if (data.error) return res.status(400).json({ error: data.error.message });
    return res.status(200).json({ url: data.url });
  } catch (err) {
    console.error('[Stripe Checkout]', err);
    return res.status(500).json({ error: 'Payment setup failed. Please try again.' });
  }
};

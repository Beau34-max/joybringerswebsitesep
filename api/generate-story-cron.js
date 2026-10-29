// api/generate-story-cron.js
// Runs daily via Vercel Cron at 10:00 UTC.
// Finds events that ended 24-48 hours ago with no story yet,
// generates an emotionally engaging story using Claude, and saves it.
//
// Required env vars:
//   SUPABASE_SERVICE_KEY  — Supabase service role key
//   ANTHROPIC_API_KEY     — Anthropic API key
//   CRON_SECRET           — A secret string to protect manual triggers

const SUPABASE_URL   = 'https://roofompdejyndlpqfrjl.supabase.co';
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY;
const CRON_SECRET    = process.env.CRON_SECRET;
const SITE_URL       = 'https://joybringerscharity.org';

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

function dateStr(d) { return d.toISOString().split('T')[0]; }

async function generateStory(event) {
  const prompt = `You are the communications writer for Joybringers, a registered charity in Newcastle and the North East that empowers children and young people aged 7–25 through skills, education, and community. Our mission is to help young people Believe, Belong, and Become.

Write a short, emotionally engaging SUCCESS STORY for our website about this event that has just passed. Use a warm, inspiring tone — real, not corporate. Celebrate the people, the impact, and the community.

EVENT DETAILS:
- Name: ${event.title}
- Date: ${event.date}
- Description: ${event.description}
- Venue: ${event.venue || 'Newcastle'}

Write a JSON object with exactly these fields:
{
  "title": "A compelling headline (max 10 words)",
  "category": "One of: Digital Skills | Well-being | Community | Outdoor Adventures | Milestone | Skills | Family",
  "story_text": "Two short paragraphs (max 120 words total). Start with an emotional hook. Second paragraph ties to Joybringers' mission. Use real language — not press-release speak.",
  "quote": "An optional short inspiring quote or reflection (max 25 words), or null if it doesn't fit naturally"
}

Respond with ONLY the JSON object, no markdown, no explanation.`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Claude API error: ${r.status} ${err}`);
  }

  const data = await r.json();
  const text = data.content?.[0]?.text?.trim();
  try {
    return JSON.parse(text);
  } catch {
    // Try to extract JSON from the response in case of extra whitespace
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Could not parse Claude response as JSON');
  }
}

async function getExistingStoryNames() {
  const r = await sb('success_stories?select=event_name&published=eq.true');
  if (!r.ok) return new Set();
  const rows = await r.json();
  return new Set(rows.map(s => s.event_name.toLowerCase().trim()));
}

export default async function handler(req, res) {
  // Allow Vercel Cron (which sends no auth) or a manual call with the secret
  const authHeader = req.headers.authorization || '';
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  const isManual = CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`;

  if (!isVercelCron && !isManual) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
  if (!SUPABASE_KEY)  return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY not set' });

  try {
    // Fetch events.json from the live site
    const eventsRes = await fetch(`${SITE_URL}/data/events.json`);
    if (!eventsRes.ok) return res.status(500).json({ error: 'Could not load events.json' });
    const { items: events } = await eventsRes.json();

    const now     = new Date();
    const oneDayAgo  = new Date(now - 24  * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    // Events that ended between 24 hours and 30 days ago (so we catch recent ones
    // without re-checking very old ones on every daily run)
    const recentPastEvents = events.filter(e => {
      const d = new Date(e.date);
      return d <= oneDayAgo && d >= thirtyDaysAgo;
    });

    if (!recentPastEvents.length) {
      return res.status(200).json({ generated: 0, message: 'No recent events to process' });
    }

    const existing = await getExistingStoryNames();
    const toGenerate = recentPastEvents.filter(
      e => !existing.has(e.title.toLowerCase().trim())
    );

    if (!toGenerate.length) {
      return res.status(200).json({ generated: 0, message: 'All recent events already have stories' });
    }

    const results = [];
    for (const event of toGenerate) {
      try {
        const story = await generateStory(event);

        // Determine images: use the event's image as the first slide
        const images = event.image ? [event.image] : [];

        const saveRes = await sb('success_stories', {
          method: 'POST',
          body: JSON.stringify({
            event_name:      event.title,
            event_date:      event.date,
            category:        story.category || 'Event',
            title:           story.title,
            story_text:      story.story_text,
            quote:           story.quote || null,
            images:          images,
            published:       true,
            generated_by_ai: true,
          }),
        });

        if (saveRes.ok) {
          results.push({ event: event.title, status: 'generated' });
        } else {
          results.push({ event: event.title, status: 'save_failed' });
        }
      } catch (err) {
        results.push({ event: event.title, status: 'error', error: err.message });
      }
    }

    return res.status(200).json({ generated: results.filter(r => r.status === 'generated').length, results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

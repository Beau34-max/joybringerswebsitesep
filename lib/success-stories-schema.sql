-- ============================================================
-- JOYBRINGERS — Success Stories
-- Run this in your Supabase SQL editor
-- ============================================================

CREATE TABLE IF NOT EXISTS success_stories (
  id            uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  event_name    text    NOT NULL,
  event_date    date    NOT NULL,
  category      text    NOT NULL DEFAULT 'Event',
  title         text    NOT NULL,
  story_text    text    NOT NULL,
  quote         text,
  images        text[]  NOT NULL DEFAULT '{}',
  published     boolean NOT NULL DEFAULT true,
  generated_by_ai boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Stories older than 1 year are automatically excluded by the API query,
-- so no hard-delete is needed — they just stop appearing.

-- Allow the API (service key) full access; public can read published rows.
ALTER TABLE success_stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read published stories"
  ON success_stories FOR SELECT
  USING (published = true);

-- Service role bypasses RLS automatically, so no extra policy needed for writes.

-- ── Seed: existing hardcoded stories ────────────────────────────────────────
-- These are the stories that were previously hardcoded in what-we-do.html.
-- Run once to populate the database with existing content.

INSERT INTO success_stories (event_name, event_date, category, title, story_text, quote, images, published) VALUES

('6-Week R-Programming Coding Bootcamp', '2026-06-06', 'Digital Skills',
 '6-Week R-Programming Coding Bootcamp',
 'A beginner-friendly bootcamp introducing participants to R programming — covering data exploration, coding fundamentals, and problem-solving. Each Saturday session included hands-on challenges in a supportive environment, helping young people build confidence and practical digital skills.

The programme supports Joybringers'' mission to help people Believe, Belong, and Become by equipping learners with tools for future career development.',
 NULL,
 ARRAY['images/events/r-programming-1.JPG','images/events/r-programming-2.JPG','images/events/r-programming-3.JPG'],
 true),

('6-Week Data Analytics Bootcamp', '2026-02-28', 'Digital Skills',
 '6-Week Data Analytics Bootcamp',
 'Hands-on training for young people aged 16–25 in Excel, data cleaning, data analysis, and Power BI. Participants explored real datasets and built confidence in using data tools for decision-making and career development.

The bootcamp created a supportive space where young people were encouraged to think critically and strengthen their digital skills.',
 NULL,
 ARRAY['images/events/yb2.jpeg','images/events/yb1.png','images/events/yb.jpeg'],
 true),

('Fruit Kebabs Workshop', '2026-02-15', 'Well-being',
 'Fruit Kebabs Workshop — Healthy Snacks Session',
 'A fun, hands-on healthy snacks session led by Donna Robinson. Young people learnt food preparation skills, created colourful fruit kebabs, and explored healthy eating tips in a friendly, supportive environment promoting wellbeing and teamwork.',
 'A safe space for learning, connection, and enjoyment — perfectly reflecting our mission to help young people Believe, Belong, and Become.',
 ARRAY['images/events/fk.jpeg','images/events/fk4.jpeg','images/events/fk3.jpeg'],
 true),

('Coding & Data Analysis Training', '2025-12-12', 'Digital Skills',
 '6-Week Coding & Data Analysis Training',
 'A Coding & Data Training Programme for young people aged 7–15, delivered over six weeks at our NEON Office. Participants built real projects and explored technology with growing confidence.',
 '"My child gained creativity, self-belief, and a renewed passion for learning." — Parent',
 ARRAY['images/code.jpg','images/code6.jpg','images/code11.jpg'],
 true),

('Youth Boat Sailing', '2025-09-20', 'Outdoor Adventures',
 'Youth Boat Sailing 2025',
 'An unforgettable Youth Boat Cruise for young people aged 14–18, filled with games, new friendships, and fun memories. Spaces filled quickly — showing how eager our young people are to connect and create lasting memories together.',
 NULL,
 ARRAY['images/boat2.JPG','images/boat.JPG'],
 true),

('Joybringers New Office', '2025-09-01', 'Milestone',
 'Joybringers Charity New Office',
 'Joybringers moved into our new office at The Light Box Q2, Quorum Business Park, NE12 8EU — strengthening our capacity to support young people across Newcastle and beyond.',
 'Heartfelt thanks to Avire UK for making this milestone possible. Your support helps us create brighter futures.',
 ARRAY['images/of.jpg','images/of1.jpg','images/of2.jpg'],
 true),

('Blakelaw Family Fun Day', '2025-08-16', 'Community',
 'Blakelaw Family Fun Day',
 'A vibrant community day bringing families together for games, laughter, and connection. Young people and their families enjoyed an afternoon of activities that celebrated belonging and community spirit.',
 NULL,
 ARRAY['images/ff.JPG','images/ff2.JPG','images/ff3.JPG'],
 true),

('Outdoor Fun Day — Carlisle Park', '2025-05-17', 'Community',
 'Outdoor Fun Day — Carlisle Park',
 'A day of outdoor adventure and fun at Carlisle Park, giving young people space to explore, play, and build friendships in a natural environment. Pure joy from start to finish.',
 NULL,
 ARRAY['images/events/bg_1.jpg','images/events/bg_2.jpg'],
 true),

('Multi-Skilled Workshop', '2025-04-12', 'Skills',
 'Multi-Skilled Workshop',
 'A hands-on skills workshop covering practical life skills, creativity, and teamwork. Participants left with new knowledge, new connections, and renewed confidence in their abilities.',
 NULL,
 ARRAY['images/events/bg_3.jpg'],
 true);

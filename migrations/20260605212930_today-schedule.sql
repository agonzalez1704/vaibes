-- Per-day randomized delivery schedule.
-- Shape: { "date": "YYYY-MM-DD" (user local), "times": ["HH:MM", ...] }
alter table public.preferences
  add column if not exists today_schedule jsonb;

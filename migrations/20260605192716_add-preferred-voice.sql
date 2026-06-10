alter table public.profiles
  add column if not exists preferred_voice_id text;

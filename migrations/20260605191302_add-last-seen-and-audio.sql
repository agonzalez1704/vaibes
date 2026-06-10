-- Activity tracking + TTS audio cache columns.

alter table public.users
  add column if not exists last_seen_at timestamptz;

create index if not exists users_last_seen_idx on public.users(last_seen_at);

alter table public.phrases
  add column if not exists audio_url text,
  add column if not exists audio_key text,
  add column if not exists audio_voice_id text;

-- True only after the user explicitly picks frequency in settings.
-- Onboarding/quiz set a default frequency but leave this false so we know
-- to prompt them on home.
alter table public.preferences
  add column if not exists frequency_set_by_user boolean not null default false;

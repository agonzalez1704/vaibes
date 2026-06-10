-- =====================================================
-- Vibes — initial schema
-- Clerk JWT-based auth: user_id stored as TEXT (Clerk's sub claim)
-- =====================================================

-- Helper: extract Clerk user id from JWT
create or replace function public.requesting_user_id()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::text
$$;

-- =====================================================
-- users  (mirror of Clerk users, kept in sync via webhook)
-- =====================================================
create table public.users (
  id              text primary key,
  email           text,
  push_token      text,
  locale          text default 'en',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.users enable row level security;

create policy users_self_read
  on public.users for select
  using (id = public.requesting_user_id());

create policy users_self_update
  on public.users for update
  using (id = public.requesting_user_id())
  with check (id = public.requesting_user_id());

-- =====================================================
-- social_handles
-- =====================================================
create table public.social_handles (
  id                uuid primary key default gen_random_uuid(),
  user_id           text not null references public.users(id) on delete cascade,
  platform          text not null check (platform in ('instagram','tiktok')),
  handle            text not null,
  last_scraped_at   timestamptz,
  status            text not null default 'pending'
                    check (status in ('pending','ok','private','not_found','failed')),
  created_at        timestamptz not null default now(),
  unique (user_id, platform)
);

create index social_handles_user_idx on public.social_handles(user_id);
alter table public.social_handles enable row level security;

create policy social_handles_owner_all
  on public.social_handles for all
  using (user_id = public.requesting_user_id())
  with check (user_id = public.requesting_user_id());

-- =====================================================
-- profiles  (LLM-derived interest/mood/language model)
-- =====================================================
create table public.profiles (
  user_id            text primary key references public.users(id) on delete cascade,
  interests          jsonb not null default '[]'::jsonb,
  mood_baseline      text,
  language           text default 'en',
  tone_preference    text,
  themes             jsonb not null default '[]'::jsonb,
  raw_signals        jsonb,
  updated_at         timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy profiles_owner_all
  on public.profiles for all
  using (user_id = public.requesting_user_id())
  with check (user_id = public.requesting_user_id());

-- =====================================================
-- scrape_jobs
-- =====================================================
create table public.scrape_jobs (
  id              uuid primary key default gen_random_uuid(),
  user_id         text not null references public.users(id) on delete cascade,
  handle_id       uuid references public.social_handles(id) on delete cascade,
  apify_run_id    text,
  platform        text not null,
  status          text not null default 'queued'
                  check (status in ('queued','running','succeeded','failed')),
  result_url      text,
  posts_count     int default 0,
  cost_cents      int default 0,
  error           text,
  created_at      timestamptz not null default now(),
  finished_at     timestamptz
);

create index scrape_jobs_user_idx on public.scrape_jobs(user_id);
create index scrape_jobs_apify_idx on public.scrape_jobs(apify_run_id);
alter table public.scrape_jobs enable row level security;

create policy scrape_jobs_owner_read
  on public.scrape_jobs for select
  using (user_id = public.requesting_user_id());

-- =====================================================
-- phrases  (daily AI-generated motivational phrases)
-- =====================================================
create table public.phrases (
  id              uuid primary key default gen_random_uuid(),
  user_id         text not null references public.users(id) on delete cascade,
  text            text not null,
  theme           text,
  language        text,
  model           text,
  prompt_hash     text,
  generated_at    timestamptz not null default now()
);

create index phrases_user_recent_idx on public.phrases(user_id, generated_at desc);
alter table public.phrases enable row level security;

create policy phrases_owner_read
  on public.phrases for select
  using (user_id = public.requesting_user_id());

-- =====================================================
-- deliveries
-- =====================================================
create table public.deliveries (
  id              uuid primary key default gen_random_uuid(),
  phrase_id       uuid not null references public.phrases(id) on delete cascade,
  user_id         text not null references public.users(id) on delete cascade,
  channel         text not null check (channel in ('push','in_app')),
  delivered_at    timestamptz not null default now(),
  opened_at       timestamptz
);

create index deliveries_user_idx on public.deliveries(user_id);
alter table public.deliveries enable row level security;

create policy deliveries_owner_read
  on public.deliveries for select
  using (user_id = public.requesting_user_id());

create policy deliveries_owner_update
  on public.deliveries for update
  using (user_id = public.requesting_user_id())
  with check (user_id = public.requesting_user_id());

-- =====================================================
-- preferences
-- =====================================================
create table public.preferences (
  user_id                 text primary key references public.users(id) on delete cascade,
  frequency               text not null default 'once'
                          check (frequency in ('once','twice','on_demand')),
  send_times              text[] not null default array['08:00'],
  quiet_hours             jsonb,
  timezone                text default 'UTC',
  notifications_enabled   boolean not null default true,
  updated_at              timestamptz not null default now()
);

alter table public.preferences enable row level security;

create policy preferences_owner_all
  on public.preferences for all
  using (user_id = public.requesting_user_id())
  with check (user_id = public.requesting_user_id());

-- =====================================================
-- consents
-- =====================================================
create table public.consents (
  id              uuid primary key default gen_random_uuid(),
  user_id         text not null references public.users(id) on delete cascade,
  handle_id       uuid references public.social_handles(id) on delete cascade,
  scope           text not null,
  policy_version  text not null default 'v1',
  granted_at      timestamptz not null default now(),
  revoked_at      timestamptz,
  ip              text,
  app_version     text
);

create index consents_user_idx on public.consents(user_id);
alter table public.consents enable row level security;

create policy consents_owner_read
  on public.consents for select
  using (user_id = public.requesting_user_id());

create policy consents_owner_insert
  on public.consents for insert
  with check (user_id = public.requesting_user_id());

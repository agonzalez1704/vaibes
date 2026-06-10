-- Pro subscription state, driven by RevenueCat webhook.
alter table public.users
  add column if not exists subscription_tier text not null default 'free'
    check (subscription_tier in ('free', 'pro')),
  add column if not exists subscription_expires_at timestamptz,
  add column if not exists subscription_product_id text,
  add column if not exists subscription_period text
    check (subscription_period in ('monthly', 'yearly', 'lifetime', null) or subscription_period is null);

create index if not exists users_subscription_tier_idx on public.users(subscription_tier);

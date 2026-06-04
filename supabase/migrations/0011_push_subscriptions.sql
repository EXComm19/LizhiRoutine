-- Web Push subscriptions, one row per device a user enables push on.
--
-- Multi-device by design: same user can have iPhone + iPad + laptop all
-- subscribed and receive every push. Identifier is `endpoint` because
-- the same browser regenerates its endpoint on each unsubscribe/re-subscribe
-- cycle, so we use it as the natural primary key.
--
-- The `keys_*` columns are the elliptic-curve handshake material the
-- push gateway needs to actually deliver the encrypted payload.

create table if not exists public.push_subscriptions (
  endpoint     text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  keys_p256dh  text not null,
  keys_auth    text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

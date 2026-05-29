-- WeChat 公众号 (personal subscription account) inbound bot.
--
-- Two tables:
--   wechat_links       — openid → Lizhi user mapping (permanent once bound)
--   wechat_bind_codes  — 6-digit one-time codes for the binding flow
--
-- Webhook + bind code endpoints both run under service_role; we don't
-- add per-user RLS here because the webhook is anonymous-with-signature
-- and the bind-code generator is session-auth'd in the route layer.

create table if not exists public.wechat_links (
  openid       text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  linked_at    timestamptz not null default now()
);

create index if not exists wechat_links_user_id_idx
  on public.wechat_links (user_id);

create table if not exists public.wechat_bind_codes (
  code         text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);

create index if not exists wechat_bind_codes_user_id_idx
  on public.wechat_bind_codes (user_id);
create index if not exists wechat_bind_codes_expires_at_idx
  on public.wechat_bind_codes (expires_at);

-- Lock the tables down to service_role only. Service-role bypasses RLS
-- so the webhook + bind-code routes still work; anything calling with
-- anon or authenticated keys gets a default-deny (no policies = no
-- access). The Supabase dashboard pops a warning otherwise.
alter table public.wechat_links        enable row level security;
alter table public.wechat_bind_codes   enable row level security;

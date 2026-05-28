-- Per-user API tokens for the Chrome extension (and any future external
-- clients). Tokens are sha256-hashed at rest; the plaintext is shown to the
-- user exactly once at creation time, then discarded server-side.
--
-- A user can have multiple tokens (one per device / browser). Each is
-- revocable individually; revocation is soft (revoked_at timestamp) so we
-- keep an audit trail of which keys were ever issued.

create table if not exists public.user_api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- sha256(plaintext) hex digest, 64 chars. Indexed for fast lookup on
  -- inbound Bearer authentication. Unique so two collisions wouldn't be
  -- ambiguous (negligible probability, but cheap to enforce).
  token_hash text not null unique,
  -- User-facing description: "Work Chrome", "Personal Edge", etc.
  label text not null default '',
  created_at timestamptz not null default now(),
  -- Updated on every successful authentication. Null = never used.
  last_used_at timestamptz,
  -- Soft-delete marker; once set the token can no longer authenticate.
  revoked_at timestamptz
);

create index if not exists user_api_tokens_user_id_idx
  on public.user_api_tokens(user_id);

-- Token-hash lookup is the hot path on every authenticated extension call.
-- Already covered by the unique constraint's implicit index.

alter table public.user_api_tokens enable row level security;

-- RLS: users can only see/modify their own tokens via the normal web UI.
-- The Bearer-auth path doesn't go through RLS (see lookup_api_token below).
drop policy if exists "user_api_tokens self select" on public.user_api_tokens;
create policy "user_api_tokens self select"
  on public.user_api_tokens
  for select
  using (auth.uid() = user_id);

drop policy if exists "user_api_tokens self insert" on public.user_api_tokens;
create policy "user_api_tokens self insert"
  on public.user_api_tokens
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_api_tokens self update" on public.user_api_tokens;
create policy "user_api_tokens self update"
  on public.user_api_tokens
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_api_tokens self delete" on public.user_api_tokens;
create policy "user_api_tokens self delete"
  on public.user_api_tokens
  for delete
  using (auth.uid() = user_id);

-- Bearer-token verification function. Runs as SECURITY DEFINER so it can
-- read the table without an auth.uid() context (the extension request only
-- carries a Bearer token, not a Supabase session).
--
-- Returns the user_id when the hash matches an unrevoked token. Side effect:
-- bumps last_used_at so the user can see which tokens are active in the
-- settings panel. Returns null when the token is unknown or revoked.
create or replace function public.lookup_api_token(hash text)
  returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  found_user uuid;
begin
  update public.user_api_tokens
    set last_used_at = now()
    where token_hash = hash and revoked_at is null
    returning user_id into found_user;
  return found_user;
end;
$$;

-- Allow the anon role to call lookup_api_token (the only entry point used
-- by the public client when verifying Bearer tokens). Authenticated users
-- and service role also get it for completeness.
grant execute on function public.lookup_api_token(text)
  to anon, authenticated, service_role;

-- Lizhi Routine — Gmail reminder suggestions (Supabase / Postgres)
--
-- Replaces the local .gmail-store.json that the v1 feature used. Each row is
-- scoped to auth.users via user_id + RLS so a single store can safely back
-- multiple tenants.
--
-- Tokens stored here are AES-256-GCM ciphertext produced by the app using
-- GMAIL_TOKEN_ENCRYPTION_KEY (see lib/server/gmail-store.ts). The database
-- never sees plaintext credentials.
--
-- Apply once via the Supabase dashboard SQL editor.

create table if not exists public.gmail_accounts (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'gmail',
  email text not null,
  -- AES-256-GCM ciphertext envelopes ("v1:<iv>:<tag>:<ciphertext>"). Never
  -- written or read in plaintext.
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  history_id text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gmail_accounts_user_idx
  on public.gmail_accounts (user_id);

create unique index if not exists gmail_accounts_user_email_idx
  on public.gmail_accounts (user_id, lower(email));

alter table public.gmail_accounts enable row level security;

create policy "gmail_accounts_select_own"
  on public.gmail_accounts for select using (auth.uid() = user_id);
create policy "gmail_accounts_insert_own"
  on public.gmail_accounts for insert with check (auth.uid() = user_id);
create policy "gmail_accounts_update_own"
  on public.gmail_accounts for update using (auth.uid() = user_id);
create policy "gmail_accounts_delete_own"
  on public.gmail_accounts for delete using (auth.uid() = user_id);


create table if not exists public.gmail_scanned_messages (
  id text primary key,
  account_id text not null references public.gmail_accounts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider_message_id text not null,
  provider_thread_id text,
  subject_hash text,
  received_at timestamptz,
  scanned_at timestamptz not null default now(),
  status text not null check (status in ('parsed', 'skipped', 'failed'))
);

create unique index if not exists gmail_scanned_messages_account_msg_idx
  on public.gmail_scanned_messages (account_id, provider_message_id);

create index if not exists gmail_scanned_messages_user_idx
  on public.gmail_scanned_messages (user_id);

alter table public.gmail_scanned_messages enable row level security;

create policy "gmail_scanned_messages_select_own"
  on public.gmail_scanned_messages for select using (auth.uid() = user_id);
create policy "gmail_scanned_messages_insert_own"
  on public.gmail_scanned_messages for insert with check (auth.uid() = user_id);
create policy "gmail_scanned_messages_update_own"
  on public.gmail_scanned_messages for update using (auth.uid() = user_id);
create policy "gmail_scanned_messages_delete_own"
  on public.gmail_scanned_messages for delete using (auth.uid() = user_id);


create table if not exists public.gmail_suggestions (
  id text primary key,
  account_id text not null references public.gmail_accounts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'gmail',
  fingerprint text not null,
  source_message_id text not null,
  source_thread_id text,
  source_subject text not null default '',
  source_from text not null default '',
  source_received_at timestamptz,
  source_snippet text not null default '',
  title text not null,
  list_name text not null,
  category text not null check (category in ('T0', 'T1', 'T2')),
  due_date date,
  due_time text,
  tags text[] not null default '{}',
  confidence double precision not null,
  reason text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'added', 'dismissed')),
  created_todo_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists gmail_suggestions_fingerprint_idx
  on public.gmail_suggestions (account_id, fingerprint);

create index if not exists gmail_suggestions_user_status_idx
  on public.gmail_suggestions (user_id, status);

alter table public.gmail_suggestions enable row level security;

create policy "gmail_suggestions_select_own"
  on public.gmail_suggestions for select using (auth.uid() = user_id);
create policy "gmail_suggestions_insert_own"
  on public.gmail_suggestions for insert with check (auth.uid() = user_id);
create policy "gmail_suggestions_update_own"
  on public.gmail_suggestions for update using (auth.uid() = user_id);
create policy "gmail_suggestions_delete_own"
  on public.gmail_suggestions for delete using (auth.uid() = user_id);

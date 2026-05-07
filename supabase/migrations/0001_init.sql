-- Lizhi Routine — initial schema (Supabase / Postgres)
--
-- Mirrors the local-storage envelope: one row per user for the "global"
-- buckets (templates, todos, todo_lists, periods, preferences) and one row
-- per (user, date_key) for scheduled day tasks. JSONB stores the same
-- documents the client already serialises to localStorage, so the client
-- can round-trip without per-field SQL.
--
-- Apply once via the Supabase dashboard SQL editor (paste + Run).

create table if not exists public.user_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  schema_version integer not null,
  templates jsonb not null default '[]'::jsonb,
  todos jsonb not null default '[]'::jsonb,
  todo_lists jsonb not null default '[]'::jsonb,
  periods jsonb not null default '[]'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_state enable row level security;

create policy "user_state_select_own"
  on public.user_state for select using (auth.uid() = user_id);
create policy "user_state_insert_own"
  on public.user_state for insert with check (auth.uid() = user_id);
create policy "user_state_update_own"
  on public.user_state for update using (auth.uid() = user_id);
create policy "user_state_delete_own"
  on public.user_state for delete using (auth.uid() = user_id);

create table if not exists public.day_tasks (
  user_id uuid not null references auth.users (id) on delete cascade,
  date_key text not null,
  schema_version integer not null,
  data jsonb not null default '{"tasks": []}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, date_key)
);

create index if not exists day_tasks_user_idx on public.day_tasks (user_id);

alter table public.day_tasks enable row level security;

create policy "day_tasks_select_own"
  on public.day_tasks for select using (auth.uid() = user_id);
create policy "day_tasks_insert_own"
  on public.day_tasks for insert with check (auth.uid() = user_id);
create policy "day_tasks_update_own"
  on public.day_tasks for update using (auth.uid() = user_id);
create policy "day_tasks_delete_own"
  on public.day_tasks for delete using (auth.uid() = user_id);

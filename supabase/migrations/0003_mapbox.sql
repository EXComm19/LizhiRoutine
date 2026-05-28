-- Lizhi Routine — Mapbox commute-estimate quota tracking
--
-- Replaces the per-process .mapbox-usage.json file, which lost counts under
-- concurrency and didn't survive serverless cold starts. Each user gets
-- their own monthly budget; the global MAPBOX_MONTHLY_REQUEST_LIMIT env var
-- becomes a per-user ceiling.
--
-- Apply via the Supabase dashboard SQL editor.

create table if not exists public.mapbox_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  month text not null,                 -- YYYY-MM
  requests integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);

create index if not exists mapbox_usage_user_idx
  on public.mapbox_usage (user_id);

alter table public.mapbox_usage enable row level security;

create policy "mapbox_usage_select_own"
  on public.mapbox_usage for select using (auth.uid() = user_id);
create policy "mapbox_usage_insert_own"
  on public.mapbox_usage for insert with check (auth.uid() = user_id);
create policy "mapbox_usage_update_own"
  on public.mapbox_usage for update using (auth.uid() = user_id);
create policy "mapbox_usage_delete_own"
  on public.mapbox_usage for delete using (auth.uid() = user_id);

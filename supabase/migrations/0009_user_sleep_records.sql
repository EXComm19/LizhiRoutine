-- Adds the `sleep_records` JSONB column to user_state.
--
-- Imported from Apple Health via the Health Auto Export iOS app (and any
-- future tracker integration). Each record is a single sleep session with
-- start, end, duration, source, and a stable dedup key (source_uid) so
-- re-imports of the same HealthKit data don't pile up.
--
-- Nullable + defaults to [] so older rows tolerate the upgrade gracefully.

alter table public.user_state
  add column if not exists sleep_records jsonb not null default '[]'::jsonb;

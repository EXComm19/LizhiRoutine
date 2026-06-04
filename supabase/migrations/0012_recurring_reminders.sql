-- Repeated reminders (e.g. "every night 22:00 take medicine") + the
-- two new preference fields driving the new push triggers.
--
-- recurring_reminders lives in the user_state row as JSONB the same way
-- events / periods / sleep_records do — keeps the round-trip simple
-- and reuses the existing localStorage envelope shape.

alter table public.user_state
  add column if not exists recurring_reminders jsonb not null default '[]'::jsonb;

-- Preferences live as a single JSONB blob on user_state, so we don't
-- need a schema change for the two new fields (daily_agenda_time,
-- event_reminder_lead_minutes). Older rows that pre-date these fields
-- get null defaults handled in the app's migrate function.

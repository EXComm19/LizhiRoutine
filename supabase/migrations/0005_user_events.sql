-- Adds the `events` JSONB column to user_state for the Task/Event split.
--
-- One-off appointments live separately from todos so the AI estimate flow,
-- progress bars, and stats can cleanly ignore them. The column is nullable
-- (older rows from before this migration have no events column populated)
-- and defaults to an empty array on new rows. The application code already
-- tolerates a null/missing value and falls back to [].

alter table public.user_state
  add column if not exists events jsonb not null default '[]'::jsonb;

-- Extends gmail_suggestions with the kind / duration_minutes fields the AI
-- parser now emits. Old rows that pre-date the classifier default to
-- kind='task' (the safe fallback). Events without a clock time are demoted
-- to tasks by the parser, so a row with kind='event' is guaranteed to also
-- have a non-null due_date and due_time on it.

alter table public.gmail_suggestions
  add column if not exists kind text not null default 'task',
  add column if not exists duration_minutes int;

-- Guard the only two values the application understands. Anything else is
-- a coding bug — fail loud at insert time.
alter table public.gmail_suggestions
  drop constraint if exists gmail_suggestions_kind_check;
alter table public.gmail_suggestions
  add constraint gmail_suggestions_kind_check
    check (kind in ('task', 'event'));

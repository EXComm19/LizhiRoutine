-- Phase 3 of the Agent rebuild (#50): every scanned email now produces a
-- card, even when there's no concrete task or event to add.
--
-- `summary` is a 1-2 sentence AI-written gist shown on every card. Empty
-- string on pre-migration rows is fine — the UI falls back to the subject.
--
-- `is_actionable` distinguishes actionable suggestions (existing task/event
-- behaviour, "Add" button shown) from informational summaries (no Add
-- button, the user just reads + dismisses). Old rows default to true so the
-- existing Add/Edit flow on them keeps working.

alter table public.gmail_suggestions
  add column if not exists summary text not null default '',
  add column if not exists is_actionable boolean not null default true;

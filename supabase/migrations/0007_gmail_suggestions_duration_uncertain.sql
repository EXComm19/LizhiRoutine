-- Adds duration_uncertain to gmail_suggestions so the AI parser can flag
-- events whose duration was a guess. Default false so old rows stay
-- valid and unchanged.

alter table public.gmail_suggestions
  add column if not exists duration_uncertain boolean not null default false;

# Current Web App State

This describes the current implementation that the iOS app should mirror at the data and behavior level.

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase Auth and PostgreSQL
- Local-first browser storage with Supabase sync
- Kimi/Moonshot API through a Next server route for AI todo parsing

## Key Source Files

| File | Purpose |
| --- | --- |
| `lib/schema.ts` | Source of truth for persisted TypeScript types, `SCHEMA_VERSION = 2`. |
| `lib/time.ts` | 5am planning boundary, timeline math, snapping, duration formatting. |
| `lib/storage.ts` | Local storage envelopes and migration behavior. |
| `lib/cloud-sync.ts` | Supabase sync for `user_state` and `day_tasks`. |
| `lib/colors.ts` | Semantic color tokens for categories, todo lists, periods, routines. |
| `lib/factories.ts` | Object constructors and ID creation. |
| `lib/period.ts` | Period activation and daily segment logic. |
| `components/routine-planner.tsx` | Main planner, views, todo/routine UI, timeline, stats. |
| `components/planner/editor.tsx` | Shared editorial editor modal primitives. |
| `components/planner/PeriodsPanel.tsx` | Period list and period editing UI. |
| `components/planner/CalendarImportPanel.tsx` | `.ics` import UI now located in Settings. |
| `app/api/parse-todos/route.ts` | Server-side Kimi todo parsing endpoint. |
| `app/api/import-calendar/route.ts` | Server-side URL calendar import endpoint. |
| `supabase/migrations/0001_init.sql` | Current backend table/RLS schema. |

## Current Screens

- **Calendar / Today:** timeline day view with date navigation, view switcher, current-time line, period background, deadline hints, draggable timeline blocks.
- **Week:** multi-day overview with due hints in day headers.
- **Month:** calendar month grid; periods appear as top ribbons, not redundant daily blocks.
- **Stats:** time statistics grouped by routine library source and original todo item.
- **Reminders/Todos:** todo lists/sub-lists, due dates, completion, AI import, double-click edit.
- **Routines:** routine library with customizable icon, color, duration, tier.
- **Periods:** long-running date ranges with optional day/time windows and breaks.
- **Settings:** calendar import and sublist management.

## Current Planning Rules

- A planning day starts at `05:00`.
- The visible day ends at `05:00` next day.
- `00:00` to `04:59` appears at the bottom of the planning day.
- Dragging and resizing snap to 30-minute increments.
- Direct editing can save exact minute start/end times.
- Fixed calendar events are locked.
- Calendar imports should not show lock icons inside the time block.
- Deadline indicators should avoid blocking timeline block text.

## Current Persistence Model

The app is local-first:

1. UI updates local state immediately.
2. State is written locally.
3. If signed in, an async Supabase upsert is fired.
4. On sign-in, cloud data replaces local data if cloud data exists.
5. If cloud is empty, local data is pushed as starter data.

The mobile MVP can keep this last-write-wins behavior for v1, but should isolate sync logic so better conflict handling can be added later.

## Existing Design References

These files are useful if the iOS builder has repository access:

- `.claude/_design/lizhi-routine.html`
- `.claude/_design/edit-todo.html`
- `.claude/_design/edit-block.html`

Treat them as visual references, not exact mobile layouts.


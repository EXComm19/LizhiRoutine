# Lizhi Routine

Web-only MVP for time-blocking and energy management on a daily routine. Drag todos and reusable routine blocks onto a 5am–5am day timeline; import .ics calendars as locked events; track a daily focus target on the FIRE progress bar.

## Run locally

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run preview  # serve the production build (next start)
npm run typecheck
npm run lint
```

## Categories

Tasks and routines are tagged `T0`, `T1`, or `T2`. T0 and T1 (plus any block of `kind` `routine` or `calendar`) count toward the daily FIRE focus target of 6 hours.

## Data model

Stored objects use a versioned JSON envelope. The schema lives in [lib/schema.ts](lib/schema.ts); construction goes through factories in [lib/factories.ts](lib/factories.ts) so every persisted object has the same shape.

```jsonc
// Task — a todo or a placed block on the timeline
{
  "id": "task-…",
  "schema_version": 1,
  "title": "Deep Work",
  "category": "T0",                 // T0 | T1 | T2
  "kind": "task",                   // task | routine | calendar | sleep
  "status": "pending",              // pending | completed
  "duration_minutes": 90,
  "start_time": "2026-05-05T09:00:00.000Z", // ISO timestamp, or null if unscheduled
  "locked": false,                  // calendar imports are locked
  "source_id": null,                // dedupe key for calendar imports
  "created_at": "2026-05-05T08:55:00.000Z",
  "updated_at": "2026-05-05T08:55:00.000Z"
}

// RoutineTemplate — a reusable block in the right-rail library
{
  "id": "template-…",
  "schema_version": 1,
  "title": "Deep Work",
  "category": "T0",
  "kind": "routine",                // routine | sleep
  "default_duration_minutes": 90,
  "built_in": false,                // true for the structural Sleep template
  "created_at": "…",
  "updated_at": "…"
}
```

## Persistence

Data is local-first: all state lives in `window.localStorage` behind the storage layer in [lib/storage.ts](lib/storage.ts). Each stored value is wrapped in an envelope:

```jsonc
{
  "schema_version": 1,
  "updated_at": "…",
  "data": { /* tasks | templates | preferences */ }
}
```

| Key                            | Contents                                |
| ------------------------------ | --------------------------------------- |
| `lizhi-routine:day:YYYY-MM-DD` | Tasks placed on (or owned by) that day  |
| `lizhi-routine:templates`      | Routine library + the Sleep template    |
| `lizhi-routine:preferences`    | Sleep target and other user preferences |

The day boundary runs 5am–5am; an overnight block started before midnight is owned by the day it began on.

The store ships **with no seed tasks or routine templates** (the Sleep template is the only built-in, and it is structural — the right-rail sleep slider needs it). Add your own via the UI.

## Calendar import

`.ics` upload (file or URL) is parsed in [lib/calendar-import.ts](lib/calendar-import.ts). Imported events are stored as `kind: "calendar"`, `locked: true`, deduped by `source_id`. URL imports go through `fetch` from the browser, so most third-party calendar URLs (Google, Apple, Outlook) will fail CORS — download the `.ics` and use the file picker instead.

## Cloud sync (optional)

When configured, the app syncs every change to a Supabase project so the same account works on every device. **Without env vars, the app keeps running in pure-localStorage mode** — the sign-in button just doesn't show.

### One-time setup

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **Project Settings → API** and copy the **Project URL** and **anon public** key.
3. Copy `.env.local.example` to `.env.local` and paste the values:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
   ```
4. Open the project's **SQL Editor**, paste the contents of [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql), and run it. This creates the `user_state` and `day_tasks` tables with row-level-security policies that key on `auth.uid()`.
5. (Dev only) Open **Authentication → Providers → Email** and toggle **Confirm email** off so sign-ups land directly in a session. Re-enable before any public deploy.

### How sync works

- **Auth**: email + password through `@supabase/supabase-js`. Sign-in/up dialog opens from the topbar.
- **First sign-up**: existing local data is pushed to the cloud as starter content.
- **Subsequent sign-ins**: the cloud overwrites local. Theme + pane widths are preserved.
- **While signed in**: every `saveDay` / `saveTodos` / `saveTemplates` etc. writes localStorage synchronously and fires an async upsert to Supabase. Last-write-wins by `updated_at`.
- **Sign-out**: cloud writer detaches and the app's local state is wiped (theme + pane widths preserved).

The cloud schema is two JSONB-blob tables that round-trip the existing localStorage envelope shapes — no per-field SQL queries — see [lib/cloud-sync.ts](lib/cloud-sync.ts).

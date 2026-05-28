# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev         # Next.js dev server on http://localhost:3000
npm run build       # Production build
npm run preview     # Serve the production build (next start)
npm run typecheck   # tsc --noEmit (strict mode)
npm run lint        # ESLint (eslint-config-next core-web-vitals)
```

Lint or typecheck a single file:
```bash
npx tsc --noEmit
npx eslint path/to/file.tsx
```

There is **no test suite** — no Vitest/Jest/Playwright. Verify changes by typecheck + lint + manually exercising the planner.

The Chrome extension under `extension/` builds with its own toolchain — see `extension/README.md`. Its `node_modules/` is local to that directory.

## Big picture

Lizhi Routine is a single-screen day planner. State is **local-first in `window.localStorage`**, with optional cloud sync to Supabase. Everything else (Gmail integration, AI parsing, sleep import, Chrome extension capture) layers on top of that core.

### The 5am–5am day window

The timeline runs from `DAY_START_HOUR = 5` to 5am the next day (`lib/time.ts`). A "day" therefore contains the late-night hours that conventionally belong to the previous calendar date. `ownerDateKey()` and `visibleRange()` handle cross-midnight attribution — an overnight block started at 23:00 belongs to the day it began on, but renders as two clipped slices on consecutive day timelines.

When working on anything that touches start/end times, **never assume midnight is the day boundary**. Use the helpers in `lib/time.ts`.

### Local storage envelope pattern

All persisted JSON in localStorage is wrapped in a `schema_version` envelope (`lib/schema.ts` → `Envelope<T>`). Read/write helpers live in `lib/storage.ts`:

| Key | Contents |
|---|---|
| `lizhi-routine:day:YYYY-MM-DD` | Placed tasks for that day (kind = task / routine / calendar / sleep) |
| `lizhi-routine:templates` | Routine library (right-rail Templates panel) |
| `lizhi-routine:todos` | Inbox todos (unscheduled, global) |
| `lizhi-routine:todo-lists` | Todo list categories |
| `lizhi-routine:periods` | Periods (long-running phases like work/internship/holiday) |
| `lizhi-routine:events` | One-off appointments — separate from todos (`EventItem` entity) |
| `lizhi-routine:sleep-records` | Imported sleep sessions from Apple Health / HAE |
| `lizhi-routine:preferences` | sleep_target_minutes, auto_hide_completed_days |

Each `loadX` migrates legacy shapes via per-entity `migrateX` validators (`lib/storage.ts`). Schema validators silently drop malformed rows — when adding fields, ensure migration keeps old data loadable.

`PRESERVED_LOCAL_KEYS` survives `clearAllLocalState()`: theme, pane widths, sort/hide-done preferences, **and `lizhi-routine:last-synced-user-id`** (without that, the sync-conflict dialog re-pops on every refresh).

### Cloud sync (`lib/cloud-sync.ts`)

Two Supabase tables hold everything as JSONB blobs that round-trip the localStorage envelope shapes:
- `user_state` (single row per user) — `templates`, `todos`, `todo_lists`, `periods`, `events`, `sleep_records`, `preferences`
- `day_tasks` (one row per `(user_id, date_key)`) — placed tasks for that day

On sign-in: empty + empty = noop; empty + local = push; cloud + empty = pull; cloud + local = **conflict dialog** (user picks side). `setCloudWriter()` then attaches a hook so every subsequent `saveX` fires a fire-and-forget upsert.

When adding a new persisted entity, you must update **four places**: schema type → migration SQL → `lib/storage.ts` (load/save/writeLocal/migrate + add to `localHasUserData` + extend `CloudWriter`) → `lib/cloud-sync.ts` (UserStateRow + `makeCloudWriter` writer + `pushLocalToCloud` push + `applyCloudSnapshotLocally` pull + conflict counter).

### The "god component" (`components/routine-planner.tsx`, ~6500 LOC)

This is **the** planner — TopBar, LeftRail (5 tabs: Calendar / Reminders / Events / Periods / Agent), Center timeline (day/week/month/stats), RightRail (templates + sleep control), drag/drop machinery, all editors. State lives at the root as `useState`; there's no reducer, no global store.

Patterns to know:
- **Drag/drop** = `@dnd-kit/core` with `PointerSensor` (no `KeyboardSensor`). Custom collision detection in `timelineCollisionDetection` (pointerWithin → rectIntersection fallback). Cross-day Safari drag broke before because the outer wrapper lost `touch-none` — keep `canDrag && "touch-none select-none"` on draggable wrappers.
- **Tabs are horizontal segmented controls** (`RailTab` component), not a vertical rail.
- **Calendar tab has a draggable row divider** between todos and upcoming events — height persisted in localStorage.
- **`dataRevision` counter** is used to invalidate `getTasksForDate` memos; bumping it forces week/month views to re-read.
- **Synthetic VisibleTasks**: events and imported sleep records are projected into the timeline as synthetic `Task` objects via `eventToSyntheticTask` / `sleepRecordToSyntheticTask` in `components/planner/helpers.ts`. They get id prefixes (`event:` / `sleep-record:`), `locked: true`, and `displayIsEvent` / `displayIsActualSleep` flags so the renderer can branch.
- **Sleep "replace" semantics**: when an imported sleep record overlaps a planned sleep block, the planned one is filtered out by `visibleTasksForDate` and the actual one renders as a normal sleep block. Same-night overlap = absolute-time window overlap. Afternoon naps don't replace night sleep.

When tempted to add a new tab or panel, prefer extracting into `components/planner/*Panel.tsx` (existing examples: `EventsPanel`, `PeriodsPanel`, `AgentPanel`, `SleepImportPanel`). Mount in routine-planner.tsx's LeftRail switch.

### Tasks vs. Events vs. Todos (the type split, #43)

The three entities serve different purposes and **must not be conflated**:

- **`TodoItem`** (`lib/schema.ts`) — something to work on. Has list, due date, AI estimate, context docs. Doesn't pin to a clock time. Lives in `todos` storage.
- **`EventItem`** — fixed-time appointment you attend. Has `starts_at`, `duration_minutes`, `event_type` (medical / work / academic / social / personal / general), `duration_uncertain`. Lives in `events` storage.
- **`Task`** — what actually sits on a day's timeline. Can be a placed todo (`kind: "task"`), a routine library block (`kind: "routine"`), an ICS-imported calendar event (`kind: "calendar"`), or sleep (`kind: "sleep"`). Lives in `day:YYYY-MM-DD` storage.

The AI parsers (`/api/parse-todos`, Gmail email parser) classify items as task vs event with explicit `kind` in their output schema. Defensively demote `kind=event → task` when due date/time is missing (parser sometimes hallucinates).

### Categories and routine palettes

`Category` is `T0 | T1 | T2`. `TodoListColor` is the 6-color palette. `categoryTokens` / `todoListColorTokens` / `routineColorTokens` / `periodColorTokens` in `lib/colors.ts` are the **single source of truth** for borders/fills/text. Never hard-code Tailwind color classes — always go through these.

CSS variables like `--block-sleep`, `--block-event`, `--block-cal`, `--block-rout` in `app/globals.css` define the synthetic-block palettes for light + dark mode. Add new ones there before referencing them.

## API routes (`app/api/*`)

| Route | Purpose |
|---|---|
| `parse-todos` | One-shot Kimi parse of paste text → task/event candidates (session auth) |
| `estimate-todo` | AI duration estimate for a single todo (session auth — extension variant lives separately) |
| `commute-estimate` | Mapbox call, server-side, with quota tracking in Supabase |
| `import-calendar` | ICS parsing endpoint |
| `gmail/auth/*` | Google OAuth start/callback for Gmail integration |
| `gmail/scan/{plan,run,finalize}` | Three-phase scan: discover message IDs → batch through Kimi → write back account state |
| `gmail/suggestions` + `/[id]` + `/dismiss-all` | CRUD on email→todo suggestion cards |
| `extension/{tokens,todos,create-todo,attach-context,estimate-todo}` | Bearer-token API for the Chrome extension |
| `health/sleep` | Bearer-token POST endpoint for Apple Health imports (Health Auto Export) |

**Auth split**: most routes use session cookies (`getServerUser()`). The `extension/*` and `health/sleep` routes use **bearer tokens** validated by `lib/server/extension-auth.ts` — the token table is `api_tokens` (`SECURITY DEFINER` RPC `lookup_api_token`). The bearer routes then use `createServiceClient()` (`SUPABASE_SERVICE_ROLE_KEY`) to bypass RLS.

**Mutating routes are same-origin guarded** via `isSameOrigin()` (`lib/server/http.ts`) — CSRF defense. Bearer routes are exempt because they're called from non-browser clients.

## Gmail integration

OAuth tokens are AES-256-GCM encrypted at rest using `GMAIL_TOKEN_ENCRYPTION_KEY`. The scan flow is **three-phase plan/run/finalize** so a Vercel serverless timeout doesn't kill a long scan mid-flight:
1. **plan** — fetch message IDs Gmail says are unscanned, return them + a chunk limit
2. **run** — client posts back N messages at a time; server fetches bodies + asks Kimi to extract suggestions
3. **finalize** — update the account's `historyId` bookmark

Server-side logging on scan failure includes the failing batch's message IDs and subjects (`lib/server/gmail-scan.ts`). Client logs every per-chunk failure to `console.error` (`AgentPanel.tsx → scanAccount`) so devtools triage is fast.

## Agent panel (`components/planner/AgentPanel.tsx`)

Unified inbox + composer. Auto-scans Gmail every 5 min while the tab is open (`AUTO_SCAN_STALENESS_MS`) AND on focus/visibilitychange. Three concepts:

- **Email cards** — Gmail suggestions. Either actionable (with [Add]/[Dismiss]) or informational (FYI summary card with [Mark read]).
- **Paste messages** — user pastes text → `/api/parse-todos` → one card with N suggestion sub-cards. Persisted to localStorage (`lizhi-routine:agent-paste-history`, capped 50).
- **Filter chips** — All / Actions / FYI / You.

The composer is **not a chat**. There's no LLM loop, no tools, no memory. Text in → parsed candidates out. Don't conflate it with an agentic assistant.

## Sleep import (`/api/health/sleep`)

iOS app **Health Auto Export** POSTs to this endpoint hourly. Body is HAE's `data.metrics[]` shape or a simple `{ records: [{ started_at, ended_at, source }] }`. Records are dedup'd by `source_uid = "${source}|${started_at}"` so re-imports update in place.

HAE emits **one row per sleep phase** (核心 / 在床上 / 深度 / 快速动眼期 / 清醒), not one per night. Apple Watch doesn't emit InBed at all, only phases. Parser strategy: extract every row's (start, end, source), sort by start, greedy-merge tuples with gap < 60 min into sessions. Each session = one SleepRecord. This dedupes overlapping trackers automatically.

Dates come in zh-CN locale shape like `"2026-05-22 +1000 上午1:20:09 +1000"` — `toIso()` has a custom parser for that, plus en-US AM/PM, plus ISO.

When the parser fails or returns 0 records, the route currently dumps the raw payload to `tmp/hae-payload-<ts>.json` for debugging. Remove once stable.

## Supabase migrations

Numbered SQL files in `supabase/migrations/`. Apply manually via the Supabase SQL editor — there is no automated runner. When adding a new column on `user_state`, the app must tolerate it being null/missing for old rows (see how `events` and `sleep_records` columns are added — defaulted to `'[]'::jsonb`).

## Things to avoid

- **Don't hard-code Tailwind colors.** Go through `lib/colors.ts`.
- **Don't assume midnight is the day boundary.** Use `ownerDateKey` / `visibleRange` / `wallTimeToTimelineMinutes`.
- **Don't add a new persisted entity** without wiring it through schema → storage → cloud-sync → conflict dialog counter. Half-wired entities silently drop data on cloud pulls.
- **Don't put logs / debug dumps under a path that could be checked in.** `tmp/` is gitignored — use it.
- **Don't echo back secrets** (tokens, service-role keys) when they appear in chat. Tell the user to rotate them.
- **Don't `setCloudWriter` outside `lib/cloud-sync.ts`.** The hook is fragile — one extra registration loops writes.
- **Don't break the typecheck.** `next.config.ts` no longer has `ignoreBuildErrors: true`. CI relies on `tsc --noEmit` passing.

## Tailscale dev origin

`next.config.ts → allowedDevOrigins` includes the user's Tailscale Funnel hostname so iOS apps (Health Auto Export) can POST in over public HTTPS during dev. Without this, Next 15+ blocks cross-origin dev-resource requests. If switching machines, update the hostname there or HMR breaks for the new origin.

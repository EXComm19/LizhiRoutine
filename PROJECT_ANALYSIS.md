# Lizhi Routine — Project Analysis

_Analysis date: 2026-05-05_

## 1. Aim

A web-only MVP for **time-blocking and energy management on a daily routine**, branded around a "FIRE" focus metric (the in-app target is 6 hours/day of T0/T1/routine/calendar work; the README pitches it as FIRE-oriented in the Financial-Independence-Retire-Early sense, though that connection is not enforced anywhere in the code — the metric is simply hours of high-value focus per day).

Concretely the app lets a single user:

1. Capture todos with priority tier `T0`/`T1`/`T2` and an estimated duration.
2. Drag those todos, plus reusable "routine" templates (Deep Work, Fitness, Active Learning, Meal Prep, Sleep), onto a vertical day timeline that snaps to 30 min.
3. Browse the same data in **day / week / month** views.
4. **Import .ics calendars** (file upload or URL fetch) as locked events.
5. Set a **sleep target** and watch a daily **FIRE Progress** bar (focus minutes ÷ 360).
6. Keep everything **local-first** in `localStorage`, keyed per day.

## 2. Stack

| Layer        | Choice                                                                                |
| ------------ | ------------------------------------------------------------------------------------- |
| Framework    | Next.js (App Router, RSC) — `latest`                                                  |
| UI           | React `latest`, Tailwind CSS v4 (`@tailwindcss/postcss`)                              |
| Components   | shadcn-style minimal kit (only `button`, `progress`); Radix `Slot`; `cva` + `clsx` + `tailwind-merge` |
| Drag & drop  | `@dnd-kit/core` (PointerSensor, custom collision detection)                           |
| Icons        | `lucide-react`                                                                        |
| Persistence  | `window.localStorage`, one key per date plus one for templates                        |
| Calendar     | Hand-rolled .ics parser in [lib/calendar-import.ts](lib/calendar-import.ts) (DAILY/WEEKLY RRULE, EXDATE, DURATION) |
| Tooling      | TypeScript strict mode, ESLint (`eslint-config-next`), Turbopack-built                |
| Dangling     | `.env.example` references Supabase, empty `supabase/` directory — **no Supabase code anywhere in `app/`, `components/`, or `lib/`** |

## 3. Strengths

- **Single, opinionated screen.** The product is one tri-pane planner ([components/routine-planner.tsx](components/routine-planner.tsx)) that does exactly what the README claims. No dead routes.
- **Sound time math.** [lib/time.ts](lib/time.ts) defines a 5am–5am-next-day window, snap-to-30, pixel/minute conversion, and cross-midnight `visibleRange`/`ownerDateKey` logic that correctly attributes overnight blocks (e.g. sleep started at 23:00) to the right "owner" day.
- **Reasonable .ics parser** without bringing in `ical.js`. Handles line unfolding, EXDATE, BYDAY, DURATION, COUNT/UNTIL, UTC suffixes, and falls back gracefully for unsupported FREQ.
- **Drag UX is thoughtful.** Custom `timelineCollisionDetection` (`pointerWithin` → `rectIntersection` fallback), top/bottom resize handles ([routine-planner.tsx:826](components/routine-planner.tsx:826)), week-view multi-day drop based on x-offset, drag overlay preview.
- **SSR-safe storage** in `readDay`/`readTemplates` (`typeof window === "undefined"` guard).
- **Type-driven shape.** `Task`, `RoutineTemplate`, `DragPayload`, and the `BlockKind` union are tight ([lib/types.ts](lib/types.ts)).
- **Visual coherence.** Single `categoryStyles` record drives every chip/border/background per tier.

## 4. Weaknesses

### 4.1 Architecture & code structure

- **2,452-line god component.** [components/routine-planner.tsx](components/routine-planner.tsx) holds `RoutinePlanner`, `TopBar`, `ViewSwitcher`, `LeftRail`, `SectionHeader`, `NavItem`, `CalendarImportPanel`, `ReminderEditor`, `ReminderCard`, `DragOverlayCard`, `EmptyState`, `RightRail`, `SectionLabel`, `RoutineTemplateEditor`, `RoutineIcon`, `RoutineTemplateCard`, `SleepControl`, `Timeline`, `TimelineGrid`, `TimeGrid`, `WeekView`, `MonthView`, `PlacedTask`, plus all helpers. ~20 components in one file. It should be split into `components/planner/{layout,timeline,reminders,templates,calendar-import}/…`.
- **No state library, no reducer.** All state and ~15 callbacks live as `useState`/`useCallback` on the root, threaded through 4–5 levels of props. Adding any feature means editing the root and several leaves.
- **`dataRevision` counter hack.** [routine-planner.tsx:309](components/routine-planner.tsx:309) bumps a number to invalidate `getTasksForDate` for non-current dates. The fallback path (`readDay`) then **reads `localStorage` and `JSON.parse`s synchronously during render** for every cell of the week (8 reads) and month (43 reads) views on every revision. Should be a `Map<dateKey, Task[]>` cache hydrated on view change.
- **`writeDay` is not SSR-guarded** while `readDay` is — asymmetric, would crash if ever called server-side.

### 4.2 Build & dependency hygiene

- **`"latest"` for every dependency** in [package.json](package.json). No lockfile-pinned major versions; reinstalls a year from now will pull React 20+/Next 17+/Tailwind 5 and silently break the build.
- **`typescript.ignoreBuildErrors: true`** in [next.config.ts](next.config.ts:5). Defeats the value of `strict: true`. Type errors ship.
- **`experimental: { cpus: 1, workerThreads: true }`** in `next.config.ts` — looks like a leftover workaround for a low-memory dev box, not a feature.
- **Not under git.** No `.git/`, no `.gitignore`. Build artefacts (`.next/`, `tsconfig.tsbuildinfo`, `next-dev.{out,err}.log`, `next-start.{out,err}.log`, `.npm-cache/`) sit beside source.
- **Empty Supabase scaffolding.** `supabase/` directory is empty and `.env.example` lists `NEXT_PUBLIC_SUPABASE_*` vars that are read **nowhere** in the source. Either implement sync or delete the dangling intent — it currently misleads any new contributor reading the README's "local-first" note next to a `supabase/` folder.

### 4.3 Data model & persistence

- **Todos are scoped to a date.** Inbox todos (`kind === "task"`, `start_time === null`) are stored in the **selected day's** `localStorage` key ([routine-planner.tsx:552](components/routine-planner.tsx:552), `addInboxTask` writes to `selectedDate`). Switch days and your unscheduled todos disappear from view because they live on a different day's key. They're not lost, just invisible — but this is almost certainly not the user's mental model.
- **No timezone awareness.** Everything uses `new Date(...)` and `Date.toISOString()` interchangeably. Floating-time .ics events are stored as if they were the importer's local clock; a UTC `Z` event is converted with `Date.UTC` correctly, but a user travelling time zones will see drift.
- **No migration / schema version.** A future change to `Task` fields will silently corrupt old `localStorage`.
- **Sleep template auto-resurrects.** [routine-planner.tsx:278](components/routine-planner.tsx:278) re-appends the default sleep template if the saved templates list lacks one. If a user *edits* their sleep template to something else, the original gets re-injected on next load — duplicates accumulate.

### 4.4 Calendar import

- **Browser `fetch` of an .ics URL will hit CORS** for Google/Apple/Outlook public links almost every time. The handler ([routine-planner.tsx:1310](components/routine-planner.tsx:1310)) catches the failure and tells the user to download the file manually, which makes the "Link" button mostly cosmetic. Needs a server-side proxy route (`/api/ics?url=…`) to be useful.
- **Each imported event triggers its own `updateTasksForDay`** ([routine-planner.tsx:617](components/routine-planner.tsx:617)) — i.e. one re-render per day-bucket. Fine for a calendar with a handful of recurrences, but on a daily standup over 6 months it's hundreds of state updates.
- **EXDATE matched by `toISOString()`** of a floating-time `Date`. Works in the common case, but DST transitions can shift the local clock by an hour and a recurrence that *should* be excluded slips through.
- **Only DAILY and WEEKLY RRULE.** MONTHLY/YEARLY events fall back to single-occurrence — silently incomplete for many real calendars.

### 4.5 Logic / correctness smells

- **FIRE progress double-counts.** [routine-planner.tsx:417](components/routine-planner.tsx:417):
  ```
  task.kind === "calendar" || task.kind === "routine" || task.category === "T0" || task.category === "T1"
  ```
  A routine block with category `T2` (e.g. "Meal Prep") still counts toward FIRE focus. Either intended (any routine = focus) or a bug — but unstated.
- **Reset behaviour is opaque.** `resetDay` keeps locked items + unschedules todos but **deletes routines and sleep blocks outright** ([routine-planner.tsx:689](components/routine-planner.tsx:689)). The button just says "Reset" with a 3-second arming window; the user has no way to know what survives.
- **Cross-midnight resize from the top edge** can move a block into the previous day mid-drag and re-render with the wrong storage key during the unmount; the persist-on-`pointerup` path papers over it but mid-drag state is briefly inconsistent.

### 4.6 UX gaps

- **T0/T1/T2 are unlabelled.** No legend, no tooltip explaining what the tiers mean. A first-time user can't guess.
- **No keyboard accessibility.** dnd-kit is configured with `PointerSensor` only — no `KeyboardSensor`, so the entire planner is mouse/touch-only.
- **No empty-state for the timeline.** New users see a blank 24-hour grid with no hint to drag a routine onto it.
- **No undo.** Every destructive action (delete block, delete reminder, delete template, reset day) is one-click and final.
- **README script error.** README says `npm run preview -- --port 3000` but the script is `"preview": "next start"`, where `--port` requires `-p`/`--port` after `next start`, not after `--`. Minor but annoying.

### 4.7 Testing & docs

- **Zero tests.** No Vitest/Jest/Playwright setup. The .ics parser, the cross-midnight `visibleRange`, the snap math, and the drop-target calculation are all reasonable candidates for unit tests and have none.
- **README is 25 lines.** Doesn't explain the T0/T1/T2 model, the FIRE metric, the day-window 5am–5am, or that calendar URL imports usually fail due to CORS.

## 5. Points of contention

These are decisions where reasonable contributors will disagree; the project should pick a side and document it.

1. **Local-first vs. cloud sync.** The empty `supabase/` directory and `.env.example` imply intent to sync. Either (a) delete them and commit to local-only, or (b) actually wire Supabase auth + a `tasks` / `templates` schema. Leaving both half-states is the worst option.
2. **Inbox scope.** Are unscheduled todos a per-day list or a global backlog? Current code says per-day; UI implies global ("Today's Input" suggests a single inbox). Pick one.
3. **What counts as FIRE focus?** Tier-based (T0+T1 only), kind-based (routine+calendar), or both? Current OR-of-both is the broadest interpretation and probably inflates the metric.
4. **"FIRE" branding.** The acronym in the FIRE community means Financial Independence; the app's metric is just focus hours. Either rename ("Focus Score", "Deep Work %") or explain the connection in the UI.
5. **Monolithic component vs. split.** Splitting [routine-planner.tsx](components/routine-planner.tsx) is a sizeable refactor that risks breaking closure-heavy callbacks and `useDroppable` ref plumbing. Worth doing, but should be one PR with a clear before/after.

## 6. Code cleanliness

- **Naming:** clear and consistent (`ownerDateKey`, `visibleRange`, `dateForTimelineMinutes`, `seedTasksForDay`).
- **Comments:** essentially none. For code this domain-specific (5am day boundary, snap math, ICS RRULE expansion), a few WHY comments would help — e.g. why DAY_START_HOUR=5, what `ownerDateKey` is solving.
- **Dead code:** `defaultTasks: Task[] = []` ([lib/default-data.ts:3](lib/default-data.ts:3)) is exported and used as a fallback but always empty.
- **Magic numbers:** `FIRE_TARGET_MINUTES = 6 * 60` is named; gutter widths (`72`, `100`, `116`), break heights (`38`), and `16 * 60` max resize live inline.
- **Build artefacts in tree:** `.next/`, `node_modules/`, `tsconfig.tsbuildinfo`, several empty `*.log` files. No `.gitignore` because there's no git repo.
- **Lint/type laxity:** `ignoreBuildErrors: true` plus a `latest`-pinned dep tree means the project is flying without instruments.

Overall: the code that exists is **legible and well-shaped**, but the surrounding discipline (versioning, pinning, testing, type-error gating, documentation) is largely absent.

## 7. Recommendations to better serve the aim

Ordered by leverage. The first five are cheap and unlock everything else.

### Immediate (hours)

1. **`git init` and add `.gitignore`** for `node_modules`, `.next`, `*.log`, `.npm-cache`, `tsconfig.tsbuildinfo`, `.env*` (keep `.env.example`).
2. **Pin dependency versions** in [package.json](package.json). Replace every `"latest"` with the actual installed semver from `package-lock.json`.
3. **Remove `typescript.ignoreBuildErrors: true`** from [next.config.ts](next.config.ts). Fix whatever it was hiding before merging anything else.
4. **Decide on Supabase.** If staying local-first: delete `supabase/` and the Supabase keys from `.env.example`. If syncing: add a thin `lib/sync.ts` and gate it behind an env-var check.
5. **Expand the README** with: T0/T1/T2 meaning, the 5am–5am day window, the FIRE metric definition, the CORS limitation on calendar URL import, and a short "data lives in localStorage, clearing site data wipes it" warning.

### Short-term (a day each)

6. **Split [components/routine-planner.tsx](components/routine-planner.tsx)** into `components/planner/{Planner,TopBar,LeftRail,RightRail,Timeline,WeekView,MonthView,PlacedTask,reminders/*,templates/*,calendar-import/*}.tsx`. Move shared types into `lib/planner-types.ts`. Aim for no file over ~300 lines.
7. **Promote the inbox to a global key.** Store unscheduled todos under `lizhi-routine:inbox` rather than per-day. Per-day storage stays for *scheduled* tasks only. Migration: on first load, sweep all `lizhi-routine:day:*` for `start_time === null && kind === "task"` and union them into the inbox.
8. **Add a server route `app/api/ics/route.ts`** that fetches the user-supplied URL server-side and returns the body, sidestepping CORS. Validate the URL host and length.
9. **Cache `getTasksForDate` properly** — use a `Map<string, Task[]>` invalidated by writes instead of the `dataRevision` counter; eliminate render-time `JSON.parse`.
10. **Tests for the load-bearing pure functions:** `parseIcsCalendar` (DAILY, WEEKLY, BYDAY, EXDATE, UTC vs. floating, COUNT vs. UNTIL), `visibleRange` and `ownerDateKey` for cross-midnight blocks, and the snap math. Vitest is enough.

### Medium-term (a week each)

11. **Decide and document the FIRE metric**, then make the rule explicit (e.g. `task.category === "T0" || task.category === "T1"` only, ignoring `kind`). Show the rule in a tooltip on the progress bar.
12. **Add a `KeyboardSensor`** from `@dnd-kit/core` so todos and templates can be moved with arrow keys + Enter.
13. **Schema-versioned localStorage** with a `__version` field; on bump, run a migration function. Avoids the "I edited the sleep template and now I have two" class of bug.
14. **Light onboarding state** — when `currentTasks` is empty for today, show inline hints on the timeline ("Drag Deep Work here to start your day") instead of a blank grid.
15. **Undo for destructive actions** — a single-level undo stack covering delete-block / delete-reminder / reset-day. Stored in component state; no need to persist.

### Aim-aligned product moves (longer)

16. **Energy management** is in the README's pitch but not in the code. Add a per-block self-rated energy after completion (e.g. low/med/high), persist alongside the task, and let the user see week-over-week patterns of when their T0 energy is highest. This is what would make the app distinctive vs. a generic time-blocker.
17. **A weekly review screen.** Aggregate visible week tasks by category, compare to FIRE target. Currently the week view is a calendar grid; it could double as a retrospective.
18. **Optional cloud sync** (only if you commit to the Supabase direction) — auth + per-user `tasks`/`templates` rows + last-write-wins by `updated_at`. Keep localStorage as the offline cache, not the source of truth.

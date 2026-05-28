# Lizhi Routine iOS Port Plan

This document captures what to watch when porting the current web app into a Swift-based iOS app while keeping the same product behavior and Supabase backend.

## Current Web Architecture

- Frontend: Next.js, React, TypeScript, Tailwind.
- Local state: browser `localStorage`, wrapped by `lib/storage.ts`.
- Cloud sync: Supabase Auth plus two JSONB-backed tables.
- Data contracts: TypeScript types in `lib/schema.ts`, currently `SCHEMA_VERSION = 2`.
- AI todo parsing: Next API route at `app/api/parse-todos/route.ts`, calling Kimi with a server-side API key.
- Calendar import: `.ics` file or URL parsing in `lib/calendar-import.ts`.
- Timeline rule: the day starts at `05:00`; `00:00` to `04:59` belongs visually at the bottom of the same planning day.

## Existing Backend Contract

The mobile app should keep the same Supabase tables unless there is a deliberate backend migration.

### `public.user_state`

One row per user.

- `user_id uuid`
- `schema_version integer`
- `templates jsonb`
- `todos jsonb`
- `todo_lists jsonb`
- `periods jsonb`
- `preferences jsonb`
- `updated_at timestamptz`

### `public.day_tasks`

One row per user and planning date.

- `user_id uuid`
- `date_key text`
- `schema_version integer`
- `data jsonb`, shaped as `{ "tasks": Task[] }`
- `updated_at timestamptz`

Row-level security already keys access by `auth.uid() = user_id`.

## Data Model To Mirror In Swift

Create Swift `Codable`, `Identifiable`, and `Equatable` models matching `lib/schema.ts`.

Core models:

- `Task`
- `RoutineTemplate`
- `TodoList`
- `TodoItem`
- `Preferences`
- `Period`
- `PeriodBreak`
- Envelope types such as `DayDoc`, `TodosDoc`, `TodoListsDoc`, `PeriodsDoc`

Important fields:

- `Task.source_id` connects a placed todo/routine/calendar block back to its original source.
- Routine blocks placed on the timeline should retain `source_id = template.id` for future stats.
- Todo blocks placed on the timeline should retain `source_id = todo.id`.
- Calendar blocks use `kind = "calendar"` and `locked = true`.
- Use the same enum raw values exactly: `T0`, `T1`, `T2`, `task`, `routine`, `calendar`, `sleep`, etc.

## Things To Beware Of

### 1. Time And Date Handling

This is the biggest risk.

- The app is not a normal midnight-to-midnight calendar. It uses a 5am planning boundary.
- A block can visually span midnight while still belonging to the date on which it started.
- Store absolute task `start_time` as ISO timestamps, but calculate UI placement with the same logic as `lib/time.ts`.
- Handle daylight saving time carefully. A fixed pixel height per hour can break on DST transition days if you naively add seconds.
- Use `Calendar`, `DateComponents`, and a user-selected timezone strategy. Do not rely on string slicing for production iOS date math.

### 2. Sync And Conflict Rules

The current web app is local-first with last-write-wins cloud sync.

- Local writes happen immediately, then Supabase upserts run asynchronously.
- On sign-in, cloud data replaces local data if cloud data exists.
- If cloud is empty, local data is pushed up.
- This simple model is okay for one active device, but mobile makes multi-device conflicts much more likely.

Recommended iOS approach:

- Keep a local store first, probably SQLite, SwiftData, or a file-backed JSON document cache.
- Add a sync queue for pending mutations.
- Preserve the current `updated_at` fields.
- Decide whether to keep last-write-wins for v1 or add per-document conflict prompts later.

### 3. Same Backend Does Not Mean Same API Layer

The web app has a Next server route for Kimi parsing. A native app cannot safely call Kimi directly with the API key.

Use one of these:

- Keep the deployed Next API route and let iOS call `/api/parse-todos`.
- Move parsing to a Supabase Edge Function.
- Build a small dedicated backend endpoint.

Do not ship `MOONSHOT_API_KEY` inside the iOS app.

### 4. Supabase Auth On iOS

Use the native Supabase Swift SDK for:

- email/password auth
- session refresh
- sign-out
- reading/writing `user_state`
- reading/writing `day_tasks`

Plan for secure token storage in Keychain. Avoid storing auth sessions in plain files.

### 5. Mobile Timeline Interaction

The current web app depends on pointer precision and drag handles. On iPhone, this needs a different interaction design.

Watch for:

- finger occlusion while dragging blocks
- snapping to 30-minute intervals
- resizing small blocks
- scrolling while dragging
- editing precise start/end times
- one-handed use
- haptic feedback for snap points

Recommended pattern:

- Keep drag-to-schedule.
- Add tap-to-edit as the reliable fallback.
- Use a bottom sheet editor for exact start and end times.
- Consider a magnified time indicator during drag.

### 6. Calendar Import And Native Calendar Access

The web app imports `.ics`. iOS can do more.

Options:

- Continue supporting `.ics` file import through the Files picker.
- Add EventKit access later for native Apple Calendar read-only imports.
- If adding EventKit, clearly separate fixed calendar events from editable Lizhi Routine blocks.
- Be strict with permissions and privacy copy.

### 7. Notifications And Background Sync

iOS background execution is limited.

- Do not assume continuous background sync.
- Use foreground sync on app launch/resume.
- Use push notifications or local notifications for deadlines only if the UX justifies it.
- Widgets and Live Activities should read from local cached state, not depend on instant network reads.

### 8. Visual System Translation

The web design now uses warm cream/dark tokens in `app/globals.css` and color mapping in `lib/colors.ts`.

For SwiftUI:

- Create a shared `Theme` layer with semantic colors: canvas, bg, card, sunken, line, ink, tier colors, sleep color.
- Do not hard-code web Tailwind colors in views.
- Support light/dark mode from the beginning.
- Use Dynamic Type, but clamp timeline labels and block rows so layout does not collapse.

### 9. Schema Versioning

Keep schema migration explicit.

- Mirror `SCHEMA_VERSION`.
- Add Swift migration functions equivalent to `lib/storage.ts`.
- Never silently drop unknown fields from JSONB documents unless the schema migration intentionally does it.
- Write migration tests with archived real user-like JSON.

## Recommended iOS Architecture

### App Layers

1. `Models`
   - Codable structs mirroring `lib/schema.ts`.

2. `LocalStore`
   - Persists envelopes locally.
   - Can start as JSON files, then move to SQLite/SwiftData if needed.

3. `SupabaseSyncService`
   - Auth session handling.
   - Pull/push `user_state`.
   - Pull/push `day_tasks`.
   - Pending mutation queue.

4. `PlannerEngine`
   - Date math.
   - 5am day boundary.
   - visible task generation.
   - overlap/cross-day logic.
   - statistics aggregation.

5. `UI`
   - SwiftUI views.
   - Timeline.
   - Todo lists.
   - Routine library.
   - Period editor.
   - Stats page.

6. `Integrations`
   - `.ics` parser.
   - optional EventKit.
   - AI parser client.

## Suggested Folder Structure

```text
LizhiRoutine-iOS/
  App/
    LizhiRoutineApp.swift
    AppState.swift
  Models/
    Schema.swift
    Envelopes.swift
  Services/
    SupabaseClientFactory.swift
    AuthService.swift
    SyncService.swift
    TodoParserService.swift
    CalendarImportService.swift
  Store/
    LocalStore.swift
    MigrationService.swift
  Planner/
    TimeMath.swift
    VisibleTaskBuilder.swift
    StatisticsEngine.swift
    PeriodEngine.swift
  UI/
    Theme/
    Timeline/
    Todos/
    Routines/
    Periods/
    Stats/
    Editors/
  Tests/
```

## Porting Phases

### Phase 1: Shared Contract Freeze

- Document the current schema as the source of truth.
- Export sample JSON for:
  - `user_state`
  - one `day_tasks` row
  - todos with due dates
  - routines with custom color/icon
  - periods
  - cross-midnight blocks
- Add tests in the web repo for time math and stats before porting.

### Phase 2: Native Data And Sync Prototype

- Build Swift models from `lib/schema.ts`.
- Implement local JSON persistence.
- Implement Supabase login/logout.
- Pull `user_state` and `day_tasks`.
- Push a small mutation back to Supabase.
- Verify web and iOS can round-trip the same user without data loss.

### Phase 3: Planner Engine

- Port `lib/time.ts` behavior.
- Port period activation logic from `lib/period.ts`.
- Port visible task generation rules from `components/routine-planner.tsx` into a pure Swift planner service.
- Add unit tests for:
  - 5am boundary
  - midnight-spanning blocks
  - 30-minute drag snapping
  - exact start/end display
  - deadline display
  - stats grouped by `source_id`

### Phase 4: Core iPhone UI

- Build the app around mobile-native navigation, not a literal 3-column clone.
- Suggested tabs:
  - Today
  - Todos
  - Routines
  - Stats
  - Settings
- Today view should combine timeline + quick access to unscheduled todos/routines.
- Editors should be bottom sheets or centered modals depending on device size.

### Phase 5: Interactions

- Add drag from todo/routine into timeline.
- Add block movement and resize.
- Add exact edit sheet for title, tier, source, start/end, duration, color/icon where relevant.
- Add haptics on snap.
- Add undo for destructive delete and reset actions.

### Phase 6: Integrations

- Add `.ics` file import.
- Add AI todo parsing through a secure backend endpoint.
- Consider EventKit after the local planner is stable.
- Add notifications only after deadline logic is proven reliable.

### Phase 7: Production Hardening

- Offline queue and retry.
- Account deletion/export.
- Crash reporting.
- Privacy policy.
- App Store permission copy.
- Accessibility audit.
- Real-device performance testing on older iPhones.

## Backend Migration Considerations

The existing JSONB blob backend is very convenient for parity. Keep it for the first iOS version.

Move to normalized SQL tables only if you need:

- server-side analytics
- sharing/collaboration
- partial sync at large scale
- advanced querying across todos/tasks/routines
- audit history

If normalizing later, migrate gradually:

1. Keep JSONB as the canonical store.
2. Add normalized read models.
3. Backfill from JSONB.
4. Write both.
5. Switch clients.
6. Retire JSONB only after all clients are updated.

## Minimum Viable iOS Scope

For the first useful mobile version:

- Supabase sign-in.
- Pull existing routines, todos, periods, preferences, and day tasks.
- Today timeline from 5am to 5am.
- Todo list with due dates and completion.
- Routine library.
- Drag or tap-to-schedule routines and todos.
- Edit blocks with exact start/end time.
- Stats page using `source_id`.
- Push changes back to Supabase.

Defer:

- native calendar sync
- widgets
- notifications
- complex offline conflict UI
- iPad multi-column polish
- Apple Watch

## Acceptance Criteria For Parity

- A user can sign in on web, create todos/routines/periods, then see them on iOS.
- A user can schedule a todo multiple times on iOS, then see those placed blocks on web.
- Routine statistics group by original routine template.
- Todo statistics group by original todo item.
- Due dates show consistently across web and iOS.
- Cross-midnight blocks render correctly.
- Calendar-imported blocks remain locked.
- Dark mode preserves contrast in all selected states.

## Open Decisions

- Whether iOS should keep local JSON files or use SwiftData/SQLite immediately.
- Whether to keep the current last-write-wins sync model for v1.
- Whether the AI parser endpoint should remain in Next.js or move to Supabase Edge Functions.
- Whether native calendar access is required for the first mobile release.
- Whether iPad should use a three-column layout while iPhone uses tabs/sheets.

# iOS MVP Feature Specification

This is the first useful iOS release. It should prioritize parity of core behavior over every web feature.

## Required MVP Features

### 1. Authentication

- Sign in with the same Supabase project as the web app.
- Use secure session storage, preferably Keychain-backed through the Supabase Swift SDK.
- Support sign out.

### 2. Today Timeline

- Show a vertical timeline from `05:00` to `05:00` next day.
- Use 24-hour time internally and visually unless a later design decision changes it.
- Render placed blocks for the selected date.
- Render cross-midnight blocks in the same planning day.
- Render current-time line when selected date is today.
- Show period background bands when active.
- Show deadlines in a way that does not block block titles.

### 3. Todos

- Todos do not require scheduled time at creation.
- Todos can have:
  - title,
  - tier,
  - list/sublist,
  - due date,
  - optional due time,
  - tags,
  - completion status.
- A todo can be scheduled multiple times into multiple timeline blocks.
- Completion is controlled from the todo list, not timeline blocks.
- Deadline display:
  - if due within one week, show relative text like `in 3 days at 23:55`,
  - if due today, show red urgent styling,
  - further deadlines are warmer/yellower and less urgent.

### 4. Todo Lists / Sublists

- Built-in `Inbox`.
- User-created lists with colors.
- List color should drive todo chips and todo timeline blocks.
- Lists can collapse/expand.
- Sort todos by due date.

### 5. Routine Library

- Create, edit, delete routine templates.
- Each routine has:
  - title,
  - tier,
  - default duration,
  - color,
  - icon,
  - kind.
- Drag or tap routines into the timeline.
- Placed routine blocks must retain `source_id = routineTemplate.id`.
- Existing web app uses a built-in Sleep template. The iOS MVP can keep it as a special routine block until a later health/sleep-specific feature is built.

### 6. Timeline Block Editing

- Double tap or tap an edit action to open an editor.
- Edit:
  - title,
  - tier,
  - start time,
  - end time,
  - duration,
  - source relationship where applicable.
- Exact start/end times can be saved to the minute.
- Dragging/resizing can snap to 30 minutes for ease.

### 7. Calendar Events

- Imported calendar events appear as locked fixed blocks.
- They cannot be moved or resized.
- They should be visually distinct and should not show an unnecessary lock icon.

### 8. Periods

- Periods represent date ranges such as internship, placement, study, holiday.
- Period fields:
  - title,
  - kind,
  - color,
  - start/end date,
  - optional daily start/end time,
  - weekdays,
  - breaks,
  - notes.
- On day/week timeline, periods show as background availability/context.
- In month view, periods show as ribbons on top, not redundant blocks in each cell.

### 9. Stats

- Group routine time by original routine template.
- Group todo time by original todo item.
- Support preset ranges:
  - Today,
  - Week,
  - Month,
  - Custom start/end.
- Totals should be calculated from scheduled timeline blocks, not from todo due dates.

### 10. Settings

- Account/session controls.
- Import calendar `.ics`.
- Manage todo lists/sub-lists.
- Future toggles for native iOS Reminders, Apple Calendar, notifications.

## Defer From First MVP

- Native iOS Reminders two-way sync.
- Apple Calendar/EventKit live sync.
- Widgets and Live Activities.
- Push notifications.
- Complex multi-device conflict UI.
- iPad three-pane polish.
- Apple Watch.

These should be designed for, but not required to ship the first MVP.


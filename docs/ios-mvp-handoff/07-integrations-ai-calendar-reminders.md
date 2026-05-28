# Integrations: AI, Calendar, And iOS Reminders

## AI Todo Import

The web app uses Kimi/Moonshot through a server-side Next API route:

- Route: `app/api/parse-todos/route.ts`
- Default base URL: `https://api.moonshot.cn/v1`
- Default model: `kimi-k2.6`
- API key env var: `MOONSHOT_API_KEY`
- Model env var: `KIMI_TODO_PARSER_MODEL`

The parser returns:

```ts
{
  todos: [
    {
      title: string;
      listName: string;
      category: "T0" | "T1" | "T2";
      dueDate: "YYYY-MM-DD" | null;
      dueTime: "HH:MM" | null;
      tags: string[];
    }
  ],
  warnings: string[];
}
```

## AI Rule For iOS

Never ship `MOONSHOT_API_KEY` inside the iOS app.

Use one of:

1. Keep a deployed Next API endpoint and call it from iOS.
2. Move parser logic to Supabase Edge Functions.
3. Add a small backend endpoint dedicated to mobile parsing.

Recommended MVP path: call the same deployed web backend endpoint, then move to Edge Functions later if the web app is not always deployed.

## Calendar Import

Current web behavior:

- Import `.ics` by file.
- Import `.ics` by URL through server route.
- Convert imported events into locked timeline tasks.
- Store fixed blocks as `kind = "calendar"` and `locked = true`.
- Deduplicate by `source_id`.

iOS MVP:

- Support `.ics` file import through the Files picker if feasible.
- URL import can call the existing server route.
- Do not require native Apple Calendar sync for the first MVP.

## Native Apple Calendar Later

Native Calendar access should use EventKit and must be clearly permissioned.

Recommended policy:

- Calendar imports are read-only fixed blocks.
- They do not become editable Lizhi Routine blocks.
- Imported Apple Calendar events should keep an external identifier for dedupe.
- User should choose which calendars to display/import.

## iOS Reminders Sync

It is possible, but it requires a native iOS app. A web/PWA cannot directly sync with iOS Reminders.

Use EventKit Reminders:

- Request reminder access.
- Fetch reminders from selected reminder lists.
- Map iOS Reminder lists to Lizhi todo lists.
- Sync completion status, title, due date, due time, and notes.

Recommended for after MVP because two-way sync has conflict and dedupe complexity.

## iOS Reminders Mapping

| Lizhi | iOS Reminders |
| --- | --- |
| `TodoItem.title` | `EKReminder.title` |
| `TodoItem.status` | `EKReminder.isCompleted` |
| `TodoItem.due_date` + `due_time` | `EKReminder.dueDateComponents` |
| `TodoItem.list_id` | `EKCalendar` reminder list |
| `TodoItem.tags` | notes text or embedded metadata |
| `TodoItem.id` | embedded hidden metadata in notes |

Suggested hidden notes marker:

```text
[LizhiRoutine:id=todo-xxxx]
```

## Reminder Sync Risk

Watch for:

- user denying permission,
- user editing the same reminder in Apple Reminders and Lizhi,
- duplicate reminders after reinstall,
- `calendarItemIdentifier` changes,
- iCloud propagation delays,
- recurring reminders,
- reminders without due dates,
- privacy expectations.

Recommended first implementation:

- User explicitly enables Reminders sync in Settings.
- User chooses which iOS Reminder list maps to which Lizhi list.
- Start with one-way import or one-way export.
- Add two-way sync only after dedupe is reliable.


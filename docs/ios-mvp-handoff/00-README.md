# Lizhi Routine iOS MVP Handoff

This folder is a self-contained handoff pack for starting the Swift/iOS version of Lizhi Routine. It describes the current web product, the required aesthetic, the data contract, the iOS-specific UX changes, and the first MVP build plan.

Use this folder as the first context bundle in the next chat. If context is limited, paste files in this order:

1. `NEXT_CHAT_PROMPT.md`
2. `01-product-and-principles.md`
3. `03-design-system-and-aesthetic.md`
4. `04-feature-spec-ios-mvp.md`
5. `05-ui-ux-porting-guide.md`
6. `06-data-backend-sync-contract.md`
7. `08-ios-architecture-build-plan.md`
8. `10-mvp-checklist-and-acceptance-tests.md`

The remaining files add implementation context:

- `02-web-app-current-state.md`: current web architecture and source files.
- `07-integrations-ai-calendar-reminders.md`: Kimi AI parsing, calendar import, and future iOS Reminders sync.
- `09-wireframes-and-flows.md`: text/mermaid visual references for the iOS MVP.
- `sample-data.json`: example JSON shapes that should round-trip through Supabase and Swift models.

The sample timestamps are ISO UTC values. They are intended to be interpreted in the device timezone at render time, matching how the web app stores JavaScript `Date.toISOString()` values.

## Product In One Sentence

Lizhi Routine is a calm, editorial time-blocking app that turns todos, reusable routines, fixed calendar events, periods, and sleep into a 5am-to-5am planning timeline, while preserving links back to the original todo or routine so future statistics can answer where time actually went.

## Non-Negotiables For The iOS Port

- Keep the 5am-to-5am planning day.
- Keep todos reusable: one todo can be allocated into many timeline blocks.
- Keep routine blocks linked to their original routine template via `source_id`.
- Keep todo blocks linked to their original todo via `source_id`.
- Keep fixed calendar imports locked and visually distinct.
- Keep editable exact start/end times; drag/resize may snap, but saved block times can be exact minutes.
- Keep the warm cream editorial design direction, not generic iOS blue productivity styling.
- Keep Supabase as the shared backend and avoid shipping server API keys inside the iOS app.

## What Should Change On iOS

- Do not clone the desktop three-pane layout on iPhone.
- Use mobile-native navigation: Today, Todos, Routines, Stats, Settings.
- Use bottom sheets or centered modal cards for editing.
- Provide tap-to-schedule and exact-time editing as reliable alternatives to drag.
- Add haptics during drag snapping/resizing.
- Treat iOS Reminders, native Calendar, widgets, and notifications as integrations, not core MVP blockers.

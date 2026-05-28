# Prompt For The Next Chat

You are helping me build the first SwiftUI iOS MVP of Lizhi Routine.

Please read these files first, in order:

1. `docs/ios-mvp-handoff/00-README.md`
2. `docs/ios-mvp-handoff/01-product-and-principles.md`
3. `docs/ios-mvp-handoff/03-design-system-and-aesthetic.md`
4. `docs/ios-mvp-handoff/04-feature-spec-ios-mvp.md`
5. `docs/ios-mvp-handoff/05-ui-ux-porting-guide.md`
6. `docs/ios-mvp-handoff/06-data-backend-sync-contract.md`
7. `docs/ios-mvp-handoff/08-ios-architecture-build-plan.md`
8. `docs/ios-mvp-handoff/10-mvp-checklist-and-acceptance-tests.md`

Then build the first MVP in SwiftUI.

Important product constraints:

- The app is a calm editorial time-blocking planner, not a generic blue calendar app.
- The planning day is `05:00` to `05:00` next day.
- Todos do not require scheduled time at creation.
- A todo can be allocated to many timeline blocks.
- Routine blocks and todo blocks must retain `source_id` linking back to the original routine template or todo item.
- Stats must summarize scheduled timeline blocks by their source.
- Use the same Supabase backend contract as the web app.
- Do not put Kimi/Moonshot API keys into the iOS client.
- iOS should use mobile-native UX: Today, Todos, Routines, Stats, Settings; use sheets/modals instead of a literal desktop three-column clone.

Start by creating:

1. Swift Codable models matching the current schema.
2. Theme tokens matching the warm cream/ink aesthetic.
3. A local sample-data store using `sample-data.json`.
4. A Today timeline screen that renders the sample tasks from 05:00 to 05:00.
5. Todo and routine editors using the shared editorial editor style.

Do not start with advanced integrations. Build the core planner first.


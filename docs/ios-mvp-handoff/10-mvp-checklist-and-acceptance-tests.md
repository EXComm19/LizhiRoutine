# MVP Checklist And Acceptance Tests

## Implementation Checklist

### Contract

- [ ] Swift models match `lib/schema.ts`.
- [ ] JSON encode/decode tests pass for sample data.
- [ ] `SCHEMA_VERSION = 2` is represented.
- [ ] IDs use the same string prefix style.

### Auth And Sync

- [ ] User can sign in with Supabase.
- [ ] User can sign out.
- [ ] `user_state` pulls into local cache.
- [ ] `day_tasks` pulls for selected dates.
- [ ] Local todo/routine/block edits push to Supabase.
- [ ] Web app can read changes made by iOS.
- [ ] iOS can read changes made by web.

### Timeline

- [ ] Day starts at 05:00.
- [ ] 00:00-04:59 appears at bottom.
- [ ] Cross-midnight blocks render correctly.
- [ ] Current-time line appears only for today.
- [ ] Drag placement snaps to 30 minutes.
- [ ] Editor can save exact minute start/end.
- [ ] Calendar blocks are locked.
- [ ] Deadline markers do not obscure block text.

### Todos

- [ ] Todo creation does not require time allocation.
- [ ] Todo has due date/time/tags/list/tier.
- [ ] Todo can be scheduled multiple times.
- [ ] Todo completion checkbox works from todo list.
- [ ] Completed todo is visually checked, with no redundant Completed pill.
- [ ] Due-within-week styling gets warmer as due date approaches.
- [ ] Today deadlines are red/urgent.
- [ ] Sort by due date works.

### Routines

- [ ] Routine create/edit/delete works.
- [ ] Routine has custom icon and color.
- [ ] Routine can be scheduled.
- [ ] Placed routine keeps `source_id`.
- [ ] Whole routine card is draggable/tappable.

### Periods

- [ ] Period create/edit/delete works.
- [ ] Active periods appear on timeline.
- [ ] Month view uses ribbons, not redundant daily blocks.
- [ ] Period breaks are respected.

### Stats

- [ ] Stats group routine time by routine template.
- [ ] Stats group todo time by todo item.
- [ ] Today/week/month/custom ranges work.
- [ ] Stats use placed timeline blocks, not due dates.

### Integrations

- [ ] AI parser uses secure backend endpoint, not embedded API key.
- [ ] `.ics` import creates locked calendar tasks.
- [ ] URL calendar import either works through backend or fails with clear message.

## Acceptance Tests

1. **Web to iOS round trip**
   - Create todo list `BPS3071` on web.
   - Create todo `Lab report`, due in 3 days at `23:55`.
   - Open iOS app.
   - Todo appears in `BPS3071` with same tier, due time, and tags.

2. **Multiple allocations**
   - Schedule the same todo from `09:00-10:30` and `15:00-16:00`.
   - Stats should show `2h 30m` for that todo.
   - Todo itself should remain one item.

3. **Routine source integrity**
   - Create routine `Gym`, `T0`, `2h`, amber color.
   - Schedule it twice.
   - Stats group both blocks under one `Gym` source.

4. **Cross-midnight block**
   - Create sleep from `23:30` to `07:30`.
   - It appears at bottom and top of the correct 5am planning window.

5. **Exact editor times**
   - Edit a block to `17:49-18:14`.
   - Timeline height reflects 25 minutes accurately.
   - Stats count 25 minutes.
   - Dragging the same block later snaps to nearest 30 minutes.

6. **Deadline urgency**
   - Todo due today is red.
   - Todo due in three days is warm amber/orange.
   - Todo due beyond one week uses neutral due styling.

7. **Calendar lock**
   - Import `.ics`.
   - Event appears as a fixed calendar block.
   - User cannot drag or resize it.
   - No lock icon clutters the block.

8. **Dark mode**
   - All selected controls have readable text.
   - Today button is readable in selected and unselected states.
   - Editor fields have normal, legible font.


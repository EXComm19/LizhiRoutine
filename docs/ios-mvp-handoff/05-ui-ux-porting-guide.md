# UI/UX Porting Guide

## Desktop Web Versus iPhone

The web app uses a three-pane layout:

```text
Left rail             Center planner                    Right rail
Todos / Periods       Day / Week / Month / Stats         Sleep / Routines
```

Do not copy this directly onto iPhone. The iOS app should preserve function and aesthetic, not literal desktop geometry.

## Recommended iPhone Navigation

Use a tab bar:

1. **Today**
2. **Todos**
3. **Routines**
4. **Stats**
5. **Settings**

The Today tab is the primary daily planning surface.

## Today Tab

Top area:

- previous date,
- date picker,
- next date,
- view switcher or compact menu,
- Today button.

Summary strip near date:

- keep compact summary behavior,
- show working window/sunrise-sunset if available,
- show scheduled count,
- show todo/deadline count.

Main area:

- vertical timeline,
- 5am-to-5am,
- current-time line,
- period background,
- deadline pill centered in empty space where possible,
- scrollable with comfortable hourly height.

Quick actions:

- add todo,
- schedule routine,
- schedule todo,
- import or settings via Settings tab.

## Todos Tab

Use grouped list sections by todo list:

```text
BPS3071        3
  [ ] Lab 3...         T0  BPS3071  in 3 days at 23:55
  [ ] Workshop...      T0  BPS3071  17 May at 23:55

Project        1
  [ ] LizhiRoutine     T0  Project
```

Rules:

- Checkbox is right-aligned on title row or otherwise clearly separated from text.
- Due tag aligns with tier/list tags.
- No `Completed` pill; checked state is enough.
- No `No time allocated` pill.
- Time allocated should not be shown on todo cards; stats owns that information.
- Double tap todo to edit.
- Long press can show context menu.

## Routines Tab

Routine cards:

```text
[icon tile]  Gym
             T0   2h
```

Rules:

- Entire card is draggable/tappable, not just icon.
- Double tap routine to edit.
- Editing routine uses same editor language as todo/block.
- Color and icon are user-customizable.

## Editors

Use one consistent editor system:

```text
Header:
  EDIT TODO / EDIT ROUTINE / EDIT BLOCK
  Large title
  Tier / List/source / date/time/duration metadata

Rows:
  TITLE       value/control
  TIER        segmented T0/T1/T2
  LIST        picker       (todo only)
  DUE         date / time  (todo only)
  TAGS        chips        (todo only)
  WINDOW      start -> end (block only)
  DURATION    h / m        (block/routine)
  ICON        icon picker  (routine)
  COLOUR      color picker (routine/period)

Footer:
  Delete                 Cancel   Save
```

iPhone behavior:

- Use a bottom sheet on compact phones if centered modal feels cramped.
- Use centered modal on iPad and larger widths.
- Preserve fixed visual proportions and consistent row styling.

## Drag And Scheduling

Drag is valuable but should not be the only path on iPhone.

Required:

- Drag routine/todo to timeline.
- Snap dragging/resizing to 30 minutes.
- Haptic feedback on snap.
- Auto-scroll when dragging near top/bottom.

Also required:

- Tap a todo/routine and choose `Schedule`.
- Open exact editor after placement for precise start/end.

## Deadline Display

The current web deadline pills can clash with blocks. On iOS:

- Put deadline information in the center lane of the timeline when possible.
- Use a thin dashed guide line at the due time.
- Use a compact warm/red pill that includes:
  - flag icon,
  - due time,
  - title.
- If it would overlap a block row, offset it vertically or collapse to a small marker with tooltip/detail sheet on tap.

## Accessibility

- Use Dynamic Type where possible.
- Clamp timeline block title rows so they remain readable.
- All color-coded information must also have text/icon cues.
- Ensure tap targets are at least 44 x 44 pt for primary actions.
- Support VoiceOver labels for timeline blocks, due markers, and editor controls.

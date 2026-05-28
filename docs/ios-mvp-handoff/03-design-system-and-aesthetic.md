# Design System And Aesthetic

## Design Direction

The current design has moved from light macOS cards toward a warmer editorial planner style.

Keywords:

- warm cream canvas,
- ink text,
- soft paper surfaces,
- subtle dividers,
- editorial serif date title,
- compact mono metadata,
- rounded but not bubbly,
- quiet shadows,
- high information density without clutter.

## Typography

Current web fonts:

- UI: `DM Sans`
- Display/editorial: `Fraunces`
- Mono metadata: `JetBrains Mono`

iOS recommendation:

| Role | Web | iOS Direction |
| --- | --- | --- |
| Body/UI | DM Sans | Use bundled app font if licensing/build allows, otherwise `SF Pro Text`. |
| Date/title display | Fraunces | Bundle Fraunces or choose a similar editorial serif. Keep date title expressive. |
| Time/meta | JetBrains Mono | Bundle JetBrains Mono or use `SF Mono`. |

Do not let editor text fall back to tiny monospace for normal input values. Mono is for labels, metadata, times, and compact counters only.

## Color Tokens

Use semantic tokens, not one-off colors in views.

| Token | Meaning |
| --- | --- |
| `canvas` | App outer background, warm cream. |
| `background` | Main panel surface. |
| `card` | Elevated cards and editor panels. |
| `sunken` | Slightly recessed controls/inputs. |
| `line` | Quiet divider. |
| `lineStrong` | Active divider or stronger outline. |
| `ink` | Primary text / black action button. |
| `ink2` | Secondary text. |
| `ink3` | Muted labels. |
| `timelineGutter` | Time-scale column background. |
| `timelineLine` | Hour/half-hour lines. |
| `timelineTime` | Time labels. |

Suggested light values based on web tokens:

```text
canvas        #EFEAE0
background    #FAF7F1
card          #FFFFFF
sunken        #F2EEE5
line          #E4DFD3
lineSoft      #EDE8DC
lineStrong    #CFC9BB
ink           #1A170E
ink2          #5C5849
ink3          #98937F
timelineTime  #8A7D65
```

Suggested dark values:

```text
canvas        #14110A
background    #1A1610
card          #221D14
sunken        #1A1610
line          #2F291E
lineSoft      #25201A
lineStrong    #4A4232
ink           #F5EDD6
ink2          #C9C3B0
ink3          #98937F
timelineTime  #B4A98F
```

## Tier Visuals

| Tier | Visual Direction |
| --- | --- |
| `T0` | Ink/black chip; serious, high priority. |
| `T1` | Violet/plum family. |
| `T2` | Amber/warm family. |

Tier chips should be compact and readable. Selected segmented controls should use `ink` background and `card` text, matching the working web editor.

## Todo List And Routine Colors

Current allowed palette:

- blue,
- emerald,
- amber,
- rose,
- violet,
- zinc.

Todo timeline blocks should use the color of the todo list they belong to. Routine blocks should use their routine template color. Calendar blocks should have their own fixed visual style. Sleep is deep purple.

## Block Styling

Time blocks:

- rounded corners, about 10-14 px on iOS,
- left accent bar,
- first row contains all key information,
- title and meta are compact,
- time range right-aligned,
- no redundant lock icon for fixed calendar events,
- deadline hints must not cover title text.

First row content order:

```text
Left:  [Tx] [icon] Title [clock] duration
Right: start-end
```

Todo completion checkbox belongs in the todo list, not timeline blocks.

## Editor Panels

The editing panels are a major part of the aesthetic. They should feel like small editorial cards:

- centered modal on larger screens,
- bottom sheet may be used on small iPhone screens if it preserves the same structure,
- fixed width/height class per editor type,
- gradient header,
- compact uppercase mono label,
- large title,
- mono metadata row,
- editorial rows with disconnected divider lines,
- footer with Delete on left, Cancel/Save on right.

All editors should share the same row system:

```text
LABEL        value/control
```

Labels should be readable and not too tiny. Row dividers should have left/right inset and should not run edge-to-edge.


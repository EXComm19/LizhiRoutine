# Wireframes And Flows

These are text-first visual references that can be pasted into an implementation chat without image files.

## iPhone Tab Structure

```mermaid
flowchart LR
  Today["Today"] --- Todos["Todos"]
  Todos --- Routines["Routines"]
  Routines --- Stats["Stats"]
  Stats --- Settings["Settings"]
```

## Today Screen

```text
+-------------------------------------+
| <  Saturday 9 May 2026  >     Today |
| Day   Week   Month   Stats          |
+-------------------------------------+
| Saturday 9 May                      |
| 07:00-17:00 / 4 scheduled / 2 due   |
+------+------------------------------+
| 5 AM |                              |
| 6 AM | +--------------------------+ |
|      | | T1 moon Sleep     05-07  | |
| 7 AM | +--------------------------+ |
| 8 AM | +--------------------------+ |
|      | | T2 bolt Commute  08-09   | |
| 9 AM | +--------------------------+ |
|      | | T1 cal Laboratory 09-12  | |
| 10AM | |                          | |
| 11AM | |        -- NOW 11:42 --   | |
| 12PM | +--------------------------+ |
| 1 PM |   flag due 14:20 / Genius Bar|
+------+------------------------------+
```

## Todo List Screen

```text
+-------------------------------------+
| Todos                         +     |
| AI Import collapsed                 |
+-------------------------------------+
| v BPS3071                       3   |
| +-------------------------------o-+ |
| | Lab 3 Micelles, Cyclodextrins...| |
| | T0  BPS3071  in 3 days at 23:55 | |
| +---------------------------------+ |
| +-------------------------------o-+ |
| | Workshop 5 Submission           | |
| | T0  BPS3071  17 May at 23:55    | |
| +---------------------------------+ |
|                                     |
| > Project                       1   |
+-------------------------------------+
```

## Routine Library Screen

```text
+-------------------------------------+
| Routines                      + New |
+-------------------------------------+
| +----+  Gym                         |
| | ic |  T0  2h                      |
| +----+                              |
| +----+  Commute                     |
| | ic |  T2  30m                     |
| +----+                              |
| +----+  Shower                      |
| | ic |  T0  30m                     |
| +----+                              |
+-------------------------------------+
```

## Editor Modal

```text
+-------------------------------------+
| EDIT TODO                         x |
| Lab 3 Micelles, Cyclodextrins and...|
| Tier T0 / BPS3071 / 2026-05-12 23:55|
+-------------------------------------+
| TITLE     Lab 3 Micelles...         |
| TIER      T0   T1   T2              |
| LIST      BPS3071              v    |
| DUE       2026/05/12 / 23:55        |
| TAGS      Lab report x Submission x |
+-------------------------------------+
| Delete                 Cancel  Save |
+-------------------------------------+
```

## Scheduling Flow

```mermaid
sequenceDiagram
  participant User
  participant UI as iOS UI
  participant Store as Local Store
  participant Sync as Supabase Sync

  User->>UI: Drag/tap routine or todo
  UI->>UI: Choose start time
  UI->>Store: Create Task with source_id
  Store->>UI: Optimistic update
  Store->>Sync: Queue/upsert day_tasks
  Sync->>Store: Confirm or keep pending retry
```

## Stats Flow

```mermaid
flowchart TD
  Blocks["Timeline Task[] in date range"] --> Split{"kind"}
  Split --> Routines["routine/sleep"]
  Split --> Todos["task"]
  Split --> Calendar["calendar"]
  Routines --> RSource["Group by source_id -> RoutineTemplate"]
  Todos --> TSource["Group by source_id -> TodoItem"]
  Calendar --> CGroup["Optional fixed event total"]
  RSource --> Stats["Stats UI"]
  TSource --> Stats
  CGroup --> Stats
```

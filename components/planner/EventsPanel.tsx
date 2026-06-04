"use client";

import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Briefcase,
  CalendarPlus,
  Clock,
  Dumbbell,
  Gamepad2,
  HeartPulse,
  Moon,
  Pencil,
  Sparkles,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { EmptyState } from "@/components/planner/primitives";
import {
  EDITOR_BODY_CLASS,
  EDITOR_CARD_CLASS,
  EDITOR_INPUT_CLASS,
  EDITOR_LABEL_CLASS,
  EDITOR_PLAIN_INPUT_CLASS,
  EDITOR_ROW_CLASS,
  EditorFooter,
  EditorHeader,
  EditorModal,
  EditorTierSegment,
} from "@/components/planner/editor";
import { todoListColorTokens } from "@/lib/colors";
import { EVENT_TYPES, EVENT_TYPE_LABELS } from "@/lib/event-type";
import { createEvent, patchEvent } from "@/lib/factories";
import type {
  Category,
  EventItem,
  EventType,
  TodoList,
} from "@/lib/schema";
import { formatDateKey, todayKey } from "@/lib/time";
import { cn } from "@/lib/utils";

type EventsPanelProps = {
  events: EventItem[];
  todoLists: TodoList[];
  upsertEvent: (event: EventItem) => void;
  deleteEvent: (id: string) => void;
};

type Draft = {
  title: string;
  list_id: string;
  category: Category;
  eventType: EventType;
  date: string;
  time: string;
  duration: number;
  durationUncertain: boolean;
  notes: string;
};

// Life area → lucide icon. Used in card rendering + the editor picker.
// (Exported as EVENT_TYPE_ICONS for back-compat with AgentPanel.)
export const EVENT_TYPE_ICONS: Record<EventType, LucideIcon> = {
  general: Clock,
  medical: HeartPulse,
  work: Briefcase,
  academic: BookOpen,
  social: Users,
  personal: User,
  fitness: Dumbbell,
  sleep: Moon,
  hobby: Gamepad2,
  chores: Sparkles,
};

const dayLabelFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "numeric",
  day: "numeric",
});
const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

function defaultDraft(todoLists: TodoList[]): Draft {
  const now = new Date();
  // Round up to next 30 min so the suggested time is "near future" not "now".
  const ceiledMinutes = Math.ceil((now.getMinutes() + 1) / 30) * 30;
  now.setMinutes(ceiledMinutes, 0, 0);
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return {
    title: "",
    list_id: todoLists[0]?.id ?? "list-inbox",
    category: "T1",
    eventType: "general",
    date: todayKey(),
    time: `${hh}:${mm}`,
    duration: 60,
    durationUncertain: false,
    notes: "",
  };
}

function buildStartsAt(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

function eventEndsAt(event: EventItem): Date {
  return new Date(
    new Date(event.starts_at).getTime() + event.duration_minutes * 60_000,
  );
}

function isPast(event: EventItem, now: Date): boolean {
  return eventEndsAt(event).getTime() < now.getTime();
}

function dayKeyOf(event: EventItem): string {
  return formatDateKey(new Date(event.starts_at));
}

function formatTimeRange(event: EventItem): string {
  const start = new Date(event.starts_at);
  return `${timeFmt.format(start)} – ${timeFmt.format(eventEndsAt(event))}`;
}

export function EventsPanel({
  events,
  todoLists,
  upsertEvent,
  deleteEvent,
}: EventsPanelProps) {
  const [editorState, setEditorState] = useState<
    | { mode: "new"; draft: Draft }
    | { mode: "edit"; draft: Draft; editingId: string }
    | null
  >(null);

  const todayDateKey = todayKey();
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const { todayEvents, futureEvents, pastEvents } = useMemo(() => {
    const now = new Date(nowTick);
    const t: EventItem[] = [];
    const f: EventItem[] = [];
    const p: EventItem[] = [];
    for (const event of events) {
      if (event.status === "cancelled") {
        p.push(event);
        continue;
      }
      const dayKey = dayKeyOf(event);
      if (isPast(event, now)) {
        p.push(event);
      } else if (dayKey === todayDateKey) {
        t.push(event);
      } else {
        f.push(event);
      }
    }
    const byStart = (a: EventItem, b: EventItem) =>
      a.starts_at.localeCompare(b.starts_at);
    return {
      todayEvents: t.sort(byStart),
      futureEvents: f.sort(byStart),
      pastEvents: p.sort((a, b) => b.starts_at.localeCompare(a.starts_at)),
    };
  }, [events, todayDateKey, nowTick]);

  const openComposer = () =>
    setEditorState({ mode: "new", draft: defaultDraft(todoLists) });

  const openEdit = (event: EventItem) => {
    const start = new Date(event.starts_at);
    const hh = String(start.getHours()).padStart(2, "0");
    const mm = String(start.getMinutes()).padStart(2, "0");
    setEditorState({
      mode: "edit",
      editingId: event.id,
      draft: {
        title: event.title,
        list_id: event.list_id,
        category: event.category,
        eventType: event.event_type,
        date: formatDateKey(start),
        time: `${hh}:${mm}`,
        duration: event.duration_minutes,
        durationUncertain: event.duration_uncertain,
        notes: event.notes ?? "",
      },
    });
  };

  const closeEditor = () => setEditorState(null);

  const submitDraft = () => {
    if (!editorState) return;
    const { draft } = editorState;
    if (!draft.title.trim()) return;
    const startsAt = buildStartsAt(draft.date, draft.time);
    if (editorState.mode === "edit") {
      const existing = events.find((event) => event.id === editorState.editingId);
      if (!existing) return;
      upsertEvent(
        patchEvent(existing, {
          title: draft.title,
          list_id: draft.list_id,
          category: draft.category,
          event_type: draft.eventType,
          starts_at: startsAt,
          duration_minutes: draft.duration,
          duration_uncertain: draft.durationUncertain,
          notes: draft.notes.trim() || null,
        }),
      );
    } else {
      upsertEvent(
        createEvent({
          title: draft.title,
          list_id: draft.list_id,
          category: draft.category,
          event_type: draft.eventType,
          starts_at: startsAt,
          duration_minutes: draft.duration,
          duration_uncertain: draft.durationUncertain,
          notes: draft.notes.trim() || null,
        }),
      );
    }
    closeEditor();
  };

  const deleteFromEditor = () => {
    if (editorState?.mode === "edit") {
      deleteEvent(editorState.editingId);
    }
    closeEditor();
  };

  return (
    <aside className="flex h-full w-full min-h-0 flex-col overflow-hidden bg-[color:var(--card)]">
      <div className="flex shrink-0 items-center justify-between px-3.5 pb-1.5 pt-3 font-[family-name:var(--font-mono)] text-[10.5px] font-medium uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
        <span>Events</span>
        <button
          type="button"
          onClick={openComposer}
          className="inline-flex items-center gap-1 rounded-[var(--r-sm)] px-1.5 py-1 text-[11.5px] font-medium normal-case tracking-normal text-[color:var(--ink-2)] hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink)]"
          title="New event"
        >
          <CalendarPlus className="h-3.5 w-3.5" />
          New
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-4">
        <EventGroup
          title="Today"
          events={todayEvents}
          todoLists={todoLists}
          onEdit={openEdit}
        />
        <EventGroup
          title="Upcoming"
          events={futureEvents}
          todoLists={todoLists}
          onEdit={openEdit}
        />
        <EventGroup
          title="Past"
          events={pastEvents}
          todoLists={todoLists}
          onEdit={openEdit}
          muted
        />

        {!events.length && (
          <EmptyState text="Add fixed-time things here — meetings, lectures, appointments." />
        )}
      </div>

      {editorState && (
        <EventEditorModal
          mode={editorState.mode}
          draft={editorState.draft}
          todoLists={todoLists}
          onDraftChange={(next) =>
            setEditorState((prev) => (prev ? { ...prev, draft: next } : prev))
          }
          onCancel={closeEditor}
          onSubmit={submitDraft}
          onDelete={
            editorState.mode === "edit" ? deleteFromEditor : undefined
          }
        />
      )}
    </aside>
  );
}

function EventGroup({
  title,
  events,
  todoLists,
  onEdit,
  muted = false,
}: {
  title: string;
  events: EventItem[];
  todoLists: TodoList[];
  onEdit: (event: EventItem) => void;
  muted?: boolean;
}) {
  if (!events.length) return null;
  return (
    <section className="mt-3 first:mt-1">
      <div className="mb-1.5 font-[family-name:var(--font-mono)] text-[10px] font-medium uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
        {title}
      </div>
      <div className="space-y-1">
        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            todoLists={todoLists}
            onEdit={onEdit}
            muted={muted}
          />
        ))}
      </div>
    </section>
  );
}

function EventCard({
  event,
  todoLists,
  onEdit,
  muted,
}: {
  event: EventItem;
  todoLists: TodoList[];
  onEdit: (event: EventItem) => void;
  muted: boolean;
}) {
  const list = todoLists.find((l) => l.id === event.list_id);
  const listStyles = list ? todoListColorTokens(list.color) : null;
  const Icon = EVENT_TYPE_ICONS[event.event_type] ?? Clock;
  const start = new Date(event.starts_at);
  // Single-line meta avoids the "5月27日 / 周三" stacking from the old
  // layout — locale-formatted date + time-range stays on one row.
  const meta = `${dayLabelFmt.format(start)} · ${formatTimeRange(event)}`;

  return (
    <button
      type="button"
      onClick={() => onEdit(event)}
      className={cn(
        "group flex w-full items-start gap-2.5 rounded-[10px] border border-transparent p-2 text-left transition-colors hover:border-[color:var(--line-soft)] hover:bg-[color:var(--hover)]",
        muted && "opacity-65",
      )}
    >
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-[color:var(--block-event)] text-[color:var(--block-event-ink)]"
        aria-hidden
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        {/* Title is the dominant element — bigger, bolder, single line.
            This is the hierarchy fix the user asked for. */}
        <div className="truncate text-[13.5px] font-semibold leading-[1.25] text-[color:var(--ink)]">
          {event.title}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap font-[family-name:var(--font-mono)] text-[10.5px] text-[color:var(--ink-3)]">
          <span className="truncate">{meta}</span>
          {list && listStyles && (
            <span
              className={cn(
                "inline-flex h-3.5 shrink-0 items-center truncate rounded border px-1 text-[9.5px] font-medium",
                listStyles.block,
                listStyles.text,
              )}
            >
              {list.name}
            </span>
          )}
          {event.duration_uncertain && (
            <span
              className="inline-flex h-3.5 shrink-0 items-center rounded bg-[color:var(--sunken)] px-1 text-[9px] uppercase tracking-wide text-[color:var(--ink-3)]"
              title="Duration is uncertain"
            >
              ~
            </span>
          )}
        </div>
      </div>
      {/* Edit indicator on hover — clicking the card itself opens the
          editor; trash lives inside the editor's footer. */}
      <Pencil
        className="mt-1 h-3 w-3 shrink-0 text-[color:var(--ink-3)] opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
    </button>
  );
}

function EventEditorModal({
  mode,
  draft,
  todoLists,
  onDraftChange,
  onCancel,
  onSubmit,
  onDelete,
}: {
  mode: "new" | "edit";
  draft: Draft;
  todoLists: TodoList[];
  onDraftChange: (next: Draft) => void;
  onCancel: () => void;
  onSubmit: () => void;
  onDelete?: () => void;
}) {
  const setField = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    onDraftChange({ ...draft, [key]: value });
  };

  const startsAtForHeader = useMemo(() => {
    try {
      const iso = buildStartsAt(draft.date, draft.time);
      return new Date(iso);
    } catch {
      return null;
    }
  }, [draft.date, draft.time]);

  const dateMeta = startsAtForHeader
    ? dayLabelFmt.format(startsAtForHeader)
    : null;
  const timeMeta = startsAtForHeader ? timeFmt.format(startsAtForHeader) : null;
  const headerEyebrow = mode === "edit" ? "Edit event" : "New event";

  const TypeIcon = EVENT_TYPE_ICONS[draft.eventType] ?? Clock;

  return (
    <EditorModal onClose={onCancel}>
      <div className={EDITOR_CARD_CLASS}>
        <EditorHeader
          eyebrow={headerEyebrow}
          title={draft.title || "Untitled event"}
          onCancel={onCancel}
          leading={
            <span
              className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-[color:var(--block-event)] text-[color:var(--block-event-ink)]"
              aria-hidden
            >
              <TypeIcon className="h-4 w-4" />
            </span>
          }
          meta={[
            dateMeta,
            timeMeta ? `${timeMeta}` : null,
            `${draft.duration}m${draft.durationUncertain ? " (~)" : ""}`,
            EVENT_TYPE_LABELS[draft.eventType],
          ]}
        />

        <div className={EDITOR_BODY_CLASS}>
          {/* Title */}
          <div className={EDITOR_ROW_CLASS}>
            <span className={EDITOR_LABEL_CLASS}>Title</span>
            <input
              className={EDITOR_PLAIN_INPUT_CLASS}
              placeholder="Event title"
              value={draft.title}
              onChange={(event) => setField("title", event.target.value)}
              autoFocus
            />
          </div>

          {/* Type picker */}
          <div className={EDITOR_ROW_CLASS}>
            <span className={EDITOR_LABEL_CLASS}>Type</span>
            <div className="flex flex-wrap gap-1">
              {EVENT_TYPES.map((type) => {
                const Icon = EVENT_TYPE_ICONS[type];
                const selected = draft.eventType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setField("eventType", type)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11.5px] font-medium transition-colors",
                      selected
                        ? "border-[color:var(--ink)] bg-[color:var(--ink)] !text-[color:var(--card)]"
                        : "border-[color:var(--line)] bg-[color:var(--card)] text-[color:var(--ink-2)] hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink)]",
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {EVENT_TYPE_LABELS[type]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* When + duration */}
          <div className={EDITOR_ROW_CLASS}>
            <span className={EDITOR_LABEL_CLASS}>When</span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                className={cn(EDITOR_INPUT_CLASS, "w-[8.5rem]")}
                value={draft.date}
                onChange={(event) => setField("date", event.target.value)}
              />
              <input
                type="time"
                className={cn(EDITOR_INPUT_CLASS, "w-[6rem]")}
                value={draft.time}
                onChange={(event) => setField("time", event.target.value)}
              />
              <span className="text-[11px] text-[color:var(--ink-3)]">for</span>
              <input
                type="number"
                min={5}
                max={1440}
                step={5}
                className={cn(EDITOR_INPUT_CLASS, "w-[4.5rem] text-center")}
                value={draft.duration}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (!Number.isFinite(next) || next < 5) return;
                  setField(
                    "duration",
                    Math.min(1440, Math.max(5, Math.round(next))),
                  );
                }}
              />
              <span className="text-[11px] text-[color:var(--ink-3)]">min</span>
            </div>
          </div>

          {/* Uncertain toggle (small row) */}
          <div className={EDITOR_ROW_CLASS}>
            <span className={EDITOR_LABEL_CLASS}>Length</span>
            <label className="flex items-center gap-2 text-[12.5px] text-[color:var(--ink-2)]">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[color:var(--ink)]"
                checked={draft.durationUncertain}
                onChange={(event) =>
                  setField("durationUncertain", event.target.checked)
                }
              />
              <span>Uncertain — may run over (timeline block fades)</span>
            </label>
          </div>

          {/* Category */}
          <div className={EDITOR_ROW_CLASS}>
            <span className={EDITOR_LABEL_CLASS}>Tier</span>
            <EditorTierSegment
              value={draft.category}
              onChange={(value) => setField("category", value)}
            />
          </div>

          {/* List */}
          <div className={EDITOR_ROW_CLASS}>
            <span className={EDITOR_LABEL_CLASS}>List</span>
            <select
              className={cn(EDITOR_INPUT_CLASS, "max-w-[14rem]")}
              value={draft.list_id}
              onChange={(event) => setField("list_id", event.target.value)}
            >
              {todoLists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div className={EDITOR_ROW_CLASS}>
            <span className={cn(EDITOR_LABEL_CLASS, "self-start pt-1")}>
              Notes
            </span>
            <textarea
              className="min-h-[64px] w-full resize-none rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] px-2.5 py-1.5 text-[12.5px] text-[color:var(--ink)] outline-none focus:border-[color:var(--line-strong)] focus:ring-2 focus:ring-[color:var(--ring)]"
              placeholder="Agenda, location, joining info…"
              value={draft.notes}
              maxLength={2000}
              onChange={(event) => setField("notes", event.target.value)}
            />
          </div>
        </div>

        <EditorFooter
          onCancel={onCancel}
          onSubmit={onSubmit}
          onDelete={onDelete}
          submitLabel={mode === "edit" ? "Save" : "Create"}
          submitDisabled={!draft.title.trim()}
        />
      </div>
    </EditorModal>
  );
}

// Trash2 + ClockBackup type re-exports avoid an unused-import warning when
// I trim the EventCard surface — kept around so callers from the Calendar
// rail tab pinned glance can reuse this module's icon mapping below.
export { Trash2, Clock };

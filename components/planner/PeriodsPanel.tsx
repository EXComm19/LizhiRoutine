"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  BookOpen,
  Briefcase,
  Building2,
  CalendarRange,
  Check,
  CirclePlus,
  Clock,
  GraduationCap,
  Pencil,
  Plane,
  Plus,
  Trash2,
} from "lucide-react";
import { EmptyState } from "@/components/planner/primitives";
import {
  EDITOR_BODY_CLASS,
  EDITOR_CARD_CLASS,
  EditorFooter,
  EditorHeader,
  EditorModal,
} from "@/components/planner/editor";
import { periodColorTokens } from "@/lib/colors";
import {
  createPeriod,
  createPeriodBreak,
  patchPeriod,
} from "@/lib/factories";
import {
  formatPeriodRange,
  periodDefaultColor,
  periodKindLabel,
} from "@/lib/period";
import { LifeAreaSelect } from "@/components/planner/LifeAreaSelect";
import type {
  LifeArea,
  Period,
  PeriodBreak,
  PeriodColor,
  PeriodKind,
} from "@/lib/schema";
import { guessLifeArea } from "@/lib/life-area";
import { todayKey } from "@/lib/time";
import { cn } from "@/lib/utils";

const PERIOD_KIND_ORDER: ReadonlyArray<PeriodKind> = [
  "placement",
  "work",
  "internship",
  "study",
  "holiday",
  "custom",
];

/** Default life area implied by a period's kind. The picker can override. */
const PERIOD_KIND_AREA: Record<PeriodKind, LifeArea> = {
  placement: "work",
  work: "work",
  internship: "work",
  study: "academic",
  holiday: "personal",
  custom: "general",
};

const PERIOD_COLOR_OPTIONS: PeriodColor[] = [
  "blue",
  "emerald",
  "amber",
  "rose",
  "violet",
  "zinc",
];

const WEEKDAY_LABELS: ReadonlyArray<{ index: number; label: string }> = [
  { index: 1, label: "M" },
  { index: 2, label: "T" },
  { index: 3, label: "W" },
  { index: 4, label: "T" },
  { index: 5, label: "F" },
  { index: 6, label: "S" },
  { index: 0, label: "S" },
];

function PeriodKindIcon({
  kind,
  className,
}: {
  kind: PeriodKind;
  className?: string;
}) {
  switch (kind) {
    case "placement":
      return <Building2 className={className} aria-hidden="true" />;
    case "work":
      return <Briefcase className={className} aria-hidden="true" />;
    case "internship":
      return <GraduationCap className={className} aria-hidden="true" />;
    case "study":
      return <BookOpen className={className} aria-hidden="true" />;
    case "holiday":
      return <Plane className={className} aria-hidden="true" />;
    case "custom":
    default:
      return <CalendarRange className={className} aria-hidden="true" />;
  }
}

const periodEditorLabelClass =
  "font-[family-name:var(--font-mono)] text-[10.5px] font-medium uppercase tracking-[0.12em] text-[color:var(--ink-3)]";

const periodEditorSectionClass =
  "border-b border-[color:var(--line-soft)] py-3.5";

const periodEditorFieldBoxClass =
  "flex h-9 w-full items-center gap-2 rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] px-2.5 transition-colors focus-within:border-[color:var(--line-strong)] focus-within:bg-[color:var(--card)] focus-within:ring-2 focus-within:ring-[color:var(--ring)]";

const periodEditorInputClass =
  "min-w-0 flex-1 border-0 bg-transparent text-[13px] font-medium text-[color:var(--ink)] outline-none placeholder:text-[color:var(--ink-3)]";

const periodEditorDateClass = cn(
  periodEditorInputClass,
  "font-[family-name:var(--font-mono)] text-[12.5px] tabular-nums",
);

export function PeriodsPanel({
  periods,
  upsertPeriod,
  deletePeriod,
}: {
  periods: Period[];
  upsertPeriod: (period: Period) => void;
  deletePeriod: (periodId: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const sortedPeriods = useMemo(
    () =>
      [...periods].sort((a, b) =>
        a.start_date === b.start_date
          ? a.title.localeCompare(b.title)
          : a.start_date.localeCompare(b.start_date),
      ),
    [periods],
  );
  const editingPeriod = sortedPeriods.find((period) => period.id === editingId);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PeriodPanelHeader
        className="pt-3"
        trailing={
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-[var(--r-sm)] px-1.5 py-1 font-[family-name:var(--font-ui)] text-[11.5px] font-medium normal-case tracking-normal text-[color:var(--ink-2)] transition-colors hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink)]"
            title="Add period"
            aria-label="Add period"
            onClick={() => setIsAdding(true)}
          >
            <CirclePlus className="h-3.5 w-3.5" />
            New
          </button>
        }
      >
        Periods
      </PeriodPanelHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-0 pb-4 [scrollbar-color:var(--line)_transparent]">
        {sortedPeriods.length ? (
          sortedPeriods.map((period) => (
            <PeriodCard
              key={period.id}
              period={period}
              onEdit={() => setEditingId(period.id)}
              onDelete={() => deletePeriod(period.id)}
            />
          ))
        ) : !isAdding ? (
          <div className="mx-3.5">
            <EmptyState text="No periods yet. Add a placement, holiday, or custom range." />
          </div>
        ) : null}
      </div>
      {isAdding && (
        <PeriodEditor
          submitLabel="Add"
          onCancel={() => setIsAdding(false)}
          onSubmit={(period) => {
            upsertPeriod(period);
            setIsAdding(false);
          }}
        />
      )}
      {editingPeriod && (
        <PeriodEditor
          period={editingPeriod}
          submitLabel="Save"
          onCancel={() => setEditingId(null)}
          onSubmit={(next) => {
            upsertPeriod(next);
            setEditingId(null);
          }}
          onDelete={() => {
            deletePeriod(editingPeriod.id);
            setEditingId(null);
          }}
        />
      )}
    </div>
  );
}

function PeriodPanelHeader({
  children,
  trailing,
  className,
}: {
  children: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-[18px] pb-2 font-[family-name:var(--font-mono)] text-[10.5px] font-medium uppercase tracking-[0.14em] text-[color:var(--ink-3)]",
        className,
      )}
    >
      <span>{children}</span>
      {trailing}
    </div>
  );
}

function PeriodCard({
  period,
  onEdit,
  onDelete,
}: {
  period: Period;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tokens = periodColorTokens(period.color);
  const isAllDay = !period.daily_start_time || !period.daily_end_time;
  const timeLabel = isAllDay
    ? "All day"
    : `${period.daily_start_time} - ${period.daily_end_time}`;

  return (
    <div
      className="group mx-3 mb-1.5 flex cursor-default select-none items-center gap-[11px] rounded-[11px] border border-transparent p-2.5 transition-all duration-150 hover:border-[color:var(--line-soft)] hover:bg-[color:var(--hover)]"
      title={`${period.title}\n${formatPeriodRange(period)}\n${periodKindLabel(period.kind)} - ${timeLabel}`}
      onDoubleClick={onEdit}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]",
          tokens.block,
          tokens.text,
        )}
        aria-hidden="true"
      >
        <PeriodKindIcon kind={period.kind} className="h-3.5 w-3.5" />
      </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[13.5px] font-semibold tracking-[-0.005em] text-[color:var(--ink)]">
              {period.title}
            </span>
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tokens.accent)} />
          </div>
          <div className="mt-[3px] flex min-w-0 items-center gap-1.5 font-[family-name:var(--font-mono)] text-[10.5px] text-[color:var(--ink-3)]">
            <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.04em]", tokens.chip)}>
              {periodKindLabel(period.kind)}
            </span>
            <span className="truncate">{formatPeriodRange(period)}</span>
            <span className="shrink-0">{timeLabel}</span>
            {period.breaks.length > 0 && (
              <span className="shrink-0 rounded bg-[color:var(--sunken)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--ink-3)]">
                {period.breaks.length} break{period.breaks.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            className="rounded p-1 text-[color:var(--ink-3)] transition-colors hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink)]"
            title="Edit period"
            aria-label={`Edit ${period.title}`}
            onClick={(event) => {
              event.stopPropagation();
              onEdit();
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="rounded p-1 text-[color:var(--ink-3)] transition-colors hover:bg-[oklch(95%_0.04_25)] hover:text-[oklch(55%_0.18_25)]"
            title="Delete period"
            aria-label={`Delete ${period.title}`}
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
    </div>
  );
}

type PeriodEditorProps = {
  period?: Period;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (period: Period) => void;
  onDelete?: () => void;
};

function PeriodEditor({
  period,
  submitLabel,
  onCancel,
  onSubmit,
  onDelete,
}: PeriodEditorProps) {
  const [title, setTitle] = useState(period?.title ?? "");
  const [kind, setKind] = useState<PeriodKind>(period?.kind ?? "placement");
  const [color, setColor] = useState<PeriodColor>(
    period?.color ?? periodDefaultColor("placement"),
  );
  const [startDate, setStartDate] = useState(
    period?.start_date ?? todayKey(),
  );
  const [endDate, setEndDate] = useState(period?.end_date ?? todayKey());
  const [allDay, setAllDay] = useState(
    !period?.daily_start_time || !period?.daily_end_time,
  );
  const [dailyStart, setDailyStart] = useState(
    period?.daily_start_time ?? "09:00",
  );
  const [dailyEnd, setDailyEnd] = useState(period?.daily_end_time ?? "17:00");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(
    period?.days_of_week ?? [1, 2, 3, 4, 5],
  );
  const [breaks, setBreaks] = useState<PeriodBreak[]>(period?.breaks ?? []);
  const [notes, setNotes] = useState(period?.notes ?? "");
  const [lifeArea, setLifeArea] = useState<LifeArea>(
    period?.life_area ??
      PERIOD_KIND_AREA[period?.kind ?? "placement"] ??
      "general",
  );
  // Once the user picks an area manually, stop overriding it from kind.
  const [lifeAreaTouched, setLifeAreaTouched] = useState(
    Boolean(period?.life_area),
  );

  const handleKindChange = (next: PeriodKind) => {
    setKind(next);
    if (!period) {
      setColor(periodDefaultColor(next));
    }
    if (!lifeAreaTouched) {
      setLifeArea(PERIOD_KIND_AREA[next] ?? "general");
    }
  };

  const toggleDay = (index: number) => {
    setDaysOfWeek((current) =>
      current.includes(index)
        ? current.filter((day) => day !== index)
        : [...current, index].sort((a, b) => a - b),
    );
  };

  const addBreak = () => {
    setBreaks((current) => [
      ...current,
      createPeriodBreak({ label: "Lunch", start_time: "12:00", end_time: "13:00" }),
    ]);
  };

  const updateBreak = (id: string, patch: Partial<PeriodBreak>) => {
    setBreaks((current) =>
      current.map((value) => (value.id === id ? { ...value, ...patch } : value)),
    );
  };

  const removeBreak = (id: string) => {
    setBreaks((current) => current.filter((value) => value.id !== id));
  };

  const isValid = Boolean(
    title.trim() &&
      startDate &&
      endDate &&
      startDate <= endDate &&
      (allDay || (dailyStart && dailyEnd && dailyStart < dailyEnd)),
  );

  const handleSubmit = () => {
    if (!isValid) return;
    const next = period
      ? patchPeriod(period, {
          title: title.trim(),
          kind,
          color,
          start_date: startDate,
          end_date: endDate,
          daily_start_time: allDay ? null : dailyStart,
          daily_end_time: allDay ? null : dailyEnd,
          days_of_week: daysOfWeek,
          breaks,
          notes,
          life_area: lifeArea,
        })
      : createPeriod({
          title: title.trim(),
          kind,
          color,
          start_date: startDate,
          end_date: endDate,
          daily_start_time: allDay ? null : dailyStart,
          daily_end_time: allDay ? null : dailyEnd,
          days_of_week: daysOfWeek,
          breaks,
          notes,
          life_area: lifeArea,
        });
    onSubmit(next);
  };

  return (
    <EditorModal
      onClose={onCancel}
      widthClass="w-[460px] max-w-[calc(100vw-2rem)]"
    >
      <div className={EDITOR_CARD_CLASS}>
        <EditorHeader
          eyebrow={period ? "Edit period" : "Add period"}
          title={title.trim() || (period ? "Untitled period" : "New period")}
          meta={[
            periodKindLabel(kind),
            startDate && endDate
              ? formatPeriodRange({
                  ...(period ?? {
                    id: "",
                    schema_version: 0,
                    title: "",
                    kind,
                    color,
                    days_of_week: [],
                    breaks: [],
                    notes: "",
                    created_at: "",
                    updated_at: "",
                  }),
                  start_date: startDate,
                  end_date: endDate,
                } as Period)
              : undefined,
            allDay ? "All day" : `${dailyStart} – ${dailyEnd}`,
          ]}
          onCancel={onCancel}
        />
        <div className={cn(EDITOR_BODY_CLASS, "px-5 py-1")}>
          <div className={periodEditorSectionClass}>
            <div className={cn(periodEditorLabelClass, "mb-2.5")}>Title</div>
            <div className={periodEditorFieldBoxClass}>
              <input
                className={periodEditorInputClass}
                placeholder="Period name"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                autoFocus
              />
            </div>
          </div>
          <PeriodKindPicker value={kind} onChange={handleKindChange} />
          <PeriodColorPicker value={color} onChange={setColor} />
          <div
            className={cn(
              periodEditorSectionClass,
              "flex items-center justify-between gap-3",
            )}
          >
            <div>
              <div className={periodEditorLabelClass}>Life area</div>
              <p className="mt-1 text-[11.5px] leading-snug text-[color:var(--ink-3)]">
                Counts toward this area in time stats. Defaults from kind.
              </p>
            </div>
            <LifeAreaSelect
              value={lifeArea}
              onChange={(next) => {
                setLifeArea(next);
                setLifeAreaTouched(true);
              }}
              aria-label="Period life area"
            />
          </div>
          <PeriodDateRangeFields
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
          />

          <div className={periodEditorSectionClass}>
            <button
              type="button"
              className="flex select-none items-center gap-2 text-[13px] font-medium text-[color:var(--ink-2)]"
              onClick={() => setAllDay((current) => !current)}
            >
              <span
                className={cn(
                  "inline-grid h-4 w-4 place-items-center rounded border border-[color:var(--line-strong)] bg-[color:var(--card)] transition-colors",
                  allDay && "border-[color:var(--ink)] bg-[color:var(--ink)] !text-[color:var(--card)]",
                )}
              >
                {allDay && <Check className="h-3 w-3" />}
              </span>
              <span>All day (no time window)</span>
            </button>

            {!allDay && (
              <PeriodTimeWindowFields
                dailyStart={dailyStart}
                dailyEnd={dailyEnd}
                onDailyStartChange={setDailyStart}
                onDailyEndChange={setDailyEnd}
              />
            )}
          </div>

          <PeriodWeekdayToggles value={daysOfWeek} onToggle={toggleDay} />

          {!allDay && (
            <PeriodBreaksList
              breaks={breaks}
              onAdd={addBreak}
              onUpdate={updateBreak}
              onRemove={removeBreak}
            />
          )}

          <div className={cn(periodEditorSectionClass, "border-b-0")}>
            <div className={cn(periodEditorLabelClass, "mb-2.5")}>Notes</div>
            <textarea
              className="min-h-20 w-full resize-y rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] px-3 py-2 text-[13px] text-[color:var(--ink)] outline-none transition-colors placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--line-strong)] focus:bg-[color:var(--card)] focus:ring-2 focus:ring-[color:var(--ring)]"
              placeholder="Optional notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </div>
        <EditorFooter
          onDelete={onDelete}
          onCancel={onCancel}
          onSubmit={handleSubmit}
          submitLabel={submitLabel}
          submitDisabled={!isValid}
        />
      </div>
    </EditorModal>
  );
}

function PeriodKindPicker({
  value,
  onChange,
}: {
  value: PeriodKind;
  onChange: (next: PeriodKind) => void;
}) {
  return (
    <div className={periodEditorSectionClass}>
      <div className={cn(periodEditorLabelClass, "mb-2.5")}>Kind</div>
      <div className="grid grid-cols-3 gap-1.5">
        {PERIOD_KIND_ORDER.map((kind) => {
          const isActive = kind === value;
          return (
            <button
              key={kind}
              type="button"
              className={cn(
                "flex min-w-0 items-center justify-center gap-1.5 rounded-[var(--r-sm)] border px-2 py-2 text-[12.5px] font-semibold leading-none transition-colors",
                isActive
                  ? "border-[color:var(--ink)] bg-[color:var(--ink)] !text-[color:var(--card)]"
                  : "border-[color:var(--line)] bg-[color:var(--card)] !text-[color:var(--ink-2)] hover:border-[color:var(--line-strong)] hover:bg-[color:var(--sunken)] hover:!text-[color:var(--ink)]",
              )}
              onClick={() => onChange(kind)}
            >
              <PeriodKindIcon kind={kind} className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{periodKindLabel(kind)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PeriodColorPicker({
  value,
  onChange,
}: {
  value: PeriodColor;
  onChange: (next: PeriodColor) => void;
}) {
  return (
    <div className={periodEditorSectionClass}>
      <div className={cn(periodEditorLabelClass, "mb-2.5")}>Colour</div>
      <div className="flex items-center gap-3">
        {PERIOD_COLOR_OPTIONS.map((option) => {
          const tokens = periodColorTokens(option);
          const isActive = option === value;
          return (
            <button
              key={option}
              type="button"
              className={cn(
                "relative inline-grid h-[26px] w-[26px] place-items-center rounded-full border border-transparent transition-transform hover:scale-105",
                tokens.accent,
                isActive &&
                  "after:absolute after:-inset-1 after:rounded-full after:border after:border-[color:var(--ink)]",
              )}
              title={option}
              aria-label={option}
              onClick={() => onChange(option)}
            >
              {isActive && <Check className="h-3.5 w-3.5 text-white drop-shadow-sm" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PeriodDateRangeFields({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: {
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 border-b border-[color:var(--line-soft)] py-3.5">
      <div>
        <div className={cn(periodEditorLabelClass, "mb-2")}>Start date</div>
        <div className={periodEditorFieldBoxClass}>
          <input
            type="date"
            className={periodEditorDateClass}
            value={startDate}
            onChange={(event) => onStartDateChange(event.target.value)}
          />
        </div>
      </div>
      <div>
        <div className={cn(periodEditorLabelClass, "mb-2")}>End date</div>
        <div className={periodEditorFieldBoxClass}>
          <input
            type="date"
            className={periodEditorDateClass}
            value={endDate}
            min={startDate}
            onChange={(event) => onEndDateChange(event.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

function PeriodTimeWindowFields({
  dailyStart,
  dailyEnd,
  onDailyStartChange,
  onDailyEndChange,
}: {
  dailyStart: string;
  dailyEnd: string;
  onDailyStartChange: (value: string) => void;
  onDailyEndChange: (value: string) => void;
}) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-4">
      <div>
        <div className={cn(periodEditorLabelClass, "mb-2")}>Starts</div>
        <div className={periodEditorFieldBoxClass}>
          <input
            type="time"
            step={1800}
            className={periodEditorDateClass}
            value={dailyStart}
            onChange={(event) => onDailyStartChange(event.target.value)}
          />
          <Clock className="h-3.5 w-3.5 shrink-0 text-[color:var(--ink-3)]" />
        </div>
      </div>
      <div>
        <div className={cn(periodEditorLabelClass, "mb-2")}>Ends</div>
        <div className={periodEditorFieldBoxClass}>
          <input
            type="time"
            step={1800}
            className={periodEditorDateClass}
            value={dailyEnd}
            onChange={(event) => onDailyEndChange(event.target.value)}
          />
          <Clock className="h-3.5 w-3.5 shrink-0 text-[color:var(--ink-3)]" />
        </div>
      </div>
    </div>
  );
}

function PeriodWeekdayToggles({
  value,
  onToggle,
}: {
  value: number[];
  onToggle: (index: number) => void;
}) {
  return (
    <div className={periodEditorSectionClass}>
      <div className={cn(periodEditorLabelClass, "mb-2.5")}>Days of week</div>
      <div className="flex gap-1.5">
        {WEEKDAY_LABELS.map((day) => {
          const active = value.includes(day.index);
          return (
            <button
              key={day.index}
              type="button"
              className={cn(
                "h-8 w-8 rounded-full border text-[12px] font-bold leading-none transition-colors",
                active
                  ? "border-[color:var(--ink)] bg-[color:var(--ink)] !text-[color:var(--card)]"
                  : "border-[color:var(--line)] bg-[color:var(--card)] !text-[color:var(--ink-2)] hover:border-[color:var(--line-strong)] hover:bg-[color:var(--sunken)]",
              )}
              onClick={() => onToggle(day.index)}
            >
              {day.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PeriodBreaksList({
  breaks,
  onAdd,
  onUpdate,
  onRemove,
}: {
  breaks: PeriodBreak[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<PeriodBreak>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className={periodEditorSectionClass}>
      <div className="mb-2.5 flex items-center justify-between">
        <div className={periodEditorLabelClass}>Breaks</div>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-[var(--r-sm)] px-2 py-1 text-[12px] font-semibold text-[color:var(--ink-2)] transition-colors hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink)]"
          onClick={onAdd}
        >
          <Plus className="h-3.5 w-3.5" />
          Add break
        </button>
      </div>
      {breaks.length === 0 ? (
        <p className="text-[12.5px] italic text-[color:var(--ink-3)]">
          Add lunch or other gaps inside the daily window.
        </p>
      ) : (
        <div className="space-y-2">
          {breaks.map((value) => (
            <div
              key={value.id}
              className="flex items-center gap-2 rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--sunken)] p-2"
            >
              <input
                className="min-w-0 flex-1 rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] px-2.5 py-1.5 text-[12.5px] font-medium text-[color:var(--ink)] outline-none focus:border-[color:var(--line-strong)] focus:ring-2 focus:ring-[color:var(--ring)]"
                placeholder="Label"
                value={value.label}
                onChange={(event) =>
                  onUpdate(value.id, { label: event.target.value })
                }
              />
              <input
                type="time"
                step={1800}
                className="w-[88px] rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] px-2 py-1.5 font-[family-name:var(--font-mono)] text-[12px] tabular-nums text-[color:var(--ink)] outline-none focus:border-[color:var(--line-strong)] focus:ring-2 focus:ring-[color:var(--ring)]"
                value={value.start_time}
                onChange={(event) =>
                  onUpdate(value.id, { start_time: event.target.value })
                }
              />
              <input
                type="time"
                step={1800}
                className="w-[88px] rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] px-2 py-1.5 font-[family-name:var(--font-mono)] text-[12px] tabular-nums text-[color:var(--ink)] outline-none focus:border-[color:var(--line-strong)] focus:ring-2 focus:ring-[color:var(--ring)]"
                value={value.end_time}
                onChange={(event) =>
                  onUpdate(value.id, { end_time: event.target.value })
                }
              />
              <button
                type="button"
                className="rounded-[var(--r-sm)] p-1.5 text-[color:var(--ink-3)] transition-colors hover:bg-[oklch(95%_0.04_25)] hover:text-[oklch(55%_0.18_25)]"
                title="Remove break"
                onClick={() => onRemove(value.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

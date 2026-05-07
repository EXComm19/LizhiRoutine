"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  Briefcase,
  Building2,
  CalendarRange,
  GraduationCap,
  Pencil,
  Plane,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  Label,
  SectionHeader,
} from "@/components/planner/primitives";
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
import type {
  Period,
  PeriodBreak,
  PeriodColor,
  PeriodKind,
} from "@/lib/schema";
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

const periodEditorInputClass =
  "min-h-0 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-1 text-[11px] leading-4 text-zinc-800 dark:text-zinc-200 outline-none transition-colors placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20";

const periodEditorDateClass = cn(
  periodEditorInputClass,
  "h-8 w-full min-w-0 text-[10px] tabular-nums",
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

  return (
    <>
      <SectionHeader title="Periods" onAdd={() => setIsAdding(true)} />
      <div className="mt-3 space-y-2 pb-4">
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
        {sortedPeriods.map((period) =>
          editingId === period.id ? (
            <PeriodEditor
              key={period.id}
              period={period}
              submitLabel="Save"
              onCancel={() => setEditingId(null)}
              onSubmit={(next) => {
                upsertPeriod(next);
                setEditingId(null);
              }}
            />
          ) : (
            <PeriodCard
              key={period.id}
              period={period}
              onEdit={() => setEditingId(period.id)}
              onDelete={() => deletePeriod(period.id)}
            />
          ),
        )}
        {!sortedPeriods.length && !isAdding && (
          <EmptyState text="No periods yet. Add a placement, holiday, or custom range." />
        )}
      </div>
    </>
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
    : `${period.daily_start_time} – ${period.daily_end_time}`;

  return (
    <div className="group rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5 transition-all hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow-sm">
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
            tokens.block,
            tokens.text,
          )}
        >
          <PeriodKindIcon kind={period.kind} className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
              {period.title}
            </span>
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tokens.accent)} />
          </div>
          <div className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400">
            {formatPeriodRange(period)}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 font-medium">
              {periodKindLabel(period.kind)}
            </span>
            <span>{timeLabel}</span>
            {period.breaks.length > 0 && (
              <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 font-medium">
                {period.breaks.length} break{period.breaks.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            className="rounded p-1 text-zinc-400 dark:text-zinc-500 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-200"
            title="Edit period"
            aria-label={`Edit ${period.title}`}
            onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="rounded p-1 text-zinc-400 dark:text-zinc-500 transition-colors hover:bg-rose-50 dark:hover:bg-rose-500/15 hover:text-rose-600 dark:hover:text-rose-400"
            title="Delete period"
            aria-label={`Delete ${period.title}`}
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

type PeriodEditorProps = {
  period?: Period;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (period: Period) => void;
};

function PeriodEditor({
  period,
  submitLabel,
  onCancel,
  onSubmit,
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

  const handleKindChange = (next: PeriodKind) => {
    setKind(next);
    if (!period) {
      setColor(periodDefaultColor(next));
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
        });
    onSubmit(next);
  };

  return (
    <div className="space-y-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5 text-[11px] shadow-sm">
      <input
        className={cn(periodEditorInputClass, "h-8 w-full")}
        placeholder="Period title (e.g. Spring placement)"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        autoFocus
      />

      <PeriodKindPicker value={kind} onChange={handleKindChange} />
      <PeriodColorPicker value={color} onChange={setColor} />

      <PeriodDateRangeFields
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
      />

      <label className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-600 dark:text-zinc-300">
        <input
          type="checkbox"
          className="h-3 w-3 rounded border-zinc-300 dark:border-zinc-700 accent-indigo-600"
          checked={allDay}
          onChange={(event) => setAllDay(event.target.checked)}
        />
        All day (no time window)
      </label>

      {!allDay && (
        <PeriodTimeWindowFields
          dailyStart={dailyStart}
          dailyEnd={dailyEnd}
          onDailyStartChange={setDailyStart}
          onDailyEndChange={setDailyEnd}
        />
      )}

      <PeriodWeekdayToggles value={daysOfWeek} onToggle={toggleDay} />

      {!allDay && (
        <PeriodBreaksList
          breaks={breaks}
          onAdd={addBreak}
          onUpdate={updateBreak}
          onRemove={removeBreak}
        />
      )}

      <div>
        <Label>Notes</Label>
        <textarea
          className={cn(periodEditorInputClass, "w-full resize-y")}
          placeholder="Optional notes"
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      <div className="flex justify-end gap-1.5 pt-0.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px]"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="h-7 px-2 text-[11px]"
          disabled={!isValid}
          onClick={handleSubmit}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
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
    <div>
      <Label>Kind</Label>
      <div className="grid grid-cols-3 gap-1">
        {PERIOD_KIND_ORDER.map((kind) => {
          const isActive = kind === value;
          return (
            <button
              key={kind}
              type="button"
              className={cn(
                "flex h-7 min-w-0 items-center justify-center gap-1 rounded-md border px-1.5 text-[9.5px] font-medium leading-none transition-colors",
                isActive
                  ? "border-indigo-300 dark:border-indigo-500/40 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
                  : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60",
              )}
              onClick={() => onChange(kind)}
            >
              <PeriodKindIcon kind={kind} className="h-3 w-3 shrink-0" />
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
    <div>
      <Label>Colour</Label>
      <div className="flex items-center gap-1.5">
        {PERIOD_COLOR_OPTIONS.map((option) => {
          const tokens = periodColorTokens(option);
          const isActive = option === value;
          return (
            <button
              key={option}
              type="button"
              className={cn(
                "h-6 w-6 rounded-full border-2 transition-transform",
                tokens.accent,
                isActive
                  ? "border-zinc-900 dark:border-zinc-100 scale-110"
                  : "border-transparent hover:scale-105",
              )}
              title={option}
              aria-label={option}
              onClick={() => onChange(option)}
            />
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
    <div className="grid grid-cols-2 gap-2">
      <div>
        <Label>Start date</Label>
        <input
          type="date"
          className={periodEditorDateClass}
          value={startDate}
          onChange={(event) => onStartDateChange(event.target.value)}
        />
      </div>
      <div>
        <Label>End date</Label>
        <input
          type="date"
          className={periodEditorDateClass}
          value={endDate}
          min={startDate}
          onChange={(event) => onEndDateChange(event.target.value)}
        />
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
    <div className="grid grid-cols-2 gap-2">
      <div>
        <Label>Starts</Label>
        <input
          type="time"
          step={1800}
          className={periodEditorDateClass}
          value={dailyStart}
          onChange={(event) => onDailyStartChange(event.target.value)}
        />
      </div>
      <div>
        <Label>Ends</Label>
        <input
          type="time"
          step={1800}
          className={periodEditorDateClass}
          value={dailyEnd}
          onChange={(event) => onDailyEndChange(event.target.value)}
        />
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
    <div>
      <Label>Days of week</Label>
      <div className="flex gap-1">
        {WEEKDAY_LABELS.map((day) => {
          const active = value.includes(day.index);
          return (
            <button
              key={day.index}
              type="button"
              className={cn(
                "h-6 w-6 rounded-md border text-[10px] font-semibold leading-none transition-colors",
                active
                  ? "border-indigo-300 dark:border-indigo-500/40 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
                  : "border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/60",
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
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <Label className="mb-0">Breaks</Label>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-indigo-600 dark:text-indigo-300 transition-colors hover:bg-indigo-50 dark:hover:bg-indigo-500/15"
          onClick={onAdd}
        >
          <Plus className="h-3 w-3" />
          Add break
        </button>
      </div>
      {breaks.length === 0 ? (
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
          Add lunch or other gaps inside the daily window.
        </p>
      ) : (
        <div className="space-y-1.5">
          {breaks.map((value) => (
            <div
              key={value.id}
              className="flex items-center gap-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 p-1.5"
            >
              <input
                className="min-w-0 flex-1 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-1 text-[11px] text-zinc-700 dark:text-zinc-300 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                placeholder="Label"
                value={value.label}
                onChange={(event) =>
                  onUpdate(value.id, { label: event.target.value })
                }
              />
              <input
                type="time"
                step={1800}
                className="w-[88px] rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-1.5 py-1 text-[11px] tabular-nums text-zinc-700 dark:text-zinc-300 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                value={value.start_time}
                onChange={(event) =>
                  onUpdate(value.id, { start_time: event.target.value })
                }
              />
              <input
                type="time"
                step={1800}
                className="w-[88px] rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-1.5 py-1 text-[11px] tabular-nums text-zinc-700 dark:text-zinc-300 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                value={value.end_time}
                onChange={(event) =>
                  onUpdate(value.id, { end_time: event.target.value })
                }
              />
              <button
                type="button"
                className="rounded p-1 text-zinc-400 dark:text-zinc-500 transition-colors hover:bg-rose-50 dark:hover:bg-rose-500/15 hover:text-rose-600 dark:hover:text-rose-400"
                title="Remove break"
                onClick={() => onRemove(value.id)}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

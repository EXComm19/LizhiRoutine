import {
  TOTAL_MINUTES,
  dateKeyInRange,
  parseDateKey,
  wallTimeToTimelineEnd,
  wallTimeToTimelineMinutes,
  weekdayIndex,
} from "@/lib/time";
import type { Period, PeriodColor, PeriodKind } from "@/lib/schema";

export type PeriodSegment = {
  startMinutes: number;
  endMinutes: number;
};

export function periodActiveOnDate(period: Period, dateKey: string): boolean {
  if (!dateKeyInRange(dateKey, period.start_date, period.end_date)) return false;
  if (!period.days_of_week.length) return true;
  return period.days_of_week.includes(weekdayIndex(dateKey));
}

export function periodDailyRange(period: Period): PeriodSegment {
  if (!period.daily_start_time || !period.daily_end_time) {
    return { startMinutes: 0, endMinutes: TOTAL_MINUTES };
  }
  const startMinutes = wallTimeToTimelineMinutes(period.daily_start_time);
  const endMinutes = wallTimeToTimelineEnd(period.daily_end_time, startMinutes);
  if (endMinutes <= startMinutes) {
    // Empty or zero-length window — caller treats this as "no segments".
    return { startMinutes, endMinutes: startMinutes };
  }
  return { startMinutes, endMinutes };
}

export function periodSegmentsForDay(period: Period): PeriodSegment[] {
  const { startMinutes, endMinutes } = periodDailyRange(period);
  if (endMinutes <= startMinutes) return [];

  const breaks = period.breaks
    .map((value) => {
      const breakStart = wallTimeToTimelineMinutes(value.start_time);
      const breakEnd = wallTimeToTimelineEnd(value.end_time, breakStart);
      return { start: breakStart, end: breakEnd };
    })
    .filter((value) => value.end > value.start)
    .filter((value) => value.end > startMinutes && value.start < endMinutes)
    .map((value) => ({
      start: Math.max(value.start, startMinutes),
      end: Math.min(value.end, endMinutes),
    }))
    .sort((a, b) => a.start - b.start);

  if (!breaks.length) {
    return [{ startMinutes, endMinutes }];
  }

  const segments: PeriodSegment[] = [];
  let cursor = startMinutes;
  for (const gap of breaks) {
    if (gap.start > cursor) {
      segments.push({ startMinutes: cursor, endMinutes: gap.start });
    }
    cursor = Math.max(cursor, gap.end);
  }
  if (cursor < endMinutes) {
    segments.push({ startMinutes: cursor, endMinutes });
  }
  return segments;
}

export const PERIOD_KIND_LABELS: Record<PeriodKind, string> = {
  placement: "Placement",
  work: "Work",
  internship: "Internship",
  study: "Study",
  holiday: "Holiday",
  custom: "Custom",
};

export const PERIOD_KIND_DEFAULT_COLOR: Record<PeriodKind, PeriodColor> = {
  placement: "blue",
  work: "zinc",
  internship: "violet",
  study: "emerald",
  holiday: "amber",
  custom: "rose",
};

export function periodKindLabel(kind: PeriodKind): string {
  return PERIOD_KIND_LABELS[kind] ?? PERIOD_KIND_LABELS.custom;
}

export function periodDefaultColor(kind: PeriodKind): PeriodColor {
  return PERIOD_KIND_DEFAULT_COLOR[kind] ?? PERIOD_KIND_DEFAULT_COLOR.custom;
}

export function formatPeriodRange(period: Period): string {
  const start = parseDateKey(period.start_date);
  const end = parseDateKey(period.end_date);
  const sameYear = start.getFullYear() === end.getFullYear();
  const fmtShort = new Intl.DateTimeFormat("en-AU", {
    month: "short",
    day: "numeric",
  });
  const fmtLong = new Intl.DateTimeFormat("en-AU", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const startLabel = sameYear ? fmtShort.format(start) : fmtLong.format(start);
  return `${startLabel} - ${fmtLong.format(end)}`;
}

const WEEKDAY_NAMES: Record<number, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function periodDaysLabel(period: Period): string {
  if (!period.days_of_week.length) return "Every day";
  return WEEKDAY_DISPLAY_ORDER.filter((day) =>
    period.days_of_week.includes(day),
  )
    .map((day) => WEEKDAY_NAMES[day])
    .join(", ");
}

export function periodScheduleLabel(period: Period): string {
  if (!period.daily_start_time || !period.daily_end_time) return "All day";
  return `${period.daily_start_time} - ${period.daily_end_time}`;
}

export function periodBreaksLabel(period: Period): string {
  if (!period.breaks.length) return "";
  return `Breaks: ${period.breaks
    .map(
      (periodBreak) =>
        `${periodBreak.label || "Break"} ${periodBreak.start_time}-${periodBreak.end_time}`,
    )
    .join("; ")}`;
}

export type PeriodHoverDetails = {
  kindLabel: string;
  range: string;
  schedule: string;
  days: string;
  breaks: string;
  notes: string;
};

export function periodHoverDetails(period: Period): PeriodHoverDetails {
  return {
    kindLabel: periodKindLabel(period.kind),
    range: formatPeriodRange(period),
    schedule: periodScheduleLabel(period),
    days: periodDaysLabel(period),
    breaks: periodBreaksLabel(period),
    notes: period.notes.trim(),
  };
}

export function periodHoverTitle(period: Period): string {
  const details = periodHoverDetails(period);
  return [
    period.title,
    `${details.kindLabel} · ${details.range}`,
    details.schedule,
    details.days,
    details.breaks,
    details.notes,
  ]
    .filter(Boolean)
    .join("\n");
}

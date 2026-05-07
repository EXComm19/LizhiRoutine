export const DAY_START_HOUR = 5;
export const DAY_END_HOUR = 29;
const PIXELS_PER_HOUR = 72;

export const MINUTES_PER_PIXEL = 60 / PIXELS_PER_HOUR;
export const SNAP_MINUTES = 30;

export const TOTAL_MINUTES = (DAY_END_HOUR - DAY_START_HOUR) * 60;
export const TIMELINE_HEIGHT = TOTAL_MINUTES / MINUTES_PER_PIXEL;

export function minutesToPixels(minutes: number) {
  return minutes / MINUTES_PER_PIXEL;
}

export function pixelsToMinutes(pixels: number) {
  return pixels * MINUTES_PER_PIXEL;
}

export function snapMinutes(minutes: number) {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

export function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(dateKey: string, days: number) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return formatDateKey(date);
}

export function todayKey() {
  return formatDateKey(new Date());
}

export function timelineStart(dateKey: string) {
  const date = parseDateKey(dateKey);
  date.setHours(DAY_START_HOUR, 0, 0, 0);
  return date;
}

export function timelineEnd(dateKey: string) {
  const date = timelineStart(dateKey);
  date.setMinutes(date.getMinutes() + TOTAL_MINUTES);
  return date;
}

export function minutesFromStart(dateValue: string, dateKey = todayKey()) {
  const start = timelineStart(dateKey).getTime();
  const value = new Date(dateValue).getTime();
  return Math.round((value - start) / 60000);
}

export function dateForTimelineMinutes(dateKey: string, minutes: number) {
  const date = timelineStart(dateKey);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

export function overlapsTimeline(
  startTime: string | null,
  durationMinutes: number,
  dateKey: string,
) {
  if (!startTime) return false;
  const blockStart = new Date(startTime).getTime();
  const blockEnd = blockStart + durationMinutes * 60000;
  return (
    blockEnd > timelineStart(dateKey).getTime() &&
    blockStart < timelineEnd(dateKey).getTime()
  );
}

export function visibleRange(
  startTime: string,
  durationMinutes: number,
  dateKey: string,
) {
  const windowStart = timelineStart(dateKey).getTime();
  const windowEnd = timelineEnd(dateKey).getTime();
  const blockStart = new Date(startTime).getTime();
  const blockEnd = blockStart + durationMinutes * 60000;
  const visibleStart = Math.max(blockStart, windowStart);
  const visibleEnd = Math.min(blockEnd, windowEnd);

  return {
    topMinutes: Math.max(0, Math.round((visibleStart - windowStart) / 60000)),
    durationMinutes: Math.max(
      1,
      Math.round((visibleEnd - visibleStart) / 60000),
    ),
    continuesBefore: blockStart < windowStart,
    continuesAfter: blockEnd > windowEnd,
  };
}

export function formatTimeFromMinutes(minutes: number) {
  const total = DAY_START_HOUR * 60 + minutes;
  const hours = Math.floor(total / 60) % 24;
  const mins = total % 60;

  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
}

export function formatDayLabel(dateKey: string) {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(parseDateKey(dateKey));
}

export function timelineHours() {
  return Array.from(
    { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
    (_, index) => DAY_START_HOUR + index,
  );
}

export function parseHmToMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return 0;
  const hours = Math.min(24, Math.max(0, Number(match[1])));
  const minutes = Math.min(59, Math.max(0, Number(match[2])));
  return hours * 60 + minutes;
}

export function formatHm(minutes: number): string {
  const safe = Math.max(0, Math.min(24 * 60, minutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function compareDateKeys(a: string, b: string) {
  return a.localeCompare(b);
}

export function dateKeyInRange(dateKey: string, start: string, end: string) {
  return compareDateKeys(dateKey, start) >= 0 && compareDateKeys(dateKey, end) <= 0;
}

export function dateKeysBetween(start: string, end: string): string[] {
  if (compareDateKeys(start, end) > 0) return [];
  const keys: string[] = [];
  let cursor = start;
  while (compareDateKeys(cursor, end) <= 0) {
    keys.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return keys;
}

export function weekdayIndex(dateKey: string): number {
  return parseDateKey(dateKey).getDay();
}

/**
 * Convert a wall-clock "HH:MM" to timeline minutes (0..TOTAL_MINUTES) on
 * the day-window axis that starts at DAY_START_HOUR. Times before
 * DAY_START_HOUR wrap to the bottom of the column (e.g. 02:00 with a 5am
 * start lands at minute 1260 = 21h into the timeline).
 */
export function wallTimeToTimelineMinutes(value: string): number {
  const dayStartMinutes = DAY_START_HOUR * 60;
  const raw = parseHmToMinutes(value);
  const wrapped = raw < dayStartMinutes ? raw + 24 * 60 : raw;
  const offset = wrapped - dayStartMinutes;
  return Math.max(0, Math.min(TOTAL_MINUTES, offset));
}

/**
 * Like wallTimeToTimelineMinutes, but used for the "end" side of a range:
 * if the end converts to a value at or before the start, treat it as the
 * next wrap-cycle so the range stays contiguous.
 */
export function wallTimeToTimelineEnd(
  value: string,
  startMinutes: number,
): number {
  const minutes = wallTimeToTimelineMinutes(value);
  if (minutes > startMinutes) return minutes;
  // End rolled past 5am into the next cycle — push by 24h, then clamp.
  return Math.min(TOTAL_MINUTES, minutes + 24 * 60);
}

export type ImportedCalendarEvent = {
  sourceId: string;
  title: string;
  startTime: string;
  durationMinutes: number;
};

type RawCalendarEvent = {
  uid?: string;
  summary?: string;
  dtstart?: string;
  dtend?: string;
  duration?: string;
  rrule?: string;
  exdates: string[];
};

const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_LOOKAHEAD_DAYS = 180;

export function parseIcsCalendar(
  text: string,
  anchorDate = new Date(),
): ImportedCalendarEvent[] {
  const events = parseRawEvents(text);
  const rangeStart = new Date(anchorDate);
  rangeStart.setDate(rangeStart.getDate() - DEFAULT_LOOKBACK_DAYS);
  rangeStart.setHours(0, 0, 0, 0);

  const rangeEnd = new Date(anchorDate);
  rangeEnd.setDate(rangeEnd.getDate() + DEFAULT_LOOKAHEAD_DAYS);
  rangeEnd.setHours(23, 59, 59, 999);

  return events.flatMap((event) => expandEvent(event, rangeStart, rangeEnd));
}

function parseRawEvents(text: string) {
  const lines = unfoldIcsLines(text);
  const events: RawCalendarEvent[] = [];
  let current: RawCalendarEvent | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = { exdates: [] };
      continue;
    }

    if (line === "END:VEVENT") {
      if (current) events.push(current);
      current = null;
      continue;
    }

    if (!current) continue;

    const { name, value } = splitProperty(line);
    if (!name) continue;

    if (name === "UID") current.uid = value;
    if (name === "SUMMARY") current.summary = unescapeIcsText(value);
    if (name === "DTSTART") current.dtstart = value;
    if (name === "DTEND") current.dtend = value;
    if (name === "DURATION") current.duration = value;
    if (name === "RRULE") current.rrule = value;
    if (name === "EXDATE") {
      current.exdates.push(...value.split(",").map((item) => item.trim()));
    }
  }

  return events;
}

function unfoldIcsLines(text: string) {
  const rawLines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const lines: string[] = [];

  for (const line of rawLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line.trimEnd());
    }
  }

  return lines;
}

function splitProperty(line: string) {
  const colonIndex = line.indexOf(":");
  if (colonIndex === -1) return { name: "", value: "" };

  const rawName = line.slice(0, colonIndex).split(";")[0].toUpperCase();
  return {
    name: rawName,
    value: line.slice(colonIndex + 1),
  };
}

function expandEvent(
  event: RawCalendarEvent,
  rangeStart: Date,
  rangeEnd: Date,
) {
  if (!event.dtstart) return [];

  const firstStart = parseIcsDate(event.dtstart);
  if (!firstStart) return [];

  const durationMinutes = getDurationMinutes(event, firstStart);
  const title = event.summary?.trim() || "Calendar event";
  const uid = event.uid || `${title}-${event.dtstart}`;
  const exdates = new Set(
    event.exdates
      .map((value) => parseIcsDate(value)?.toISOString())
      .filter(Boolean),
  );

  if (!event.rrule) {
    if (!eventIntersectsRange(firstStart, durationMinutes, rangeStart, rangeEnd)) {
      return [];
    }

    return [
      toImportedEvent(uid, title, firstStart, durationMinutes, firstStart),
    ];
  }

  const rule = parseRule(event.rrule);
  if (!rule.freq || !["DAILY", "WEEKLY"].includes(rule.freq)) {
    return eventIntersectsRange(firstStart, durationMinutes, rangeStart, rangeEnd)
      ? [toImportedEvent(uid, title, firstStart, durationMinutes, firstStart)]
      : [];
  }

  const interval = Number(rule.interval ?? "1") || 1;
  const until = rule.until ? (parseIcsDate(rule.until) ?? rangeEnd) : rangeEnd;
  const count = rule.count ? Number(rule.count) : Number.POSITIVE_INFINITY;
  const byDays = parseByDay(rule.byday);
  const results: ImportedCalendarEvent[] = [];
  let emitted = 0;

  if (rule.freq === "DAILY") {
    const cursor = new Date(firstStart);
    while (cursor <= rangeEnd && cursor <= until && emitted < count) {
      if (
        !exdates.has(cursor.toISOString()) &&
        eventIntersectsRange(cursor, durationMinutes, rangeStart, rangeEnd)
      ) {
        results.push(toImportedEvent(uid, title, cursor, durationMinutes, cursor));
      }
      emitted += 1;
      cursor.setDate(cursor.getDate() + interval);
    }
    return results;
  }

  const weekCursor = new Date(firstStart);
  const dayOffsets = byDays.length ? byDays : [firstStart.getDay()];

  while (weekCursor <= rangeEnd && weekCursor <= until && emitted < count) {
    const startOfWeek = new Date(weekCursor);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

    for (const day of dayOffsets) {
      const occurrence = new Date(startOfWeek);
      occurrence.setDate(startOfWeek.getDate() + day);
      occurrence.setHours(
        firstStart.getHours(),
        firstStart.getMinutes(),
        firstStart.getSeconds(),
        firstStart.getMilliseconds(),
      );

      if (occurrence < firstStart || occurrence > rangeEnd || occurrence > until) {
        continue;
      }

      if (emitted >= count) break;
      emitted += 1;

      if (
        !exdates.has(occurrence.toISOString()) &&
        eventIntersectsRange(occurrence, durationMinutes, rangeStart, rangeEnd)
      ) {
        results.push(
          toImportedEvent(uid, title, occurrence, durationMinutes, occurrence),
        );
      }
    }

    weekCursor.setDate(weekCursor.getDate() + 7 * interval);
  }

  return results;
}

function parseIcsDate(value: string) {
  const clean = value.trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(clean);
  if (dateOnly) {
    return new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
    );
  }

  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(clean);
  if (!match) return null;

  const [, year, month, day, hour, minute, second, utc] = match;
  if (utc) {
    return new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
      ),
    );
  }

  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
}

function getDurationMinutes(event: RawCalendarEvent, start: Date) {
  if (event.dtend) {
    const end = parseIcsDate(event.dtend);
    if (end) return Math.max(30, Math.round((end.getTime() - start.getTime()) / 60000));
  }

  if (event.duration) {
    const duration = parseDuration(event.duration);
    if (duration) return duration;
  }

  return 60;
}

function parseDuration(value: string) {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(value);
  if (!match) return null;

  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  return Math.max(30, days * 24 * 60 + hours * 60 + minutes);
}

function parseRule(value: string) {
  return Object.fromEntries(
    value.split(";").map((part) => {
      const [key, ruleValue] = part.split("=");
      return [key.toLowerCase(), ruleValue];
    }),
  ) as Record<string, string | undefined>;
}

function parseByDay(value?: string) {
  if (!value) return [];

  const dayMap: Record<string, number> = {
    SU: 0,
    MO: 1,
    TU: 2,
    WE: 3,
    TH: 4,
    FR: 5,
    SA: 6,
  };

  return value
    .split(",")
    .map((day) => dayMap[day.slice(-2)])
    .filter((day) => typeof day === "number")
    .sort((a, b) => a - b);
}

function eventIntersectsRange(
  start: Date,
  durationMinutes: number,
  rangeStart: Date,
  rangeEnd: Date,
) {
  const end = new Date(start.getTime() + durationMinutes * 60000);
  return end >= rangeStart && start <= rangeEnd;
}

function toImportedEvent(
  uid: string,
  title: string,
  start: Date,
  durationMinutes: number,
  occurrence: Date,
) {
  const occurrenceStamp = occurrence.toISOString();
  return {
    sourceId: `${uid}-${occurrenceStamp}`,
    title,
    startTime: start.toISOString(),
    durationMinutes,
  };
}

function unescapeIcsText(value: string) {
  return value
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

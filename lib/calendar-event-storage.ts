import type { ImportedCalendarEvent } from "@/lib/calendar-import";
import { createTask } from "@/lib/factories";
import { DAY_START_HOUR, formatDateKey } from "@/lib/time";
import { loadDay, saveDay } from "@/lib/storage";
import type { Task } from "@/lib/schema";

function ownerDateKey(startTime: string) {
  const date = new Date(startTime);
  if (date.getHours() < DAY_START_HOUR) {
    date.setDate(date.getDate() - 1);
  }

  return formatDateKey(date);
}

function calendarTaskId(sourceId: string) {
  return `calendar-${sourceId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120)}`;
}

export function importCalendarEventsToStorage(events: ImportedCalendarEvent[]) {
  const grouped = new Map<string, Task[]>();

  for (const event of events) {
    const dateKey = ownerDateKey(event.startTime);
    const task = createTask({
      id: calendarTaskId(event.sourceId),
      title: event.title,
      category: "T1",
      kind: "calendar",
      duration_minutes: event.durationMinutes,
      start_time: event.startTime,
      locked: true,
      source_id: event.sourceId,
    });
    grouped.set(dateKey, [...(grouped.get(dateKey) ?? []), task]);
  }

  let importedCount = 0;

  for (const [dateKey, tasksForDay] of grouped) {
    const existingTasks = loadDay(dateKey);
    const existingSources = new Set(
      existingTasks
        .map((task) => task.source_id)
        .filter((value): value is string => Boolean(value)),
    );
    const existingIds = new Set(existingTasks.map((task) => task.id));
    const seenSources = new Set<string>();
    const seenIds = new Set<string>();

    const freshTasks = tasksForDay.filter((task) => {
      if (existingIds.has(task.id)) return false;
      if (seenIds.has(task.id)) return false;
      if (task.source_id && existingSources.has(task.source_id)) return false;
      if (task.source_id && seenSources.has(task.source_id)) return false;
      seenIds.add(task.id);
      if (task.source_id) seenSources.add(task.source_id);
      return true;
    });

    if (!freshTasks.length) continue;
    importedCount += freshTasks.length;
    saveDay(dateKey, [...existingTasks, ...freshTasks]);
  }

  return importedCount;
}

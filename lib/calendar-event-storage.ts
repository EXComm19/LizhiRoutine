import type { ImportedCalendarEvent } from "@/lib/calendar-import";
import { createTask } from "@/lib/factories";
import { DAY_START_HOUR, formatDateKey } from "@/lib/time";
import { loadAllDays, loadDay, saveDay } from "@/lib/storage";
import type { LifeArea, Task } from "@/lib/schema";

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

export function importCalendarEventsToStorage(
  events: ImportedCalendarEvent[],
  /** Human label for this import (filename or URL); shown in the manage UI. */
  batchLabel = "Calendar import",
) {
  const grouped = new Map<string, Task[]>();
  // One batch stamp shared by every event in this import, so the manage
  // UI can group + bulk-edit them together later.
  const importBatch = {
    id: `ics-${Date.now().toString(36)}`,
    label: batchLabel.slice(0, 120),
    importedAt: new Date().toISOString(),
  };

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
      import_batch: importBatch,
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

/** One imported calendar block, flattened for the manage UI. */
export type ImportedCalendarBlock = {
  id: string;
  dateKey: string;
  title: string;
  startTime: string | null;
  durationMinutes: number;
  lifeArea: LifeArea | null;
  batchId: string;
};

/** A group of imported blocks sharing one import batch. */
export type ImportedCalendarBatch = {
  id: string;
  label: string;
  importedAt: string | null;
  blocks: ImportedCalendarBlock[];
};

const LEGACY_BATCH_ID = "__legacy__";

/**
 * Enumerate every ICS-imported calendar block across all days, grouped
 * by import batch. Blocks predating the batch field land in a single
 * "Earlier import" group. Batches sorted newest-import first; blocks
 * within a batch sorted by start time descending.
 */
export function listImportedCalendarBatches(): ImportedCalendarBatch[] {
  const byBatch = new Map<
    string,
    { label: string; importedAt: string | null; blocks: ImportedCalendarBlock[] }
  >();

  for (const { dateKey, tasks } of loadAllDays()) {
    for (const task of tasks) {
      if (task.kind !== "calendar") continue;
      const batchId = task.import_batch?.id ?? LEGACY_BATCH_ID;
      const label = task.import_batch?.label ?? "Earlier import";
      const importedAt = task.import_batch?.importedAt ?? null;
      const group =
        byBatch.get(batchId) ??
        (() => {
          const g = { label, importedAt, blocks: [] as ImportedCalendarBlock[] };
          byBatch.set(batchId, g);
          return g;
        })();
      group.blocks.push({
        id: task.id,
        dateKey,
        title: task.title,
        startTime: task.start_time,
        durationMinutes: task.duration_minutes,
        lifeArea: task.life_area ?? null,
        batchId,
      });
    }
  }

  const batches: ImportedCalendarBatch[] = [...byBatch.entries()].map(
    ([id, group]) => ({
      id,
      label: group.label,
      importedAt: group.importedAt,
      blocks: group.blocks.sort((a, b) =>
        (b.startTime ?? "").localeCompare(a.startTime ?? ""),
      ),
    }),
  );

  // Newest import first; legacy group last.
  return batches.sort((a, b) => {
    if (a.id === LEGACY_BATCH_ID) return 1;
    if (b.id === LEGACY_BATCH_ID) return -1;
    return (b.importedAt ?? "").localeCompare(a.importedAt ?? "");
  });
}

/** Set (or clear) the life-area override on one imported block. */
export function setImportedCalendarBlockArea(
  dateKey: string,
  taskId: string,
  area: LifeArea,
): void {
  const tasks = loadDay(dateKey);
  let changed = false;
  const next = tasks.map((task) => {
    if (task.id !== taskId) return task;
    changed = true;
    return { ...task, life_area: area, updated_at: new Date().toISOString() };
  });
  if (changed) saveDay(dateKey, next);
}

/** Delete one imported calendar block. */
export function deleteImportedCalendarBlock(
  dateKey: string,
  taskId: string,
): void {
  const tasks = loadDay(dateKey);
  const next = tasks.filter((task) => task.id !== taskId);
  if (next.length !== tasks.length) saveDay(dateKey, next);
}

/** Delete every imported calendar block across all days. Returns count removed. */
export function clearAllImportedCalendarBlocks(): number {
  let removed = 0;
  for (const { dateKey, tasks } of loadAllDays()) {
    const next = tasks.filter((task) => task.kind !== "calendar");
    if (next.length !== tasks.length) {
      removed += tasks.length - next.length;
      saveDay(dateKey, next);
    }
  }
  return removed;
}

const LEGACY_BATCH_MATCH = "__legacy__";

function taskInBatch(task: Task, batchId: string): boolean {
  if (task.kind !== "calendar") return false;
  if (batchId === LEGACY_BATCH_MATCH) return !task.import_batch;
  return task.import_batch?.id === batchId;
}

/** Set the life area on every block in an import batch. */
export function setImportedCalendarBatchArea(
  batchId: string,
  area: LifeArea,
): void {
  const now = new Date().toISOString();
  for (const { dateKey, tasks } of loadAllDays()) {
    let changed = false;
    const next = tasks.map((task) => {
      if (!taskInBatch(task, batchId)) return task;
      changed = true;
      return { ...task, life_area: area, updated_at: now };
    });
    if (changed) saveDay(dateKey, next);
  }
}

/** Delete every block in an import batch. Returns count removed. */
export function deleteImportedCalendarBatch(batchId: string): number {
  let removed = 0;
  for (const { dateKey, tasks } of loadAllDays()) {
    const next = tasks.filter((task) => !taskInBatch(task, batchId));
    if (next.length !== tasks.length) {
      removed += tasks.length - next.length;
      saveDay(dateKey, next);
    }
  }
  return removed;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Paperclip, Sparkles, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  TodoContextDoc,
  TodoEstimate,
  TodoEstimateSnapshot,
  TodoItem,
} from "@/lib/schema";
import { cn } from "@/lib/utils";

const ACCEPTED_FILE_TYPES = ".md,.markdown,.pdf,text/markdown,application/pdf";
const MAX_TOTAL_NEW_BYTES = 12 * 1024 * 1024; // matches server-side per-file cap

type EstimateRequestBody = {
  todoTitle: string;
  todoCategory: TodoItem["category"];
  existingDocs: { name: string; text: string }[];
  newFiles: { name: string; mime: string; base64: string }[];
  userInsight?: string;
};

type EstimateResponseBody = {
  estimate: TodoEstimate;
  newDocs: TodoContextDoc[];
  warnings: string[];
};

type ErrorResponseBody = { error?: string };

async function fileToBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("unexpected reader result"));
        return;
      }
      // data:application/pdf;base64,XXXX -> XXXX
      const idx = result.indexOf(",");
      resolve(idx === -1 ? result : result.slice(idx + 1));
    };
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatHours(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  // Show whole hours cleanly when it lands on an integer; otherwise 1 decimal.
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

/**
 * Inline single-line "Est Xh · took Yh (1.4×)" caption shown under a
 * completed todo whose estimate was snapshotted at completion. Phase-1
 * surfaces the data; future phases will read this back into the AI prompt.
 *
 * Renders nothing when actual_minutes is missing yet (snapshot exists but
 * nothing's been logged) — we instead show a quieter "Est Xh" line so the
 * user knows the snapshot is there and waiting.
 */
export function EstimateAccuracyLine({
  snapshot,
  actualMinutes,
}: {
  snapshot: TodoEstimateSnapshot;
  actualMinutes: number | null;
}) {
  if (actualMinutes === null) {
    return (
      <div className="mt-1.5 font-[family-name:var(--font-mono)] text-[10.5px] text-[color:var(--ink-3)]">
        Est {formatHours(snapshot.minutes)} · no actuals logged
      </div>
    );
  }
  const ratio = actualMinutes / Math.max(1, snapshot.minutes);
  const overshoot = ratio > 1.2;
  const undershoot = ratio < 0.8;
  return (
    <div className="mt-1.5 flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-[10.5px] text-[color:var(--ink-3)]">
      <span>Est {formatHours(snapshot.minutes)}</span>
      <span>·</span>
      <span>took {formatHours(actualMinutes)}</span>
      <span
        className={cn(
          "rounded px-1 py-px text-[9.5px] tabular-nums",
          overshoot
            ? "bg-[oklch(94%_0.04_30)] text-[oklch(45%_0.15_30)] dark:bg-[oklch(30%_0.10_30)] dark:text-[oklch(82%_0.10_30)]"
            : undershoot
              ? "bg-[oklch(94%_0.05_160)] text-[oklch(40%_0.13_160)] dark:bg-[oklch(28%_0.08_160)] dark:text-[oklch(80%_0.10_160)]"
              : "bg-[color:var(--sunken)] text-[color:var(--ink-2)]",
        )}
      >
        {ratio.toFixed(2)}×
      </span>
    </div>
  );
}

/**
 * Compact, always-visible progress bar — shown inline on the reminder card
 * whenever the todo has an estimate, regardless of whether the full context
 * panel is expanded.
 */
export function TodoEstimateProgressBar({
  estimate,
  completedMinutes,
  compact = false,
}: {
  estimate: TodoEstimate;
  completedMinutes: number;
  compact?: boolean;
}) {
  const target = Math.max(1, estimate.minutes);
  const ratio = Math.min(1, completedMinutes / target);
  const pct = Math.round(ratio * 100);
  const isDone = completedMinutes >= target;

  return (
    <div className={cn("min-w-0", compact ? "flex items-center gap-2" : "")}>
      {!compact && (
        <div className="mb-1 flex items-center justify-between text-[11px] text-[color:var(--ink-2)]">
          <span className="font-medium">
            {formatHours(completedMinutes)} of {formatHours(estimate.minutes)}
          </span>
          <span className="font-[family-name:var(--font-mono)] tabular-nums text-[10.5px] text-[color:var(--ink-3)]">
            {pct}%
          </span>
        </div>
      )}
      <div
        className={cn(
          "overflow-hidden rounded-full bg-[color:var(--sunken)]",
          compact ? "h-1 flex-1" : "h-1.5",
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            isDone ? "bg-[oklch(55%_0.15_160)]" : "bg-[color:var(--ink)]",
          )}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
      {compact && (
        <span className="shrink-0 font-[family-name:var(--font-mono)] text-[10px] tabular-nums text-[color:var(--ink-3)]">
          {formatHours(completedMinutes)}/{formatHours(estimate.minutes)}
        </span>
      )}
    </div>
  );
}

/**
 * Expanded panel shown under a ReminderCard when the user clicks the
 * paperclip toggle. Lets them upload .md / .pdf, see attached docs, (re-)run
 * the AI estimate, and view a full progress bar.
 */
export function TodoContextPanel({
  todo,
  completedMinutes,
  onUpdate,
  onClose,
}: {
  todo: TodoItem;
  completedMinutes: number;
  /** Persists changes (context_docs, estimate) up through the normal flow. */
  onUpdate: (values: Partial<TodoItem>) => void;
  onClose: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isWorking, setIsWorking] = useState(false);
  const [message, setMessage] = useState<{
    tone: "info" | "error";
    text: string;
  } | null>(null);
  // Local mirror of the saved insight so the textarea can be typed in
  // without persisting on every keystroke; we save it onBlur and also
  // include the current value with each estimate request.
  const [insightDraft, setInsightDraft] = useState<string>(
    todo.user_insight ?? "",
  );

  // Esc to close — standard dialog behaviour.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock background scroll while the modal is open (saves the user from
  // accidentally scrolling the planner under the backdrop).
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const commitInsight = () => {
    const trimmed = insightDraft.trim();
    const next = trimmed ? trimmed.slice(0, 2000) : null;
    if (next !== (todo.user_insight ?? null)) {
      onUpdate({ user_insight: next });
    }
  };

  const removeDoc = (docId: string) => {
    onUpdate({
      context_docs: todo.context_docs.filter((doc) => doc.id !== docId),
    });
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((current) => current.filter((_, idx) => idx !== index));
  };

  const handleFilePick = (files: FileList | null) => {
    if (!files || !files.length) return;
    const accepted: File[] = [];
    let runningBytes = pendingFiles.reduce(
      (total, file) => total + file.size,
      0,
    );
    for (const file of Array.from(files)) {
      // Defensive client-side guard — server enforces real limits.
      if (runningBytes + file.size > MAX_TOTAL_NEW_BYTES) {
        setMessage({
          tone: "error",
          text: `Too many bytes queued — drop the upload below ${formatBytes(MAX_TOTAL_NEW_BYTES)}.`,
        });
        break;
      }
      accepted.push(file);
      runningBytes += file.size;
    }
    if (accepted.length) {
      setPendingFiles((current) => [...current, ...accepted]);
      setMessage(null);
    }
  };

  const runEstimate = async () => {
    if (isWorking) return;
    setIsWorking(true);
    setMessage(null);
    try {
      const encoded = await Promise.all(
        pendingFiles.map(async (file) => ({
          name: file.name,
          mime: file.type || "",
          base64: await fileToBase64(file),
        })),
      );
      const insightTrim = insightDraft.trim();
      const body: EstimateRequestBody = {
        todoTitle: todo.title,
        todoCategory: todo.category,
        existingDocs: todo.context_docs.map((doc) => ({
          name: doc.name,
          text: doc.text,
        })),
        newFiles: encoded,
        userInsight: insightTrim || undefined,
      };
      const response = await fetch("/api/estimate-todo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | ErrorResponseBody
          | null;
        setMessage({
          tone: "error",
          text: payload?.error ?? `Estimate failed (${response.status}).`,
        });
        return;
      }
      const result = (await response.json()) as EstimateResponseBody;
      const trimmedInsight = insightDraft.trim();
      onUpdate({
        context_docs: [...todo.context_docs, ...result.newDocs],
        estimate: result.estimate,
        // Save the insight at the same moment so a refresh / re-estimate
        // keeps it. Empty string means "the user cleared it".
        user_insight: trimmedInsight ? trimmedInsight.slice(0, 2000) : null,
      });
      setPendingFiles([]);
      const warningSuffix = result.warnings.length
        ? ` (${result.warnings.join(" ")})`
        : "";
      setMessage({
        tone: result.warnings.length ? "error" : "info",
        text: `Estimated ${formatHours(result.estimate.minutes)}.${warningSuffix}`,
      });
    } catch (error) {
      console.warn("[lizhi-routine] estimate request failed", error);
      setMessage({
        tone: "error",
        text: "Could not reach the estimate service.",
      });
    } finally {
      setIsWorking(false);
    }
  };

  const clearEstimate = () => {
    onUpdate({ estimate: null });
    setMessage(null);
  };

  const totalDocs = todo.context_docs.length + pendingFiles.length;
  const canRun = totalDocs > 0 && !isWorking;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,18,10,0.45)] p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Task context and estimate"
      // Click outside the card closes — common dialog pattern.
      onClick={onClose}
      // Stop drag events from bubbling up to any parent draggable.
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-[var(--r-lg)] border border-[color:var(--line)] bg-[color:var(--card)] shadow-[0_28px_72px_-30px_rgba(20,18,10,0.55)]"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header — title + close — pinned at the top of the dialog. */}
        <div className="flex items-center justify-between gap-2 border-b border-[color:var(--line-soft)] px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-[10.5px] font-medium uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
              <Paperclip className="h-3 w-3" />
              Context & estimate
            </div>
            <div className="mt-1 truncate text-[13px] font-medium text-[color:var(--ink)]">
              {todo.title}
            </div>
          </div>
          <button
            type="button"
            className="rounded p-1.5 text-[color:var(--ink-3)] hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink)]"
            onClick={onClose}
            aria-label="Close context panel"
            title="Close (Esc)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Scrollable body — everything below scrolls inside the dialog. */}
        <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
          {/* Optional free-text insight from the user — fed to the estimator. */}
          <div>
            <label className="block font-[family-name:var(--font-mono)] text-[10px] font-medium uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
              Your notes (optional)
            </label>
            <p className="mt-0.5 text-[11px] text-[color:var(--ink-3)]">
              First-person hints we&apos;ll feed to the AI estimator — e.g.,
              &ldquo;I have a partial draft already&rdquo; or &ldquo;new to this topic&rdquo;.
            </p>
            <textarea
              className="mt-1.5 w-full resize-none rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] px-2.5 py-1.5 text-[12.5px] text-[color:var(--ink)] outline-none focus:border-[color:var(--line-strong)] focus:ring-2 focus:ring-[color:var(--ring)]"
              placeholder="Add a sentence or two…"
              rows={2}
              maxLength={2000}
              value={insightDraft}
              onChange={(event) => setInsightDraft(event.target.value)}
              onBlur={commitInsight}
            />
          </div>

      {/* Existing attached docs */}
      {todo.context_docs.length > 0 && (
        <ul className="space-y-1.5">
          {todo.context_docs.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center gap-2 rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] px-2 py-1.5 text-[12px]"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[color:var(--sunken)] text-[color:var(--ink-3)]">
                {doc.mime === "application/pdf" ? (
                  <span className="font-[family-name:var(--font-mono)] text-[8.5px] font-semibold">
                    PDF
                  </span>
                ) : (
                  <span className="font-[family-name:var(--font-mono)] text-[8.5px] font-semibold">
                    MD
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-[color:var(--ink)]">
                  {doc.name}
                </div>
                <div className="text-[10.5px] text-[color:var(--ink-3)]">
                  {formatBytes(doc.size_bytes)} · {doc.text_chars.toLocaleString()} chars extracted
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeDoc(doc.id)}
                className="rounded p-1 text-[color:var(--ink-3)] hover:bg-[color:var(--sunken)] hover:text-[oklch(55%_0.18_25)]"
                title="Remove"
                aria-label={`Remove ${doc.name}`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Pending (not yet sent) files */}
      {pendingFiles.length > 0 && (
        <ul className="space-y-1">
          {pendingFiles.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-2 rounded-[var(--r-sm)] border border-dashed border-[color:var(--line)] bg-[color:var(--card)]/60 px-2 py-1.5 text-[12px]"
            >
              <Upload className="h-3 w-3 text-[color:var(--ink-3)]" />
              <span className="min-w-0 flex-1 truncate text-[color:var(--ink)]">
                {file.name}
              </span>
              <span className="shrink-0 text-[10.5px] text-[color:var(--ink-3)]">
                {formatBytes(file.size)}
              </span>
              <button
                type="button"
                onClick={() => removePendingFile(index)}
                className="rounded p-1 text-[color:var(--ink-3)] hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink)]"
                title="Cancel upload"
                aria-label={`Cancel ${file.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Upload + estimate buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_FILE_TYPES}
          className="hidden"
          onChange={(event) => {
            handleFilePick(event.target.files);
            // Reset so re-picking the same file fires onChange again.
            event.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="soft"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isWorking}
        >
          <Upload className="mr-1 h-3 w-3" />
          Attach .md / .pdf
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={runEstimate}
          disabled={!canRun}
        >
          {isWorking ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="mr-1 h-3 w-3" />
          )}
          {todo.estimate ? "Re-estimate" : "Estimate"}
        </Button>
        {todo.estimate && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearEstimate}
            disabled={isWorking}
          >
            Clear estimate
          </Button>
        )}
      </div>

      {message && (
        <div
          className={cn(
            "rounded-[var(--r-sm)] px-2 py-1.5 text-[11.5px]",
            message.tone === "error"
              ? "bg-[oklch(94%_0.04_30)] text-[oklch(45%_0.15_30)] dark:bg-[oklch(30%_0.10_30)] dark:text-[oklch(82%_0.10_30)]"
              : "bg-[color:var(--card)] text-[color:var(--ink-2)]",
          )}
        >
          {message.text}
        </div>
      )}

      {/* Full progress bar + Phase-2A breakdown when we have an estimate */}
      {todo.estimate && (
        <div className="rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] p-2.5">
          <TodoEstimateProgressBar
            estimate={todo.estimate}
            completedMinutes={completedMinutes}
          />
          <EstimateRangeLine estimate={todo.estimate} />
          {todo.estimate.factors && todo.estimate.factors.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {todo.estimate.factors.map((factor, index) => (
                <span
                  key={`${factor}-${index}`}
                  className="inline-flex items-center rounded-[var(--r-xs)] bg-[color:var(--sunken)] px-1.5 py-0.5 text-[10px] text-[color:var(--ink-2)]"
                >
                  {factor}
                </span>
              ))}
            </div>
          )}
          {todo.estimate.subtasks && todo.estimate.subtasks.length > 0 && (
            <EstimateSubtaskList subtasks={todo.estimate.subtasks} />
          )}
          {todo.estimate.notes && (
            <p className="mt-1.5 text-[11.5px] leading-snug text-[color:var(--ink-2)]">
              {todo.estimate.notes}
            </p>
          )}
          <p className="mt-1 text-[10px] text-[color:var(--ink-3)]">
            {todo.estimate.source === "ai" ? "AI estimate" : "Manual estimate"}
            {todo.estimate.confidence
              ? ` (${todo.estimate.confidence} confidence)`
              : ""}{" "}
            · updated{" "}
            {new Date(todo.estimate.computed_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}

/** "Likely 2h · range 1h - 3.5h" pulled out so the panel jsx stays flat. */
function EstimateRangeLine({ estimate }: { estimate: TodoEstimate }) {
  const hasRange =
    typeof estimate.minutes_optimistic === "number" ||
    typeof estimate.minutes_pessimistic === "number";
  if (!hasRange) return null;
  const opt = estimate.minutes_optimistic;
  const pes = estimate.minutes_pessimistic;
  return (
    <div className="mt-1.5 font-[family-name:var(--font-mono)] text-[10.5px] text-[color:var(--ink-3)]">
      Range{" "}
      {opt !== undefined ? formatHours(opt) : "?"}
      {" – "}
      {pes !== undefined ? formatHours(pes) : "?"}
      {"  ·  likely "}
      {formatHours(estimate.minutes)}
    </div>
  );
}

function EstimateSubtaskList({
  subtasks,
}: {
  subtasks: { name: string; minutes: number }[];
}) {
  const total = subtasks.reduce((sum, s) => sum + s.minutes, 0) || 1;
  return (
    <ul className="mt-2 space-y-1">
      {subtasks.map((sub, index) => {
        const pct = Math.round((sub.minutes / total) * 100);
        return (
          <li
            key={`${sub.name}-${index}`}
            className="flex items-center gap-2 text-[11.5px]"
          >
            <span className="h-1 w-1 shrink-0 rounded-full bg-[color:var(--ink-3)]" />
            <span className="min-w-0 flex-1 truncate text-[color:var(--ink)]">
              {sub.name}
            </span>
            <span className="shrink-0 font-[family-name:var(--font-mono)] text-[10px] tabular-nums text-[color:var(--ink-3)]">
              {formatHours(sub.minutes)}{" "}
              <span className="opacity-70">({pct}%)</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

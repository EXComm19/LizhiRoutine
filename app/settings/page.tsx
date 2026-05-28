"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TodoListsManager } from "@/components/planner/todo-lists-manager";
import { CalendarImportPanel } from "@/components/planner/CalendarImportPanel";
import { ExtensionTokensPanel } from "@/components/planner/ExtensionTokensPanel";
import { SleepImportPanel } from "@/components/planner/SleepImportPanel";
import { GmailSettingsPanel } from "@/components/planner/GmailInboxPanel";
import { parseIcsCalendar } from "@/lib/calendar-import";
import { importCalendarEventsToStorage } from "@/lib/calendar-event-storage";
import { createTodoList, patchTodoList } from "@/lib/factories";
import {
  loadPreferences,
  loadTodoLists,
  savePreferences,
  saveTodoLists,
} from "@/lib/storage";
import { parseDateKey, todayKey } from "@/lib/time";
import type { TodoList, TodoListColor } from "@/lib/schema";

type GmailBanner = { tone: "success" | "error"; text: string } | null;

function readGmailBannerFromUrl(): GmailBanner {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const error = params.get("gmail_error");
  const connected = params.get("gmail_connected");
  if (error) return { tone: "error", text: error };
  if (connected === "1") return { tone: "success", text: "Gmail connected." };
  return null;
}

function clearGmailQueryParams() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("gmail_error") && !url.searchParams.has("gmail_connected")) {
    return;
  }
  url.searchParams.delete("gmail_error");
  url.searchParams.delete("gmail_connected");
  window.history.replaceState({}, "", url.toString());
}

export default function SettingsPage() {
  const [lists, setLists] = useState<TodoList[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<TodoListColor>("emerald");
  const [calendarImportMessage, setCalendarImportMessage] = useState("");
  const [gmailBanner, setGmailBanner] = useState<GmailBanner>(null);
  // null = feature off; non-negative integer = days to wait after completion.
  const [autoHideDays, setAutoHideDays] = useState<number | null>(null);

  useEffect(() => {
    // localStorage isn't available during SSR; hydrate after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLists(loadTodoLists());
    setAutoHideDays(loadPreferences().auto_hide_completed_days);
    // Surface the result of the Gmail OAuth callback redirect, then strip
    // the query params so a reload doesn't keep replaying the banner.
    setGmailBanner(readGmailBannerFromUrl());
    clearGmailQueryParams();
  }, []);

  const persistAutoHideDays = (next: number | null) => {
    setAutoHideDays(next);
    const prefs = loadPreferences();
    savePreferences({ ...prefs, auto_hide_completed_days: next });
  };

  const upsertList = (next: TodoList) => {
    setLists((current) => {
      const exists = current.some((list) => list.id === next.id);
      const updated = exists
        ? current.map((list) =>
            list.id === next.id ? patchTodoList(list, next) : list,
          )
        : [...current, next];
      saveTodoLists(updated);
      return updated;
    });
  };

  const deleteList = (listId: string) => {
    setLists((current) => {
      const updated = current.filter((list) => {
        if (list.id !== listId) return true;
        return list.built_in;
      });
      saveTodoLists(updated);
      return updated;
    });
  };

  const importCalendarText = (text: string) => {
    const events = parseIcsCalendar(text, parseDateKey(todayKey()));
    if (!events.length) {
      setCalendarImportMessage("No timed events found in that calendar.");
      return;
    }

    const importedCount = importCalendarEventsToStorage(events);
    setCalendarImportMessage(
      importedCount
        ? `Imported ${importedCount} fixed event${importedCount === 1 ? "" : "s"}.`
        : "Calendar already imported.",
    );
  };

  return (
    <main className="min-h-screen bg-[color:var(--canvas)] px-4 py-8 text-[color:var(--ink)]">
      <div className="mx-auto max-w-xl">
        <div className="mb-5 flex items-center gap-3">
          <Link
            href="/"
            className="inline-grid h-8 w-8 place-items-center rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] text-[color:var(--ink-2)] transition-colors hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink)]"
            aria-label="Back to planner"
            title="Back to planner"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </Link>
          <h1 className="font-[family-name:var(--font-disp)] text-[24px] font-medium tracking-[-0.015em] text-[color:var(--ink)]">
            Settings
          </h1>
        </div>

        <section className="overflow-hidden rounded-[var(--r-lg)] border border-[color:var(--line)] bg-[color:var(--card)] p-5">
          <h2 className="font-[family-name:var(--font-mono)] text-[10.5px] font-medium uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
            Import calendar
          </h2>
          <p className="mt-1 text-[13px] text-[color:var(--ink-2)]">
            Import fixed schedule blocks from an .ics file or webcal link.
          </p>

          <CalendarImportPanel
            className="mx-0 mb-0 mt-4"
            importCalendarText={importCalendarText}
            message={calendarImportMessage}
            setMessage={setCalendarImportMessage}
          />
        </section>

        <GmailSettingsPanel initialBanner={gmailBanner} />

        <section className="mt-5 overflow-hidden rounded-[var(--r-lg)] border border-[color:var(--line)] bg-[color:var(--card)] p-5">
          <h2 className="font-[family-name:var(--font-mono)] text-[10.5px] font-medium uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
            Sublists
          </h2>
          <p className="mt-1 text-[13px] text-[color:var(--ink-2)]">
            Group todos by class, project, or anything else. Built-in lists
            can&apos;t be deleted.
          </p>

          <TodoListsManager
            todoLists={lists}
            isAddingList={isAdding}
            name={name}
            color={color}
            onNameChange={setName}
            onColorChange={setColor}
            onAddStart={() => setIsAdding(true)}
            onCancel={() => setIsAdding(false)}
            onSubmit={() => {
              upsertList(createTodoList({ name, color }));
              setName("");
              setColor("emerald");
              setIsAdding(false);
            }}
            onDelete={deleteList}
          />
        </section>

        <section className="mt-5 overflow-hidden rounded-[var(--r-lg)] border border-[color:var(--line)] bg-[color:var(--card)] p-5">
          <h2 className="font-[family-name:var(--font-mono)] text-[10.5px] font-medium uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
            Reminders
          </h2>
          <p className="mt-1 text-[13px] text-[color:var(--ink-2)]">
            Automatically hide completed reminders after a delay. Use the
            &ldquo;Hide done&rdquo; toggle in the Reminders tab to hide them
            instantly instead.
          </p>

          <div className="mt-4 flex items-center gap-3">
            <label className="flex items-center gap-2 text-[13px] text-[color:var(--ink)]">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-[color:var(--line)] accent-[color:var(--ink)]"
                checked={autoHideDays !== null}
                onChange={(event) =>
                  persistAutoHideDays(event.target.checked ? 7 : null)
                }
              />
              <span>Auto-hide completed after</span>
            </label>

            <input
              type="number"
              min={0}
              max={365}
              inputMode="numeric"
              disabled={autoHideDays === null}
              value={autoHideDays ?? 7}
              onChange={(event) => {
                const raw = Number(event.target.value);
                if (!Number.isFinite(raw) || raw < 0) return;
                persistAutoHideDays(Math.min(365, Math.floor(raw)));
              }}
              className="w-16 rounded-md border border-[color:var(--line)] bg-[color:var(--card)] px-2 py-1 text-center text-[13px] outline-none focus:border-[color:var(--line-strong)] focus:ring-2 focus:ring-[color:var(--ring)] disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Auto-hide days"
            />
            <span className="text-[13px] text-[color:var(--ink-2)]">
              day{autoHideDays === 1 ? "" : "s"}
            </span>
          </div>
          <p className="mt-2 text-[12px] text-[color:var(--ink-3)]">
            {autoHideDays === null
              ? "Off — completed reminders stay visible until you toggle Hide done."
              : autoHideDays === 0
                ? "Completed reminders disappear as soon as you check them off."
                : `Completed reminders disappear ${autoHideDays} day${
                    autoHideDays === 1 ? "" : "s"
                  } after you check them off.`}
          </p>
        </section>

        <ExtensionTokensPanel />
        <SleepImportPanel />
      </div>
    </main>
  );
}

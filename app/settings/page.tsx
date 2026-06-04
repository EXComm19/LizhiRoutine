"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TodoListsManager } from "@/components/planner/todo-lists-manager";
import { CalendarImportPanel } from "@/components/planner/CalendarImportPanel";
import { ImportedCalendarPanel } from "@/components/planner/ImportedCalendarPanel";
import { ExtensionTokensPanel } from "@/components/planner/ExtensionTokensPanel";
import { PushNotificationsPanel } from "@/components/planner/PushNotificationsPanel";
import { SleepImportPanel } from "@/components/planner/SleepImportPanel";
import { WeChatLinkPanel } from "@/components/planner/WeChatLinkPanel";
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
import { guessLifeArea } from "@/lib/life-area";
import type { LifeArea, TodoList, TodoListColor } from "@/lib/schema";

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
  // Life area for the new-list form. Auto-guessed from the name unless
  // the user manually overrides it (tracked by lifeAreaTouched).
  const [lifeArea, setLifeArea] = useState<LifeArea>("general");
  const [lifeAreaTouched, setLifeAreaTouched] = useState(false);
  const [calendarImportMessage, setCalendarImportMessage] = useState("");
  // Bumped after an import so ImportedCalendarPanel re-reads storage.
  const [importedReloadKey, setImportedReloadKey] = useState(0);
  const [gmailBanner, setGmailBanner] = useState<GmailBanner>(null);
  // null = feature off; non-negative integer = days to wait after completion.
  const [autoHideDays, setAutoHideDays] = useState<number | null>(null);
  // "HH:MM" or null. Time of day the daily agenda push fires.
  const [agendaTime, setAgendaTime] = useState<string | null>(null);
  // Minutes before each event; 0/null = disabled.
  const [eventLeadMinutes, setEventLeadMinutes] = useState<number | null>(null);

  useEffect(() => {
    // localStorage isn't available during SSR; hydrate after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLists(loadTodoLists());
    const prefs = loadPreferences();
    setAutoHideDays(prefs.auto_hide_completed_days);
    setAgendaTime(prefs.daily_agenda_time);
    setEventLeadMinutes(prefs.event_reminder_lead_minutes);
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

  const persistAgendaTime = (next: string | null) => {
    setAgendaTime(next);
    const prefs = loadPreferences();
    savePreferences({ ...prefs, daily_agenda_time: next });
  };

  const persistEventLeadMinutes = (next: number | null) => {
    setEventLeadMinutes(next);
    const prefs = loadPreferences();
    savePreferences({ ...prefs, event_reminder_lead_minutes: next });
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

  // Re-guess the new-list life area as the user types, until they
  // manually pick one (then we stop touching it).
  const handleListNameChange = (value: string) => {
    setName(value);
    if (!lifeAreaTouched) setLifeArea(guessLifeArea(value));
  };

  const handleLifeAreaChange = (value: LifeArea) => {
    setLifeArea(value);
    setLifeAreaTouched(true);
  };

  // Persist a field change (currently just life_area) on an existing list.
  const updateList = (list: TodoList, patch: Partial<TodoList>) => {
    upsertList(patchTodoList(list, patch));
  };

  const importCalendarText = (text: string, label?: string) => {
    const events = parseIcsCalendar(text, parseDateKey(todayKey()));
    if (!events.length) {
      setCalendarImportMessage("No timed events found in that calendar.");
      return;
    }

    const importedCount = importCalendarEventsToStorage(events, label);
    setCalendarImportMessage(
      importedCount
        ? `Imported ${importedCount} fixed event${importedCount === 1 ? "" : "s"}.`
        : "Calendar already imported.",
    );
    // Tell the manage panel to re-read so the new batch shows immediately.
    setImportedReloadKey((k) => k + 1);
  };

  return (
    <main className="min-h-screen bg-[color:var(--canvas)] px-4 py-8 text-[color:var(--ink)]">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center gap-3">
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

        <div className="grid gap-6 md:grid-cols-[180px_minmax(0,1fr)]">
          {/* Sticky anchor nav — hidden on mobile where H2s + scroll
              already provide the orientation. */}
          <aside className="hidden md:block">
            <nav className="sticky top-8">
              <ul className="space-y-0.5 border-l border-[color:var(--line-soft)] pl-3">
                <SettingsNavLink href="#notifications" label="Notifications" />
                <SettingsNavLink href="#integrations" label="Integrations" />
                <SettingsNavLink href="#lists" label="Lists & Display" />
                <SettingsNavLink href="#developer" label="Developer" />
              </ul>
            </nav>
          </aside>

          <div className="min-w-0 space-y-10">
            {/* ── Notifications ────────────────────────────────────── */}
            <section id="notifications" className="scroll-mt-8">
              <SettingsGroupHeader
                title="Notifications"
                hint="Push to your phone, daily agenda, event reminders."
              />
              <PushNotificationsPanel />

              <section className="mt-5 overflow-hidden rounded-[var(--r-lg)] border border-[color:var(--line)] bg-[color:var(--card)] p-5">
                <h3 className="font-[family-name:var(--font-mono)] text-[10.5px] font-medium uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
                  Daily agenda push
                </h3>
                <p className="mt-1 text-[13px] text-[color:var(--ink-2)]">
                  A morning recap push with the day&apos;s events and any
                  outstanding todos.
                </p>
                <div className="mt-4 flex items-center gap-3">
                  <label className="flex items-center gap-2 text-[13px] text-[color:var(--ink)]">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-[color:var(--line)] accent-[color:var(--ink)]"
                      checked={agendaTime !== null}
                      onChange={(event) =>
                        persistAgendaTime(event.target.checked ? "06:00" : null)
                      }
                    />
                    <span>Send at</span>
                  </label>
                  <input
                    type="time"
                    disabled={agendaTime === null}
                    value={agendaTime ?? "06:00"}
                    onChange={(event) => persistAgendaTime(event.target.value)}
                    className="rounded-md border border-[color:var(--line)] bg-[color:var(--card)] px-2 py-1 font-[family-name:var(--font-mono)] text-[13px] outline-none focus:border-[color:var(--line-strong)] focus:ring-2 focus:ring-[color:var(--ring)] disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <span className="text-[12px] text-[color:var(--ink-3)]">
                    local time
                  </span>
                </div>
              </section>

              <section className="mt-5 overflow-hidden rounded-[var(--r-lg)] border border-[color:var(--line)] bg-[color:var(--card)] p-5">
                <h3 className="font-[family-name:var(--font-mono)] text-[10.5px] font-medium uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
                  Event lead-in push
                </h3>
                <p className="mt-1 text-[13px] text-[color:var(--ink-2)]">
                  Get a push notification a configurable number of minutes
                  before every saved event starts. Applies to every event.
                </p>
                <div className="mt-4 flex items-center gap-3">
                  <label className="flex items-center gap-2 text-[13px] text-[color:var(--ink)]">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-[color:var(--line)] accent-[color:var(--ink)]"
                      checked={
                        eventLeadMinutes !== null && eventLeadMinutes > 0
                      }
                      onChange={(event) =>
                        persistEventLeadMinutes(event.target.checked ? 15 : null)
                      }
                    />
                    <span>Remind</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={240}
                    inputMode="numeric"
                    disabled={eventLeadMinutes === null}
                    value={eventLeadMinutes ?? 15}
                    onChange={(event) => {
                      const raw = Number(event.target.value);
                      if (!Number.isFinite(raw) || raw < 0) return;
                      persistEventLeadMinutes(Math.min(240, Math.floor(raw)));
                    }}
                    className="w-16 rounded-md border border-[color:var(--line)] bg-[color:var(--card)] px-2 py-1 text-center text-[13px] outline-none focus:border-[color:var(--line-strong)] focus:ring-2 focus:ring-[color:var(--ring)] disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Minutes before"
                  />
                  <span className="text-[13px] text-[color:var(--ink-2)]">
                    minutes before
                  </span>
                </div>
              </section>

              <section className="mt-5 overflow-hidden rounded-[var(--r-lg)] border border-dashed border-[color:var(--line)] bg-[color:var(--sunken)]/30 p-4 text-[12.5px] text-[color:var(--ink-3)]">
                Looking for repeated reminders (e.g. &ldquo;take medicine
                10pm every night&rdquo;)? They moved out of Settings —
                use the <strong>↻ Repeat</strong> icon in the planner&apos;s
                top bar.
              </section>
            </section>

            {/* ── Integrations ─────────────────────────────────────── */}
            <section id="integrations" className="scroll-mt-8">
              <SettingsGroupHeader
                title="Integrations"
                hint="One-time wiring to external services."
              />
              <section className="overflow-hidden rounded-[var(--r-lg)] border border-[color:var(--line)] bg-[color:var(--card)] p-5">
                <h3 className="font-[family-name:var(--font-mono)] text-[10.5px] font-medium uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
                  Import calendar
                </h3>
                <p className="mt-1 text-[13px] text-[color:var(--ink-2)]">
                  Import fixed schedule blocks from an .ics file or
                  webcal link.
                </p>
                <CalendarImportPanel
                  className="mx-0 mb-0 mt-4"
                  importCalendarText={importCalendarText}
                  message={calendarImportMessage}
                  setMessage={setCalendarImportMessage}
                />
              </section>
              <div className="mt-5">
                <ImportedCalendarPanel reloadKey={importedReloadKey} />
              </div>
              <GmailSettingsPanel initialBanner={gmailBanner} />
              <SleepImportPanel />
              <WeChatLinkPanel />
            </section>

            {/* ── Lists & Display ──────────────────────────────────── */}
            <section id="lists" className="scroll-mt-8">
              <SettingsGroupHeader
                title="Lists & Display"
                hint="Sublists, reminder visibility."
              />
              <section className="overflow-hidden rounded-[var(--r-lg)] border border-[color:var(--line)] bg-[color:var(--card)] p-5">
                <h3 className="font-[family-name:var(--font-mono)] text-[10.5px] font-medium uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
                  Sublists
                </h3>
                <p className="mt-1 text-[13px] text-[color:var(--ink-2)]">
                  Group todos by class, project, or anything else.
                  Built-in lists can&apos;t be deleted.
                </p>
                <TodoListsManager
                  todoLists={lists}
                  isAddingList={isAdding}
                  name={name}
                  color={color}
                  lifeArea={lifeArea}
                  onNameChange={handleListNameChange}
                  onColorChange={setColor}
                  onLifeAreaChange={handleLifeAreaChange}
                  onAddStart={() => setIsAdding(true)}
                  onCancel={() => {
                    setIsAdding(false);
                    setLifeAreaTouched(false);
                  }}
                  onSubmit={() => {
                    upsertList(createTodoList({ name, color, life_area: lifeArea }));
                    setName("");
                    setColor("emerald");
                    setLifeArea("general");
                    setLifeAreaTouched(false);
                    setIsAdding(false);
                  }}
                  onDelete={deleteList}
                  onUpdateList={updateList}
                />
              </section>

              <section className="mt-5 overflow-hidden rounded-[var(--r-lg)] border border-[color:var(--line)] bg-[color:var(--card)] p-5">
                <h3 className="font-[family-name:var(--font-mono)] text-[10.5px] font-medium uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
                  Auto-hide completed reminders
                </h3>
                <p className="mt-1 text-[13px] text-[color:var(--ink-2)]">
                  Automatically hide completed reminders after a delay.
                  Use the &ldquo;Hide done&rdquo; toggle in the Reminders
                  tab to hide them instantly instead.
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
            </section>

            {/* ── Developer ────────────────────────────────────────── */}
            <section id="developer" className="scroll-mt-8">
              <SettingsGroupHeader
                title="Developer"
                hint="API tokens for the Chrome extension and Health Auto Export."
              />
              <ExtensionTokensPanel />
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function SettingsGroupHeader({
  title,
  hint,
}: {
  title: string;
  hint: string;
}) {
  return (
    <div className="mb-3">
      <h2 className="font-[family-name:var(--font-disp)] text-[18px] font-medium tracking-[-0.01em] text-[color:var(--ink)]">
        {title}
      </h2>
      <p className="mt-0.5 text-[12.5px] text-[color:var(--ink-3)]">{hint}</p>
    </div>
  );
}

function SettingsNavLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <li>
      <a
        href={href}
        className="block rounded-[var(--r-sm)] px-2 py-1 text-[12.5px] font-medium text-[color:var(--ink-2)] transition-colors hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink)]"
      >
        {label}
      </a>
    </li>
  );
}

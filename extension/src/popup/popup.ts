// Popup script — orchestrates the capture flow:
//  1) On open, ask the service worker to inject + run the extractor on the
//     active tab. Show the result in the preview card.
//  2) Fetch the user's pending todos, render a searchable list.
//  3) On "Attach" or "Create new", POST to the API and close the popup
//     with a success/error banner.

import {
  ApiError,
  attachContext,
  createTodoFromCapture,
  estimateTodo,
  listTodos,
} from "../lib/api";
import { isConfigured, loadSettings } from "../lib/storage";
import type { CapturedPage, ExtensionTodo } from "../lib/types";

type State = {
  page: CapturedPage | null;
  todos: ExtensionTodo[];
  filtered: ExtensionTodo[];
  selectedTodoId: string | null;
  searchQuery: string;
};

const state: State = {
  page: null,
  todos: [],
  filtered: [],
  selectedTodoId: null,
  searchQuery: "",
};

// ── Element references ──────────────────────────────────────────────────
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

const previewEl = $("page-preview");
const onboardingEl = $("onboarding");
const insightSection = $("insight-section");
const insightInput = $<HTMLTextAreaElement>("insight");
const pickerEl = $("picker");
const actionsEl = $("actions");
const statusEl = $("status");
const titleEl = $("page-title");
const metaEl = $("page-meta");
const snippetEl = $("page-snippet");
const todoListEl = $("todo-list");
const searchInput = $<HTMLInputElement>("search");
const attachButton = $<HTMLButtonElement>("attach");
const createButton = $<HTMLButtonElement>("create-new");

// ── UI helpers ──────────────────────────────────────────────────────────
function showStatus(text: string, tone: "ok" | "error" | "info"): void {
  statusEl.textContent = text;
  statusEl.className = `status ${tone}`;
  statusEl.classList.remove("hidden");
}
function clearStatus(): void {
  statusEl.classList.add("hidden");
  statusEl.textContent = "";
}

function setDisabled(button: HTMLButtonElement, value: boolean): void {
  button.disabled = value;
}

function renderPreview(page: CapturedPage): void {
  titleEl.textContent = page.title || "(no title)";
  const host = (() => {
    try {
      return new URL(page.url).hostname.replace(/^www\./, "");
    } catch {
      return page.url;
    }
  })();
  metaEl.textContent = `${host} · ${page.text.length.toLocaleString()} chars · ${page.extractSource}`;
  snippetEl.textContent = page.text.slice(0, 600);
  previewEl.classList.remove("hidden");
}

function renderTodos(): void {
  todoListEl.innerHTML = "";
  if (!state.filtered.length) {
    const empty = document.createElement("div");
    empty.className = "todo-list-empty";
    empty.textContent = state.searchQuery
      ? "No matching todos."
      : "No pending todos yet.";
    todoListEl.appendChild(empty);
    return;
  }
  for (const todo of state.filtered) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "todo-item";
    button.setAttribute("role", "option");
    button.setAttribute(
      "aria-selected",
      todo.id === state.selectedTodoId ? "true" : "false",
    );
    button.dataset.todoId = todo.id;

    const title = document.createElement("span");
    title.className = "todo-title";
    title.textContent = todo.title;
    button.appendChild(title);

    const meta = document.createElement("span");
    meta.className = "todo-meta";
    meta.textContent = `${todo.listName} · ${todo.category}`;
    button.appendChild(meta);

    button.addEventListener("click", () => {
      state.selectedTodoId = todo.id;
      renderTodos();
      setDisabled(attachButton, !state.page);
    });
    todoListEl.appendChild(button);
  }
}

function applySearch(): void {
  const q = state.searchQuery.trim().toLowerCase();
  state.filtered = q
    ? state.todos.filter((todo) => todo.title.toLowerCase().includes(q))
    : state.todos;
  // Reset selection if it scrolled off-screen.
  if (
    state.selectedTodoId &&
    !state.filtered.some((todo) => todo.id === state.selectedTodoId)
  ) {
    state.selectedTodoId = null;
    setDisabled(attachButton, true);
  }
  renderTodos();
}

// ── Flow ───────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  $("open-options").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
  $("open-options-cta").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  const settings = await loadSettings();
  if (!isConfigured(settings)) {
    onboardingEl.classList.remove("hidden");
    return;
  }

  searchInput.addEventListener("input", (event) => {
    state.searchQuery = (event.target as HTMLInputElement).value;
    applySearch();
  });

  attachButton.addEventListener("click", () => void onAttach());
  createButton.addEventListener("click", () => void onCreateNew());

  insightSection.classList.remove("hidden");
  pickerEl.classList.remove("hidden");
  actionsEl.classList.remove("hidden");

  showStatus("Extracting page…", "info");
  // Run page capture + todos fetch in parallel — neither depends on the
  // other and the popup feels much snappier this way.
  const [pageResult, todosResult] = await Promise.allSettled([
    captureCurrentPage(),
    listTodos(),
  ]);

  if (pageResult.status === "fulfilled" && pageResult.value) {
    state.page = pageResult.value;
    renderPreview(pageResult.value);
    clearStatus();
  } else {
    const error =
      pageResult.status === "rejected"
        ? pageResult.reason instanceof Error
          ? pageResult.reason.message
          : String(pageResult.reason)
        : "Page capture returned nothing.";
    showStatus(error, "error");
    setDisabled(attachButton, true);
    setDisabled(createButton, true);
  }

  if (todosResult.status === "fulfilled") {
    state.todos = todosResult.value;
    applySearch();
  } else {
    const error =
      todosResult.reason instanceof ApiError
        ? `Could not load todos: ${todosResult.reason.message}`
        : "Could not load todos.";
    showStatus(error, "error");
    setDisabled(attachButton, true);
  }
}

async function captureCurrentPage(): Promise<CapturedPage | null> {
  const response = await chrome.runtime.sendMessage({ type: "capturePage" });
  if (!response) {
    throw new Error("No response from background worker.");
  }
  if (!response.ok) {
    throw new Error(response.error ?? "Capture failed.");
  }
  return response.page as CapturedPage;
}

function currentInsight(): string | undefined {
  const value = insightInput.value.trim();
  return value ? value : undefined;
}

/**
 * After a successful attach/create, kick off the AI estimate in the
 * background. We don't await its completion before closing the popup —
 * users move on quickly, and the result lands on the todo automatically
 * via the persistence inside /api/extension/estimate-todo.
 *
 * Failures are surfaced in the popup banner but don't block — the attach
 * itself already succeeded.
 */
async function fireEstimate(todoId: string): Promise<void> {
  showStatus("Estimating…", "info");
  try {
    const result = await estimateTodo({
      todoId,
      userInsight: currentInsight(),
    });
    const mins = result.estimate.minutes;
    const display = mins < 60 ? `${mins}m` : `${(mins / 60).toFixed(1)}h`;
    showStatus(`Estimated ${display}.`, "ok");
  } catch (error) {
    // Don't fail the whole flow — the attach worked; estimate can be
    // triggered manually from the web app later.
    const message =
      error instanceof Error ? error.message : "Estimate failed.";
    showStatus(`Attached, but estimate failed: ${message}`, "error");
  }
}

async function onAttach(): Promise<void> {
  if (!state.page || !state.selectedTodoId) return;
  setDisabled(attachButton, true);
  setDisabled(createButton, true);
  showStatus("Attaching…", "info");
  try {
    const result = await attachContext({
      todoId: state.selectedTodoId,
      url: state.page.url,
      title: state.page.title,
      text: state.page.text,
      userInsight: currentInsight(),
    });
    await fireEstimate(result.todo.id);
    window.setTimeout(() => window.close(), 1400);
  } catch (error) {
    showStatus(
      error instanceof Error ? error.message : "Attach failed.",
      "error",
    );
    setDisabled(attachButton, false);
    setDisabled(createButton, false);
  }
}

async function onCreateNew(): Promise<void> {
  if (!state.page) return;
  setDisabled(attachButton, true);
  setDisabled(createButton, true);
  showStatus("Creating todo…", "info");
  try {
    const result = await createTodoFromCapture({
      url: state.page.url,
      pageTitle: state.page.title,
      text: state.page.text,
      userInsight: currentInsight(),
    });
    await fireEstimate(result.todo.id);
    window.setTimeout(() => window.close(), 1400);
  } catch (error) {
    showStatus(
      error instanceof Error ? error.message : "Create failed.",
      "error",
    );
    setDisabled(attachButton, false);
    setDisabled(createButton, false);
  }
}

void bootstrap();

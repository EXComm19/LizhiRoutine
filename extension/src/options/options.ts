// Options page — collects the base URL + API token, persists to chrome
// storage, optionally verifies via a probe call. Single form, no router.

import { ApiError, testConnection } from "../lib/api";
import { loadSettings, saveSettings } from "../lib/storage";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

const form = $<HTMLFormElement>("settings-form");
const baseUrlInput = $<HTMLInputElement>("base-url");
const tokenInput = $<HTMLInputElement>("api-token");
const testButton = $<HTMLButtonElement>("test");
const statusEl = $<HTMLDivElement>("status");

function showStatus(text: string, tone: "ok" | "error" | "info"): void {
  statusEl.textContent = text;
  statusEl.className = `status ${tone}`;
  statusEl.classList.remove("hidden");
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

async function hydrate(): Promise<void> {
  const settings = await loadSettings();
  baseUrlInput.value = settings.baseUrl;
  tokenInput.value = settings.apiToken;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  const apiToken = tokenInput.value.trim();
  if (!baseUrl || !apiToken) {
    showStatus("Both fields are required.", "error");
    return;
  }
  await saveSettings({ baseUrl, apiToken });
  showStatus("Saved.", "ok");
});

testButton.addEventListener("click", async () => {
  const baseUrl = normalizeBaseUrl(baseUrlInput.value);
  const apiToken = tokenInput.value.trim();
  if (!baseUrl || !apiToken) {
    showStatus("Fill in both fields before testing.", "error");
    return;
  }
  showStatus("Probing /api/extension/todos…", "info");
  try {
    // Use a one-shot settings object — don't persist until the user clicks
    // Save explicitly, in case they're still iterating on values.
    await testConnection({ baseUrl, apiToken });
    showStatus("Connection OK. Save to persist these values.", "ok");
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `${error.status}: ${error.message}`
        : error instanceof Error
          ? error.message
          : "Connection failed.";
    showStatus(message, "error");
  }
});

void hydrate();

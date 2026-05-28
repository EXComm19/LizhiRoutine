// MV3 service worker. Its main job is to inject the content script into
// the active tab when the popup asks for an extraction — the popup can't
// run chrome.scripting itself reliably (its lifetime ends when it closes,
// and chrome.scripting on the popup window is awkward).
//
// Message protocol with popup:
//   { type: "capturePage" }
//     →  { ok: true, page: CapturedPage }
//     |  { ok: false, error: string }

import type { CapturedPage } from "../lib/types";

type CapturePageRequest = { type: "capturePage" };
type ExtractResponse =
  | { ok: true; page: CapturedPage }
  | { ok: false; error: string };

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  return tab ?? null;
}

function isInjectable(url: string | undefined): boolean {
  if (!url) return false;
  // Chrome blocks injection into chrome://, edge://, the web store, and
  // newtab pages. We surface a clear error instead of silently failing.
  return /^https?:|^file:/.test(url);
}

async function capturePage(): Promise<ExtractResponse> {
  const tab = await getActiveTab();
  if (!tab?.id) {
    return { ok: false, error: "No active tab found." };
  }
  if (!isInjectable(tab.url)) {
    return {
      ok: false,
      error:
        "Can't capture this page. Chrome blocks extension scripts on chrome:// and extension pages.",
    };
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content/extract.js"],
    });
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Could not inject content script: ${error.message}`
          : "Could not inject content script.",
    };
  }
  return new Promise<ExtractResponse>((resolve) => {
    chrome.tabs.sendMessage(
      tab.id!,
      { type: "extract" },
      (response: ExtractResponse | undefined) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          resolve({ ok: false, error: lastError.message ?? "No response from page." });
          return;
        }
        resolve(response ?? { ok: false, error: "No response from page." });
      },
    );
  });
}

chrome.runtime.onMessage.addListener(
  (
    message: CapturePageRequest,
    _sender,
    sendResponse: (response: ExtractResponse) => void,
  ) => {
    if (!message || message.type !== "capturePage") return false;
    void capturePage().then(sendResponse);
    // Returning true keeps the channel open for the async sendResponse.
    return true;
  },
);

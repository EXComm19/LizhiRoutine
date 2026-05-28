// Content script: runs in the page's isolated world when the popup asks
// for extracted text. We use Mozilla Readability (the algorithm Firefox's
// Reader View uses) to pull the main content out of the page — much cleaner
// signal than document.body.innerText, which includes nav / ads / footer
// noise. Falls back to innerText when Readability returns nothing (works on
// non-article-style pages like Google Docs or app dashboards).
//
// Communicates with the popup via a single chrome.runtime message:
//   { type: "extract" }   →   { ok: true, page: CapturedPage }
//                          |  { ok: false, error: string }

import { Readability } from "@mozilla/readability";
import type { CapturedPage } from "../lib/types";

// Cap before we ship it back — the server caps too (30K) but trimming here
// avoids paying the messaging serialization cost on huge pages.
const MAX_CHARS = 50_000;

function trimTo(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max);
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\s*\n\s*\n\s*/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function extractWithReadability(): string | null {
  try {
    // Readability mutates the document — clone first so we don't break the
    // page the user is looking at.
    const docClone = document.cloneNode(/* deep */ true) as Document;
    const reader = new Readability(docClone);
    const article = reader.parse();
    if (!article || !article.textContent) return null;
    return normalizeWhitespace(article.textContent);
  } catch {
    return null;
  }
}

function extractWithInnerText(): string {
  return normalizeWhitespace(document.body?.innerText ?? "");
}

function buildCapturedPage(): CapturedPage {
  let extractSource: CapturedPage["extractSource"] = "readability";
  let text = extractWithReadability();
  if (!text || text.length < 50) {
    // Readability decided this page isn't an article. Fall back to a raw
    // dump so the user can still capture e.g. dashboards or app screens.
    text = extractWithInnerText();
    extractSource = "innertext";
  }
  return {
    url: location.href,
    title: (document.title || location.hostname).trim(),
    text: trimTo(text, MAX_CHARS),
    extractSource,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object" || message.type !== "extract") {
    return false;
  }
  try {
    sendResponse({ ok: true, page: buildCapturedPage() });
  } catch (error) {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : "Extraction failed",
    });
  }
  // Synchronous response — return false so Chrome doesn't keep the channel open.
  return false;
});

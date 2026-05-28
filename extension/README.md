# Lizhi Routine — Chrome Extension

Capture the current browser page as AI context on a Lizhi Routine todo. Works
on any page you can see in the browser, including authenticated content like
Moodle assignment pages.

## Install (development)

```bash
cd extension
npm install
npm run build
```

Then in Chrome / Edge / Brave:

1. Open `chrome://extensions`
2. Toggle on **Developer mode** (top-right)
3. Click **Load unpacked**
4. Select the `extension/dist` folder

The extension icon (a generic puzzle piece until you add icons) appears in
the toolbar. Right-click it → **Options** to set your URL + API token.

### Generate an API token

In the Lizhi Routine web app → **Settings → Extension access** → **New
token** → label it ("Work Chrome") → copy the `lzr_...` value once shown.
Paste it into the extension's Options page, along with your deployment URL
(or `http://localhost:3000` for dev).

Click **Test connection** to verify, then **Save**.

## Use

1. Browse to the page you want to capture
2. Click the toolbar icon (or hit `Alt+L`)
3. The popup shows a preview of the extracted main content
4. Pick a pending todo from the searchable list (or hit **Create new todo**)
5. Click **Attach** — the page is stored as a `TodoContextDoc` on that todo

Back in Lizhi Routine, open that todo's context panel — you'll see the new
doc alongside any PDFs / markdown you'd previously attached. The AI
estimator picks it up automatically next time you click **Estimate**.

## Development

```bash
npm run watch     # rebuild dist/ on changes (manifest + HTML still need restart)
npm run typecheck # tsc --noEmit
```

After a watch rebuild, click the **Reload** circular arrow on your extension
card at `chrome://extensions` to pick up changes.

## Architecture

```
src/
├── popup/             — toolbar popup (HTML + CSS + TS)
├── options/           — settings page (token + URL)
├── content/extract.ts — page extractor (Mozilla Readability)
├── background/        — MV3 service worker (chrome.scripting injection)
└── lib/               — shared types + storage + API client
```

The extractor uses Mozilla's
[Readability.js](https://github.com/mozilla/readability) (same algorithm
Firefox's Reader View uses) to pull the main article content out of the
page. Falls back to `document.body.innerText` for non-article pages like
app dashboards.

Everything talks to three endpoints on your Lizhi Routine deployment:

- `GET /api/extension/todos?q=` — fetch pending todos for the picker
- `POST /api/extension/attach-context` — attach to existing
- `POST /api/extension/create-todo` — create + attach in one shot

All three require `Authorization: Bearer lzr_...`.

## Icons

The bundled manifest doesn't ship icons — Chrome shows a default puzzle
piece. Drop your own PNGs into `dist/icons/` (16, 32, 48, 128 px) and add
an `"icons": { ... }` entry to `manifest.json` if you want to brand it.

## Security notes

- API token is stored in `chrome.storage.local`, which Chrome encrypts at
  rest. It never leaves the extension via any channel besides the
  Authorization header on requests to your configured base URL.
- A token grants read/write access to **all** of that account's todos —
  treat it like a password. Revoke any time from the app's settings.
- The `host_permissions` block allows the extension to inject the
  extractor on any `https://` page; if you'd rather scope it tighter, edit
  `manifest.json` to list specific domains.

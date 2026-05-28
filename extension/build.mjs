// esbuild config for the Lizhi Routine Chrome extension.
//
// Three bundles, one per extension context:
//   popup       — user-facing UI shown when the toolbar icon is clicked
//   options     — settings page (token + base URL)
//   background  — MV3 service worker, handles cross-context messaging
//   content     — injected into pages to extract main content via Readability
//
// Output goes to dist/ in a layout that matches manifest.json's paths. The
// manifest.json + popup.html + options.html are copied verbatim alongside.

import { build, context } from "esbuild";
import { cp, mkdir, rm } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const isWatch = process.argv.includes("--watch");
const outdir = "dist";

const shared = {
  bundle: true,
  format: "iife",
  target: ["chrome120"],
  platform: "browser",
  // Use minimal minification — keep readable in DevTools; size isn't a real
  // constraint for an extension that ships ~50KB total.
  minify: false,
  sourcemap: true,
  logLevel: "info",
};

const entries = [
  { in: "src/popup/popup.ts", out: "popup/popup" },
  { in: "src/options/options.ts", out: "options/options" },
  { in: "src/content/extract.ts", out: "content/extract" },
  { in: "src/background/service-worker.ts", out: "background/service-worker" },
];

async function clean() {
  if (existsSync(outdir)) await rm(outdir, { recursive: true });
  await mkdir(outdir, { recursive: true });
}

async function copyStatic() {
  // Manifest + HTML pages + CSS get copied verbatim.
  await cp("manifest.json", path.join(outdir, "manifest.json"));
  await cp("src/popup/popup.html", path.join(outdir, "popup/popup.html"));
  await cp("src/popup/popup.css", path.join(outdir, "popup/popup.css"));
  await cp("src/options/options.html", path.join(outdir, "options/options.html"));
  await cp("src/options/options.css", path.join(outdir, "options/options.css"));
}

async function buildOnce() {
  await clean();
  await copyStatic();
  for (const entry of entries) {
    await build({
      ...shared,
      entryPoints: [entry.in],
      outfile: path.join(outdir, `${entry.out}.js`),
    });
  }
  console.log("✓ build complete");
}

async function watch() {
  await clean();
  await copyStatic();
  for (const entry of entries) {
    const ctx = await context({
      ...shared,
      entryPoints: [entry.in],
      outfile: path.join(outdir, `${entry.out}.js`),
    });
    await ctx.watch();
  }
  console.log("✓ watching for changes (manifest + HTML are not re-copied — restart watch after changes there)");
}

if (isWatch) {
  await watch();
} else {
  await buildOnce();
}

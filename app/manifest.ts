import type { MetadataRoute } from "next";

/**
 * PWA manifest. Next.js auto-serves this at /manifest.webmanifest and
 * injects the `<link rel="manifest">` tag. Required so iOS Safari's
 * "Add to Home Screen" installs Lizhi as a standalone app (which is
 * itself required so web push notifications work on iOS 16.4+).
 *
 * Icons re-use `app/icon.svg` (the stacked-blocks L) — Safari accepts
 * SVG for the home-screen icon at all sizes. The dedicated
 * apple-icon.tsx path generates a 180×180 PNG via Satori for older
 * iOS versions and other Apple touchpoints.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lizhi Routine",
    short_name: "Lizhi",
    description:
      "Calm 5am–5am time-blocking planner. Drag todos, routine blocks, and imported calendar events onto today's timeline.",
    start_url: "/",
    display: "standalone",
    background_color: "#FBF8F0",
    theme_color: "#1A170E",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}

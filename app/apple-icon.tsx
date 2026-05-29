import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * iOS Home Screen / Apple Touch icon. iOS doesn't render SVG favicons,
 * so we generate a 180×180 PNG via Satori. Light variant only — iOS
 * applies its own background masking when the icon ships, so honouring
 * the system colour scheme here doesn't change what the user sees.
 *
 * Geometry is the same as app/icon.svg but scaled 1.8× (100→180 px).
 */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#1A170E",
          borderRadius: 40,
          position: "relative",
          display: "flex",
        }}
      >
        {/* Vertical bar — was (28, 18, 18, 42) in 100-viewBox units */}
        <div
          style={{
            position: "absolute",
            left: 50,
            top: 32,
            width: 32,
            height: 76,
            background: "#F5EDD6",
            borderRadius: 8,
          }}
        />
        {/* Horizontal bar — was (28, 63, 44, 16) in 100-viewBox units */}
        <div
          style={{
            position: "absolute",
            left: 50,
            top: 113,
            width: 79,
            height: 29,
            background: "#F5EDD6",
            borderRadius: 8,
          }}
        />
        {/* Top inset bevel — letterpress nod */}
        <div
          style={{
            position: "absolute",
            left: 11,
            top: 5,
            width: 158,
            height: 4,
            background: "rgba(255, 255, 255, 0.22)",
            borderRadius: 2,
          }}
        />
      </div>
    ),
    size,
  );
}

"use client";

import type { LifeArea } from "@/lib/schema";
import { LIFE_AREAS, LIFE_AREA_LABELS } from "@/lib/life-area";
import { cn } from "@/lib/utils";

/**
 * Compact themed <select> for picking a LifeArea. Native select keeps it
 * tiny + accessible + works inside dense rows (list manager, editors)
 * without a popover. Used wherever a life area needs manual override.
 */
export function LifeAreaSelect({
  value,
  onChange,
  className,
  "aria-label": ariaLabel,
}: {
  value: LifeArea;
  onChange: (value: LifeArea) => void;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as LifeArea)}
      aria-label={ariaLabel ?? "Life area"}
      className={cn(
        "rounded-md border border-[color:var(--line)] bg-[color:var(--card)] px-2 py-1 text-[11.5px] text-[color:var(--ink)] outline-none focus:border-[color:var(--line-strong)] focus:ring-2 focus:ring-[color:var(--ring)]",
        className,
      )}
    >
      {LIFE_AREAS.map((area) => (
        <option key={area} value={area}>
          {LIFE_AREA_LABELS[area]}
        </option>
      ))}
    </select>
  );
}

import type { Category, Period, RoutineTemplate, TodoListColor } from "@/lib/schema";

export type ColorTokens = {
  /** Filled accent (left bar on a block, dot in a chip). */
  accent: string;
  /** Soft tinted background for blocks/cards (includes border). */
  block: string;
  /** Stronger tint for ribbons / month-view stripes. */
  ribbon: string;
  /** Tinted chip background + foreground (used together). */
  chip: string;
  /** Foreground colour for inline text on the tint. */
  text: string;
};

/**
 * Design palette aligned with the warm-cream system in `app/globals.css`.
 * Each palette name maps to a tinted block colour family that harmonises
 * with the cream canvas. Values use Tailwind v4 arbitrary-value syntax so
 * they pick up the CSS custom properties from `:root` / `html.dark` and
 * automatically respect the active theme.
 */
const palette: Record<TodoListColor, ColorTokens> = {
  blue: {
    accent:
      "bg-[oklch(48%_0.10_250)] dark:bg-[oklch(78%_0.08_250)]",
    block:
      "bg-[oklch(94%_0.03_250)] border-[oklch(82%_0.06_250)] dark:bg-[oklch(28%_0.06_250)] dark:border-[oklch(40%_0.08_250)]",
    ribbon:
      "bg-[oklch(82%_0.08_250)] dark:bg-[oklch(45%_0.10_250)]",
    chip:
      "bg-[oklch(90%_0.05_250)] text-[oklch(38%_0.10_250)] dark:bg-[oklch(38%_0.10_250)] dark:text-[oklch(82%_0.06_250)]",
    text: "text-[oklch(38%_0.10_260)] dark:text-[oklch(82%_0.06_260)]",
  },
  emerald: {
    accent:
      "bg-[oklch(50%_0.13_165)] dark:bg-[oklch(72%_0.12_165)]",
    block:
      "bg-[oklch(94%_0.04_165)] border-[oklch(82%_0.07_165)] dark:bg-[oklch(28%_0.06_165)] dark:border-[oklch(40%_0.08_165)]",
    ribbon:
      "bg-[oklch(82%_0.10_165)] dark:bg-[oklch(50%_0.12_165)]",
    chip:
      "bg-[oklch(90%_0.06_165)] text-[oklch(38%_0.12_165)] dark:bg-[oklch(38%_0.10_165)] dark:text-[oklch(82%_0.07_165)]",
    text: "text-[oklch(38%_0.12_165)] dark:text-[oklch(82%_0.07_165)]",
  },
  amber: {
    accent:
      "bg-[oklch(60%_0.14_60)] dark:bg-[oklch(75%_0.13_60)]",
    block:
      "bg-[oklch(94%_0.05_75)] border-[oklch(82%_0.10_70)] dark:bg-[oklch(28%_0.06_75)] dark:border-[oklch(40%_0.08_70)]",
    ribbon:
      "bg-[oklch(82%_0.12_70)] dark:bg-[oklch(50%_0.14_70)]",
    chip:
      "bg-[oklch(91%_0.07_70)] text-[oklch(40%_0.10_60)] dark:bg-[oklch(38%_0.10_60)] dark:text-[oklch(82%_0.10_70)]",
    text: "text-[oklch(40%_0.10_60)] dark:text-[oklch(82%_0.10_70)]",
  },
  rose: {
    accent:
      "bg-[oklch(55%_0.18_15)] dark:bg-[oklch(72%_0.15_15)]",
    block:
      "bg-[oklch(94%_0.04_15)] border-[oklch(82%_0.08_15)] dark:bg-[oklch(28%_0.06_15)] dark:border-[oklch(40%_0.10_15)]",
    ribbon:
      "bg-[oklch(82%_0.10_15)] dark:bg-[oklch(50%_0.14_15)]",
    chip:
      "bg-[oklch(90%_0.06_15)] text-[oklch(40%_0.14_15)] dark:bg-[oklch(38%_0.12_15)] dark:text-[oklch(82%_0.08_15)]",
    text: "text-[oklch(40%_0.14_15)] dark:text-[oklch(82%_0.08_15)]",
  },
  violet: {
    accent:
      "bg-[oklch(48%_0.18_305)] dark:bg-[oklch(70%_0.16_305)]",
    block:
      "bg-[oklch(94%_0.04_305)] border-[oklch(80%_0.08_305)] dark:bg-[oklch(28%_0.08_305)] dark:border-[oklch(40%_0.10_305)]",
    ribbon:
      "bg-[oklch(80%_0.10_305)] dark:bg-[oklch(50%_0.14_305)]",
    chip:
      "bg-[oklch(90%_0.06_305)] text-[oklch(38%_0.16_305)] dark:bg-[oklch(38%_0.14_305)] dark:text-[oklch(82%_0.08_305)]",
    text: "text-[oklch(38%_0.16_305)] dark:text-[oklch(82%_0.08_305)]",
  },
  zinc: {
    accent: "bg-ink dark:bg-ink",
    block:
      "bg-sunken border-line dark:bg-sunken dark:border-line",
    ribbon:
      "bg-line-strong/70 dark:bg-line-strong/40",
    chip: "bg-ink text-[#f7f1de] dark:bg-ink dark:text-[#1A170E]",
    text: "text-ink dark:text-ink",
  },
};

export function paletteTokens(color: TodoListColor): ColorTokens {
  return palette[color] ?? palette.violet;
}

export function periodColorTokens(color: Period["color"]): ColorTokens {
  return paletteTokens(color);
}

export function todoListColorTokens(color: TodoListColor): ColorTokens {
  return paletteTokens(color);
}

export function routineColorTokens(color: RoutineTemplate["color"]): ColorTokens {
  return paletteTokens(color);
}

/**
 * Tier (T0/T1/T2) to palette mapping, matching the design:
 *   T0 = ink (solid neutral)
 *   T1 = plum/violet
 *   T2 = amber
 */
const categoryToColor: Record<Category, TodoListColor> = {
  T0: "zinc",
  T1: "violet",
  T2: "amber",
};

export function categoryTokens(category: Category): ColorTokens {
  return paletteTokens(categoryToColor[category]);
}

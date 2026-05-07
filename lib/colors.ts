import type { Category, Period, RoutineTemplate, TodoListColor } from "@/lib/schema";

export type ColorTokens = {
  /** Filled accent (left bar on a block, dot in a chip). */
  accent: string;
  /** Soft tinted background for blocks/cards. */
  block: string;
  /** Stronger tint for ribbons / month-view stripes. */
  ribbon: string;
  /** Tinted chip background + foreground (used together). */
  chip: string;
  /** Foreground colour for inline text on the tint. */
  text: string;
};

const palette: Record<TodoListColor, ColorTokens> = {
  blue: {
    accent: "bg-blue-600 dark:bg-blue-400",
    block:
      "bg-blue-100/85 border-blue-300/80 dark:bg-blue-500/20 dark:border-blue-400/45",
    ribbon: "bg-blue-300/85 dark:bg-blue-400/50",
    chip: "bg-blue-200 text-blue-900 dark:bg-blue-500/30 dark:text-blue-100",
    text: "text-blue-900 dark:text-blue-100",
  },
  emerald: {
    accent: "bg-emerald-600 dark:bg-emerald-400",
    block:
      "bg-emerald-100/85 border-emerald-300/80 dark:bg-emerald-500/20 dark:border-emerald-400/45",
    ribbon: "bg-emerald-300/85 dark:bg-emerald-400/50",
    chip:
      "bg-emerald-200 text-emerald-900 dark:bg-emerald-500/30 dark:text-emerald-100",
    text: "text-emerald-900 dark:text-emerald-100",
  },
  amber: {
    accent: "bg-orange-500 dark:bg-orange-300",
    block:
      "bg-orange-100/90 border-orange-300/80 dark:bg-orange-500/20 dark:border-orange-300/45",
    ribbon: "bg-orange-300/85 dark:bg-orange-300/50",
    chip:
      "bg-orange-200 text-orange-900 dark:bg-orange-500/30 dark:text-orange-100",
    text: "text-orange-900 dark:text-orange-100",
  },
  rose: {
    accent: "bg-rose-600 dark:bg-rose-400",
    block:
      "bg-rose-100/85 border-rose-300/80 dark:bg-rose-500/20 dark:border-rose-400/45",
    ribbon: "bg-rose-300/85 dark:bg-rose-400/50",
    chip: "bg-rose-200 text-rose-900 dark:bg-rose-500/30 dark:text-rose-100",
    text: "text-rose-900 dark:text-rose-100",
  },
  violet: {
    accent: "bg-violet-600 dark:bg-violet-400",
    block:
      "bg-violet-100/85 border-violet-300/80 dark:bg-violet-500/20 dark:border-violet-400/45",
    ribbon: "bg-violet-300/85 dark:bg-violet-400/50",
    chip:
      "bg-violet-200 text-violet-900 dark:bg-violet-500/30 dark:text-violet-100",
    text: "text-violet-900 dark:text-violet-100",
  },
  zinc: {
    accent: "bg-zinc-600 dark:bg-zinc-300",
    block:
      "bg-zinc-200/80 border-zinc-300 dark:bg-zinc-500/20 dark:border-zinc-300/40",
    ribbon: "bg-zinc-300/90 dark:bg-zinc-300/45",
    chip: "bg-zinc-200 text-zinc-800 dark:bg-zinc-500/30 dark:text-zinc-100",
    text: "text-zinc-800 dark:text-zinc-100",
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

const categoryToColor: Record<Category, TodoListColor> = {
  T0: "blue",
  T1: "emerald",
  T2: "amber",
};

export function categoryTokens(category: Category): ColorTokens {
  return paletteTokens(categoryToColor[category]);
}

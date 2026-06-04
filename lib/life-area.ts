// Canonical lookups for the LifeArea taxonomy. Lives apart from the
// React tree so non-component code (parsers, normalizers, stats) can
// import the lists without pulling in lucide-react.

import type { LifeArea, TodoListColor } from "@/lib/schema";

export const LIFE_AREAS: ReadonlyArray<LifeArea> = [
  "academic",
  "work",
  "fitness",
  "sleep",
  "medical",
  "social",
  "hobby",
  "chores",
  "personal",
  "general",
];

/** Human label for picker UIs and prompt definitions. */
export const LIFE_AREA_LABELS: Record<LifeArea, string> = {
  academic: "Academic",
  work: "Work",
  fitness: "Fitness",
  sleep: "Sleep",
  medical: "Medical",
  social: "Social",
  hobby: "Hobby",
  chores: "Chores",
  personal: "Personal",
  general: "General",
};

/**
 * One-line hint shown next to each option in the picker — also fed to
 * the AI parser as classification guidance.
 */
export const LIFE_AREA_HINTS: Record<LifeArea, string> = {
  academic: "Lectures, study, assignments, exams, coursework",
  work: "Job, meetings, interviews, internship, career",
  fitness: "Gym, running, sport, training, physio exercises",
  sleep: "Night sleep + naps",
  medical: "Doctor, dentist, therapy, medication, health admin",
  social: "Friends, family, dates, parties, calls, hangouts",
  hobby: "Music, games, reading, side projects, creative time",
  chores: "Cleaning, groceries, errands, admin, paperwork",
  personal: "Self-care, grooming, finances, anything personal",
  general: "Default — anything that doesn't fit the others",
};

/**
 * Per-area accent color, reusing the existing TodoListColor palette so
 * we don't introduce a new color system. Used for the picker chips and
 * (Phase 3) timeline block tinting + stats charts.
 */
export const LIFE_AREA_COLORS: Record<LifeArea, TodoListColor> = {
  academic: "blue",
  work: "violet",
  fitness: "emerald",
  sleep: "violet",
  medical: "rose",
  social: "amber",
  hobby: "emerald",
  chores: "zinc",
  personal: "amber",
  general: "zinc",
};

/**
 * Keyword heuristic for auto-assigning a life area from free text
 * (a list name, routine title, period title, etc.). Returns the first
 * area whose keywords match, else "general" — we always assign the
 * closest match rather than leaving it unset.
 *
 * Order matters: more specific areas are checked first so e.g. "gym
 * study" lands on fitness before academic. Case-insensitive substring.
 */
const AREA_KEYWORDS: Array<{ area: LifeArea; words: string[] }> = [
  {
    area: "sleep",
    words: ["sleep", "nap", "bed", "睡", "午睡", "小睡"],
  },
  {
    area: "fitness",
    words: [
      "gym",
      "workout",
      "run",
      "running",
      "jog",
      "swim",
      "cycle",
      "cycling",
      "yoga",
      "lift",
      "training",
      "sport",
      "fitness",
      "健身",
      "跑步",
      "锻炼",
      "运动",
      "游泳",
    ],
  },
  {
    area: "medical",
    words: [
      "doctor",
      "dentist",
      "therapy",
      "therapist",
      "clinic",
      "hospital",
      "medical",
      "vaccin",
      "medicine",
      "pill",
      "prescription",
      "physio",
      "看病",
      "医院",
      "牙医",
      "吃药",
    ],
  },
  {
    area: "academic",
    words: [
      "lecture",
      "class",
      "tutorial",
      "lab",
      "exam",
      "assignment",
      "study",
      "course",
      "homework",
      "quiz",
      "essay",
      "thesis",
      "revision",
      "上课",
      "考试",
      "作业",
      "复习",
      "学习",
    ],
  },
  {
    area: "work",
    words: [
      "work",
      "meeting",
      "standup",
      "stand-up",
      "interview",
      "1:1",
      "1-on-1",
      "client",
      "internship",
      "project",
      "deadline",
      "shift",
      "上班",
      "工作",
      "会议",
      "面试",
      "实习",
    ],
  },
  {
    area: "social",
    words: [
      "dinner",
      "lunch",
      "coffee",
      "party",
      "hangout",
      "date",
      "drinks",
      "catch up",
      "catchup",
      "call mom",
      "call dad",
      "friend",
      "family",
      "聚",
      "约",
      "吃饭",
      "聚会",
    ],
  },
  {
    area: "hobby",
    words: [
      "guitar",
      "piano",
      "music",
      "game",
      "gaming",
      "read",
      "reading",
      "paint",
      "draw",
      "photography",
      "side project",
      "hobby",
      "练琴",
      "游戏",
      "看书",
      "画画",
    ],
  },
  {
    area: "chores",
    words: [
      "clean",
      "laundry",
      "dishes",
      "grocery",
      "groceries",
      "shopping",
      "errand",
      "bunnings",
      "bill",
      "tax",
      "admin",
      "paperwork",
      "tidy",
      "买菜",
      "打扫",
      "购物",
      "缴费",
    ],
  },
];

/**
 * Best-effort life area from arbitrary text. Always returns a concrete
 * area (forced-guess policy — never null). `general` only when nothing
 * matches.
 */
export function guessLifeArea(text: string): LifeArea {
  const haystack = text.toLowerCase();
  for (const { area, words } of AREA_KEYWORDS) {
    if (words.some((w) => haystack.includes(w))) return area;
  }
  return "general";
}

export function isLifeArea(value: unknown): value is LifeArea {
  return (
    typeof value === "string" && LIFE_AREAS.includes(value as LifeArea)
  );
}

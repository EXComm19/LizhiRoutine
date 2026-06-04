// Back-compat shim. The EventType enum became the broader LifeArea
// taxonomy (lib/life-area.ts). These aliases keep existing imports
// (`EVENT_TYPES`, `EVENT_TYPE_LABELS`, `EVENT_TYPE_HINTS`) compiling.
// New code should import from "@/lib/life-area" directly.

export {
  LIFE_AREAS as EVENT_TYPES,
  LIFE_AREA_LABELS as EVENT_TYPE_LABELS,
  LIFE_AREA_HINTS as EVENT_TYPE_HINTS,
  LIFE_AREA_COLORS,
  guessLifeArea,
  isLifeArea,
} from "@/lib/life-area";

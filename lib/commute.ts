import type {
  CommuteConfig,
  CommuteEstimate,
  CommuteMode,
  CommuteProvider,
  CommuteTimeStrategy,
  RoutineTemplate,
} from "@/lib/schema";

export const COMMUTE_MODES: CommuteMode[] = [
  "driving-traffic",
  "driving",
  "walking",
  "cycling",
];

export const COMMUTE_PROVIDERS: CommuteProvider[] = ["mapbox"];
export const COMMUTE_TIME_STRATEGIES: CommuteTimeStrategy[] = [
  "depart_at_start",
  "arrive_by_end",
];

export type CommuteEstimateRequest = {
  origin: string;
  destination: string;
  mode: CommuteMode;
  buffer_minutes: number;
  provider?: CommuteProvider;
};

export type CommuteEstimateResponse = {
  estimate: CommuteEstimate;
  usage: {
    month: string;
    used: number;
    limit: number;
    cached: boolean;
  };
};

export function hasCommuteConfig(
  template: RoutineTemplate,
): template is RoutineTemplate & { commute_config: CommuteConfig } {
  return Boolean(
    template.commute_config?.origin.trim() &&
      template.commute_config.destination.trim(),
  );
}

export function isCommuteTemplate(template: RoutineTemplate) {
  return template.commute_enabled || Boolean(template.commute_config);
}

export function commuteModeLabel(mode: CommuteMode) {
  if (mode === "driving-traffic") return "Driving traffic";
  if (mode === "driving") return "Driving";
  if (mode === "walking") return "Walking";
  return "Cycling";
}

export function compactRouteLabel(origin: string, destination: string) {
  const cleanOrigin = origin.trim() || "Origin";
  const cleanDestination = destination.trim() || "Destination";
  return `${cleanOrigin} -> ${cleanDestination}`;
}

export function commuteTimeStrategyLabel(strategy: CommuteTimeStrategy) {
  return strategy === "arrive_by_end" ? "Arrive by end" : "Depart at start";
}

import { NextRequest, NextResponse } from "next/server";
import type {
  CommuteEstimateRequest,
  CommuteEstimateResponse,
} from "@/lib/commute";
import type { CommuteMode } from "@/lib/schema";
import {
  MapboxUsageLimitError,
  mapboxMonthlyLimit,
  reserveMapboxRequests,
} from "@/lib/server/mapbox-usage";
import { cleanEnvValue } from "@/lib/server/env";
import { isSameOrigin } from "@/lib/server/http";
import { getServerUser } from "@/lib/server/supabase-user";

export const runtime = "nodejs";

const MAX_QUERY_LENGTH = 240;
const MAPBOX_CALLS_PER_MISS = 3;
const VALID_MODES: CommuteMode[] = [
  "driving",
  "driving-traffic",
  "walking",
  "cycling",
];

type MapboxGeocodeResponse = {
  features?: Array<{
    geometry?: {
      coordinates?: [number, number];
    };
    properties?: {
      coordinates?: {
        longitude?: number;
        latitude?: number;
      };
    };
  }>;
  message?: string;
};

type MapboxDirectionsResponse = {
  routes?: Array<{
    duration?: number;
    distance?: number;
  }>;
  message?: string;
};

function normalizeQuery(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, MAX_QUERY_LENGTH) : "";
}

function normalizeMode(value: unknown): CommuteMode {
  return VALID_MODES.includes(value as CommuteMode)
    ? (value as CommuteMode)
    : "driving-traffic";
}

function normalizeBuffer(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(240, Math.round(value)))
    : 0;
}

function mapboxProfile(mode: CommuteMode) {
  if (mode === "driving-traffic") return "driving-traffic";
  return mode;
}

function getCoordinates(data: MapboxGeocodeResponse): [number, number] | null {
  const feature = data.features?.[0];
  const geometryCoordinates = feature?.geometry?.coordinates;
  if (
    Array.isArray(geometryCoordinates) &&
    typeof geometryCoordinates[0] === "number" &&
    typeof geometryCoordinates[1] === "number"
  ) {
    return geometryCoordinates;
  }

  const longitude = feature?.properties?.coordinates?.longitude;
  const latitude = feature?.properties?.coordinates?.latitude;
  if (typeof longitude === "number" && typeof latitude === "number") {
    return [longitude, latitude];
  }

  return null;
}

async function geocode(query: string, token: string) {
  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.set("q", query);
  url.searchParams.set("access_token", token);
  url.searchParams.set("limit", "1");
  url.searchParams.set("language", "en");

  const response = await fetch(url, { cache: "no-store" });
  const data = (await response.json().catch(() => null)) as
    | MapboxGeocodeResponse
    | null;
  if (!response.ok || !data) {
    throw new Error(data?.message || `Mapbox geocoding failed for ${query}.`);
  }

  const coordinates = getCoordinates(data);
  if (!coordinates) {
    throw new Error(`No Mapbox result found for ${query}.`);
  }
  return coordinates;
}

async function directions(
  origin: [number, number],
  destination: [number, number],
  mode: CommuteMode,
  token: string,
) {
  const coordinates = `${origin[0]},${origin[1]};${destination[0]},${destination[1]}`;
  const url = new URL(
    `https://api.mapbox.com/directions/v5/mapbox/${mapboxProfile(mode)}/${coordinates}`,
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("alternatives", "false");
  url.searchParams.set("overview", "false");
  url.searchParams.set("steps", "false");

  const response = await fetch(url, { cache: "no-store" });
  const data = (await response.json().catch(() => null)) as
    | MapboxDirectionsResponse
    | null;
  if (!response.ok || !data) {
    throw new Error(data?.message || "Mapbox directions failed.");
  }

  const route = data.routes?.[0];
  if (typeof route?.duration !== "number") {
    throw new Error("Mapbox returned no route.");
  }

  return {
    travelDurationMinutes: Math.max(1, Math.ceil(route.duration / 60)),
    distanceMeters:
      typeof route.distance === "number" ? Math.max(0, route.distance) : 0,
  };
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  }
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const token = cleanEnvValue(process.env.MAPBOX_ACCESS_TOKEN);
  if (!token) {
    return NextResponse.json(
      { error: "Missing MAPBOX_ACCESS_TOKEN in .env.local." },
      { status: 503 },
    );
  }

  let body: Partial<CommuteEstimateRequest>;
  try {
    body = (await request.json()) as Partial<CommuteEstimateRequest>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 });
  }

  const estimateRequest: CommuteEstimateRequest = {
    origin: normalizeQuery(body.origin),
    destination: normalizeQuery(body.destination),
    mode: normalizeMode(body.mode),
    buffer_minutes: normalizeBuffer(body.buffer_minutes),
    provider: "mapbox",
  };

  if (!estimateRequest.origin || !estimateRequest.destination) {
    return NextResponse.json(
      { error: "Origin and destination are required." },
      { status: 400 },
    );
  }

  // The previous module-level Map cache was effectively dead on serverless
  // (cold start = new instance, so the 30-minute TTL almost never served a
  // hit). It's been removed; rely on the task storing its own
  // commute_estimate so we only re-fetch when the user explicitly asks for
  // a fresh estimate.

  let usage: { month: string; used: number; limit: number };
  try {
    usage = await reserveMapboxRequests(user.userId, MAPBOX_CALLS_PER_MISS);
  } catch (error) {
    if (error instanceof MapboxUsageLimitError) {
      return NextResponse.json(
        {
          error: `Mapbox monthly request limit reached: ${error.used}/${error.limit} used for ${error.month}. This estimate would need ${error.requested} more requests.`,
          usage: {
            month: error.month,
            used: error.used,
            limit: error.limit,
            cached: false,
          },
        },
        { status: 429 },
      );
    }
    throw error;
  }

  try {
    const [origin, destination] = await Promise.all([
      geocode(estimateRequest.origin, token),
      geocode(estimateRequest.destination, token),
    ]);
    const route = await directions(
      origin,
      destination,
      estimateRequest.mode,
      token,
    );
    const payload: CommuteEstimateResponse = {
      estimate: {
        provider: "mapbox",
        origin: estimateRequest.origin,
        destination: estimateRequest.destination,
        mode: estimateRequest.mode,
        travel_duration_minutes: route.travelDurationMinutes,
        buffer_minutes: estimateRequest.buffer_minutes,
        duration_minutes:
          route.travelDurationMinutes + estimateRequest.buffer_minutes,
        distance_meters: route.distanceMeters,
        calculated_at: new Date().toISOString(),
      },
      usage: {
        ...usage,
        limit: mapboxMonthlyLimit(),
        cached: false,
      },
    };

    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to estimate commute.";
    return NextResponse.json(
      {
        error: message,
        usage: {
          ...usage,
          limit: mapboxMonthlyLimit(),
          cached: false,
        },
      },
      { status: 502 },
    );
  }
}

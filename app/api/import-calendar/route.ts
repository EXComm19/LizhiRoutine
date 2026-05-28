import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/server/http";
import { getServerUser } from "@/lib/server/supabase-user";

const MAX_ICS_BYTES = 5 * 1024 * 1024;

type ImportCalendarRequest = {
  url?: unknown;
};

function normalizeCalendarUrl(value: unknown) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const urlText = trimmed.startsWith("webcal://")
    ? `https://${trimmed.slice("webcal://".length)}`
    : trimmed;

  try {
    const url = new URL(urlText);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}

function isBlockedHostname(hostname: string) {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost")) return true;

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(lower);
  if (!ipv4) return false;

  const octets = ipv4.slice(1).map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return true;

  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

async function readLimitedText(response: Response) {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_ICS_BYTES) {
    throw new Error("Calendar file is too large.");
  }

  const text = await response.text();
  if (new Blob([text]).size > MAX_ICS_BYTES) {
    throw new Error("Calendar file is too large.");
  }

  return text;
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  }
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: ImportCalendarRequest;

  try {
    body = (await request.json()) as ImportCalendarRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 });
  }

  const url = normalizeCalendarUrl(body.url);
  if (!url) {
    return NextResponse.json(
      { error: "Enter a valid http, https, or webcal calendar URL." },
      { status: 400 },
    );
  }

  if (isBlockedHostname(url.hostname)) {
    return NextResponse.json(
      { error: "Local or private network calendar URLs are not supported." },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/calendar, application/calendar+json;q=0.7, text/plain;q=0.5, */*;q=0.1",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Calendar link returned HTTP ${response.status}.` },
        { status: 502 },
      );
    }

    const text = await readLimitedText(response);
    if (!text.includes("BEGIN:VCALENDAR") && !text.includes("BEGIN:VEVENT")) {
      return NextResponse.json(
        { error: "That link did not return an .ics calendar file." },
        { status: 422 },
      );
    }

    return NextResponse.json({ text });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not fetch that calendar link.",
      },
      { status: 502 },
    );
  }
}

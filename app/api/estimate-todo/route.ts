import { NextRequest, NextResponse } from "next/server";
import type { Category, TodoContextDoc, TodoEstimate } from "@/lib/schema";
import {
  computeEstimate,
  type IncomingFile,
  MAX_FILES_PER_REQUEST,
} from "@/lib/server/estimate-engine";
import { isSameOrigin } from "@/lib/server/http";
import { getServerUser } from "@/lib/server/supabase-user";

export const runtime = "nodejs";
/**
 * Thinking-enabled Kimi requests can take 20-40s to return. Default Next.js
 * function timeout is much shorter on some deployments (10s on Vercel hobby,
 * 60s on pro). Bump to 90s so the route doesn't get killed mid-flight.
 */
export const maxDuration = 90;

type RequestBody = {
  todoTitle?: string;
  todoCategory?: Category;
  existingDocs?: Pick<TodoContextDoc, "name" | "text">[];
  newFiles?: IncomingFile[];
  /** Optional user-perspective hint to inject into the prompt. */
  userInsight?: string;
};

type ResponseBody = {
  estimate: TodoEstimate;
  newDocs: TodoContextDoc[];
  warnings: string[];
};

/**
 * Session-auth estimate route. Used by the panel inside the web app when
 * the user uploads new files and/or asks for a fresh estimate. The Bearer-
 * auth variant for the extension lives at /api/extension/estimate-todo and
 * shares the same `computeEstimate` engine.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: "Cross-origin request blocked." },
      { status: 403 },
    );
  }
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 });
  }

  const newFiles = Array.isArray(body.newFiles)
    ? body.newFiles.slice(0, MAX_FILES_PER_REQUEST)
    : [];

  const result = await computeEstimate({
    title: typeof body.todoTitle === "string" ? body.todoTitle : "",
    category: (body.todoCategory ?? "T1") as Category,
    existingDocs: Array.isArray(body.existingDocs) ? body.existingDocs : [],
    newFiles,
    userInsight: body.userInsight,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const response: ResponseBody = {
    estimate: result.estimate,
    newDocs: result.newDocs,
    warnings: result.warnings,
  };
  return NextResponse.json(response);
}

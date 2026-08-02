import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getProject } from "@/server/projects";
import { getWalk, startWalk } from "@/server/walks";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const walk = await getWalk(id);
  return NextResponse.json(walk);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim().length > 0) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const result = await startWalk(id, body as Parameters<typeof startWalk>[1]);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ job: result.job }, { status: 202 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", issues: error.issues },
        { status: 400 },
      );
    }
    throw error;
  }
}

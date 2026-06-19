import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getBriefForUser, NotFoundError, ServiceConfigurationError } from "@/lib/analysis/repository";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { userId }] = await Promise.all([params, auth()]);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const brief = await getBriefForUser(userId, id);
    if (!brief) return NextResponse.json({ error: "Brief is not ready" }, { status: 202 });
    return NextResponse.json(brief.architectureDiagram);
  } catch (error) {
    if (error instanceof ServiceConfigurationError || error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load diagram" }, { status: 500 });
  }
}

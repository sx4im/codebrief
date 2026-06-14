import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAnalysisStatusForUser, NotFoundError, ServiceConfigurationError } from "@/lib/analysis/repository";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await getAnalysisStatusForUser(userId, id));
  } catch (error) {
    if (error instanceof ServiceConfigurationError || error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load analysis status" }, { status: 500 });
  }
}

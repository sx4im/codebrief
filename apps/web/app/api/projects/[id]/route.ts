import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { deleteProjectForUser, NotFoundError, ServiceConfigurationError } from "@/lib/analysis/repository";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { userId }] = await Promise.all([params, auth()]);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const deleted = await deleteProjectForUser(userId, id);
    if (!deleted) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json({ deleted: id });
  } catch (error) {
    if (error instanceof ServiceConfigurationError || error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to delete project" }, { status: 500 });
  }
}

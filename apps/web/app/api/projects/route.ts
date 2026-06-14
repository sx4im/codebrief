import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createProjectForUser, getProjectsForUser, NotFoundError, ServiceConfigurationError } from "@/lib/analysis/repository";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await getProjectsForUser(userId));
  } catch (error) {
    return routeError(error, "Failed to load projects");
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as { repoUrl?: string; includePrivate?: boolean };
  const user = await currentUser();
  try {
    const project = await createProjectForUser({
      userId,
      email: user?.primaryEmailAddress?.emailAddress || `${userId}@codebrief.local`,
      repoUrl: body.repoUrl || "",
      includePrivate: body.includePrivate === true,
    });
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    return routeError(error, "Failed to create project");
  }
}

function routeError(error: unknown, fallback: string) {
  if (error instanceof ServiceConfigurationError || error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 400 });
}

import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { PipelineStageNameSchema } from "@codebrief/shared";
import { createRetryAnalysisRecord, markAnalysisEnqueueFailed, NotFoundError, ServiceConfigurationError } from "@/lib/analysis/repository";
import { getGitHubOAuthToken } from "@/lib/github/oauth";
import { enqueueAnalysis } from "@/lib/queue/analysis";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rateLimit = await checkRateLimit({ key: `analysis:retry:${userId}:${clientIp(request)}`, limit: 20, windowMs: 60 * 60 * 1000 });
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Analysis retry rate limit exceeded", retryAfterSeconds: rateLimit.retryAfterSeconds },
      { status: 429, headers: { "retry-after": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const body = await readJson(request);
  const retryFromStage = PipelineStageNameSchema.safeParse(body.retryFromStage).success ? PipelineStageNameSchema.parse(body.retryFromStage) : undefined;
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress || `${userId}@codebrief.local`;
  const githubToken = await getGitHubOAuthToken(userId).catch(() => null);

  let created;
  try {
    created = await createRetryAnalysisRecord({
      userId,
      email,
      analysisId: id,
      retryFromStage,
      githubToken: githubToken || undefined,
    });
  } catch (error) {
    return routeError(error, "Failed to prepare retry");
  }

  try {
    await enqueueAnalysis(created.payload);
    return NextResponse.json({ analysisId: created.analysisId, projectId: created.projectId }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to enqueue retry";
    await markAnalysisEnqueueFailed(created.analysisId, message);
    return NextResponse.json({ error: message, analysisId: created.analysisId, projectId: created.projectId }, { status: 503 });
  }
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function routeError(error: unknown, fallback: string) {
  if (error instanceof ServiceConfigurationError || error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 400 });
}

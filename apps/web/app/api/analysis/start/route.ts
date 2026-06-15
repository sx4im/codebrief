import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { AnalysisConfigSchema } from "@codebrief/shared";
import { createAnalysisRecord, getAnalysisEntitlement, markAnalysisEnqueueFailed, NotFoundError, ServiceConfigurationError } from "@/lib/analysis/repository";
import { getGitHubOAuthToken } from "@/lib/github/oauth";
import { enqueueAnalysis } from "@/lib/queue/analysis";
import { isOwnedUploadKey } from "@/lib/storage/analysis-artifacts";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Rate-limit keys are scoped to the authenticated user only. The client IP is
  // derived from X-Forwarded-For, which the client controls, so including it would
  // let a single account mint a fresh bucket per spoofed IP and bypass the cap.
  const rateLimit = await checkRateLimit({ key: `analysis:start:${userId}`, limit: 10, windowMs: 60 * 60 * 1000 });
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Analysis start rate limit exceeded", retryAfterSeconds: rateLimit.retryAfterSeconds },
      { status: 429, headers: { "retry-after": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const body = await readBody(request);
  const repoUrl = String(body.repoUrl || "");
  const scope = body.scope === "full" ? "full" : "quick";
  const config = AnalysisConfigSchema.parse({
    scope,
    scopeCommits: scope === "full" ? 500 : 100,
    scopePullRequests: scope === "full" ? 200 : 50,
    scopeIssues: scope === "full" ? 200 : 100,
    includePrivate: body.includePrivate === "true" || body.includePrivate === true,
    docsArtifactKey: optionalString(body.docsArtifactKey),
    issueCsvArtifactKey: optionalString(body.issueCsvArtifactKey),
  });
  // Artifact keys are supplied by the client. Only allow references to uploads this
  // user owns so a key cannot be pointed at another account's upload or at an
  // internal pipeline artifact.
  for (const artifactKey of [config.docsArtifactKey, config.issueCsvArtifactKey]) {
    if (artifactKey && !isOwnedUploadKey(userId, artifactKey)) {
      return NextResponse.json({ error: "Uploaded artifact does not belong to this account" }, { status: 400 });
    }
  }
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress || `${userId}@codebrief.local`;
  const wantsHtml = acceptsHtml(request);

  // Entitlement gate: free accounts get a fixed number of lifetime analyses;
  // beyond that a one-time purchase (plan="lifetime") is required.
  let entitlement;
  try {
    entitlement = await getAnalysisEntitlement(userId, email);
  } catch (error) {
    return errorResponse(error);
  }
  if (!entitlement.canAnalyze) {
    if (wantsHtml) return NextResponse.redirect(new URL("/settings?upgrade=required", request.url), { status: 303 });
    return NextResponse.json(
      {
        error: "You've used all your free analyses. Upgrade to lifetime access to continue.",
        code: "upgrade_required",
        used: entitlement.used,
        limit: entitlement.limit,
        upgradeUrl: "/settings?upgrade=required",
      },
      { status: 402 },
    );
  }

  const githubToken = await getGitHubOAuthToken(userId).catch(() => null);
  if (config.includePrivate && !githubToken && !process.env.GITHUB_TOKEN) {
    return NextResponse.json({ error: "Private repository analysis requires GitHub OAuth or GITHUB_TOKEN" }, { status: 409 });
  }

  let created;
  try {
    created = await createAnalysisRecord({
      userId,
      email,
      repoUrl,
      projectId: uuidOrUndefined(body.projectId),
      githubToken: githubToken || undefined,
      config,
    });
  } catch (error) {
    return errorResponse(error);
  }

  try {
    await enqueueAnalysis(created.payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to enqueue analysis";
    await markAnalysisEnqueueFailed(created.analysisId, message);
    if (wantsHtml) return NextResponse.redirect(progressUrl(request, created.projectId, created.analysisId), { status: 303 });
    return NextResponse.json({ error: message, analysisId: created.analysisId, projectId: created.projectId }, { status: 503 });
  }

  if (wantsHtml) return NextResponse.redirect(progressUrl(request, created.projectId, created.analysisId), { status: 303 });
  return NextResponse.json({ analysisId: created.analysisId, projectId: created.projectId }, { status: 202 });
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return (await request.json()) as Record<string, unknown>;
  const form = await request.formData();
  return Object.fromEntries(form.entries());
}

function acceptsHtml(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  const accept = request.headers.get("accept") || "";
  return !contentType.includes("application/json") && accept.includes("text/html");
}

function progressUrl(request: Request, projectId: string, analysisId: string) {
  return new URL(`/projects/${projectId}/${analysisId}/progress`, request.url);
}

function uuidOrUndefined(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : undefined;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function errorResponse(error: unknown) {
  if (error instanceof ServiceConfigurationError || error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to start analysis" }, { status: 400 });
}

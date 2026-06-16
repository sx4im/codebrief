import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  AnalysisConfigSchema,
  AnalysisJobPayloadSchema,
  AnalysisStatusSchema,
  BriefOutputSchema,
  FREE_ANALYSIS_LIMIT,
  PIPELINE_STAGES,
  PipelineStageStatusSchema,
  PlanSchema,
  QAConversationMessageSchema,
  type AnalysisConfig,
  type AnalysisJobPayload,
  type AnalysisStatus,
  type BriefOutput,
  type PipelineStageName,
  type PipelineStageStatus,
  type Plan,
  type QAAnswer,
  type QAConversationMessage,
  type SourceCitation,
  type SourcedClaim,
} from "@codebrief/shared";
import { getDb } from "@/lib/db/client";
import { analyses, artifacts, briefs, pipelineStages, projects, qaConversations, users } from "@/lib/db/schema";

export class ServiceConfigurationError extends Error {
  readonly status = 503;
  constructor(message: string) {
    super(message);
    this.name = "ServiceConfigurationError";
  }
}

export class NotFoundError extends Error {
  readonly status = 404;
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export interface CreateAnalysisInput {
  userId: string;
  email: string;
  repoUrl: string;
  projectId?: string;
  githubToken?: string;
  config: AnalysisConfig;
}

export interface CreatedAnalysis {
  analysisId: string;
  projectId: string;
  payload: AnalysisJobPayload;
}

export interface RetryAnalysisInput {
  userId: string;
  email: string;
  analysisId: string;
  retryFromStage?: PipelineStageName;
  githubToken?: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  repoUrl: string;
  repoFullName: string;
  createdAt: string | null;
  latestAnalysisId: string | null;
  latestStatus: AnalysisStatus | "not-run";
  latestVerdict: string | null;
  lastAnalyzedAt: string | null;
}

export interface CreateProjectInput {
  userId: string;
  email: string;
  repoUrl: string;
  includePrivate: boolean;
}

export interface AnalysisStatusView {
  analysisId: string;
  projectId: string;
  repoUrl: string;
  repoFullName: string;
  status: AnalysisStatus;
  progress: number;
  tokensUsed: number;
  errorMessage: string | null;
  canRetry: boolean;
  stages: Array<{
    stageName: PipelineStageName;
    status: PipelineStageStatus;
    startedAt: string | null;
    completedAt: string | null;
    errorMessage: string | null;
    output: unknown;
  }>;
}

export interface UsageSummary {
  plan: Plan;
  analysesUsed: number;
  tokensUsed: number;
  limit: number | null;
}

export interface AccountExport {
  schemaVersion: 1;
  exportedAt: string;
  user: {
    id: string;
    email: string;
    plan: Plan;
    createdAt: string | null;
    githubConnected: boolean;
  };
  usage: UsageSummary;
  projects: AccountExportProject[];
  totals: {
    projects: number;
    analyses: number;
    pipelineStages: number;
    briefs: number;
    qaConversations: number;
    artifacts: number;
  };
  redactions: string[];
}

export interface AccountExportProject {
  id: string;
  name: string;
  repoUrl: string;
  repoOwner: string;
  repoName: string;
  provider: string | null;
  isPrivate: boolean | null;
  createdAt: string | null;
  analyses: Array<{
    id: string;
    status: AnalysisStatus;
    config: unknown;
    createdAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    errorMessage: string | null;
    tokensUsed: number;
    stages: Array<{
      id: string;
      stageName: string;
      status: PipelineStageStatus;
      startedAt: string | null;
      completedAt: string | null;
      output: unknown;
      errorMessage: string | null;
    }>;
    brief: {
      id: string;
      createdAt: string | null;
      systemNarrative: unknown;
      decisions: unknown;
      landmines: unknown;
      assessment: unknown;
      topFindings: unknown;
      architectureDiagram: unknown;
      repoStats: unknown;
      modelVersions: unknown;
      flaggedClaims: unknown;
    } | null;
    qaConversations: Array<{
      id: string;
      messages: QAConversationMessage[];
      updatedAt: string | null;
    }>;
    artifacts: Array<{
      id: string;
      type: string;
      storageKey: string;
      sizeBytes: number | null;
      createdAt: string | null;
    }>;
  }>;
}

export interface AccountDeletionSummary {
  userDeleted: boolean;
  projectsDeleted: number;
  analysesDeleted: number;
  pipelineStagesDeleted: number;
  briefsDeleted: number;
  qaConversationsDeleted: number;
  artifactsDeleted: number;
}

export function parseGitHubRepoUrl(repoUrl: string): { owner: string; name: string; normalizedUrl: string } | null {
  const trimmed = repoUrl.trim();
  const match = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/([^/#?]+)(?:[/?#].*)?$/);
  if (!match?.[1] || !match[2]) return null;
  const owner = match[1];
  const name = match[2].replace(/\.git$/, "");
  // owner/name are interpolated into GitHub API paths (`/repos/${owner}/${repo}`)
  // without encoding. Restrict them to GitHub's actual identifier charset so a
  // crafted value (e.g. "..", "%2f", "?") cannot traverse or inject into the API
  // URL and redirect the server's token to a different endpoint.
  if (!/^[A-Za-z0-9-]+$/.test(owner)) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(name) || name === "." || name === "..") return null;
  return { owner, name, normalizedUrl: `https://github.com/${owner}/${name}` };
}

export function getConfiguredDb() {
  if (!process.env.DATABASE_URL) {
    throw new ServiceConfigurationError("DATABASE_URL is not configured");
  }
  return getDb();
}

export async function createAnalysisRecord(input: CreateAnalysisInput): Promise<CreatedAnalysis> {
  const repo = parseGitHubRepoUrl(input.repoUrl);
  if (!repo) throw new Error("GitHub repository URL required");

  const config = AnalysisConfigSchema.parse(input.config);
  const db = getConfiguredDb();
  const user = await upsertUser(input.userId, input.email);

  const project = await findOrCreateProject({
    userId: input.userId,
    projectId: input.projectId,
    repoOwner: repo.owner,
    repoName: repo.name,
    repoUrl: repo.normalizedUrl,
    includePrivate: config.includePrivate,
  });

  const analysisId = randomUUID();
  await db.insert(analyses).values({
    id: analysisId,
    projectId: project.id,
    status: "pending",
    config,
    tokensUsed: 0,
  });
  await db.insert(pipelineStages).values(
    PIPELINE_STAGES.map((stageName) => ({
      id: randomUUID(),
      analysisId,
      stageName,
      status: "pending",
    })),
  );

  const payload = AnalysisJobPayloadSchema.parse({
    analysisId,
    projectId: project.id,
    userId: input.userId,
    repoOwner: project.repoOwner,
    repoName: project.repoName,
    repoUrl: project.repoUrl,
    githubToken: input.githubToken || user.githubToken || undefined,
    config,
  });

  return { analysisId, projectId: project.id, payload };
}

export async function createRetryAnalysisRecord(input: RetryAnalysisInput): Promise<CreatedAnalysis> {
  const db = getConfiguredDb();
  const [source] = await db
    .select({
      id: analyses.id,
      config: analyses.config,
      projectId: projects.id,
      repoUrl: projects.repoUrl,
      userId: projects.userId,
    })
    .from(analyses)
    .innerJoin(projects, eq(projects.id, analyses.projectId))
    .where(and(eq(analyses.id, input.analysisId), eq(projects.userId, input.userId)))
    .limit(1);

  if (!source) throw new NotFoundError("Analysis not found");
  const existingConfig = source.config && typeof source.config === "object" ? source.config : {};
  const config = AnalysisConfigSchema.parse({
    ...existingConfig,
    retryOfAnalysisId: input.analysisId,
    retryFromStage: input.retryFromStage,
  });

  return createAnalysisRecord({
    userId: input.userId,
    email: input.email,
    repoUrl: source.repoUrl,
    projectId: source.projectId,
    githubToken: input.githubToken,
    config,
  });
}

export async function markAnalysisEnqueueFailed(analysisId: string, errorMessage: string) {
  const db = getConfiguredDb();
  await db.update(analyses).set({ status: "failed", errorMessage }).where(eq(analyses.id, analysisId));
  await db
    .update(pipelineStages)
    .set({ status: "failed", errorMessage, completedAt: new Date() })
    .where(and(eq(pipelineStages.analysisId, analysisId), eq(pipelineStages.stageName, "ingest:repo")));
}

export async function getProjectsForUser(userId: string): Promise<ProjectSummary[]> {
  const db = getConfiguredDb();
  const projectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      repoUrl: projects.repoUrl,
      repoOwner: projects.repoOwner,
      repoName: projects.repoName,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.createdAt));

  if (projectRows.length === 0) return [];

  const projectIds = projectRows.map((project) => project.id);
  const analysisRows = await db
    .select({
      id: analyses.id,
      projectId: analyses.projectId,
      status: analyses.status,
      completedAt: analyses.completedAt,
      startedAt: analyses.startedAt,
      createdAt: analyses.createdAt,
      assessment: briefs.assessment,
    })
    .from(analyses)
    .leftJoin(briefs, eq(briefs.analysisId, analyses.id))
    .where(inArray(analyses.projectId, projectIds))
    .orderBy(desc(analyses.createdAt));

  const latestByProject = new Map<string, (typeof analysisRows)[number]>();
  for (const row of analysisRows) {
    if (row.projectId && !latestByProject.has(row.projectId)) latestByProject.set(row.projectId, row);
  }

  return projectRows.map((project) => {
    const latest = latestByProject.get(project.id);
    return {
      id: project.id,
      name: project.name,
      repoUrl: project.repoUrl,
      repoFullName: `${project.repoOwner}/${project.repoName}`,
      createdAt: toIso(project.createdAt),
      latestAnalysisId: latest?.id || null,
      latestStatus: latest ? parseAnalysisStatus(latest.status) : "not-run",
      latestVerdict: extractVerdict(latest?.assessment),
      lastAnalyzedAt: toIso(latest?.completedAt || latest?.startedAt || latest?.createdAt || null),
    };
  });
}

export async function createProjectForUser(input: CreateProjectInput): Promise<ProjectSummary> {
  const repo = parseGitHubRepoUrl(input.repoUrl);
  if (!repo) throw new Error("GitHub repository URL required");

  await upsertUser(input.userId, input.email);

  const project = await findOrCreateProject({
    userId: input.userId,
    repoOwner: repo.owner,
    repoName: repo.name,
    repoUrl: repo.normalizedUrl,
    includePrivate: input.includePrivate,
  });

  return {
    id: project.id,
    name: project.name,
    repoUrl: project.repoUrl,
    repoFullName: `${project.repoOwner}/${project.repoName}`,
    createdAt: toIso(project.createdAt),
    latestAnalysisId: null,
    latestStatus: "not-run",
    latestVerdict: null,
    lastAnalyzedAt: null,
  };
}

export async function getAnalysisStatusForUser(userId: string, analysisId: string): Promise<AnalysisStatusView> {
  const db = getConfiguredDb();
  const [analysis] = await db
    .select({
      id: analyses.id,
      projectId: projects.id,
      repoUrl: projects.repoUrl,
      repoOwner: projects.repoOwner,
      repoName: projects.repoName,
      status: analyses.status,
      errorMessage: analyses.errorMessage,
      tokensUsed: analyses.tokensUsed,
    })
    .from(analyses)
    .innerJoin(projects, eq(projects.id, analyses.projectId))
    .where(and(eq(analyses.id, analysisId), eq(projects.userId, userId)))
    .limit(1);

  if (!analysis) throw new NotFoundError("Analysis not found");

  const stageRows = await db
    .select({
      stageName: pipelineStages.stageName,
      status: pipelineStages.status,
      startedAt: pipelineStages.startedAt,
      completedAt: pipelineStages.completedAt,
      errorMessage: pipelineStages.errorMessage,
      output: pipelineStages.output,
    })
    .from(pipelineStages)
    .where(eq(pipelineStages.analysisId, analysisId));

  const byStage = new Map(stageRows.map((stage) => [stage.stageName, stage]));
  const stages = PIPELINE_STAGES.map((stageName) => {
    const stage = byStage.get(stageName);
    return {
      stageName,
      status: parseStageStatus(stage?.status),
      startedAt: toIso(stage?.startedAt || null),
      completedAt: toIso(stage?.completedAt || null),
      errorMessage: stage?.errorMessage || null,
      output: stage?.output ?? null,
    };
  });
  const doneCount = stages.filter((stage) => stage.status === "done").length;
  const status = parseAnalysisStatus(analysis.status);

  return {
    analysisId: analysis.id,
    projectId: analysis.projectId,
    repoUrl: analysis.repoUrl,
    repoFullName: `${analysis.repoOwner}/${analysis.repoName}`,
    status,
    progress: status === "complete" ? 100 : Math.round((doneCount / PIPELINE_STAGES.length) * 100),
    tokensUsed: analysis.tokensUsed || 0,
    errorMessage: analysis.errorMessage || null,
    canRetry: status === "failed",
    stages,
  };
}

export async function getBriefForUser(userId: string, analysisId: string): Promise<BriefOutput | null> {
  const db = getConfiguredDb();
  const [row] = await db
    .select({
      id: briefs.id,
      analysisId: analyses.id,
      createdAt: briefs.createdAt,
      repoOwner: projects.repoOwner,
      repoName: projects.repoName,
      systemNarrative: briefs.systemNarrative,
      decisions: briefs.decisions,
      landmines: briefs.landmines,
      assessment: briefs.assessment,
      topFindings: briefs.topFindings,
      architectureDiagram: briefs.architectureDiagram,
      repoStats: briefs.repoStats,
      modelVersions: briefs.modelVersions,
      flaggedClaims: briefs.flaggedClaims,
    })
    .from(briefs)
    .innerJoin(analyses, eq(analyses.id, briefs.analysisId))
    .innerJoin(projects, eq(projects.id, analyses.projectId))
    .where(and(eq(analyses.id, analysisId), eq(projects.userId, userId)))
    .limit(1);

  if (!row) return null;
  return BriefOutputSchema.parse({
    id: row.id,
    analysisId: row.analysisId,
    repoFullName: `${row.repoOwner}/${row.repoName}`,
    createdAt: toIso(row.createdAt) || new Date().toISOString(),
    systemNarrative: row.systemNarrative,
    decisions: row.decisions,
    landmines: row.landmines,
    assessment: row.assessment,
    topFindings: row.topFindings,
    architectureDiagram: row.architectureDiagram,
    repoStats: row.repoStats,
    modelVersions: row.modelVersions || {},
    flaggedClaims: row.flaggedClaims || [],
  });
}

export async function getUsageForUser(userId: string, fallbackEmail = `${userId}@codebrief.local`): Promise<UsageSummary> {
  const db = getConfiguredDb();
  const user = await getOrCreateUser(userId, fallbackEmail);
  const plan = parsePlan(user.plan);
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [summary] = await db
    .select({
      analysesUsed: sql<number>`count(${analyses.id})::int`,
      tokensUsed: sql<number>`coalesce(sum(${analyses.tokensUsed}), 0)::int`,
    })
    .from(analyses)
    .innerJoin(projects, eq(projects.id, analyses.projectId))
    .where(and(eq(projects.userId, userId), gte(analyses.createdAt, monthStart)));

  return {
    plan,
    analysesUsed: summary?.analysesUsed || 0,
    tokensUsed: summary?.tokensUsed || 0,
    limit: null,
  };
}

export interface AnalysisEntitlement {
  plan: Plan;
  /** True once the user has paid for lifetime access. */
  lifetime: boolean;
  /** Lifetime count of analyses this user has started. */
  used: number;
  /** Free-tier ceiling; null when unlimited (lifetime). */
  limit: number | null;
  /** Free analyses left; null when unlimited. */
  remaining: number | null;
  /** Whether the user may start another analysis right now. */
  canAnalyze: boolean;
}

/**
 * Resolves whether a user may start a new analysis. Free accounts get
 * FREE_ANALYSIS_LIMIT lifetime analyses; a one-time purchase sets
 * plan="lifetime" for unlimited access. Counting is lifetime (all analyses ever
 * started under the user's projects), not monthly.
 */
export async function getAnalysisEntitlement(userId: string, fallbackEmail?: string): Promise<AnalysisEntitlement> {
  const db = getConfiguredDb();
  const user = await getOrCreateUser(userId, fallbackEmail ?? `${userId}@codebrief.local`);
  const plan = parsePlan(user.plan);
  const lifetime = plan === "lifetime";

  const [row] = await db
    .select({ used: sql<number>`count(${analyses.id})::int` })
    .from(analyses)
    .innerJoin(projects, eq(projects.id, analyses.projectId))
    .where(eq(projects.userId, userId));
  const used = row?.used ?? 0;

  if (lifetime) {
    return { plan, lifetime: true, used, limit: null, remaining: null, canAnalyze: true };
  }
  const remaining = Math.max(0, FREE_ANALYSIS_LIMIT - used);
  return { plan, lifetime: false, used, limit: FREE_ANALYSIS_LIMIT, remaining, canAnalyze: used < FREE_ANALYSIS_LIMIT };
}

/** Grant lifetime access after a successful Stripe payment (idempotent). */
export async function markUserLifetime(input: { userId: string; email?: string; stripeCustomerId?: string }): Promise<void> {
  const db = getConfiguredDb();
  await getOrCreateUser(input.userId, input.email ?? `${input.userId}@codebrief.local`);
  await db
    .update(users)
    .set({ plan: "lifetime", ...(input.stripeCustomerId ? { stripeCustomerId: input.stripeCustomerId } : {}) })
    .where(eq(users.id, input.userId));
}

export async function getAccountExportForUser(userId: string, fallbackEmail?: string): Promise<AccountExport> {
  const db = getConfiguredDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const plan = parsePlan(user?.plan);
  const projectRows = await db.select().from(projects).where(eq(projects.userId, userId)).orderBy(asc(projects.createdAt));
  const projectIds = projectRows.map((project) => project.id);
  const analysisRows =
    projectIds.length > 0
      ? await db.select().from(analyses).where(inArray(analyses.projectId, projectIds)).orderBy(asc(analyses.createdAt))
      : [];
  const analysisIds = analysisRows.map((analysis) => analysis.id);
  const stageRows =
    analysisIds.length > 0
      ? await db.select().from(pipelineStages).where(inArray(pipelineStages.analysisId, analysisIds)).orderBy(asc(pipelineStages.stageName))
      : [];
  const briefRows =
    analysisIds.length > 0 ? await db.select().from(briefs).where(inArray(briefs.analysisId, analysisIds)).orderBy(asc(briefs.createdAt)) : [];
  const conversationRows =
    analysisIds.length > 0
      ? await db.select().from(qaConversations).where(inArray(qaConversations.analysisId, analysisIds)).orderBy(asc(qaConversations.updatedAt))
      : [];
  const artifactRows =
    analysisIds.length > 0 ? await db.select().from(artifacts).where(inArray(artifacts.analysisId, analysisIds)).orderBy(asc(artifacts.createdAt)) : [];
  const usage = await getUsageSummaryFromRows(db, userId, plan);

  const stagesByAnalysis = groupBy(stageRows, (row) => row.analysisId || "");
  const conversationsByAnalysis = groupBy(conversationRows, (row) => row.analysisId || "");
  const artifactsByAnalysis = groupBy(artifactRows, (row) => row.analysisId || "");
  const briefByAnalysis = new Map(briefRows.map((brief) => [brief.analysisId || "", brief]));
  const analysesByProject = groupBy(analysisRows, (analysis) => analysis.projectId || "");

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    user: {
      id: userId,
      email: user?.email || fallbackEmail || `${userId}@codebrief.local`,
      plan,
      createdAt: toIso(user?.createdAt || null),
      githubConnected: Boolean(user?.githubToken),
    },
    usage,
    projects: projectRows.map((project) => ({
      id: project.id,
      name: project.name,
      repoUrl: project.repoUrl,
      repoOwner: project.repoOwner,
      repoName: project.repoName,
      provider: project.provider,
      isPrivate: project.isPrivate,
      createdAt: toIso(project.createdAt),
      analyses: (analysesByProject.get(project.id) || []).map((analysis) => {
        const brief = briefByAnalysis.get(analysis.id);
        return {
          id: analysis.id,
          status: parseAnalysisStatus(analysis.status),
          config: analysis.config,
          createdAt: toIso(analysis.createdAt),
          startedAt: toIso(analysis.startedAt),
          completedAt: toIso(analysis.completedAt),
          errorMessage: analysis.errorMessage,
          tokensUsed: analysis.tokensUsed || 0,
          stages: (stagesByAnalysis.get(analysis.id) || [])
            .slice()
            .sort((a, b) => stageSortIndex(a.stageName) - stageSortIndex(b.stageName))
            .map((stage) => ({
              id: stage.id,
              stageName: stage.stageName,
              status: parseStageStatus(stage.status),
              startedAt: toIso(stage.startedAt),
              completedAt: toIso(stage.completedAt),
              output: stage.output,
              errorMessage: stage.errorMessage,
            })),
          brief: brief
            ? {
                id: brief.id,
                createdAt: toIso(brief.createdAt),
                systemNarrative: brief.systemNarrative,
                decisions: brief.decisions,
                landmines: brief.landmines,
                assessment: brief.assessment,
                topFindings: brief.topFindings,
                architectureDiagram: brief.architectureDiagram,
                repoStats: brief.repoStats,
                modelVersions: brief.modelVersions,
                flaggedClaims: brief.flaggedClaims,
              }
            : null,
          qaConversations: (conversationsByAnalysis.get(analysis.id) || []).map((conversation) => ({
            id: conversation.id,
            messages: parseQaMessages(conversation.messages),
            updatedAt: toIso(conversation.updatedAt),
          })),
          artifacts: (artifactsByAnalysis.get(analysis.id) || []).map((artifact) => ({
            id: artifact.id,
            type: artifact.type,
            storageKey: artifact.storageKey,
            sizeBytes: artifact.sizeBytes,
            createdAt: toIso(artifact.createdAt),
          })),
        };
      }),
    })),
    totals: {
      projects: projectRows.length,
      analyses: analysisRows.length,
      pipelineStages: stageRows.length,
      briefs: briefRows.length,
      qaConversations: conversationRows.length,
      artifacts: artifactRows.length,
    },
    redactions: [
      "users.githubToken is intentionally redacted. Reconnect GitHub from the account provider instead of importing a token from this file.",
      "Artifact records include storage keys and sizes; raw object-storage payloads are not embedded in this database export.",
    ],
  };
}

export async function deleteAccountDataForUser(userId: string): Promise<AccountDeletionSummary> {
  const db = getConfiguredDb();
  return db.transaction(async (tx) => {
    const projectRows = await tx.select({ id: projects.id }).from(projects).where(eq(projects.userId, userId));
    const projectIds = projectRows.map((project) => project.id);
    const analysisRows =
      projectIds.length > 0 ? await tx.select({ id: analyses.id }).from(analyses).where(inArray(analyses.projectId, projectIds)) : [];
    const analysisIds = analysisRows.map((analysis) => analysis.id);

    const deletedStages =
      analysisIds.length > 0 ? await tx.delete(pipelineStages).where(inArray(pipelineStages.analysisId, analysisIds)).returning({ id: pipelineStages.id }) : [];
    const deletedBriefs =
      analysisIds.length > 0 ? await tx.delete(briefs).where(inArray(briefs.analysisId, analysisIds)).returning({ id: briefs.id }) : [];
    const deletedConversations =
      analysisIds.length > 0
        ? await tx.delete(qaConversations).where(inArray(qaConversations.analysisId, analysisIds)).returning({ id: qaConversations.id })
        : [];
    const deletedArtifacts =
      analysisIds.length > 0 ? await tx.delete(artifacts).where(inArray(artifacts.analysisId, analysisIds)).returning({ id: artifacts.id }) : [];
    const deletedAnalyses =
      analysisIds.length > 0 ? await tx.delete(analyses).where(inArray(analyses.id, analysisIds)).returning({ id: analyses.id }) : [];
    const deletedProjects = await tx.delete(projects).where(eq(projects.userId, userId)).returning({ id: projects.id });
    const deletedUsers = await tx.delete(users).where(eq(users.id, userId)).returning({ id: users.id });

    return {
      userDeleted: deletedUsers.length > 0,
      projectsDeleted: deletedProjects.length,
      analysesDeleted: deletedAnalyses.length,
      pipelineStagesDeleted: deletedStages.length,
      briefsDeleted: deletedBriefs.length,
      qaConversationsDeleted: deletedConversations.length,
      artifactsDeleted: deletedArtifacts.length,
    };
  });
}

export async function deleteProjectForUser(userId: string, projectId: string): Promise<boolean> {
  const db = getConfiguredDb();
  const deleted = await db.delete(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId))).returning({ id: projects.id });
  return deleted.length > 0;
}

export async function addAnalysisTokenUsage(userId: string, analysisId: string, tokenUsage: number) {
  if (tokenUsage <= 0) return;
  const db = getConfiguredDb();
  await assertAnalysisOwnedByUser(db, userId, analysisId);
  await db
    .update(analyses)
    .set({ tokensUsed: sql<number>`${analyses.tokensUsed} + ${tokenUsage}` })
    .where(eq(analyses.id, analysisId));
}

export async function getQaMessagesForUser(userId: string, analysisId: string): Promise<QAConversationMessage[]> {
  const db = getConfiguredDb();
  await assertAnalysisOwnedByUser(db, userId, analysisId);
  const [conversation] = await db
    .select({ messages: qaConversations.messages })
    .from(qaConversations)
    .where(eq(qaConversations.analysisId, analysisId))
    .orderBy(desc(qaConversations.updatedAt))
    .limit(1);
  return parseQaMessages(conversation?.messages);
}

export async function appendQaExchangeForUser(input: {
  userId: string;
  analysisId: string;
  question: string;
  answer: QAAnswer;
}): Promise<QAConversationMessage[]> {
  const db = getConfiguredDb();
  await assertAnalysisOwnedByUser(db, input.userId, input.analysisId);
  const [conversation] = await db
    .select({ id: qaConversations.id, messages: qaConversations.messages })
    .from(qaConversations)
    .where(eq(qaConversations.analysisId, input.analysisId))
    .orderBy(desc(qaConversations.updatedAt))
    .limit(1);

  const timestamp = new Date().toISOString();
  const messages = [
    ...parseQaMessages(conversation?.messages),
    { role: "user" as const, content: input.question, timestamp },
    {
      role: "assistant" as const,
      content: input.answer.answer,
      sources: input.answer.sources,
      confidence: input.answer.confidence,
      caveat: input.answer.caveat,
      timestamp,
    },
  ].slice(-100);

  if (conversation) {
    await db
      .update(qaConversations)
      .set({ messages, updatedAt: new Date() })
      .where(eq(qaConversations.id, conversation.id));
  } else {
    await db.insert(qaConversations).values({
      id: randomUUID(),
      analysisId: input.analysisId,
      messages,
      updatedAt: new Date(),
    });
  }

  return messages;
}

export function briefToMarkdown(brief: BriefOutput): string {
  const lines = [
    `# Codebrief: ${brief.repoFullName}`,
    "",
    `> ${brief.systemNarrative.purpose.claim}`,
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Generated | ${formatExportDate(brief.createdAt)} |`,
    `| Analysis ID | \`${brief.analysisId}\` |`,
    `| Verdict | ${brief.assessment.verdict} |`,
    `| Confidence | ${formatConfidence(brief.assessment.confidence)} |`,
    "",
    "---",
    "",
    "## Repository Snapshot",
    `- Files analyzed: ${brief.repoStats.fileCount}`,
    `- Commits inspected: ${brief.repoStats.commitCount}`,
    `- Pull requests inspected: ${brief.repoStats.pullRequestCount}`,
    `- Contributors observed: ${brief.repoStats.contributorCount}`,
    ...(brief.repoStats.repoAgeDays !== undefined ? [`- Repository age: ${brief.repoStats.repoAgeDays} days`] : []),
    ...(brief.repoStats.commitsPerMonth !== undefined ? [`- Commit frequency: ${brief.repoStats.commitsPerMonth} commits/month (sampled window)`] : []),
    ...formatLanguageBreakdownMarkdown(brief.repoStats.languageBreakdown),
    "",
    "## System Narrative",
    ...formatSourcedClaimMarkdown("Purpose", brief.systemNarrative.purpose),
    ...formatSourcedClaimMarkdown("Data model", brief.systemNarrative.dataModel),
    ...formatSourcedClaimMarkdown("Architecture pattern", brief.systemNarrative.architecturePattern),
    "- Main workflows:",
    ...brief.systemNarrative.mainWorkflows.flatMap((workflow) =>
      formatSourcedClaimMarkdown(workflow.name, workflow).map((line) => `  ${line}`),
    ),
    ...(brief.systemNarrative.integrations.length > 0
      ? [
          "- Integrations:",
          ...brief.systemNarrative.integrations.flatMap((integration) =>
            formatSourcedClaimMarkdown(`${integration.name} (${integration.kind})`, integration).map((line) => `  ${line}`),
          ),
        ]
      : []),
    "- Supporting claims:",
    ...brief.systemNarrative.claims.flatMap((claim, index) =>
      formatSourcedClaimMarkdown(`Claim ${index + 1}`, claim).map((line) => `  ${line}`),
    ),
    `- Narrative confidence: ${formatConfidence(brief.systemNarrative.confidence)}`,
    "",
    "## Top Findings",
    ...brief.topFindings.flatMap((finding) => [
      `- **${finding.title}** (${finding.severity}, confidence ${formatConfidence(finding.confidence)})`,
      `  - ${finding.claim}`,
      ...formatSourcesMarkdown(finding.sources, 2),
    ]),
    "",
    ...(brief.flaggedClaims.length > 0
      ? [
          "## Flagged Claims",
          ...brief.flaggedClaims.flatMap((claim) => [
            `- **Confidence ${formatConfidence(claim.confidence)}:** ${claim.claim}`,
            ...formatSourcesMarkdown(claim.sources, 1),
          ]),
          "",
        ]
      : []),
    "## Decision Archaeology",
    ...brief.decisions.flatMap((decision) => [
      `- **${decision.title}** (confidence ${formatConfidence(decision.confidence)})`,
      `  - Description: ${decision.description}`,
      `  - Context: ${decision.context}`,
      `  - Assessment: ${decision.assessment}`,
      ...formatSourcesMarkdown(decision.evidence, 2),
    ]),
    "",
    "## Landmine Map",
    ...brief.landmines.flatMap((landmine) => [
      `- **${landmine.location}** (${landmine.severity}, ${landmine.category}, priority ${landmine.priority}, confidence ${formatConfidence(
        landmine.confidence,
      )})`,
      `  - Why it matters: ${landmine.explanation}`,
      `  - Remediation: ${landmine.remediation}`,
      `  - Estimate: ${landmine.remediationEstimate}`,
      ...formatSourcesMarkdown(landmine.evidence, 2),
    ]),
    "",
    "## Architecture Diagram Summary",
    ...(brief.architectureDiagram.nodes.length > 0
      ? [
          "- Nodes:",
          ...brief.architectureDiagram.nodes.map(
            (node) =>
              `  - ${node.label} (${node.path})${node.severity ? `, severity ${node.severity}` : ""}, landmines ${node.landmineCount}`,
          ),
        ]
      : ["- Nodes: none recorded"]),
    ...(brief.architectureDiagram.edges.length > 0
      ? [
          "- Edges:",
          ...brief.architectureDiagram.edges.map((edge) => `  - ${edge.source} -> ${edge.target} (${edge.kind})`),
        ]
      : ["- Edges: none recorded"]),
    "",
    "## Rewrite Assessment",
    `Verdict: ${brief.assessment.verdict}`,
    `Confidence: ${formatConfidence(brief.assessment.confidence)}`,
    `Uncertainty: ${brief.assessment.uncertainty}`,
    "",
    "### Reasons",
    ...brief.assessment.reasons.flatMap((reason, index) => formatSourcedClaimMarkdown(`Reason ${index + 1}`, reason)),
    "",
    "### Risks",
    ...brief.assessment.risks.flatMap((risk, index) => formatSourcedClaimMarkdown(`Risk ${index + 1}`, risk)),
  ];

  return normalizeExportText(lines.join("\n"));
}

const LANGUAGE_BREAKDOWN_LIMIT = 12;

export function briefToHtml(brief: BriefOutput): string {
  const languageEntries = Object.entries(brief.repoStats.languageBreakdown).sort((a, b) => b[1] - a[1]);
  const languageShown = languageEntries.slice(0, LANGUAGE_BREAKDOWN_LIMIT);
  const languageRemainder = languageEntries.slice(LANGUAGE_BREAKDOWN_LIMIT);
  const languageTotal = languageEntries.reduce((sum, [, count]) => sum + count, 0) || 1;
  const languageMax = languageShown[0]?.[1] || 1;
  // Compact two-column bar chart instead of a tall single-column table: each row
  // shows the language, a proportional bar, and its file count + share.
  const languageItems = languageShown
    .map(([language, count]) => {
      const pct = Math.round((count / languageTotal) * 100);
      const barWidth = Math.max(4, Math.round((count / languageMax) * 100));
      return `<div class="lang"><span class="lang-name">${escapeHtml(language)}</span><span class="lang-bar"><i style="width:${barWidth}%"></i></span><span class="lang-count">${count}<span class="lang-pct">${pct}%</span></span></div>`;
    })
    .join("");
  const languageMoreItem =
    languageRemainder.length > 0
      ? `<div class="lang lang-more"><span class="lang-name">+${languageRemainder.length} more</span><span class="lang-bar"></span><span class="lang-count">${languageRemainder.reduce((sum, [, count]) => sum + count, 0)}</span></div>`
      : "";
  const languageBreakdownHtml = languageItems
    ? `<h3>Language Breakdown</h3><div class="langs">${languageItems}${languageMoreItem}</div>`
    : "";
  const findings = brief.topFindings.map((finding) => renderFindingHtml(finding)).join("");
  const decisions = brief.decisions
    .map(
      (decision) => `<article class="item">
        <h3>${escapeHtml(decision.title)} <span>${formatConfidence(decision.confidence)}</span></h3>
        <p>${escapeHtml(decision.description)}</p>
        <dl>
          <dt>Context</dt><dd>${escapeHtml(decision.context)}</dd>
          <dt>Assessment</dt><dd>${escapeHtml(decision.assessment)}</dd>
        </dl>
        ${renderSourcesHtml(decision.evidence)}
      </article>`,
    )
    .join("");
  const landmines = brief.landmines.map((landmine) => renderLandmineHtml(landmine)).join("");
  const flagged =
    brief.flaggedClaims.length > 0
      ? `<section><h2>Flagged Claims</h2>${brief.flaggedClaims.map((claim) => renderClaimHtml("Needs review", claim)).join("")}</section>`
      : "";
  const diagramNodes = brief.architectureDiagram.nodes
    .map(
      (node) => `<tr>
        <th>${escapeHtml(node.label)}</th>
        <td>${escapeHtml(node.path)}</td>
        <td>${escapeHtml(node.severity || "none")}</td>
        <td>${node.landmineCount}</td>
      </tr>`,
    )
    .join("");
  const diagramEdges = brief.architectureDiagram.edges
    .map((edge) => `<li>${escapeHtml(edge.source)} -> ${escapeHtml(edge.target)} <span>${escapeHtml(edge.kind)}</span></li>`)
    .join("");
  return [
    "<!doctype html>",
    `<html lang="en"><head><meta charset="utf-8"><title>Codebrief Export: ${escapeHtml(brief.repoFullName)}</title>`,
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    `<style>${exportCss()}</style>`,
    "</head><body>",
    "<main>",
    `<header class="cover">
      <p class="eyebrow">Codebrief technical audit</p>
      <h1>${escapeHtml(brief.repoFullName)}</h1>
      <p class="lede">${escapeHtml(brief.systemNarrative.purpose.claim)}</p>
      <dl class="meta">
        <div><dt>Generated</dt><dd>${escapeHtml(formatExportDate(brief.createdAt))}</dd></div>
        <div><dt>Analysis</dt><dd>${escapeHtml(brief.analysisId)}</dd></div>
        <div><dt>Verdict</dt><dd>${escapeHtml(brief.assessment.verdict)}</dd></div>
        <div><dt>Confidence</dt><dd>${formatConfidence(brief.assessment.confidence)}</dd></div>
      </dl>
    </header>`,
    `<section><h2>Repository Snapshot</h2>
      <div class="stats">
        <div><span>${brief.repoStats.fileCount}</span><small>files analyzed</small></div>
        <div><span>${brief.repoStats.commitCount}</span><small>commits inspected</small></div>
        <div><span>${brief.repoStats.pullRequestCount}</span><small>pull requests inspected</small></div>
        <div><span>${brief.repoStats.contributorCount}</span><small>contributors observed</small></div>
        ${brief.repoStats.repoAgeDays !== undefined ? `<div><span>${brief.repoStats.repoAgeDays}</span><small>days old</small></div>` : ""}
        ${brief.repoStats.commitsPerMonth !== undefined ? `<div><span>${brief.repoStats.commitsPerMonth}</span><small>commits/month</small></div>` : ""}
      </div>
      ${languageBreakdownHtml}
    </section>`,
    `<section><h2>System Narrative</h2>
      ${renderClaimHtml("Purpose", brief.systemNarrative.purpose)}
      ${renderClaimHtml("Data model", brief.systemNarrative.dataModel)}
      ${renderClaimHtml("Architecture pattern", brief.systemNarrative.architecturePattern)}
      <h3>Main Workflows</h3>
      ${brief.systemNarrative.mainWorkflows.map((workflow) => renderClaimHtml(workflow.name, workflow)).join("")}
      ${
        brief.systemNarrative.integrations.length > 0
          ? `<h3>Integrations</h3>${brief.systemNarrative.integrations
              .map((integration) => renderClaimHtml(`${integration.name} (${integration.kind})`, integration))
              .join("")}`
          : ""
      }
      <h3>Supporting Claims</h3>
      ${brief.systemNarrative.claims.map((claim, index) => renderClaimHtml(`Claim ${index + 1}`, claim)).join("")}
    </section>`,
    `<section><h2>Top Findings</h2>${findings}</section>`,
    flagged,
    `<section><h2>Decision Archaeology</h2>${decisions || "<p>No decisions were recorded.</p>"}</section>`,
    `<section><h2>Landmine Map</h2>${landmines || "<p>No landmines were recorded.</p>"}</section>`,
    `<section><h2>Architecture Diagram Summary</h2>
      ${renderArchitectureDiagramSvg(brief.architectureDiagram)}
      ${
        diagramNodes
          ? `<table><thead><tr><th>Node</th><th>Path</th><th>Severity</th><th>Landmines</th></tr></thead><tbody>${diagramNodes}</tbody></table>`
          : "<p>No diagram nodes were recorded.</p>"
      }
      ${diagramEdges ? `<h3>Edges</h3><ul class="edges">${diagramEdges}</ul>` : "<p>No diagram edges were recorded.</p>"}
    </section>`,
    `<section><h2>Rewrite Assessment</h2>
      <article class="item">
        <h3>${escapeHtml(brief.assessment.verdict)} <span>${formatConfidence(brief.assessment.confidence)}</span></h3>
        <p><strong>Uncertainty:</strong> ${escapeHtml(brief.assessment.uncertainty)}</p>
      </article>
      <h3>Reasons</h3>
      ${brief.assessment.reasons.map((reason, index) => renderClaimHtml(`Reason ${index + 1}`, reason)).join("")}
      <h3>Risks</h3>
      ${brief.assessment.risks.map((risk, index) => renderClaimHtml(`Risk ${index + 1}`, risk)).join("")}
    </section>`,
    "</main>",
    "</body></html>",
  ].join("");
}

function formatSourcedClaimMarkdown(label: string, claim: SourcedClaim): string[] {
  return [`- **${label}:** ${claim.claim}`, `  - Confidence: ${formatConfidence(claim.confidence)}`, ...formatSourcesMarkdown(claim.sources, 1)];
}

function formatSourcesMarkdown(sources: SourceCitation[], depth: 1 | 2): string[] {
  if (sources.length === 0) return [];
  const prefix = "  ".repeat(depth);
  return sources.map((source, index) => `${prefix}- Source ${index + 1}: ${formatCitationMarkdown(source)}`);
}

function formatCitationMarkdown(source: SourceCitation): string {
  const parts: string[] = [source.type];
  if (source.path) parts.push(source.path);
  if (source.section) parts.push(`section ${source.section}`);
  if (source.number) parts.push(`#${source.number}`);
  if (source.hash) parts.push(source.hash.slice(0, 12));
  if (source.storageKey) parts.push(`artifact ${source.storageKey}`);
  if (source.url) parts.push(source.url);
  if (source.excerpt) parts.push(`"${source.excerpt}"`);
  return parts.join(" | ");
}

function formatLanguageBreakdownMarkdown(languageBreakdown: Record<string, number>): string[] {
  const entries = Object.entries(languageBreakdown).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return [];
  const shown = entries.slice(0, LANGUAGE_BREAKDOWN_LIMIT);
  const remainder = entries.slice(LANGUAGE_BREAKDOWN_LIMIT);
  const lines = ["- Language breakdown:", ...shown.map(([language, count]) => `  - ${language}: ${count}`)];
  if (remainder.length > 0) {
    lines.push(`  - +${remainder.length} more: ${remainder.reduce((sum, [, count]) => sum + count, 0)}`);
  }
  return lines;
}

function renderFindingHtml(finding: BriefOutput["topFindings"][number]): string {
  return `<article class="item finding ${escapeHtml(finding.severity)}">
    <h3>${escapeHtml(finding.title)} <span>${escapeHtml(finding.severity)} / ${formatConfidence(finding.confidence)}</span></h3>
    <p>${escapeHtml(finding.claim)}</p>
    ${renderSourcesHtml(finding.sources)}
  </article>`;
}

function renderLandmineHtml(landmine: BriefOutput["landmines"][number]): string {
  return `<article class="item landmine ${escapeHtml(landmine.severity)}">
    <h3>${escapeHtml(landmine.location)} <span>${escapeHtml(landmine.severity)} / priority ${landmine.priority}</span></h3>
    <dl>
      <dt>Category</dt><dd>${escapeHtml(landmine.category)}</dd>
      <dt>Confidence</dt><dd>${formatConfidence(landmine.confidence)}</dd>
      <dt>Why it matters</dt><dd>${escapeHtml(landmine.explanation)}</dd>
      <dt>Remediation</dt><dd>${escapeHtml(landmine.remediation)}</dd>
      <dt>Estimate</dt><dd>${escapeHtml(landmine.remediationEstimate)}</dd>
    </dl>
    ${renderSourcesHtml(landmine.evidence)}
  </article>`;
}

function renderClaimHtml(label: string, claim: SourcedClaim): string {
  return `<article class="item claim">
    <h3>${escapeHtml(label)} <span>${formatConfidence(claim.confidence)}</span></h3>
    <p>${escapeHtml(claim.claim)}</p>
    ${renderSourcesHtml(claim.sources)}
  </article>`;
}

function renderSourcesHtml(sources: SourceCitation[]): string {
  if (sources.length === 0) return "";
  return `<details open><summary>Sources</summary><ol>${sources.map((source) => `<li>${renderCitationHtml(source)}</li>`).join("")}</ol></details>`;
}

function renderArchitectureDiagramSvg(diagram: BriefOutput["architectureDiagram"]): string {
  const nodes = diagram.nodes.slice(0, 24);
  if (nodes.length === 0) return "";

  const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(nodes.length))));
  const cellWidth = 210;
  const cellHeight = 104;
  const margin = 28;
  const width = margin * 2 + columns * cellWidth;
  const rows = Math.ceil(nodes.length / columns);
  const height = margin * 2 + rows * cellHeight;
  const positions = new Map(
    nodes.map((node, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      return [
        node.id,
        {
          x: margin + column * cellWidth + 18,
          y: margin + row * cellHeight + 18,
          width: cellWidth - 36,
          height: cellHeight - 36,
        },
      ] as const;
    }),
  );
  const edges = diagram.edges
    .filter((edge) => positions.has(edge.source) && positions.has(edge.target))
    .slice(0, 60)
    .map((edge) => {
      const source = positions.get(edge.source)!;
      const target = positions.get(edge.target)!;
      const sourceX = source.x + source.width / 2;
      const sourceY = source.y + source.height / 2;
      const targetX = target.x + target.width / 2;
      const targetY = target.y + target.height / 2;
      const stroke = edge.kind === "coupling" ? "#9a9a9a" : "#bdbdbd";
      const dash = edge.kind === "coupling" ? ` stroke-dasharray="4 3"` : "";
      return `<line x1="${sourceX}" y1="${sourceY}" x2="${targetX}" y2="${targetY}" stroke="${stroke}" stroke-width="1.2" stroke-opacity="0.85"${dash} marker-end="url(#arrow)" />`;
    })
    .join("");
  const nodeMarkup = nodes
    .map((node) => {
      const box = positions.get(node.id)!;
      const severity = node.severity || "none";
      const stroke = severityColor(severity);
      return `<g>
        <rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="6" fill="#ffffff" stroke="${stroke}" stroke-width="${severity === "none" ? 1 : 2}" />
        <text x="${box.x + 12}" y="${box.y + 24}" fill="#1b1b1b" font-size="13" font-weight="700">${escapeSvgText(truncateText(node.label, 24))}</text>
        <text x="${box.x + 12}" y="${box.y + 44}" fill="#6b6b6b" font-size="10">${escapeSvgText(truncateText(node.path, 32))}</text>
        <text x="${box.x + 12}" y="${box.y + 61}" fill="${stroke}" font-size="10" font-weight="700" letter-spacing="0.04em">${escapeSvgText(
          `${severity.toUpperCase()}${node.landmineCount ? ` / ${node.landmineCount} LANDMINE(S)` : ""}`,
        )}</text>
      </g>`;
    })
    .join("");

  return `<figure class="diagram-figure">
    <figcaption>Static architecture diagram preview</figcaption>
    <svg class="diagram-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Architecture diagram summary">
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L8,4 L0,8 Z" fill="#bdbdbd" />
        </marker>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" rx="10" fill="#fafafa" stroke="#e4e3df" />
      ${edges}
      ${nodeMarkup}
    </svg>
    ${
      diagram.nodes.length > nodes.length || diagram.edges.length > 60
        ? `<p class="diagram-note">Preview limited to ${nodes.length} nodes and ${Math.min(60, diagram.edges.length)} edges; complete data follows in the table.</p>`
        : ""
    }
  </figure>`;
}

function severityColor(severity: string): string {
  // Grayscale ramp: severity is shown by weight, not hue, to keep the export
  // monochrome and professional.
  if (severity === "critical") return "#1b1b1b";
  if (severity === "high") return "#565656";
  if (severity === "medium") return "#8a8a8a";
  if (severity === "low") return "#b0b0b0";
  return "#cbcbcb";
}

function truncateText(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, Math.max(0, length - 1))}...` : value;
}

function escapeSvgText(value: string): string {
  return escapeHtml(value);
}

function renderCitationHtml(source: SourceCitation): string {
  const parts = [
    `<strong>${escapeHtml(source.type)}</strong>`,
    source.path ? `<code>${escapeHtml(source.path)}</code>` : "",
    source.section ? `<span>${escapeHtml(source.section)}</span>` : "",
    source.number ? `<span>#${source.number}</span>` : "",
    source.hash ? `<code>${escapeHtml(source.hash.slice(0, 12))}</code>` : "",
    source.storageKey ? `<code>${escapeHtml(source.storageKey)}</code>` : "",
  ].filter(Boolean);
  const href = safeHref(source.url);
  const link = href ? `<a href="${escapeHtml(href)}">${escapeHtml(href)}</a>` : "";
  const excerpt = source.excerpt ? `<blockquote>${escapeHtml(source.excerpt)}</blockquote>` : "";
  return `${parts.join(" ")} ${link}${excerpt}`;
}

function safeHref(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatExportDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString();
}

function normalizeExportText(value: string): string {
  return `${value.replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

function exportCss(): string {
  // Monochrome, print-first audit document. No accent colors — severity is
  // conveyed through a grayscale weight ramp and uppercase labels so the PDF
  // reads as a professional report rather than a colorful web page.
  return `
    :root {
      color-scheme: light;
      --ink: #1b1b1b;
      --ink-soft: #333333;
      --muted: #6b6b6b;
      --faint: #9a9a9a;
      --line: #e4e3df;
      --line-strong: #c9c7c1;
      --panel: #f7f6f3;
    }
    * { box-sizing: border-box; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      margin: 0;
      background: #f1f0ec;
      color: var(--ink);
      font: 13px/1.6 "IBM Plex Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    main {
      max-width: 820px;
      margin: 0 auto;
      background: #fff;
      padding: 56px 56px 64px;
    }
    .cover {
      margin-bottom: 36px;
      padding-bottom: 28px;
      border-bottom: 1px solid var(--line-strong);
    }
    .eyebrow {
      margin: 0 0 14px;
      color: var(--muted);
      font: 600 11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }
    h1, h2, h3 {
      margin: 0;
      line-height: 1.25;
      color: var(--ink);
      font-weight: 600;
    }
    h1 {
      font-size: 30px;
      letter-spacing: -0.01em;
      overflow-wrap: anywhere;
    }
    h2 {
      margin-top: 42px;
      margin-bottom: 2px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--line);
      font-size: 17px;
      letter-spacing: -0.005em;
    }
    h3 {
      margin-top: 18px;
      font-size: 13.5px;
    }
    h3 span {
      display: inline-block;
      margin-left: 8px;
      color: var(--faint);
      font: 600 11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    p, dd, li { overflow-wrap: anywhere; }
    p { margin: 8px 0 0; color: var(--ink-soft); }
    .lede {
      margin: 16px 0 0;
      max-width: 640px;
      font-size: 15px;
      color: var(--ink-soft);
    }
    .meta, .stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 1px;
      margin: 26px 0 0;
      background: var(--line);
      border: 1px solid var(--line);
    }
    .meta div, .stats div {
      background: #fff;
      padding: 12px 14px;
      min-width: 0;
    }
    dt {
      color: var(--muted);
      font-weight: 600;
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      text-align: left;
    }
    dd { margin: 4px 0 0; color: var(--ink); }
    .stats span {
      display: block;
      font-size: 22px;
      font-weight: 600;
      letter-spacing: -0.01em;
    }
    .stats small {
      color: var(--muted);
      font-weight: 600;
      font-size: 11px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .item {
      break-inside: avoid;
      border: 1px solid var(--line);
      border-left: 3px solid var(--line-strong);
      background: #fff;
      margin-top: 12px;
      padding: 14px 16px;
    }
    .item dl {
      margin: 10px 0 0;
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 4px 16px;
    }
    .item dt { align-self: start; }
    .finding.critical, .landmine.critical { border-left-color: #1b1b1b; }
    .finding.high, .landmine.high { border-left-color: #565656; }
    .finding.medium, .landmine.medium { border-left-color: #8a8a8a; }
    .finding.low, .landmine.low { border-left-color: #bdbdbd; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 14px;
      font-size: 12.5px;
    }
    thead th {
      border-bottom: 1.5px solid var(--line-strong);
      padding: 0 10px 8px;
      color: var(--muted);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      text-align: left;
    }
    tbody th, tbody td, td {
      border-bottom: 1px solid var(--line);
      padding: 8px 10px;
      vertical-align: top;
      overflow-wrap: anywhere;
      text-align: left;
    }
    tbody th { font-weight: 600; color: var(--ink); }
    table.kv { width: auto; min-width: 280px; margin-top: 10px; }
    table.kv th { padding-left: 0; font-weight: 500; color: var(--ink-soft); }
    table.kv td {
      width: 88px;
      text-align: right;
      color: var(--muted);
      font-variant-numeric: tabular-nums;
    }
    .langs {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px 36px;
      margin-top: 12px;
    }
    .lang {
      display: grid;
      grid-template-columns: 84px 1fr auto;
      align-items: center;
      gap: 12px;
      font-size: 12px;
      break-inside: avoid;
    }
    .lang-name {
      color: var(--ink);
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .lang-bar {
      height: 6px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 999px;
      overflow: hidden;
    }
    .lang-bar i { display: block; height: 100%; background: var(--ink-soft); }
    .lang-count { color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; text-align: right; }
    .lang-pct { margin-left: 8px; color: var(--faint); }
    .lang-more .lang-name { color: var(--muted); font-style: italic; }
    code {
      font: 11.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 3px;
      padding: 1px 5px;
    }
    details { margin-top: 10px; color: var(--muted); }
    summary { cursor: pointer; font-weight: 600; color: var(--ink-soft); font-size: 12px; }
    details ol { margin: 8px 0 0; padding-left: 18px; }
    details li { margin-top: 4px; }
    blockquote {
      margin: 8px 0 0;
      border-left: 2px solid var(--line-strong);
      padding-left: 12px;
      color: var(--muted);
      font-style: italic;
    }
    a {
      color: var(--ink);
      text-decoration: underline;
      text-decoration-color: var(--line-strong);
      text-underline-offset: 2px;
      overflow-wrap: anywhere;
    }
    ul.edges { margin: 12px 0 0; padding-left: 18px; }
    ul.edges li {
      margin-top: 4px;
      font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .edges span { color: var(--faint); }
    .diagram-figure { margin: 16px 0 18px; break-inside: avoid; }
    .diagram-figure figcaption {
      margin: 0 0 10px;
      color: var(--muted);
      font: 600 11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .diagram-svg {
      display: block;
      width: 100%;
      max-height: 520px;
      border: 1px solid var(--line);
      background: #fff;
    }
    .diagram-note { margin: 8px 0 0; color: var(--faint); font-size: 11.5px; }
    @page { size: A4; }
    @media print {
      body { background: #fff; }
      main { padding: 0; max-width: none; }
      a { color: var(--ink); }
      h2 { break-after: avoid; }
      details, .item, tr { break-inside: avoid; }
      .diagram-svg { max-height: 460px; }
    }
    @media (max-width: 720px) {
      main { padding: 28px 22px; }
      .meta, .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      h1 { font-size: 26px; }
    }
    @media (max-width: 520px) {
      .langs { grid-template-columns: 1fr; }
    }
  `;
}

export function answerFromBrief(brief: BriefOutput, question: string): QAAnswer {
  const text = question.trim().toLowerCase();
  const claims = [
    brief.systemNarrative.purpose,
    brief.systemNarrative.dataModel,
    brief.systemNarrative.architecturePattern,
    ...brief.systemNarrative.claims,
    ...brief.assessment.reasons,
    ...brief.assessment.risks,
    ...brief.topFindings,
  ];
  const tokens = new Set(text.split(/[^a-z0-9./_-]+/).filter((token) => token.length > 3));
  const match = claims.find((claim) => Array.from(tokens).some((token) => claim.claim.toLowerCase().includes(token)));
  const fallback = brief.systemNarrative.purpose;
  const selected = match || fallback;
  return {
    answer: match
      ? selected.claim
      : "I don't have enough data to answer confidently. The closest supported context is the repository purpose.",
    sources: selected.sources.length > 0 ? selected.sources : [{ type: "brief", section: "system narrative" }],
    confidence: match ? "medium" : "low",
    caveat: "This answer is generated from the persisted brief only; the NVIDIA Q&A model can be enabled after credentials are added.",
  };
}

async function assertAnalysisOwnedByUser(db: ReturnType<typeof getDb>, userId: string, analysisId: string) {
  const [analysis] = await db
    .select({ id: analyses.id })
    .from(analyses)
    .innerJoin(projects, eq(projects.id, analyses.projectId))
    .where(and(eq(analyses.id, analysisId), eq(projects.userId, userId)))
    .limit(1);
  if (!analysis) throw new NotFoundError("Analysis not found");
  return analysis;
}

function parseQaMessages(value: unknown): QAConversationMessage[] {
  const result = QAConversationMessageSchema.array().safeParse(value);
  return result.success ? result.data : [];
}

async function getUsageSummaryFromRows(db: ReturnType<typeof getDb>, userId: string, plan: Plan): Promise<UsageSummary> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [summary] = await db
    .select({
      analysesUsed: sql<number>`count(${analyses.id})::int`,
      tokensUsed: sql<number>`coalesce(sum(${analyses.tokensUsed}), 0)::int`,
    })
    .from(analyses)
    .innerJoin(projects, eq(projects.id, analyses.projectId))
    .where(and(eq(projects.userId, userId), gte(analyses.createdAt, monthStart)));

  return {
    plan,
    analysesUsed: summary?.analysesUsed || 0,
    tokensUsed: summary?.tokensUsed || 0,
    limit: null,
  };
}

function groupBy<T>(rows: T[], keyForRow: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyForRow(row);
    const values = grouped.get(key);
    if (values) values.push(row);
    else grouped.set(key, [row]);
  }
  return grouped;
}

function stageSortIndex(stageName: string): number {
  const index = PIPELINE_STAGES.indexOf(stageName as PipelineStageName);
  return index === -1 ? PIPELINE_STAGES.length : index;
}

async function upsertUser(userId: string, email: string) {
  const db = getConfiguredDb();
  const [user] = await db
    .insert(users)
    .values({ id: userId, email })
    .onConflictDoUpdate({ target: users.id, set: { email } })
    .returning();
  if (!user) throw new Error("Failed to upsert user");
  return user;
}

async function getOrCreateUser(userId: string, email: string) {
  const db = getConfiguredDb();
  const [existing] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (existing) return existing;
  const [user] = await db.insert(users).values({ id: userId, email }).returning();
  if (!user) throw new Error("Failed to create user");
  return user;
}

async function findOrCreateProject(input: {
  userId: string;
  projectId?: string;
  repoOwner: string;
  repoName: string;
  repoUrl: string;
  includePrivate: boolean;
}) {
  const db = getConfiguredDb();
  if (input.projectId) {
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, input.projectId), eq(projects.userId, input.userId)))
      .limit(1);
    if (!project) throw new NotFoundError("Project not found");
    return project;
  }

  const [existing] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.userId, input.userId), eq(projects.repoOwner, input.repoOwner), eq(projects.repoName, input.repoName)))
    .limit(1);
  if (existing) return existing;

  const [project] = await db
    .insert(projects)
    .values({
      id: randomUUID(),
      userId: input.userId,
      name: `${input.repoOwner}/${input.repoName}`,
      repoUrl: input.repoUrl,
      repoOwner: input.repoOwner,
      repoName: input.repoName,
      provider: "github",
      isPrivate: input.includePrivate,
    })
    .returning();
  if (!project) throw new Error("Failed to create project");
  return project;
}

function parsePlan(value: unknown): Plan {
  const result = PlanSchema.safeParse(value);
  return result.success ? result.data : "free";
}

function parseAnalysisStatus(value: unknown): AnalysisStatus {
  const result = AnalysisStatusSchema.safeParse(value);
  return result.success ? result.data : "pending";
}

function parseStageStatus(value: unknown): PipelineStageStatus {
  const result = PipelineStageStatusSchema.safeParse(value);
  return result.success ? result.data : "pending";
}

function extractVerdict(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("verdict" in value)) return null;
  const verdict = (value as { verdict?: unknown }).verdict;
  return typeof verdict === "string" ? verdict : null;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

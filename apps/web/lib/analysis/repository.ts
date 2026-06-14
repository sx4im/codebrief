import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  AnalysisConfigSchema,
  AnalysisJobPayloadSchema,
  AnalysisStatusSchema,
  BriefOutputSchema,
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
    `Generated: ${formatExportDate(brief.createdAt)}`,
    `Analysis ID: ${brief.analysisId}`,
    "",
    "## Repository Snapshot",
    `- Files analyzed: ${brief.repoStats.fileCount}`,
    `- Commits inspected: ${brief.repoStats.commitCount}`,
    `- Pull requests inspected: ${brief.repoStats.pullRequestCount}`,
    `- Contributors observed: ${brief.repoStats.contributorCount}`,
    ...(brief.repoStats.repoAgeDays !== undefined ? [`- Repository age: ${brief.repoStats.repoAgeDays} days`] : []),
    ...(brief.repoStats.commitsPerMonth !== undefined ? [`- Commit frequency: ${brief.repoStats.commitsPerMonth} commits/month (sampled window)`] : []),
    ...formatLanguageBreakdownMarkdown(brief.repoStats.languageBreakdown),
    ...formatModelVersionsMarkdown(brief.modelVersions),
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

export function briefToHtml(brief: BriefOutput): string {
  const languageRows = Object.entries(brief.repoStats.languageBreakdown)
    .sort((a, b) => b[1] - a[1])
    .map(([language, count]) => `<tr><th>${escapeHtml(language)}</th><td>${count}</td></tr>`)
    .join("");
  const modelRows = Object.entries(brief.modelVersions)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([agent, model]) => `<tr><th>${escapeHtml(agent)}</th><td>${escapeHtml(model)}</td></tr>`)
    .join("");
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
      ${languageRows ? `<h3>Language Breakdown</h3><table>${languageRows}</table>` : ""}
      ${modelRows ? `<h3>Model Versions</h3><table>${modelRows}</table>` : ""}
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
  return ["- Language breakdown:", ...entries.map(([language, count]) => `  - ${language}: ${count}`)];
}

function formatModelVersionsMarkdown(modelVersions: Record<string, string>): string[] {
  const entries = Object.entries(modelVersions).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return [];
  return ["- Model versions:", ...entries.map(([agent, model]) => `  - ${agent}: ${model}`)];
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
      const stroke = edge.kind === "coupling" ? "#f59e0b" : "#64748b";
      const dash = edge.kind === "coupling" ? ` stroke-dasharray="4 3"` : "";
      return `<line x1="${sourceX}" y1="${sourceY}" x2="${targetX}" y2="${targetY}" stroke="${stroke}" stroke-width="1.4" stroke-opacity="0.55"${dash} marker-end="url(#arrow)" />`;
    })
    .join("");
  const nodeMarkup = nodes
    .map((node) => {
      const box = positions.get(node.id)!;
      const severity = node.severity || "none";
      const stroke = severityColor(severity);
      return `<g>
        <rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="6" fill="#111827" stroke="${stroke}" stroke-width="${severity === "none" ? 1 : 2}" />
        <text x="${box.x + 12}" y="${box.y + 24}" fill="#f8fafc" font-size="13" font-weight="700">${escapeSvgText(truncateText(node.label, 24))}</text>
        <text x="${box.x + 12}" y="${box.y + 44}" fill="#cbd5e1" font-size="10">${escapeSvgText(truncateText(node.path, 32))}</text>
        <text x="${box.x + 12}" y="${box.y + 61}" fill="${stroke}" font-size="10" font-weight="700">${escapeSvgText(
          `${severity}${node.landmineCount ? ` / ${node.landmineCount} landmine(s)` : ""}`,
        )}</text>
      </g>`;
    })
    .join("");

  return `<figure class="diagram-figure">
    <figcaption>Static architecture diagram preview</figcaption>
    <svg class="diagram-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Architecture diagram summary">
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L8,4 L0,8 Z" fill="#64748b" fill-opacity="0.65" />
        </marker>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" rx="10" fill="#0f172a" />
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
  if (severity === "critical") return "#b42318";
  if (severity === "high") return "#c2410c";
  if (severity === "medium") return "#b54708";
  if (severity === "low") return "#0f766e";
  return "#64748b";
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
  return `
    :root {
      color-scheme: light;
      --ink: #172033;
      --muted: #526070;
      --line: #d5dce6;
      --panel: #f8fafc;
      --accent: #0f766e;
      --danger: #b42318;
      --warn: #b54708;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #eef2f7;
      color: var(--ink);
      font: 14px/1.55 "IBM Plex Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      max-width: 980px;
      margin: 0 auto;
      background: #fff;
      min-height: 100vh;
      padding: 44px;
    }
    .cover {
      border-bottom: 2px solid var(--ink);
      padding-bottom: 26px;
      margin-bottom: 28px;
    }
    .eyebrow {
      margin: 0 0 12px;
      color: var(--accent);
      font: 700 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
      text-transform: uppercase;
    }
    h1, h2, h3 {
      margin: 0;
      line-height: 1.2;
      color: var(--ink);
    }
    h1 {
      font-size: 34px;
      overflow-wrap: anywhere;
    }
    h2 {
      margin-top: 34px;
      padding-top: 18px;
      border-top: 1px solid var(--line);
      font-size: 21px;
    }
    h3 {
      margin-top: 16px;
      font-size: 15px;
    }
    h3 span {
      display: inline-block;
      margin-left: 8px;
      color: var(--muted);
      font: 600 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    p, dd, li {
      overflow-wrap: anywhere;
    }
    .lede {
      margin: 16px 0 0;
      max-width: 780px;
      font-size: 17px;
      color: #283548;
    }
    .meta, .stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin: 24px 0 0;
    }
    .meta div, .stats div {
      border: 1px solid var(--line);
      background: var(--panel);
      padding: 12px;
      min-width: 0;
    }
    dt, th {
      color: var(--muted);
      font-weight: 700;
      text-align: left;
    }
    dd {
      margin: 4px 0 0;
    }
    .stats span {
      display: block;
      font-size: 24px;
      font-weight: 700;
    }
    .stats small {
      color: var(--muted);
      font-weight: 600;
    }
    .item {
      break-inside: avoid;
      border: 1px solid var(--line);
      background: #fff;
      margin-top: 12px;
      padding: 14px;
    }
    .critical { border-left: 5px solid var(--danger); }
    .high { border-left: 5px solid #c2410c; }
    .medium { border-left: 5px solid var(--warn); }
    .low { border-left: 5px solid var(--accent); }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
      table-layout: fixed;
    }
    th, td {
      border: 1px solid var(--line);
      padding: 8px 10px;
      vertical-align: top;
      overflow-wrap: anywhere;
    }
    code {
      font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
      background: var(--panel);
      border: 1px solid var(--line);
      padding: 1px 4px;
    }
    details {
      margin-top: 10px;
      color: var(--muted);
    }
    summary {
      cursor: pointer;
      font-weight: 700;
      color: var(--ink);
    }
    blockquote {
      margin: 8px 0 0;
      border-left: 3px solid var(--line);
      padding-left: 10px;
      color: var(--muted);
    }
    a {
      color: #075985;
      text-decoration: none;
      overflow-wrap: anywhere;
    }
    .edges span {
      color: var(--muted);
      font-weight: 700;
    }
    .diagram-figure {
      margin: 16px 0 18px;
      break-inside: avoid;
    }
    .diagram-figure figcaption {
      margin: 0 0 8px;
      color: var(--muted);
      font: 700 12px/1.2 "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
      text-transform: uppercase;
    }
    .diagram-svg {
      display: block;
      width: 100%;
      max-height: 520px;
      border: 1px solid var(--line);
      background: #0f172a;
    }
    .diagram-note {
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 12px;
    }
    @media print {
      body { background: #fff; }
      main { padding: 0; max-width: none; }
      a { color: var(--ink); }
      details { break-inside: avoid; }
      .diagram-svg { max-height: 460px; }
    }
    @media (max-width: 720px) {
      main { padding: 24px; }
      .meta, .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      h1 { font-size: 28px; }
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

import { randomUUID } from "node:crypto";
import type OpenAI from "openai";
import type { AnalysisJobPayload, BriefOutput, PipelineStageName, RepoStats } from "@codebrief/shared";
import { GitHubApiClient } from "../ingestion/github-client.js";
import { ingestRepository, type RepoIngestion } from "../ingestion/repo.js";
import { extractAst } from "../ingestion/ast.js";
import { analyzeDependencies, type DependencyFinding } from "../ingestion/deps.js";
import { ingestDocs, type DocumentationPage } from "../ingestion/docs.js";
import { detectTechStack } from "../ingestion/tech-stack.js";
import { ingestIssueCsvArtifact, mergeIssueSummaries } from "../ingestion/issues.js";
import { scoreFiles } from "../analysis/risk-scorer.js";
import { detectCoupling, type CouplingCluster } from "../analysis/coupling.js";
import { detectSilos, type KnowledgeSilo } from "../analysis/silos.js";
import { detectComplexityBombs, type ComplexityBomb } from "../analysis/complexity.js";
import { buildRepoStats } from "../analysis/repo-stats.js";
import { buildRecencyMap, detectStaleHotspots } from "../analysis/recency.js";
import { createNvidiaClient } from "../adapters/nvidia-nim.js";
import { runArchitectureAgent } from "../agents/architecture.js";
import { runHistoryAgent } from "../agents/history.js";
import { runRiskAgent } from "../agents/risk.js";
import { runSynthesisAgent } from "../agents/synthesis.js";
import { buildArchitectureDiagram } from "../output/diagram.js";
import { assembleBrief } from "../output/brief.js";
import type { ArtifactStore } from "../storage/r2-client.js";
import type { AnalysisJobStore } from "../storage/postgres-job-store.js";
import type { PipelineEnv } from "../env.js";
import { requireEnv } from "../env.js";
import type { ProgressEmitter } from "../websocket/emit.js";

export interface AnalysisJobContext {
  env: PipelineEnv;
  artifacts: ArtifactStore;
  store: AnalysisJobStore;
  emitter: ProgressEmitter;
  // Optional injected clients (default to the real GitHub/NVIDIA clients). Enables
  // offline end-to-end testing of the full pipeline wiring without live services.
  github?: GitHubApiClient;
  nvidia?: OpenAI;
}

const STAGE_PROGRESS_HEARTBEAT_MS = 15_000;

export async function runAnalysisJob(payload: AnalysisJobPayload, context: AnalysisJobContext): Promise<{ briefId: string; tokensUsed: number }> {
  await context.store.ensureAnalysisRecord(payload);
  await context.store.markAnalysisRunning(payload.analysisId);
  try {
  const github = context.github ?? new GitHubApiClient(payload.githubToken || requireEnv(context.env.GITHUB_TOKEN, "GITHUB_TOKEN"));
  const nvidia = context.nvidia ?? createNvidiaClient(context.env);
  let tokensUsed = 0;
  // Persist token usage after each NVIDIA call rather than only at completion,
  // so a run that fails partway through still accounts for tokens already spent.
  const recordTokenUsage = async (tokens: number) => {
    if (tokens <= 0) return;
    tokensUsed += tokens;
    await context.store.addTokenUsage(payload.analysisId, tokens);
  };

  let repoIngestion!: RepoIngestion;
  let astFiles: Awaited<ReturnType<typeof extractAst>> = [];
  let dependencies: DependencyFinding[] = [];
  let docs: DocumentationPage[] = [];
  let riskScores: ReturnType<typeof scoreFiles> = [];
  let couplingClusters: CouplingCluster[] = [];
  let silos: KnowledgeSilo[] = [];
  let complexityBombs: ComplexityBomb[] = [];
  let recencyMap: Record<string, string> = {};

  repoIngestion = await stage(context, payload.analysisId, "ingest:repo", "Fetching repo metadata, tree, commits, PRs, and README", async () => {
    const output = await ingestRepository(github, payload.repoOwner, payload.repoName, payload.config);
    await putArtifact(context, payload.analysisId, "repo", output);
    return output;
  });

  astFiles = await stage(context, payload.analysisId, "ingest:ast", "Parsing TypeScript/TSX AST summaries", async () => {
    const output = await extractAst(github, payload.repoOwner, payload.repoName, repoIngestion.treeFiles);
    await putArtifact(context, payload.analysisId, "ast", output);
    return output;
  });

  await stage(context, payload.analysisId, "ingest:git", "Computing churn, co-change, and recency input from commits", async () => {
    await putArtifact(context, payload.analysisId, "git-log", repoIngestion.commits);
    recencyMap = buildRecencyMap(repoIngestion.commits);
    await putArtifact(context, payload.analysisId, "recency", recencyMap);
    return repoIngestion.commits;
  });

  await stage(context, payload.analysisId, "ingest:github-api", "Persisting PR, GitHub issue, and imported issue discussion inputs", async () => {
    const importedIssues = payload.config.issueCsvArtifactKey
      ? await ingestIssueCsvArtifact(context.artifacts, payload.config.issueCsvArtifactKey)
      : [];
    if (importedIssues.length > 0) {
      repoIngestion = {
        ...repoIngestion,
        issues: mergeIssueSummaries(repoIngestion.issues, importedIssues, payload.config.scopeIssues),
      };
    }
    const output = { pullRequests: repoIngestion.pullRequests, issues: repoIngestion.issues, importedIssues };
    await putArtifact(context, payload.analysisId, "github-api", output);
    return output;
  });

  dependencies = await stage(context, payload.analysisId, "ingest:deps", "Parsing dependency manifests", async () => {
    const output = await analyzeDependencies(github, payload.repoOwner, payload.repoName, repoIngestion.treeFiles);
    await putArtifact(context, payload.analysisId, "deps", output);
    return output;
  });

  docs = await stage(context, payload.analysisId, "ingest:docs", "Collecting README, markdown docs, and uploaded docs artifacts", async () => {
    const output = await ingestDocs(github, payload.repoOwner, payload.repoName, repoIngestion.treeFiles, repoIngestion.readme, {
      artifactStore: context.artifacts,
      docsArtifactKey: payload.config.docsArtifactKey,
    });
    await putArtifact(context, payload.analysisId, "docs", output);
    return output;
  });

  riskScores = await stage(context, payload.analysisId, "analyze:risk-scores", "Scoring risky files", async () => {
    const output = scoreFiles(astFiles, repoIngestion.commits, repoIngestion.treeFiles);
    await putArtifact(context, payload.analysisId, "risk-scores", output);
    return output;
  });

  couplingClusters = await stage(context, payload.analysisId, "analyze:coupling", "Detecting co-change coupling clusters", async () => {
    const output = detectCoupling(repoIngestion.commits);
    await putArtifact(context, payload.analysisId, "coupling", output);
    return output;
  });

  silos = await stage(context, payload.analysisId, "analyze:silos", "Detecting knowledge silos", async () => {
    const output = detectSilos(repoIngestion.commits, riskScores);
    await putArtifact(context, payload.analysisId, "silos", output);
    return output;
  });

  complexityBombs = await stage(context, payload.analysisId, "analyze:complexity", "Detecting complexity bombs", async () => {
    const output = detectComplexityBombs(riskScores);
    await putArtifact(context, payload.analysisId, "complexity", output);
    return output;
  });

  const architecture = await stage(context, payload.analysisId, "agent:architecture", "Running Architecture Agent", async () => {
    const techStack = detectTechStack(repoIngestion.treeFiles, dependencies);
    await putArtifact(context, payload.analysisId, "tech-stack", techStack);
    const result = await runArchitectureAgent(nvidia, context.env, {
      repo: repoIngestion.repo,
      readme: repoIngestion.readme,
      documentation: docs,
      fileTree: repoIngestion.treeFiles.map((file) => file.path),
      astFiles,
      riskScores,
      pullRequests: repoIngestion.pullRequests,
      techStack,
    }, recordTokenUsage);
    await putArtifact(context, payload.analysisId, "agent-architecture", result.output);
    return result.output;
  });

  const history = await stage(context, payload.analysisId, "agent:history", "Running History Agent", async () => {
    const result = await runHistoryAgent(nvidia, context.env, {
      pullRequests: repoIngestion.pullRequests,
      issues: repoIngestion.issues,
      architecture,
    }, recordTokenUsage);
    await putArtifact(context, payload.analysisId, "agent-history", result.output);
    return result.output;
  });

  const risk = await stage(context, payload.analysisId, "agent:risk", "Running Risk Agent", async () => {
    const staleHotspots = detectStaleHotspots(riskScores, recencyMap);
    await putArtifact(context, payload.analysisId, "stale-hotspots", staleHotspots);
    const result = await runRiskAgent(nvidia, context.env, {
      riskScores,
      couplingClusters,
      silos,
      complexityBombs,
      staleHotspots,
      dependencies,
      architecture,
    }, recordTokenUsage);
    await putArtifact(context, payload.analysisId, "agent-risk", result.output);
    return result.output;
  });

  const repoStats: RepoStats = buildRepoStats({
    repo: repoIngestion.repo,
    treeFiles: repoIngestion.treeFiles,
    commits: repoIngestion.commits,
    pullRequests: repoIngestion.pullRequests,
  });

  const synthesis = await stage(context, payload.analysisId, "agent:synthesis", "Running Synthesis Agent", async () => {
    const result = await runSynthesisAgent(nvidia, context.env, {
      architecture,
      decisions: history.decisions,
      landmines: risk.landmines,
      repoStats,
    }, recordTokenUsage);
    await putArtifact(context, payload.analysisId, "agent-synthesis", result.output);
    return result.output;
  });

  const diagram = await stage(context, payload.analysisId, "output:diagram", "Building architecture diagram", async () => {
    const output = buildArchitectureDiagram(astFiles, risk.landmines, couplingClusters);
    await putArtifact(context, payload.analysisId, "diagram", output);
    return output;
  });

  const brief = await stage(context, payload.analysisId, "output:brief", "Assembling brief", async () => {
    const output = assembleBrief({
      id: randomUUID(),
      analysisId: payload.analysisId,
      repoFullName: `${payload.repoOwner}/${payload.repoName}`,
      createdAt: new Date().toISOString(),
      architecture,
      decisions: history.decisions,
      landmines: risk.landmines,
      synthesis,
      diagram,
      repoStats,
      modelVersions: {
        architecture: context.env.NVIDIA_ARCHITECTURE_MODEL,
        history: context.env.NVIDIA_HISTORY_MODEL,
        risk: context.env.NVIDIA_RISK_MODEL,
        synthesis: context.env.NVIDIA_SYNTHESIS_MODEL,
      },
    });
    await putArtifact(context, payload.analysisId, "brief", output);
    return output;
  });

  await stage(context, payload.analysisId, "complete", "Completing analysis", async () => {
    await context.store.saveBrief(brief);
    await context.store.markAnalysisCompleted(payload.analysisId, tokensUsed);
    await context.emitter.emit({ event: "analysis_complete", analysisId: payload.analysisId, briefId: brief.id });
    return { briefId: brief.id, docs: docs.length };
  });

  return { briefId: brief.id, tokensUsed };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await context.store.markAnalysisFailed(payload.analysisId, message);
    await context.emitter.emit({ event: "analysis_failed", analysisId: payload.analysisId, error: message });
    throw error;
  }
}

async function stage<T>(
  context: AnalysisJobContext,
  analysisId: string,
  stageName: PipelineStageName,
  message: string,
  work: () => Promise<T>,
): Promise<T> {
  await context.store.markStageStarted(analysisId, stageName);
  await context.emitter.emit({ event: "stage_start", analysisId, stage: stageName, message });
  await context.emitter.emit({ event: "stage_progress", analysisId, stage: stageName, message, percent: 0 });
  const heartbeat = startStageProgressHeartbeat(context, analysisId, stageName, message);
  try {
    const output = await work();
    const outputSummary = summarize(output);
    await context.store.markStageCompleted(analysisId, stageName, outputSummary);
    clearInterval(heartbeat);
    await context.emitter.emit({ event: "stage_progress", analysisId, stage: stageName, message: `${message} complete`, percent: 100 });
    await context.emitter.emit({ event: "stage_complete", analysisId, stage: stageName, outputSummary });
    return output;
  } catch (error) {
    clearInterval(heartbeat);
    const message = error instanceof Error ? error.message : String(error);
    await context.store.markStageFailed(analysisId, stageName, message);
    await context.emitter.emit({ event: "stage_failed", analysisId, stage: stageName, error: message });
    // Analysis-level failure (markAnalysisFailed + analysis_failed) is owned by the
    // outer catch in runAnalysisJob, which also covers non-stage throws. Emitting it
    // here too would double-mark and fire analysis_failed twice per stage failure.
    throw error;
  }
}

function startStageProgressHeartbeat(
  context: AnalysisJobContext,
  analysisId: string,
  stageName: PipelineStageName,
  baseMessage: string,
): ReturnType<typeof setInterval> {
  const startedAt = Date.now();
  let tick = 0;
  const heartbeat = setInterval(() => {
    tick += 1;
    const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const percent = Math.min(95, 5 + tick * 5);
    void context.emitter
      .emit({
        event: "stage_progress",
        analysisId,
        stage: stageName,
        message: `${baseMessage} (${elapsedSeconds}s elapsed)`,
        percent,
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`[pipeline:${analysisId}] stage_progress emit failed: ${message}\n`);
      });
  }, STAGE_PROGRESS_HEARTBEAT_MS);
  heartbeat.unref?.();
  return heartbeat;
}

async function putArtifact<T>(context: AnalysisJobContext, analysisId: string, type: string, value: T) {
  const artifact = await context.artifacts.putJson(analysisId, type, value);
  await context.store.recordArtifact(analysisId, type, artifact);
  return artifact;
}

function summarize(value: unknown): string {
  if (Array.isArray(value)) return `${value.length} item(s)`;
  if (typeof value === "object" && value) return `${Object.keys(value).length} field(s)`;
  return String(value);
}

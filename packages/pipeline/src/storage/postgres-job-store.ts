import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { PIPELINE_STAGES, type AnalysisJobPayload, type BriefOutput, type PipelineStageName } from "@codebrief/shared";

export interface AnalysisJobStore {
  ensureAnalysisRecord(payload: AnalysisJobPayload): Promise<void>;
  markAnalysisRunning(analysisId: string): Promise<void>;
  markAnalysisCompleted(analysisId: string, tokensUsed: number): Promise<void>;
  markAnalysisFailed(analysisId: string, errorMessage: string): Promise<void>;
  addTokenUsage(analysisId: string, tokensUsed: number): Promise<void>;
  markStageStarted(analysisId: string, stageName: PipelineStageName): Promise<void>;
  markStageCompleted(analysisId: string, stageName: PipelineStageName, outputSummary: string): Promise<void>;
  markStageFailed(analysisId: string, stageName: PipelineStageName, errorMessage: string): Promise<void>;
  recordArtifact(analysisId: string, type: string, artifact: { key: string; sizeBytes: number }): Promise<void>;
  saveBrief(brief: BriefOutput): Promise<void>;
  close(): Promise<void>;
}

export function createJobStore(databaseUrl?: string): AnalysisJobStore {
  if (!databaseUrl) return noopJobStore;

  const sql = postgres(databaseUrl, { prepare: false });

  return {
    async ensureAnalysisRecord(payload) {
      await sql`
        insert into users (id, email)
        values (${payload.userId}, ${`${payload.userId}@codebrief.local`})
        on conflict (id) do nothing
      `;
      const projectRows = await sql<{ id: string }[]>`
        insert into projects (id, user_id, name, repo_url, repo_owner, repo_name, provider, is_private)
        values (
          ${payload.projectId},
          ${payload.userId},
          ${`${payload.repoOwner}/${payload.repoName}`},
          ${payload.repoUrl},
          ${payload.repoOwner},
          ${payload.repoName},
          'github',
          ${payload.config.includePrivate}
        )
        on conflict (user_id, repo_owner, repo_name) do update set
          repo_url = excluded.repo_url,
          is_private = excluded.is_private
        returning id
      `;
      const projectId = projectRows[0]?.id || payload.projectId;
      await sql`
        insert into analyses (id, project_id, status, config, tokens_used)
        values (${payload.analysisId}, ${projectId}, 'pending', ${sql.json(payload.config)}, 0)
        on conflict (id) do nothing
      `;
      for (const stageName of PIPELINE_STAGES) {
        await sql`
          insert into pipeline_stages (id, analysis_id, stage_name, status)
          values (${randomUUID()}, ${payload.analysisId}, ${stageName}, 'pending')
          on conflict (analysis_id, stage_name) do nothing
        `;
      }
    },

    async markAnalysisRunning(analysisId) {
      // Reset token accounting at the start of each run so incremental
      // addTokenUsage() calls reflect only the current attempt, even if the
      // worker re-runs this analysis id after an earlier failed attempt.
      await sql`
        update analyses
        set status = 'ingesting', started_at = coalesce(started_at, now()), error_message = null, tokens_used = 0
        where id = ${analysisId}
      `;
    },

    async markAnalysisCompleted(analysisId, tokensUsed) {
      await sql`
        update analyses
        set status = 'complete', completed_at = now(), error_message = null, tokens_used = ${tokensUsed}
        where id = ${analysisId}
      `;
    },

    async markAnalysisFailed(analysisId, errorMessage) {
      await sql`
        update analyses
        set status = 'failed', completed_at = now(), error_message = ${errorMessage}
        where id = ${analysisId}
      `;
    },

    async addTokenUsage(analysisId, tokensUsed) {
      if (tokensUsed <= 0) return;
      await sql`
        update analyses
        set tokens_used = coalesce(tokens_used, 0) + ${tokensUsed}
        where id = ${analysisId}
      `;
    },

    async markStageStarted(analysisId, stageName) {
      const updated = await sql`
        update pipeline_stages
        set status = 'running',
            started_at = coalesce(started_at, now()),
            completed_at = null,
            error_message = null,
            output = null
        where analysis_id = ${analysisId} and stage_name = ${stageName}
        returning id
      `;
      if (updated.length === 0) {
        await sql`
          insert into pipeline_stages (id, analysis_id, stage_name, status, started_at)
          values (${randomUUID()}, ${analysisId}, ${stageName}, 'running', now())
        `;
      }
      await sql`
        update analyses
        set status = ${analysisStatusForStage(stageName)}, started_at = coalesce(started_at, now())
        where id = ${analysisId} and status <> 'failed'
      `;
    },

    async markStageCompleted(analysisId, stageName, outputSummary) {
      const updated = await sql`
        update pipeline_stages
        set status = 'done',
            completed_at = now(),
            error_message = null,
            output = ${sql.json({ summary: outputSummary })}
        where analysis_id = ${analysisId} and stage_name = ${stageName}
        returning id
      `;
      if (updated.length === 0) {
        await sql`
          insert into pipeline_stages (id, analysis_id, stage_name, status, started_at, completed_at, output)
          values (${randomUUID()}, ${analysisId}, ${stageName}, 'done', now(), now(), ${sql.json({ summary: outputSummary })})
        `;
      }
    },

    async markStageFailed(analysisId, stageName, errorMessage) {
      const updated = await sql`
        update pipeline_stages
        set status = 'failed',
            completed_at = now(),
            error_message = ${errorMessage}
        where analysis_id = ${analysisId} and stage_name = ${stageName}
        returning id
      `;
      if (updated.length === 0) {
        await sql`
          insert into pipeline_stages (id, analysis_id, stage_name, status, started_at, completed_at, error_message)
          values (${randomUUID()}, ${analysisId}, ${stageName}, 'failed', now(), now(), ${errorMessage})
        `;
      }
    },

    async recordArtifact(analysisId, type, artifact) {
      await sql`
        insert into artifacts (id, analysis_id, type, storage_key, size_bytes)
        values (${randomUUID()}, ${analysisId}, ${type}, ${artifact.key}, ${artifact.sizeBytes})
      `;
    },

    async saveBrief(brief) {
      await sql`
        insert into briefs (
          id,
          analysis_id,
          system_narrative,
          decisions,
          landmines,
          assessment,
          top_findings,
          architecture_diagram,
          repo_stats,
          model_versions,
          flagged_claims
        )
        values (
          ${brief.id},
          ${brief.analysisId},
          ${sql.json(brief.systemNarrative)},
          ${sql.json(brief.decisions)},
          ${sql.json(brief.landmines)},
          ${sql.json(brief.assessment)},
          ${sql.json(brief.topFindings)},
          ${sql.json(brief.architectureDiagram)},
          ${sql.json(brief.repoStats)},
          ${sql.json(brief.modelVersions)},
          ${sql.json(brief.flaggedClaims)}
        )
        on conflict (analysis_id) do update set
          id = excluded.id,
          system_narrative = excluded.system_narrative,
          decisions = excluded.decisions,
          landmines = excluded.landmines,
          assessment = excluded.assessment,
          top_findings = excluded.top_findings,
          architecture_diagram = excluded.architecture_diagram,
          repo_stats = excluded.repo_stats,
          model_versions = excluded.model_versions,
          flagged_claims = excluded.flagged_claims,
          created_at = now()
      `;
    },

    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}

const noopJobStore: AnalysisJobStore = {
  async ensureAnalysisRecord() {},
  async markAnalysisRunning() {},
  async markAnalysisCompleted() {},
  async markAnalysisFailed() {},
  async addTokenUsage() {},
  async markStageStarted() {},
  async markStageCompleted() {},
  async markStageFailed() {},
  async recordArtifact() {},
  async saveBrief() {},
  async close() {},
};

function analysisStatusForStage(stageName: PipelineStageName) {
  if (stageName.startsWith("ingest:")) return "ingesting";
  if (stageName.startsWith("analyze:") || stageName.startsWith("agent:")) return "analyzing";
  return "generating";
}

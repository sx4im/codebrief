"use client";

import { CheckCircle2, Circle, ExternalLink, Loader2, RotateCcw, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { PIPELINE_STAGES, type AnalysisStatus, type PipelineStageName, type PipelineStageStatus } from "@codebrief/shared";

type StageMap = Record<PipelineStageName, PipelineStageStatus>;
type StatusView = {
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
  }>;
};

export function ProgressTracker({ analysisId }: { analysisId: string }) {
  const [stages, setStages] = useState<StageMap>(() =>
    Object.fromEntries(PIPELINE_STAGES.map((stage) => [stage, "pending"])) as StageMap,
  );
  const [snapshot, setSnapshot] = useState<StatusView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<PipelineStageName | "analysis" | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadStatus() {
      try {
        const response = await fetch(`/api/analysis/${analysisId}/status`, { cache: "no-store" });
        const json = (await response.json()) as StatusView | { error?: string };
        if (!response.ok) throw new Error("error" in json && json.error ? json.error : "Failed to load status");
        if (cancelled) return;
        const status = json as StatusView;
        setSnapshot(status);
        setError(null);
        setStages(Object.fromEntries(status.stages.map((stage) => [stage.stageName, stage.status])) as StageMap);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Failed to load status");
      }
    }

    void loadStatus();
    const interval = window.setInterval(() => {
      void loadStatus();
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [analysisId]);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_WS_URL;
    if (!url) return;
    const socket = io(url, { transports: ["websocket"] });
    socket.emit("join", { analysisId });
    socket.on("stage_start", ({ stage }: { stage: PipelineStageName }) => setStages((existing) => ({ ...existing, [stage]: "running" })));
    socket.on("stage_complete", ({ stage }: { stage: PipelineStageName }) => setStages((existing) => ({ ...existing, [stage]: "done" })));
    socket.on("stage_failed", ({ stage }: { stage: PipelineStageName }) => setStages((existing) => ({ ...existing, [stage]: "failed" })));
    return () => {
      socket.close();
    };
  }, [analysisId]);

  async function retryAnalysis(retryFromStage?: PipelineStageName) {
    if (!snapshot) return;
    setRetrying(retryFromStage || "analysis");
    setError(null);
    try {
      const response = await fetch(`/api/analysis/${analysisId}/retry`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ retryFromStage }),
      });
      const json = (await response.json()) as { analysisId?: string; projectId?: string; error?: string };
      if (!json.analysisId || !json.projectId) throw new Error(json.error || "Retry did not create an analysis");
      window.location.assign(`/projects/${json.projectId}/${json.analysisId}/progress`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Retry failed");
      setRetrying(null);
    }
  }

  return (
    <div className="space-y-4">
      {snapshot ? (
        <div className="rounded border border-border bg-panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-mono text-sm">{snapshot.repoFullName}</div>
              <div className="mt-1 text-xs uppercase text-muted">
                {snapshot.status} · {snapshot.progress}% · {snapshot.tokensUsed.toLocaleString()} tokens
              </div>
            </div>
            <div className="flex gap-2">
              {snapshot.status === "complete" ? (
                <a className="focus-ring inline-flex h-9 items-center gap-2 rounded border border-border px-3 text-sm hover:bg-panel2" href={`/projects/${snapshot.projectId}/${analysisId}`}>
                  <ExternalLink className="h-4 w-4" />
                  Open brief
                </a>
              ) : null}
              {snapshot.canRetry ? (
                <button
                  className="focus-ring inline-flex h-9 items-center gap-2 rounded border border-border px-3 text-sm hover:bg-panel2 disabled:opacity-50"
                  type="button"
                  onClick={() => void retryAnalysis()}
                  disabled={retrying !== null}
                >
                  {retrying === "analysis" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Retry
                </button>
              ) : null}
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded bg-background">
            <div className="h-full bg-blue transition-all" style={{ width: `${snapshot.progress}%` }} />
          </div>
          {snapshot.errorMessage ? <p className="mt-3 text-sm text-danger">{snapshot.errorMessage}</p> : null}
        </div>
      ) : null}
      {error ? <div className="rounded border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{error}</div> : null}
      {PIPELINE_STAGES.map((stage) => (
        <div key={stage} className="flex items-center justify-between gap-3 rounded border border-border bg-panel px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {icon(stages[stage])}
            <div className="min-w-0">
              <div className="font-mono text-sm">{stage}</div>
              <div className="break-words text-xs text-muted">{stageDetail(snapshot, stage, stages[stage])}</div>
            </div>
          </div>
          {stages[stage] === "failed" ? (
            <button
              className="focus-ring inline-flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded border border-border px-3 text-xs hover:bg-panel2 disabled:opacity-50"
              type="button"
              onClick={() => void retryAnalysis(stage)}
              disabled={retrying !== null}
            >
              {retrying === stage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Retry
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function icon(status: PipelineStageStatus) {
  if (status === "done") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-blue" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-danger" />;
  return <Circle className="h-4 w-4 text-muted" />;
}

function stageDetail(snapshot: StatusView | null, stageName: PipelineStageName, status: PipelineStageStatus) {
  const stage = snapshot?.stages.find((item) => item.stageName === stageName);
  const elapsed = stage ? formatElapsed(stage.startedAt, stage.completedAt) : null;
  const detail = stage?.errorMessage ? `${status}: ${stage.errorMessage}` : status;
  return elapsed ? `${detail} · ${elapsed}` : detail;
}

function formatElapsed(startedAt: string | null, completedAt: string | null) {
  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

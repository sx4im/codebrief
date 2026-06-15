"use client";

import { Check, CheckCircle2, ChevronLeft, ChevronRight, FileArchive, Github, Loader2, Lock, Play, RefreshCw, Search, Table2, UploadCloud, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { GitHubRepoRef } from "@codebrief/shared";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type StepId = "repo" | "scope" | "review";
type Scope = "quick" | "full";
type UploadState = {
  status: "idle" | "uploading" | "done" | "error";
  fileName?: string;
  key?: string;
  error?: string;
};

const steps: Array<{ id: StepId; label: string }> = [
  { id: "repo", label: "Repository" },
  { id: "scope", label: "Scope" },
  { id: "review", label: "Review" },
];

export function NewAnalysisFlow() {
  const [stepIndex, setStepIndex] = useState(0);
  const [repoUrl, setRepoUrl] = useState("https://github.com/supabase/supabase");
  const [scope, setScope] = useState<Scope>("quick");
  const [includePrivate, setIncludePrivate] = useState(false);
  const [docsArtifactKey, setDocsArtifactKey] = useState("");
  const [issueCsvArtifactKey, setIssueCsvArtifactKey] = useState("");
  const [docsUpload, setDocsUpload] = useState<UploadState>({ status: "idle" });
  const [issueUpload, setIssueUpload] = useState<UploadState>({ status: "idle" });
  const [repos, setRepos] = useState<GitHubRepoRef[]>([]);
  const [repoLoading, setRepoLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedRepo = useMemo(() => repos.find((repo) => repo.htmlUrl === repoUrl), [repoUrl, repos]);
  const currentStep = steps[stepIndex]?.id || "repo";
  const uploading = docsUpload.status === "uploading" || issueUpload.status === "uploading";
  const canContinue = !uploading && (currentStep !== "repo" || /^https:\/\/github\.com\/[^/]+\/[^/#?]+/.test(repoUrl));

  async function loadRepos() {
    setRepoLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/github/repos", { cache: "no-store" });
      const json = (await response.json()) as GitHubRepoRef[] | { error?: string };
      if (!response.ok || !Array.isArray(json)) throw new Error(!Array.isArray(json) && json.error ? json.error : "Failed to load repositories");
      setRepos(json);
      if (json[0]) {
        setRepoUrl(json[0].htmlUrl);
        setIncludePrivate(json[0].isPrivate);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load repositories");
    } finally {
      setRepoLoading(false);
    }
  }

  async function startAnalysis() {
    setStarting(true);
    setError(null);
    try {
      const response = await fetch("/api/analysis/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          repoUrl,
          scope,
          includePrivate,
          docsArtifactKey: docsArtifactKey.trim() || undefined,
          issueCsvArtifactKey: issueCsvArtifactKey.trim() || undefined,
        }),
      });
      const json = (await response.json()) as {
        analysisId?: string;
        projectId?: string;
        error?: string;
        retryAfterSeconds?: number;
        code?: string;
        upgradeUrl?: string;
      };
      // Free-analysis limit reached → send the user to the lifetime upgrade.
      if (response.status === 402 || json.code === "upgrade_required") {
        window.location.assign(json.upgradeUrl || "/settings?upgrade=required");
        return;
      }
      if (!response.ok || !json.analysisId || !json.projectId) {
        const retryText = json.retryAfterSeconds ? ` Retry after ${json.retryAfterSeconds}s.` : "";
        throw new Error(`${json.error || "Failed to start analysis"}.${retryText}`);
      }
      window.location.assign(`/projects/${json.projectId}/${json.analysisId}/progress`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to start analysis");
      setStarting(false);
    }
  }

  async function uploadArtifact(kind: "docs" | "issues", file: File) {
    const setUpload = kind === "docs" ? setDocsUpload : setIssueUpload;
    const setKey = kind === "docs" ? setDocsArtifactKey : setIssueCsvArtifactKey;
    setUpload({ status: "uploading", fileName: file.name });
    setError(null);
    try {
      const form = new FormData();
      form.set("kind", kind);
      form.set("file", file);
      const response = await fetch("/api/artifacts/upload", { method: "POST", body: form });
      const json = (await response.json()) as { key?: string; fileName?: string; error?: string };
      if (!response.ok || !json.key) throw new Error(json.error || "Upload failed");
      setKey(json.key);
      setUpload({ status: "done", fileName: json.fileName || file.name, key: json.key });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Upload failed";
      setKey("");
      setUpload({ status: "error", fileName: file.name, error: message });
    }
  }

  function clearArtifact(kind: "docs" | "issues") {
    if (kind === "docs") {
      setDocsArtifactKey("");
      setDocsUpload({ status: "idle" });
    } else {
      setIssueCsvArtifactKey("");
      setIssueUpload({ status: "idle" });
    }
  }

  return (
    <div className="max-w-5xl">
      <ol className="grid gap-2 sm:grid-cols-3">
        {steps.map((step, index) => {
          const done = index < stepIndex;
          const active = index === stepIndex;
          return (
            <li key={step.id}>
              <button
                type="button"
                className={cn(
                  "focus-ring flex h-11 w-full cursor-pointer items-center gap-3 rounded border px-3 text-left text-sm transition-colors",
                  active ? "border-primary bg-primary/10 text-ink" : "border-border bg-card text-charcoal hover:bg-bone hover:text-ink",
                )}
                onClick={() => setStepIndex(index)}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded border text-xs",
                    done ? "border-primary bg-primary text-white" : active ? "border-primary text-primary" : "border-border text-mute",
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span className="font-mono">{step.label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {error ? <div className="mt-5 rounded border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div> : null}

      <section className="mt-6 rounded border border-border bg-panel p-5">
        {currentStep === "repo" ? (
          <RepoStep
            repoUrl={repoUrl}
            setRepoUrl={setRepoUrl}
            repos={repos}
            selectedRepo={selectedRepo}
            repoLoading={repoLoading}
            loadRepos={() => void loadRepos()}
            onSelect={(repo) => {
              setRepoUrl(repo.htmlUrl);
              setIncludePrivate(repo.isPrivate);
            }}
          />
        ) : null}
        {currentStep === "scope" ? (
          <ScopeStep
            scope={scope}
            setScope={setScope}
            includePrivate={includePrivate}
            setIncludePrivate={setIncludePrivate}
            docsArtifactKey={docsArtifactKey}
            docsUpload={docsUpload}
            uploadDocs={(file) => void uploadArtifact("docs", file)}
            clearDocs={() => clearArtifact("docs")}
            issueCsvArtifactKey={issueCsvArtifactKey}
            issueUpload={issueUpload}
            uploadIssues={(file) => void uploadArtifact("issues", file)}
            clearIssues={() => clearArtifact("issues")}
          />
        ) : null}
        {currentStep === "review" ? (
          <ReviewStep
            repoUrl={repoUrl}
            scope={scope}
            includePrivate={includePrivate}
            selectedRepo={selectedRepo}
            docsArtifactKey={docsArtifactKey}
            docsUpload={docsUpload}
            issueCsvArtifactKey={issueCsvArtifactKey}
            issueUpload={issueUpload}
          />
        ) : null}
      </section>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" type="button" onClick={() => setStepIndex((value) => Math.max(0, value - 1))} disabled={stepIndex === 0}>
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        {currentStep === "review" ? (
          <Button type="button" onClick={() => void startAnalysis()} disabled={starting || !canContinue}>
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Start analysis
          </Button>
        ) : (
          <Button type="button" onClick={() => setStepIndex((value) => Math.min(steps.length - 1, value + 1))} disabled={!canContinue}>
            Continue
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function RepoStep({
  repoUrl,
  setRepoUrl,
  repos,
  selectedRepo,
  repoLoading,
  loadRepos,
  onSelect,
}: {
  repoUrl: string;
  setRepoUrl: (value: string) => void;
  repos: GitHubRepoRef[];
  selectedRepo: GitHubRepoRef | undefined;
  repoLoading: boolean;
  loadRepos: () => void;
  onSelect: (repo: GitHubRepoRef) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <Github className="h-4 w-4 text-ink" />
            Select repository
          </div>
          <p className="mt-2 text-sm text-muted">Use a GitHub URL or load repositories from the connected account.</p>
        </div>
        <Button variant="secondary" type="button" onClick={loadRepos} disabled={repoLoading}>
          {repoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Load repos
        </Button>
      </div>
      <label className="mt-5 block text-sm text-muted" htmlFor="repoUrl">GitHub repository URL</label>
      <div className="group mt-2 flex items-center gap-2.5 rounded-md border border-border bg-card px-3.5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25">
        <Search className="h-4 w-4 shrink-0 text-mute transition-colors group-focus-within:text-primary" />
        <input
          id="repoUrl"
          value={repoUrl}
          onChange={(event) => setRepoUrl(event.target.value)}
          className="h-11 min-w-0 flex-1 bg-transparent font-mono text-sm text-ink outline-none placeholder:text-ash"
        />
      </div>
      {repos.length > 0 ? (
        <div className="mt-4 max-h-80 overflow-y-auto rounded border border-border">
          {repos.map((repo) => (
            <button
              key={repo.fullName}
              type="button"
              className={cn(
                "focus-ring flex w-full cursor-pointer items-center justify-between gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-panel2",
                selectedRepo?.fullName === repo.fullName ? "bg-primary/10" : "bg-background",
              )}
              onClick={() => onSelect(repo)}
            >
              <span>
                <span className="block font-mono text-sm">{repo.fullName}</span>
                <span className="mt-1 block text-xs text-muted">{repo.defaultBranch}</span>
              </span>
              {repo.isPrivate ? (
                <span className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-muted">
                  <Lock className="h-3 w-3" />
                  Private
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ScopeStep({
  scope,
  setScope,
  includePrivate,
  setIncludePrivate,
  docsArtifactKey,
  docsUpload,
  uploadDocs,
  clearDocs,
  issueCsvArtifactKey,
  issueUpload,
  uploadIssues,
  clearIssues,
}: {
  scope: Scope;
  setScope: (value: Scope) => void;
  includePrivate: boolean;
  setIncludePrivate: (value: boolean) => void;
  docsArtifactKey: string;
  docsUpload: UploadState;
  uploadDocs: (file: File) => void;
  clearDocs: () => void;
  issueCsvArtifactKey: string;
  issueUpload: UploadState;
  uploadIssues: (file: File) => void;
  clearIssues: () => void;
}) {
  return (
    <div>
      <div className="font-semibold">Choose scope</div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <ScopeOption active={scope === "quick"} title="Quick" body="100 commits and 50 merged PRs." onClick={() => setScope("quick")} />
        <ScopeOption active={scope === "full"} title="Full" body="500 commits and 200 merged PRs." onClick={() => setScope("full")} />
      </div>
      <label className="mt-5 flex cursor-pointer items-center justify-between gap-3 rounded border border-border bg-background p-4">
        <span>
          <span className="block font-medium">Private repository</span>
          <span className="mt-1 block text-sm text-muted">Requires GitHub OAuth and a paid plan.</span>
        </span>
        <input
          type="checkbox"
          checked={includePrivate}
          onChange={(event) => setIncludePrivate(event.target.checked)}
          className="h-5 w-5 accent-primary"
        />
      </label>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <ArtifactUploadField
          icon={<FileArchive className="h-4 w-4 text-ink" />}
          label="Docs export"
          accept=".zip,.md,.markdown,.mdx,.txt,.rst,.adoc,.html,.htm,.json"
          artifactKey={docsArtifactKey}
          upload={docsUpload}
          onUpload={uploadDocs}
          onClear={clearDocs}
        />
        <ArtifactUploadField
          icon={<Table2 className="h-4 w-4 text-ink" />}
          label="Issue CSV"
          accept=".csv,text/csv"
          artifactKey={issueCsvArtifactKey}
          upload={issueUpload}
          onUpload={uploadIssues}
          onClear={clearIssues}
        />
      </div>
    </div>
  );
}

function ArtifactUploadField({
  icon,
  label,
  accept,
  artifactKey,
  upload,
  onUpload,
  onClear,
}: {
  icon: ReactNode;
  label: string;
  accept: string;
  artifactKey: string;
  upload: UploadState;
  onUpload: (file: File) => void;
  onClear: () => void;
}) {
  const inputId = `${label.replace(/\W+/g, "-").toLowerCase()}-upload`;
  return (
    <div className="rounded border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm font-medium" htmlFor={inputId}>
          {icon}
          {label}
        </label>
        {artifactKey ? (
          <button
            type="button"
            className="focus-ring inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded border border-border text-muted transition-colors hover:bg-panel2 hover:text-text"
            onClick={onClear}
            aria-label={`Clear ${label}`}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <input
        id={inputId}
        type="file"
        accept={accept}
        disabled={upload.status === "uploading"}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onUpload(file);
        }}
        className="sr-only"
      />
      <label
        htmlFor={inputId}
        className={cn(
          "focus-ring mt-3 flex min-h-20 cursor-pointer flex-col justify-center rounded border border-dashed px-3 py-3 transition-colors",
          upload.status === "error" ? "border-danger/60 bg-danger/10" : "border-border bg-panel hover:bg-panel2",
          upload.status === "uploading" ? "cursor-wait opacity-80" : "",
        )}
      >
        <span className="flex items-center gap-2 text-sm">
          {upload.status === "uploading" ? <Loader2 className="h-4 w-4 animate-spin text-ink" /> : upload.status === "done" ? <CheckCircle2 className="h-4 w-4 text-success" /> : <UploadCloud className="h-4 w-4 text-ink" />}
          <span className="font-mono">{upload.fileName || "Choose file"}</span>
        </span>
        <span className="mt-2 break-words text-xs text-muted">
          {upload.status === "error" ? upload.error : artifactKey ? artifactKey : upload.status === "uploading" ? "Uploading" : acceptedSummary(accept)}
        </span>
      </label>
    </div>
  );
}

function ScopeOption({ active, title, body, onClick }: { active: boolean; title: string; body: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cn(
        "focus-ring cursor-pointer rounded border p-4 text-left transition-colors",
        active ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-panel2",
      )}
      onClick={onClick}
    >
      <span className="block font-mono text-sm">{title}</span>
      <span className="mt-2 block text-sm text-muted">{body}</span>
    </button>
  );
}

function ReviewStep({
  repoUrl,
  scope,
  includePrivate,
  selectedRepo,
  docsArtifactKey,
  docsUpload,
  issueCsvArtifactKey,
  issueUpload,
}: {
  repoUrl: string;
  scope: Scope;
  includePrivate: boolean;
  selectedRepo: GitHubRepoRef | undefined;
  docsArtifactKey: string;
  docsUpload: UploadState;
  issueCsvArtifactKey: string;
  issueUpload: UploadState;
}) {
  const estimate = scopeEstimate(scope);
  const rows = [
    ["Repository", selectedRepo?.fullName || repoUrl],
    ["Scope", `${estimate.label}: ${estimate.commits} commits, ${estimate.pullRequests} PRs, ${estimate.issues} issues`],
    ["Estimated time", estimate.duration],
    ["Estimated token cost", estimate.tokenCost],
    ["Private", includePrivate ? "Yes" : "No"],
    ["Docs artifact", artifactReviewValue(docsArtifactKey, docsUpload)],
    ["Issue CSV artifact", artifactReviewValue(issueCsvArtifactKey, issueUpload)],
  ];
  return (
    <div>
      <div className="font-semibold">Review analysis</div>
      <div className="mt-4 overflow-hidden rounded border border-border">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-2 border-b border-border bg-background px-4 py-3 last:border-b-0 sm:grid-cols-[160px_1fr]">
            <div className="text-sm text-muted">{label}</div>
            <div className="min-w-0 break-words font-mono text-sm">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function acceptedSummary(accept: string) {
  return accept.includes(".csv") ? "CSV up to 20 MB" : "ZIP, Markdown, text, HTML, or JSON up to 50 MB";
}

function artifactReviewValue(key: string, upload: UploadState) {
  if (!key.trim()) return "None";
  return upload.fileName ? `${upload.fileName}: ${key}` : key;
}

function scopeEstimate(scope: Scope) {
  if (scope === "full") {
    return {
      label: "Full",
      commits: 500,
      pullRequests: 200,
      issues: 200,
      duration: "45-90 minutes",
      tokenCost: "High: complete agent context",
    };
  }
  return {
    label: "Quick",
    commits: 100,
    pullRequests: 50,
    issues: 100,
    duration: "20-45 minutes",
    tokenCost: "Standard: bounded agent context",
  };
}

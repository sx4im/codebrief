"use client";

import { useState } from "react";
import { CheckCircle2, Download, Loader2, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface AccountDataControlsProps {
  isSignedIn: boolean;
}

export function AccountDataControls({ isSignedIn }: AccountDataControlsProps) {
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteReady = isSignedIn && confirmation === "DELETE" && !deleting;

  async function exportAccountData() {
    setExporting(true);
    setExportMessage(null);
    setExportError(null);
    try {
      const response = await fetch("/api/account/export", { cache: "no-store" });
      const body = await response.text();
      if (!response.ok) throw new Error(readError(body, "Failed to export account data"));

      const blob = new Blob([body], { type: response.headers.get("content-type") || "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileNameFromHeader(response.headers.get("content-disposition"));
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setExportMessage("Account export downloaded.");
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Failed to export account data");
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setDeleteMessage(null);
    setDeleteError(null);
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      const payload = (await response.json().catch(() => ({}))) as { identityDeleted?: boolean; identityDeletionError?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to delete account");
      setConfirmation("");
      setDeleteMessage(
        payload.identityDeletionError
          ? `Codebrief data deleted. Identity deletion needs attention: ${payload.identityDeletionError}`
          : "Account data and identity deleted.",
      );
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Failed to delete account");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mt-8 grid max-w-5xl gap-4 lg:grid-cols-2">
      <section className="rounded border border-border bg-panel p-5">
        <div className="flex items-start gap-3">
          <Download className="mt-0.5 h-5 w-5 text-blue" />
          <div className="min-w-0">
            <h2 className="font-mono text-lg font-semibold">Export personal data</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Download a JSON archive of account, project, analysis, brief, Q&A, usage, and artifact-index records.
            </p>
          </div>
        </div>
        <Button type="button" className="mt-5 w-full sm:w-auto" onClick={exportAccountData} disabled={!isSignedIn || exporting}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Download JSON
        </Button>
        {!isSignedIn ? <p className="mt-3 text-sm text-amber">Sign in to export account data.</p> : null}
        <StatusLine message={exportMessage} error={exportError} />
      </section>

      <section className="rounded border border-danger/60 bg-panel p-5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 text-danger" />
          <div className="min-w-0">
            <h2 className="font-mono text-lg font-semibold">Delete account</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Remove Codebrief database records for this user. Clerk identity deletion is attempted when Clerk credentials are configured.
            </p>
          </div>
        </div>
        <label className="mt-5 block text-sm font-semibold" htmlFor="delete-confirmation">
          Type <span className="font-mono text-danger">DELETE</span> to confirm
        </label>
        <input
          id="delete-confirmation"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          className="focus-ring mt-2 h-10 w-full rounded border border-border bg-background px-3 font-mono text-sm text-text placeholder:text-muted"
          placeholder="DELETE"
          disabled={!isSignedIn || deleting}
        />
        <Button type="button" variant="danger" className="mt-4 w-full sm:w-auto" onClick={deleteAccount} disabled={!deleteReady}>
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Delete account data
        </Button>
        {!isSignedIn ? <p className="mt-3 text-sm text-amber">Sign in to delete account data.</p> : null}
        <StatusLine message={deleteMessage} error={deleteError} />
      </section>
    </div>
  );
}

function StatusLine({ message, error }: { message: string | null; error: string | null }) {
  if (!message && !error) return null;
  return (
    <div className={error ? "mt-4 flex gap-2 text-sm leading-6 text-danger" : "mt-4 flex gap-2 text-sm leading-6 text-blue"}>
      {error ? <ShieldAlert className="mt-1 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-1 h-4 w-4 shrink-0" />}
      <p className="min-w-0 break-words">{error || message}</p>
    </div>
  );
}

function readError(body: string, fallback: string): string {
  try {
    const payload = JSON.parse(body) as { error?: string };
    return payload.error || fallback;
  } catch {
    return fallback;
  }
}

function fileNameFromHeader(header: string | null): string {
  const match = header?.match(/filename="([^"]+)"/);
  return match?.[1] || "codebrief-account-export.json";
}

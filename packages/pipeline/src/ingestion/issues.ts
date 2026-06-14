import type { IssueSummary } from "@codebrief/shared";
import { parse } from "csv-parse/sync";
import type { ArtifactStore } from "../storage/r2-client.js";

export interface IssueCsvParseOptions {
  now?: Date;
  maxIssues?: number;
}

const MAX_ISSUE_CSV_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_IMPORTED_ISSUES = 500;
const EXTERNAL_ISSUE_NUMBER_BASE = 1_000_000;

type CsvRow = Record<string, string | undefined>;

export async function ingestIssueCsvArtifact(artifactStore: ArtifactStore, storageKey: string): Promise<IssueSummary[]> {
  return parseIssueCsvArtifact(storageKey, await artifactStore.getBuffer(storageKey));
}

export function parseIssueCsvArtifact(storageKey: string, buffer: Buffer, options: IssueCsvParseOptions = {}): IssueSummary[] {
  if (buffer.byteLength > MAX_ISSUE_CSV_BYTES) {
    throw new Error(`Issue CSV artifact ${storageKey} is too large (${buffer.byteLength} bytes)`);
  }
  if (!/\.csv$/i.test(storageKey.trim())) {
    throw new Error(`Unsupported issue artifact format for ${storageKey}. Expected a CSV file.`);
  }

  const rows = parse(buffer.toString("utf8"), {
    bom: true,
    columns: true,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  }) as CsvRow[];
  const now = (options.now || new Date()).toISOString();
  const maxIssues = options.maxIssues ?? DEFAULT_MAX_IMPORTED_ISSUES;
  const issues: IssueSummary[] = [];

  for (const [index, row] of rows.entries()) {
    if (issues.length >= maxIssues) break;
    const normalized = normalizeRow(row);
    const title = pick(normalized, ["summary", "title", "name", "issuetitle"]);
    if (!title) continue;

    const key = pick(normalized, ["issuekey", "key", "id", "identifier", "issueid", "number", "issueno"]);
    const status = pick(normalized, ["status", "state", "workflowstate"]) || "open";
    const createdAt = parseDate(pick(normalized, ["created", "createdat", "createddate"])) || now;
    const updatedAt = parseDate(pick(normalized, ["updated", "updatedat", "updateddate", "modified", "modifiedat"])) || createdAt;
    const closedAt = parseDate(pick(normalized, ["resolved", "resolutiondate", "completed", "completedat", "closed", "closedat"]));
    const labels = splitLabels(pick(normalized, ["labels", "label", "tags", "tag", "issuetype", "type", "priority"]));
    const description = pick(normalized, ["description", "body", "content", "details"]) || "";
    const commentText = pick(normalized, ["comment", "comments", "latestcomment"]);
    const body = [description, commentText ? `Comment: ${commentText}` : "", `Imported from ${storageKey} row ${index + 2}.`]
      .filter(Boolean)
      .join("\n\n");
    const issueUrl = validUrl(pick(normalized, ["url", "link", "issueurl", "weburl", "permalink"]));
    const state = closedAt || isClosedStatus(status) ? "closed" : "open";

    issues.push({
      number: syntheticIssueNumber(key, index + 1),
      title: key ? `[${key}] ${title}` : title,
      body,
      state,
      createdAt,
      updatedAt,
      closedAt: state === "closed" ? closedAt || updatedAt : null,
      htmlUrl: issueUrl || syntheticIssueUrl(storageKey, index + 2),
      labels,
      comments: parseCommentCount(pick(normalized, ["commentcount", "commentscount", "comments"])) ?? (commentText ? 1 : 0),
    });
  }

  if (issues.length === 0) {
    throw new Error(`Issue CSV artifact ${storageKey} did not contain rows with a title or summary`);
  }
  return issues;
}

export function mergeIssueSummaries(primary: IssueSummary[], imported: IssueSummary[], limit: number): IssueSummary[] {
  const output: IssueSummary[] = [];
  const seen = new Set<string>();
  for (const issue of [...imported, ...primary]) {
    const key = issue.htmlUrl || `${issue.number}:${issue.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(issue);
    if (output.length >= limit) break;
  }
  return output;
}

function normalizeRow(row: CsvRow): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value !== "string") continue;
    normalized[normalizeHeader(key)] = value.trim();
  }
  return normalized;
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function pick(row: Record<string, string>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (value) return value;
  }
  return undefined;
}

function parseDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString();
}

function splitLabels(value: string | undefined): string[] {
  if (!value) return [];
  return Array.from(
    new Set(
      value
        .split(/[;,|]/)
        .map((label) => label.trim())
        .filter(Boolean),
    ),
  );
}

function validUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).toString();
  } catch {
    return undefined;
  }
}

function syntheticIssueUrl(storageKey: string, rowNumber: number): string {
  return `https://codebrief.local/artifacts/${encodeURIComponent(storageKey)}#row-${rowNumber}`;
}

function syntheticIssueNumber(key: string | undefined, index: number): number {
  const suffix = key?.match(/(\d+)(?!.*\d)/)?.[1];
  return EXTERNAL_ISSUE_NUMBER_BASE + (suffix ? Number.parseInt(suffix, 10) : index);
}

function isClosedStatus(status: string): boolean {
  return /^(done|closed|resolved|complete|completed|canceled|cancelled|fixed|shipped)$/i.test(status.trim());
}

function parseCommentCount(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

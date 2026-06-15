import "server-only";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export type UploadArtifactKind = "docs" | "issues";

export interface StoredUploadArtifact {
  key: string;
  fileName: string;
  kind: UploadArtifactKind;
  sizeBytes: number;
  contentType: string;
}

const DOC_EXTENSIONS = new Set([".zip", ".md", ".markdown", ".mdx", ".txt", ".rst", ".adoc", ".html", ".htm", ".json"]);
const ISSUE_EXTENSIONS = new Set([".csv"]);
const MAX_DOC_BYTES = 50 * 1024 * 1024;
const MAX_ISSUE_BYTES = 20 * 1024 * 1024;

export async function storeAnalysisUpload(input: {
  userId: string;
  kind: UploadArtifactKind;
  file: File;
  now?: Date;
}): Promise<StoredUploadArtifact> {
  const fileName = sanitizeFileName(input.file.name || `${input.kind}-artifact`);
  const contentType = input.file.type || contentTypeForFile(fileName);
  validateUpload(input.kind, fileName, input.file.size);
  const key = uploadKey(input.userId, input.kind, fileName, input.now || new Date());
  const buffer = Buffer.from(await input.file.arrayBuffer());
  validateUpload(input.kind, fileName, buffer.byteLength);

  if ((process.env.ARTIFACT_STORAGE_DRIVER || "local") === "r2") {
    await putR2Object(key, buffer, contentType);
  } else {
    const filePath = localArtifactPath(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
  }

  return { key, fileName, kind: input.kind, sizeBytes: buffer.byteLength, contentType };
}

export function validateUpload(kind: UploadArtifactKind, fileName: string, sizeBytes: number) {
  const extension = path.extname(fileName).toLowerCase();
  const allowed = kind === "docs" ? DOC_EXTENSIONS : ISSUE_EXTENSIONS;
  const maxBytes = kind === "docs" ? MAX_DOC_BYTES : MAX_ISSUE_BYTES;
  if (!allowed.has(extension)) {
    throw new Error(
      kind === "docs"
        ? "Docs uploads must be ZIP, Markdown, text, HTML, or JSON files"
        : "Issue uploads must be CSV files",
    );
  }
  if (sizeBytes <= 0) {
    throw new Error("Upload file is empty");
  }
  if (sizeBytes > maxBytes) {
    throw new Error(`Upload exceeds ${Math.round(maxBytes / 1024 / 1024)} MB limit`);
  }
}

function uploadKey(userId: string, kind: UploadArtifactKind, fileName: string, now: Date): string {
  const userPart = sanitizeKeySegment(userId);
  const datePart = now.toISOString().slice(0, 10);
  return `uploads/${userPart}/${kind}/${datePart}/${now.getTime()}-${randomUUID()}-${fileName}`;
}

/**
 * Authorization check for client-supplied artifact keys: a key may only be
 * referenced by the same user whose upload prefix produced it. This stops a
 * caller from pointing an analysis at another account's upload (or at an
 * internal `<analysisId>/...` pipeline artifact) by guessing or replaying a key.
 */
export function isOwnedUploadKey(userId: string, key: string): boolean {
  const normalized = key.trim().replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) return false;
  return normalized.startsWith(`uploads/${sanitizeKeySegment(userId)}/`);
}

function sanitizeFileName(value: string): string {
  const base = value.split(/[\\/]/).pop() || "artifact";
  const sanitized = base.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized || "artifact";
}

function sanitizeKeySegment(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized || "user";
}

function contentTypeForFile(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".zip") return "application/zip";
  if (extension === ".csv") return "text/csv";
  if (extension === ".json") return "application/json";
  if (extension === ".html" || extension === ".htm") return "text/html";
  if (extension === ".md" || extension === ".markdown" || extension === ".mdx") return "text/markdown";
  return "text/plain";
}

async function putR2Object(key: string, body: Buffer, contentType: string) {
  const accountId = requireEnv("R2_ACCOUNT_ID");
  const accessKeyId = requireEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");
  const bucket = requireEnv("R2_BUCKET_NAME");
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
}

function localArtifactPath(key: string): string {
  const baseDir = localArtifactBaseDir(process.env.ARTIFACT_LOCAL_DIR || "artifacts/pipeline");
  const resolved = path.resolve(baseDir, key);
  if (resolved !== baseDir && !resolved.startsWith(`${baseDir}${path.sep}`)) {
    throw new Error(`Artifact key escapes local artifact directory: ${key}`);
  }
  return resolved;
}

function localArtifactBaseDir(localDir: string): string {
  if (path.isAbsolute(localDir)) return localDir;
  return path.resolve(findWorkspaceRoot(process.cwd()), localDir);
}

function findWorkspaceRoot(start: string): string {
  let current = path.resolve(start);
  while (true) {
    const packageJsonPath = path.join(current, "package.json");
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { workspaces?: unknown };
        if (Array.isArray(packageJson.workspaces)) return current;
      } catch {
        // Continue walking upward if package.json cannot be parsed.
      }
    }
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(start);
    current = parent;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { PipelineEnv } from "../env.js";
import { requireEnv } from "../env.js";

export interface ArtifactStore {
  putJson<T>(analysisId: string, type: string, value: T): Promise<{ key: string; sizeBytes: number }>;
  getBuffer(key: string): Promise<Buffer>;
}

export function createArtifactStore(env: PipelineEnv): ArtifactStore {
  if (env.ARTIFACT_STORAGE_DRIVER === "r2") {
    const accountId = requireEnv(env.R2_ACCOUNT_ID, "R2_ACCOUNT_ID");
    const accessKeyId = requireEnv(env.R2_ACCESS_KEY_ID, "R2_ACCESS_KEY_ID");
    const secretAccessKey = requireEnv(env.R2_SECRET_ACCESS_KEY, "R2_SECRET_ACCESS_KEY");
    const bucket = requireEnv(env.R2_BUCKET_NAME, "R2_BUCKET_NAME");
    const client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    return {
      async putJson(analysisId, type, value) {
        const body = JSON.stringify(value, null, 2);
        const key = `${analysisId}/${type}-${Date.now()}.json`;
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: "application/json",
          }),
        );
        return { key, sizeBytes: Buffer.byteLength(body) };
      },
      async getBuffer(key) {
        const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: normalizeArtifactKey(key) }));
        return streamBodyToBuffer(object.Body);
      },
    };
  }

  return {
    async putJson(analysisId, type, value) {
      const body = JSON.stringify(value, null, 2);
      const dir = path.join(localArtifactBaseDir(env.ARTIFACT_LOCAL_DIR), normalizeArtifactKey(analysisId));
      await mkdir(dir, { recursive: true });
      const key = `${analysisId}/${type}-${Date.now()}.json`;
      await writeFile(localArtifactPath(env, key), body);
      return { key, sizeBytes: Buffer.byteLength(body) };
    },
    async getBuffer(key) {
      return readFile(localArtifactPath(env, key));
    },
  };
}

function normalizeArtifactKey(key: string): string {
  const trimmed = key.trim().replace(/^\/+/, "");
  if (!trimmed || trimmed.includes("..")) {
    throw new Error(`Invalid artifact storage key: ${key}`);
  }
  return trimmed;
}

function localArtifactPath(env: PipelineEnv, key: string): string {
  const baseDir = localArtifactBaseDir(env.ARTIFACT_LOCAL_DIR);
  const resolved = path.resolve(baseDir, normalizeArtifactKey(key));
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
        // Continue walking upward if package.json is unreadable.
      }
    }
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(start);
    current = parent;
  }
}

async function streamBodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof body === "string") return Buffer.from(body);
  if (typeof (body as { transformToByteArray?: unknown }).transformToByteArray === "function") {
    const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    return Buffer.from(bytes);
  }
  if (isAsyncIterable(body)) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  throw new Error("Unsupported artifact object body type");
}

function isAsyncIterable(value: unknown): value is AsyncIterable<Uint8Array | string | Buffer> {
  return typeof value === "object" && value !== null && Symbol.asyncIterator in value;
}

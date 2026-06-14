import type { GitHubTreeFile, SourceCitation } from "@codebrief/shared";
import JSZip from "jszip";
import type { ArtifactStore } from "../storage/r2-client.js";
import { GitHubApiClient } from "./github-client.js";

export interface DocumentationPage {
  path: string;
  text: string;
  source: SourceCitation;
}

export interface DocumentationIngestionOptions {
  artifactStore?: ArtifactStore;
  docsArtifactKey?: string;
}

const MAX_REPO_DOC_FILES = 50;
const MAX_ARTIFACT_DOC_PAGES = 100;
const MAX_DOC_TEXT_CHARS = 60_000;
const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;
const TEXT_DOC_EXTENSIONS = new Set([".md", ".markdown", ".mdx", ".txt", ".rst", ".adoc"]);
const HTML_DOC_EXTENSIONS = new Set([".html", ".htm"]);

export async function ingestDocs(
  client: GitHubApiClient,
  owner: string,
  repo: string,
  treeFiles: GitHubTreeFile[],
  readme: string,
  options: DocumentationIngestionOptions = {},
): Promise<DocumentationPage[]> {
  const docs: DocumentationPage[] = [
    {
      path: "README.md",
      text: trimDocumentationText(readme),
      source: { type: "readme", path: "README.md" },
    },
  ];
  const docFiles = treeFiles
    .filter((file) => file.type === "blob" && isRepositoryDocumentationPath(file.path))
    .slice(0, MAX_REPO_DOC_FILES);
  for (const file of docFiles) {
    docs.push({
      path: file.path,
      text: trimDocumentationText(await client.getBlobText(owner, repo, file.sha)),
      source: { type: "docs", path: file.path },
    });
  }
  if (options.docsArtifactKey) {
    if (!options.artifactStore) {
      throw new Error("docsArtifactKey was provided but no artifact store is available");
    }
    const buffer = await options.artifactStore.getBuffer(options.docsArtifactKey);
    docs.push(...(await parseDocumentationArtifact(options.docsArtifactKey, buffer)));
  }
  return docs;
}

export async function parseDocumentationArtifact(storageKey: string, buffer: Buffer): Promise<DocumentationPage[]> {
  if (buffer.byteLength > MAX_ARTIFACT_BYTES) {
    throw new Error(`Documentation artifact ${storageKey} is too large (${buffer.byteLength} bytes)`);
  }

  const normalizedKey = storageKey.trim();
  const extension = extensionForPath(normalizedKey);
  if (extension === ".zip") return parseZipDocumentation(normalizedKey, buffer);
  if (extension === ".json") return parseJsonDocumentation(normalizedKey, buffer.toString("utf8"), normalizedKey);
  if (HTML_DOC_EXTENSIONS.has(extension)) {
    return [makeArtifactPage(normalizedKey, normalizedKey, htmlToText(buffer.toString("utf8")))];
  }
  if (TEXT_DOC_EXTENSIONS.has(extension)) {
    return [makeArtifactPage(normalizedKey, normalizedKey, buffer.toString("utf8"))];
  }

  throw new Error(
    `Unsupported documentation artifact format for ${storageKey}. Supported formats: markdown, text, HTML, JSON, and ZIP.`,
  );
}

async function parseZipDocumentation(storageKey: string, buffer: Buffer): Promise<DocumentationPage[]> {
  const zip = await JSZip.loadAsync(buffer);
  const pages: DocumentationPage[] = [];
  const entries = Object.values(zip.files)
    .filter((entry) => !entry.dir && !isSkippableArchivePath(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (pages.length >= MAX_ARTIFACT_DOC_PAGES) break;
    const extension = extensionForPath(entry.name);
    if (TEXT_DOC_EXTENSIONS.has(extension)) {
      const text = await entry.async("text");
      pages.push(makeArtifactPage(storageKey, entry.name, text));
      continue;
    }
    if (HTML_DOC_EXTENSIONS.has(extension)) {
      const html = await entry.async("text");
      pages.push(makeArtifactPage(storageKey, entry.name, htmlToText(html)));
      continue;
    }
    if (extension === ".json") {
      const json = await entry.async("text");
      pages.push(...parseJsonDocumentation(storageKey, json, entry.name).slice(0, MAX_ARTIFACT_DOC_PAGES - pages.length));
    }
  }

  if (pages.length === 0) {
    throw new Error(`Documentation artifact ${storageKey} did not contain supported documentation files`);
  }
  return pages;
}

function parseJsonDocumentation(storageKey: string, text: string, fallbackPath: string): DocumentationPage[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Documentation JSON artifact ${fallbackPath} could not be parsed: ${message}`);
  }

  const candidates = Array.isArray(parsed) ? parsed : jsonPageArray(parsed) || [parsed];
  const pages: DocumentationPage[] = [];
  for (const candidate of candidates) {
    if (pages.length >= MAX_ARTIFACT_DOC_PAGES) break;
    const page = jsonPage(candidate, fallbackPath, pages.length + 1);
    if (page) {
      pages.push(makeArtifactPage(storageKey, page.path, page.text));
    }
  }

  if (pages.length === 0) {
    throw new Error(`Documentation JSON artifact ${fallbackPath} did not contain pages with text content`);
  }
  return pages;
}

function jsonPageArray(value: unknown): unknown[] | undefined {
  if (!isRecord(value)) return undefined;
  for (const key of ["pages", "documents", "results", "items"]) {
    const candidate = value[key];
    if (Array.isArray(candidate)) return candidate;
  }
  return undefined;
}

function jsonPage(value: unknown, fallbackPath: string, index: number): { path: string; text: string } | undefined {
  if (typeof value === "string") {
    return { path: `${fallbackPath}#page-${index}`, text: value };
  }
  if (!isRecord(value)) return undefined;

  const text = firstString(value, ["text", "content", "body", "markdown", "html"]);
  if (!text) return undefined;
  const rawPath = firstString(value, ["path", "title", "name", "url", "id"]) || `${fallbackPath}#page-${index}`;
  return {
    path: rawPath,
    text: firstString(value, ["html"]) === text ? htmlToText(text) : text,
  };
}

function firstString(value: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return undefined;
}

function makeArtifactPage(storageKey: string, pagePath: string, text: string): DocumentationPage {
  return {
    path: pagePath,
    text: trimDocumentationText(text),
    source: { type: "docs", path: pagePath, storageKey },
  };
}

function isRepositoryDocumentationPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  if (/^docs\/.+\.(md|mdx|markdown)$/i.test(normalized)) return true;
  return /(^|\/)(ARCHITECTURE|CONTRIBUTING)\.(md|mdx|markdown)$/i.test(normalized);
}

function isSkippableArchivePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.startsWith("__MACOSX/")) return true;
  return normalized.split("/").some((segment) => segment.startsWith("."));
}

function extensionForPath(filePath: string): string {
  const filename = filePath.split(/[\\/]/).pop() || filePath;
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

function trimDocumentationText(text: string): string {
  return text.replace(/\u0000/g, "").trim().slice(0, MAX_DOC_TEXT_CHARS);
}

function htmlToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\/(address|article|aside|blockquote|br|div|footer|h[1-6]|header|li|main|nav|ol|p|pre|section|table|tr|ul)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .replace(/\n{3,}/g, "\n\n"),
  );
}

function decodeHtmlEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\"",
  };
  return text
    .replace(/&#(\d+);/g, (_, value: string) => String.fromCodePoint(Number(value)))
    .replace(/&#x([a-f0-9]+);/gi, (_, value: string) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/&([a-z]+);/gi, (match, value: string) => named[value.toLowerCase()] || match);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

import assert from "node:assert/strict";
import { sampleBrief } from "@/lib/sample-data";
import { briefToHtml, briefToMarkdown } from "./repository";

const brief = structuredClone(sampleBrief);
brief.flaggedClaims = [
  {
    claim: "<script>alert(\"unsupported\")</script>",
    confidence: 0,
    sources: [{ type: "inferred", excerpt: "Unsupported generated claim was downgraded.", url: "javascript:alert(1)" }],
  },
];

const markdown = briefToMarkdown(brief);
assert.match(markdown, /^# Codebrief: supabase\/supabase/m);
assert.match(markdown, /## Repository Snapshot/);
assert.match(markdown, /## System Narrative/);
assert.match(markdown, /## Top Findings/);
assert.match(markdown, /## Flagged Claims/);
assert.match(markdown, /## Decision Archaeology/);
assert.match(markdown, /## Landmine Map/);
assert.match(markdown, /## Architecture Diagram Summary/);
assert.match(markdown, /## Rewrite Assessment/);
assert.match(markdown, /Source 1: readme \| README\.md/);
assert.match(markdown, /Confidence 0%/);
assert.ok(markdown.endsWith("\n"));

const html = briefToHtml(brief);
assert.match(html, /^<!doctype html>/);
assert.match(html, /<h2>Repository Snapshot<\/h2>/);
assert.match(html, /<h2>Flagged Claims<\/h2>/);
assert.match(html, /<h2>Architecture Diagram Summary<\/h2>/);
assert.match(html, /<svg class="diagram-svg"/);
assert.match(html, /Static architecture diagram preview/);
assert.match(html, /IBM Plex Sans/);
assert.match(html, /&lt;script&gt;alert\(&quot;unsupported&quot;\)&lt;\/script&gt;/);
assert.doesNotMatch(html, /<script>alert/);
assert.doesNotMatch(html, /href="javascript:/);

process.stdout.write("web export format tests passed\n");

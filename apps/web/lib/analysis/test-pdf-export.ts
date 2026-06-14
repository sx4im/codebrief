import "dotenv/config";
import assert from "node:assert/strict";
import { briefToHtml } from "@/lib/analysis/repository";
import { sampleBrief } from "@/lib/sample-data";

// M4 PDF export proof: render a real brief to a PDF through the exact path the
// /api/analysis/[id]/export/pdf route uses (briefToHtml -> puppeteer-core ->
// local Chrome). Run with: PUPPETEER_EXECUTABLE_PATH set.
async function main() {
  const chromePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (!chromePath) {
    // The route falls back to HTML when Chrome is unavailable; skip rather than
    // fail so the suite stays green in environments without a browser.
    process.stdout.write("pdf export test skipped (PUPPETEER_EXECUTABLE_PATH not set)\n");
    return;
  }

  const html = briefToHtml(sampleBrief);
  assert.ok(html.startsWith("<!doctype html>"), "briefToHtml should produce an HTML document");

  const puppeteer = await import("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: chromePath, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });

    // A valid PDF starts with "%PDF-" and ends with "%%EOF"; require real content.
    const header = Buffer.from(pdf.subarray(0, 5)).toString("latin1");
    assert.equal(header, "%PDF-", `expected PDF header, got ${JSON.stringify(header)}`);
    assert.ok(pdf.byteLength > 10_000, `expected a non-trivial PDF, got ${pdf.byteLength} bytes`);
    const tail = Buffer.from(pdf.subarray(pdf.byteLength - 1024)).toString("latin1");
    assert.ok(tail.includes("%%EOF"), "expected PDF EOF marker");

    process.stdout.write(`pdf export test passed (${pdf.byteLength} bytes, ${sampleBrief.repoFullName})\n`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  process.stderr.write(`pdf export test FAILED: ${(e as Error).message}\n`);
  process.exit(1);
});

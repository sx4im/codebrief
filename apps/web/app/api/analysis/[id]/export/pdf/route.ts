import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { briefToHtml, getBriefForUser, NotFoundError, ServiceConfigurationError } from "@/lib/analysis/repository";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { userId }] = await Promise.all([params, auth()]);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let brief;
  try {
    brief = await getBriefForUser(userId, id);
  } catch (error) {
    if (error instanceof ServiceConfigurationError || error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to export PDF" }, { status: 500 });
  }
  if (!brief) return NextResponse.json({ error: "Brief is not ready" }, { status: 202 });

  const html = briefToHtml(brief);
  const chromePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (!chromePath) {
    return new NextResponse(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "x-codebrief-export-note": "Set PUPPETEER_EXECUTABLE_PATH to enable PDF rendering.",
      },
    });
  }
  const puppeteer = await import("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: chromePath, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    // The export is a self-contained static document with no scripts of its own.
    // Disabling JS removes any chance of script execution inside the headless
    // browser, which is the meaningful residual risk of rendering with --no-sandbox.
    await page.setJavaScriptEnabled(false);
    await page.setContent(html, { waitUntil: "load" });
    // Plain-text repo label for the running header (templates render raw HTML).
    const repoLabel = brief.repoFullName.replace(/[<>&"]/g, "");
    const footTextStyle =
      "font-size:8px;color:#9a9a9a;font-family:Arial,Helvetica,sans-serif;width:100%;padding:0 16mm;";
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", bottom: "18mm", left: "16mm", right: "16mm" },
      displayHeaderFooter: true,
      headerTemplate: `<div style="${footTextStyle}"><span style="float:left;letter-spacing:0.08em;text-transform:uppercase;">Codebrief technical audit</span><span style="float:right;">${repoLabel}</span></div>`,
      footerTemplate: `<div style="${footTextStyle}text-align:right;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
    });
    const body = new ArrayBuffer(pdf.byteLength);
    new Uint8Array(body).set(pdf);
    return new NextResponse(body, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${brief.repoFullName.replace("/", "-")}.pdf"`,
      },
    });
  } finally {
    await browser.close();
  }
}

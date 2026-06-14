import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { briefToHtml, getBriefForUser, NotFoundError, ServiceConfigurationError } from "@/lib/analysis/repository";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
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
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });
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

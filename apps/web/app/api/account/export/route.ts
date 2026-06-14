import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getAccountExportForUser, ServiceConfigurationError } from "@/lib/analysis/repository";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rateLimit = await checkRateLimit({ key: `account:export:${userId}:${clientIp(request)}`, limit: 10, windowMs: 60 * 60 * 1000 });
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Account export rate limit exceeded", retryAfterSeconds: rateLimit.retryAfterSeconds },
      { status: 429, headers: { "retry-after": String(rateLimit.retryAfterSeconds) } },
    );
  }

  try {
    const user = await currentUser();
    const email = user?.primaryEmailAddress?.emailAddress;
    const exportData = await getAccountExportForUser(userId, email);
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${exportFileName(userId)}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ServiceConfigurationError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to export account data" }, { status: 500 });
  }
}

function exportFileName(userId: string) {
  return `codebrief-account-${userId.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
}

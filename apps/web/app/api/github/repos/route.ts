import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getGitHubOAuthToken } from "@/lib/github/oauth";
import { listGitHubRepos } from "@/lib/github/repos";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const token = (await getGitHubOAuthToken(userId)) || process.env.GITHUB_TOKEN;
    if (!token) return NextResponse.json({ error: "Connect GitHub OAuth or set GITHUB_TOKEN" }, { status: 409 });
    return NextResponse.json(await listGitHubRepos(token));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to list GitHub repositories" }, { status: 502 });
  }
}

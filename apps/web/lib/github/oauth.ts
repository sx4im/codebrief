import "server-only";
import { clerkClient } from "@clerk/nextjs/server";

export async function getGitHubOAuthToken(userId: string): Promise<string | null> {
  const client = await clerkClient();
  const response = await client.users.getUserOauthAccessToken(userId, "github");
  const token = response.data[0]?.token;
  return token || null;
}

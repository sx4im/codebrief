import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { deleteAccountDataForUser, ServiceConfigurationError } from "@/lib/analysis/repository";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export async function DELETE(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await readBody(request);
  if (body.confirmation !== "DELETE") {
    return NextResponse.json({ error: "Type DELETE to confirm account deletion" }, { status: 400 });
  }

  const rateLimit = await checkRateLimit({ key: `account:delete:${userId}:${clientIp(request)}`, limit: 5, windowMs: 60 * 60 * 1000 });
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Account deletion rate limit exceeded", retryAfterSeconds: rateLimit.retryAfterSeconds },
      { status: 429, headers: { "retry-after": String(rateLimit.retryAfterSeconds) } },
    );
  }

  try {
    const dataDeletion = await deleteAccountDataForUser(userId);
    const identityDeletion = await deleteClerkIdentity(userId);
    return NextResponse.json({
      deleted: true,
      dataDeletion,
      identityDeleted: identityDeletion.deleted,
      identityDeletionError: identityDeletion.error,
    });
  } catch (error) {
    if (error instanceof ServiceConfigurationError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to delete account" }, { status: 500 });
  }
}

async function readBody(request: Request): Promise<{ confirmation?: string }> {
  try {
    return (await request.json()) as { confirmation?: string };
  } catch {
    return {};
  }
}

async function deleteClerkIdentity(userId: string): Promise<{ deleted: boolean; error: string | null }> {
  if (!process.env.CLERK_SECRET_KEY) {
    return {
      deleted: false,
      error: "CLERK_SECRET_KEY is not configured; Codebrief data was removed, but the Clerk identity must be deleted from Clerk.",
    };
  }

  try {
    const client = await clerkClient();
    await client.users.deleteUser(userId);
    return { deleted: true, error: null };
  } catch (error) {
    return {
      deleted: false,
      error: error instanceof Error ? error.message : "Clerk identity deletion failed",
    };
  }
}

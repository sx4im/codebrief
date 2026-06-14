import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  addAnalysisTokenUsage,
  appendQaExchangeForUser,
  getBriefForUser,
  getQaMessagesForUser,
  NotFoundError,
  ServiceConfigurationError,
} from "@/lib/analysis/repository";
import { answerQuestion } from "@/lib/ai/qa";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ messages: await getQaMessagesForUser(userId, id) });
  } catch (error) {
    if (error instanceof ServiceConfigurationError || error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load Q&A history" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rateLimit = await checkRateLimit({ key: `qa:${userId}:${id}:${clientIp(request)}`, limit: 30, windowMs: 60 * 60 * 1000 });
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Q&A rate limit exceeded", retryAfterSeconds: rateLimit.retryAfterSeconds },
      { status: 429, headers: { "retry-after": String(rateLimit.retryAfterSeconds) } },
    );
  }
  const { question } = (await request.json()) as { question?: string };
  if (!question?.trim()) return NextResponse.json({ error: "Question required" }, { status: 400 });
  try {
    const brief = await getBriefForUser(userId, id);
    if (!brief) return NextResponse.json({ error: "Brief is not ready" }, { status: 202 });
    const result = await answerQuestion({ brief, question });
    await addAnalysisTokenUsage(userId, id, result.tokenUsage);
    const messages = await appendQaExchangeForUser({ userId, analysisId: id, question: question.trim(), answer: result.answer });
    return NextResponse.json({ ...result.answer, mode: result.mode, messages });
  } catch (error) {
    if (error instanceof ServiceConfigurationError || error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to answer question" }, { status: 500 });
  }
}

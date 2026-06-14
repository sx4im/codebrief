import { NextResponse } from "next/server";
import { getHealthReport } from "@/lib/health";

export async function GET(request: Request) {
  const deep = new URL(request.url).searchParams.get("deep") === "1";
  return NextResponse.json(await getHealthReport({ deep }));
}

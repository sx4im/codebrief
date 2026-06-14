import { NextResponse } from "next/server";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({
    analysisId: id,
    note: "Socket.io runs as a separate server process; clients use NEXT_PUBLIC_WS_URL.",
  });
}

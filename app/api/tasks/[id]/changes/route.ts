import { NextResponse } from "next/server";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  }
  const backendUrl = process.env.NENE_BACKEND_URL;
  const apiToken = process.env.NENE_API_TOKEN;
  if (!backendUrl || !apiToken) return NextResponse.json({ error: "Changes are temporarily unavailable." }, { status: 503 });
  try {
    const response = await fetch(`${backendUrl.replace(/\/$/, "")}/tasks/${encodeURIComponent(id)}/changes`, {
      headers: { Authorization: `Bearer ${apiToken}` }, cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]),
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not load changes." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

import { NextRequest, NextResponse } from "next/server";

const backendUrl = process.env.NENE_BACKEND_URL;
const apiToken = process.env.NENE_API_TOKEN;

if (!backendUrl) {
  throw new Error("NENE_BACKEND_URL is missing");
}

if (!apiToken) {
  throw new Error("NENE_API_TOKEN is missing");
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const response = await fetch(
    `${backendUrl}/tasks`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    }
  );

  const data = await response.json();

  return NextResponse.json(
    data,
    {
      status: response.status,
    }
  );
}

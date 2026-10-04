import { NextResponse } from "next/server";

const backendUrl = process.env.NENE_BACKEND_URL;
const apiToken = process.env.NENE_API_TOKEN;

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const { id } = await context.params;

  const response = await fetch(
    `${backendUrl}/tasks/${id}`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
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

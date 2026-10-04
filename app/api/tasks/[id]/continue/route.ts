import { NextResponse } from "next/server";

const backendUrl =
  process.env.NENE_BACKEND_URL;

const apiToken =
  process.env.NENE_API_TOKEN;

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const { id } =
    await context.params;

  const body =
    await request.json();

  if (!backendUrl || !apiToken) {
    return NextResponse.json(
      {
        error:
          "Backend configuration missing",
      },
      {
        status: 500,
      }
    );
  }

  const response =
    await fetch(
      `${backendUrl}/tasks/${id}/continue`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${apiToken}`,
        },

        body:
          JSON.stringify(body),

        cache:
          "no-store",
      }
    );

  const data =
    await response.json();

  return NextResponse.json(
    data,
    {
      status:
        response.status,
    }
  );
}

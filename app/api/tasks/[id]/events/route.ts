const backendUrl = process.env.NENE_BACKEND_URL;
const apiToken = process.env.NENE_API_TOKEN;

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const { id } = await context.params;

  const upstream = await fetch(
    `${backendUrl}/tasks/${id}/events`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
      cache: "no-store",
    }
  );

  if (!upstream.body) {
    return new Response(
      "No event stream",
      {
        status: 502,
      }
    );
  }

  return new Response(
    upstream.body,
    {
      status: upstream.status,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    }
  );
}

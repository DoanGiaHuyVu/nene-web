"use client";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return <html lang="en"><body style={{ background: "#0a0a0a", color: "white", fontFamily: "sans-serif", padding: "3rem" }}>
    <h1>Could not display this page.</h1><p>Please try again.</p><button onClick={retry}>Try again</button>
  </body></html>;
}

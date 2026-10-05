This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Project conversations

Home groups revisions into persistent projects. Each project keeps its original title,
request/result history, approval and GitHub publication events, and deployment results.
The composer remains visible throughout the project lifecycle; sending is enabled once
published code is available and the current build/approval/deployment has finished.
Failed updates can be retried against the latest successful published revision.

Project history is stored in this browser's `localStorage` under `nene-projects-v1`.
The previous `nene-task-id` is imported when available. Clearing browser storage removes
this local history, and it does not sync between browsers or devices. The current API
only returns individual tasks; shared history would require backend project/history storage.
All existing task, approval, continuation, and deployment API routes remain unchanged.

The last live branch, commit, and URL remain visible while updates are built or fail.
An inherited deployment does not mark a new revision as deployed. The frontend uses
the existing deployment endpoint for both Deploy and Deploy Update.

View Changes opens a review panel and lazily requests `/api/tasks/[id]/changes`.
The server-side proxy forwards to the backend's authenticated `/tasks/:id/changes`
using `NENE_BACKEND_URL` and `NENE_API_TOKEN`; the token is never exposed to the browser.
Initial builds are labeled Initial build. Continuations compare against their recorded
approved source, with expandable added/modified/deleted files and colored unified
patches. Binary files, oversized patches, omitted files, and partial line counts are
explicitly labeled. Source code renders as text, with horizontal scrolling.

Loading, retry, and no-changes states are supported. Close, navigation, or a new run
aborts the request and discards the loaded review; diff content is not stored in browser
history. Approve uses the existing action and remains separate from review. Published
builds retain View revision in the conversation. View Code links to GitHub after
publication. Optional task `summary` and `error` strings remain in the conversation.

Install and activate the backend endpoint before deploying this frontend update. No
new environment variables or packages are required. If the backend still runs the old
version, View Changes shows a retryable error; build/approval/deployment remain available.

Run project lifecycle regression checks with `npm test`, lint with `npm run lint`,
and the production build with `npm run build`. In environments where Turbopack cannot
open an internal worker port, use `npm run build -- --webpack`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Sentry error monitoring

The frontend uses `@sentry/nextjs` 11 via Next's instrumentation hooks. Configure `SENTRY_DSN` (server) and `NEXT_PUBLIC_SENTRY_DSN` (browser) in private `.env.local` and in the frontend hosting environment, using `.env.example` as the field list. The browser DSN is a public ingestion address; API authentication tokens must remain server-only. Runtime telemetry does not require a Sentry API auth token.

Browser exceptions, rendering errors, server request errors, and unexpected API failures are captured. Prompts, generated code, request data, user information, console breadcrumbs, and source context are removed. Expected 4xx responses and cancelled requests are excluded; repeated API failures are capped at five per route category per 15 minutes.

Frontend performance tracing, session replay and source-map uploads are disabled for this bootstrap. Backend agent traces are documented in the backend repository's `docs/SENTRY-AGENT-TRACING.md`. Redeploy the frontend after setting its Sentry environment variables; `NEXT_PUBLIC_` values are embedded during the build.

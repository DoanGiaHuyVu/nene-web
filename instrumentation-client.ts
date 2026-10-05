import * as Sentry from "@sentry/nextjs";
import { privacy, sanitizeFrontendEvent } from "./sentry.options";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "production",
  tracesSampleRate: 0, maxBreadcrumbs: 0, dataCollection: privacy,
  defaultIntegrations: false,
  integrations: [Sentry.globalHandlersIntegration(), Sentry.browserApiErrorsIntegration(), Sentry.dedupeIntegration()],
  beforeSend: sanitizeFrontendEvent, initialScope: { tags: { "service.name": "nene-frontend" } },
});

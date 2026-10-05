import * as Sentry from "@sentry/nextjs";
import { privacy, sanitizeFrontendEvent } from "./sentry.options";

if (process.env.SENTRY_DSN) Sentry.init({
  dsn: process.env.SENTRY_DSN, environment: process.env.SENTRY_ENVIRONMENT ?? "production",
  tracesSampleRate: 0, maxBreadcrumbs: 0, dataCollection: privacy, includeServerName: false,
  defaultIntegrations: false,
  integrations: [Sentry.onUncaughtExceptionIntegration(), Sentry.onUnhandledRejectionIntegration()],
  beforeSend: sanitizeFrontendEvent, initialScope: { tags: { "service.name": "nene-frontend-server" } },
});

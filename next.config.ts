import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {};
export default withSentryConfig(nextConfig, {
  org: "concordia-university-00", silent: true, telemetry: false,
  sourcemaps: { disable: true },
});

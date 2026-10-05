import * as Sentry from "@sentry/nextjs";

const budgets = new Map<string, { until: number; count: number }>();
function routeCategory(path: string): string {
  if (path === "/api/tasks") return "create";
  const action = /^\/api\/tasks\/[^/]+(?:\/(continue|approve|deploy|changes))?$/.exec(path);
  return action ? action[1] ?? "status" : "other";
}
export function reportApiFailure(path: string, status = 0) {
  try {
  if (!Sentry.getClient()) return;
  const category = routeCategory(path);
  let budget = budgets.get(category);
  if (!budget || budget.until < Date.now()) { budget = { until: Date.now() + 900_000, count: 0 }; budgets.set(category, budget); }
  if (budget.count++ >= 5) return;
  Sentry.withScope(scope => {
    scope.setTags({ "service.name": "nene-frontend", "nene.operation": "API request", "nene.api.route": category, "http.response.status_code": status });
    scope.setFingerprint(["ne-ne frontend", category, String(status)]);
    Sentry.captureException(new Error("ne-ne API request failed"));
  });
  } catch { /* Observability must not affect a user request. */ }
}
export async function monitoredFetch(path: string, init?: RequestInit) {
  try {
    const response = await fetch(path, init);
    if (response.status >= 500) reportApiFailure(path, response.status);
    return response;
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) reportApiFailure(path);
    throw error;
  }
}

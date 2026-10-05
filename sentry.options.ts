import type { Event } from "@sentry/nextjs";

const allowed = new Set(["service.name", "nene.operation", "nene.api.route", "http.response.status_code"]);
export function sanitizeFrontendEvent<T extends Event>(event: T): T {
  delete event.request; delete event.user; delete event.extra; delete event.breadcrumbs; delete event.server_name;
  delete event.modules; delete event.logentry; delete event.threads; delete event.contexts;
  event.message = undefined;
  event.tags = Object.fromEntries(Object.entries(event.tags ?? {}).filter(([key]) => allowed.has(key)));
  for (const exception of event.exception?.values ?? []) {
    exception.type = /^(Error|TypeError|RangeError|SyntaxError)$/.test(exception.type ?? "") ? exception.type : "Error";
    exception.value = "ne-ne frontend operation failed; inspect the stack and operation";
    for (const frame of exception.stacktrace?.frames ?? []) {
      delete frame.vars; delete frame.pre_context; delete frame.post_context; delete frame.context_line;
      frame.abs_path = undefined; frame.filename = frame.filename?.split("?")[0];
    }
  }
  return event;
}
export const privacy = { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false,
  graphQL: { document: false, variables: false }, genAI: { inputs: false, outputs: false },
  databaseQueryData: false, queues: false, stackFrameVariables: false, frameContextLines: 0 };

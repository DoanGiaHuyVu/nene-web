export type ProgressStage =
  | "planning"
  | "creating_project"
  | "coding"
  | "testing"
  | "waiting_for_approval"
  | "completed";

export type Task = {
  id: string;
  prompt: string;
  status: string;
  progress: ProgressStage;
  updatedAt: string;
  error?: string;
  summary?: string;
  diff?: string;
  github?: { branch: string; url: string; commit: string };
  deployment?: {
    provider: "render";
    status: "creating" | "building" | "live" | "failed";
    serviceId?: string;
    deployId?: string;
    url?: string;
    dashboardUrl?: string;
    error?: string;
  };
};

export type ConversationEvent = {
  key: string;
  label: string;
  detail?: string;
  url?: string;
};

export type ProjectRun = {
  id: string;
  prompt: string;
  isUpdate: boolean;
  createdAt: string;
  baseTaskId?: string;
  task?: Task;
  error?: string;
  approved?: boolean;
  deploymentRequested?: boolean;
  events: ConversationEvent[];
};

export type LiveVersion = {
  taskId: string;
  branch?: string;
  commit?: string;
  url: string;
  deployId?: string;
};

export type Project = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  runs: ProjectRun[];
  lastSuccessfulTask?: Task;
  liveVersion?: LiveVersion;
};

export const STORAGE_KEY = "nene-projects-v1";

export const stageKeys: ProgressStage[] = [
  "planning", "creating_project", "coding", "testing", "waiting_for_approval",
];

export function stageLabels(isUpdate: boolean) {
  return isUpdate
    ? ["Loading existing project", "Understanding codebase", "Making changes", "Testing", "Ready for approval"]
    : ["Planning", "Creating project", "Writing code", "Testing", "Ready for approval"];
}

export function failed(run: ProjectRun) {
  return !!run.error || ["failed", "error", "cancelled"].includes(run.task?.status ?? "");
}

export function ready(task?: Task) {
  return task?.status === "waiting_for_approval" || task?.progress === "waiting_for_approval";
}

export function completed(task?: Task) {
  return task?.status === "completed" || task?.progress === "completed";
}

export function building(run: ProjectRun) {
  return !failed(run) && !ready(run.task) && !completed(run.task);
}

export function projectStatus(project: Project) {
  const run = project.runs.at(-1);
  if (!run) return "Building";
  if (failed(run)) return run.isUpdate ? "Update failed" : "Build failed";
  if (building(run) || ["creating", "building"].includes(run.task?.deployment?.status ?? "")) return "Building";
  if (ready(run.task)) return "Waiting for approval";
  if (run.task?.deployment?.status === "failed") return "Update failed";
  if (project.liveVersion?.taskId === run.task?.id && project.liveVersion?.commit === run.task?.github?.commit) return "Live";
  return "Ready to deploy";
}

export function continuationBase(project: Project) {
  // Only published code can be continued on the existing branch.
  const run = [...project.runs].reverse().find((item) => !failed(item) && completed(item.task) && item.task?.github);
  return run?.task;
}

export function newProject(task: Task): Project {
  const date = task.updatedAt || new Date().toISOString();
  const project: Project = {
    id: task.id,
    title: task.prompt.replace(/^build me (an?|the)?\s*/i, "").replace(/\.$/, "") || "Untitled project",
    createdAt: date,
    updatedAt: date,
    runs: [{ id: task.id, prompt: task.prompt, isUpdate: false, createdAt: date, events: [] }],
  };
  return updateRun(project, task.id, { task });
}

export function appendRun(project: Project, run: ProjectRun): Project {
  return { ...project, updatedAt: run.createdAt, runs: [...project.runs, run] };
}

export function updateRun(project: Project, runId: string, patch: Partial<ProjectRun>): Project {
  const previous = project.runs.find((run) => run.id === runId);
  if (!previous) return project;
  const run = { ...previous, ...patch };
  if (run.isUpdate && !run.deploymentRequested && run.task?.deployment) {
    const baseDeployment = [...project.runs].reverse().find((item) => item.id !== runId && item.task?.id === run.baseTaskId)?.task?.deployment;
    const deployment = run.task.deployment;
    const inherited = baseDeployment && (deployment.deployId
      ? deployment.deployId === baseDeployment.deployId
      : deployment.serviceId === baseDeployment.serviceId && deployment.url === baseDeployment.url);
    if (inherited) run.task = { ...run.task, deployment: undefined };
  }
  const task = run.task;
  const events = [...run.events];
  function add(event: ConversationEvent) {
    if (!events.some((item) => item.key === event.key)) events.push(event);
  }
  if (run.approved || (completed(task) && task?.github && !failed(run))) {
    add({ key: "approved", label: "Changes approved" });
  }
  if (task?.github && completed(task) && !failed(run)) {
    add({ key: `github:${task.github.commit}`, label: "Published to GitHub", detail: task.github.branch, url: task.github.url });
  }
  if (run.deploymentRequested) add({ key: "deploying", label: "Deployment started" });
  const deployment = task?.deployment;
  let liveVersion = project.liveVersion;
  // A continuation can inherit the old live deployment. It is live only after
  // a new deployment, never just because the new build was published.
  const newDeployment = deployment?.deployId && deployment.deployId !== liveVersion?.deployId;
  const observedDeployment = run.deploymentRequested || previous.task?.deployment?.status === "building" || previous.task?.deployment?.status === "creating";
  if (task && deployment?.status === "live" && deployment.url && !failed(run) && (!liveVersion || newDeployment || observedDeployment)) {
    liveVersion = { taskId: task.id, branch: task.github?.branch, commit: task.github?.commit, url: deployment.url, deployId: deployment.deployId };
    add({ key: `live:${deployment.deployId ?? task.github?.commit ?? task.id}`, label: "Deployment live", detail: deployment.url, url: deployment.url });
  }
  if (deployment?.status === "failed") {
    add({ key: `deployment-failed:${deployment.deployId ?? "latest"}`, label: "Deployment failed", detail: deployment.error });
  }
  return {
    ...project,
    updatedAt: task?.updatedAt || project.updatedAt,
    runs: project.runs.map((item) => item.id === runId ? { ...run, events } : item),
    lastSuccessfulTask: task && !failed(run) && completed(task) && task.github ? task : project.lastSuccessfulTask,
    liveVersion,
  };
}

export function isTask(value: unknown): value is Task {
  if (!value || typeof value !== "object") return false;
  const task = value as Partial<Task>;
  return typeof task.id === "string" && typeof task.prompt === "string" && typeof task.status === "string" && typeof task.progress === "string";
}

export function readProjects(value: string | null): Project[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Project =>
      !!item && typeof item.id === "string" && typeof item.title === "string" && typeof item.updatedAt === "string" && Array.isArray(item.runs) &&
      item.runs.every((run: ProjectRun) => !!run && typeof run.id === "string" && typeof run.prompt === "string" && Array.isArray(run.events))
    ).map((project) => ({
      ...project,
      runs: project.runs.map((run) => !run.task && !run.error
        ? { ...run, error: "The request was interrupted before the build was received. Please retry." }
        : run),
    }));
  } catch {
    return [];
  }
}

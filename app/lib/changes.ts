export type FileChange = {
  path: string;
  status: "added" | "modified" | "deleted";
  additions: number;
  deletions: number;
  patch?: string;
  binary?: boolean;
  symlink?: boolean;
  truncated?: boolean;
  countsComplete: boolean;
  reason?: "large_file" | "patch_limit" | "response_limit" | "file_limit";
};
export type Changes = {
  taskId: string;
  baseTaskId?: string;
  initialBuild: boolean;
  summary: { filesChanged: number; additions: number; deletions: number; countsComplete: boolean };
  files: FileChange[];
  truncated: boolean;
  omittedFiles: number;
};

export function isChanges(value: unknown): value is Changes {
  if (!value || typeof value !== "object") return false;
  const data = value as Changes;
  return typeof data.taskId === "string" && typeof data.initialBuild === "boolean" &&
    typeof data.summary?.filesChanged === "number" && typeof data.summary.additions === "number" &&
    typeof data.summary.deletions === "number" && typeof data.summary.countsComplete === "boolean" &&
    Array.isArray(data.files) && data.files.every(file => typeof file.path === "string" &&
      ["added", "modified", "deleted"].includes(file.status) && typeof file.additions === "number" &&
      typeof file.deletions === "number" && typeof file.countsComplete === "boolean" &&
      (file.patch === undefined || typeof file.patch === "string")) && typeof data.omittedFiles === "number";
}

export async function loadChanges(taskId: string, signal: AbortSignal): Promise<Changes> {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/changes`, { cache: "no-store", signal });
  const data: unknown = await response.json();
  if (!response.ok) throw new Error("Could not load changes.");
  if (!isChanges(data) || data.taskId !== taskId) throw new Error("Could not load changes.");
  return data;
}

export function patchLineClass(line: string) {
  if (line.startsWith("+")) return "bg-green-950/40 text-green-300";
  if (line.startsWith("-")) return "bg-red-950/40 text-red-300";
  if (line.startsWith("@@")) return "text-sky-300";
  return "text-neutral-400";
}

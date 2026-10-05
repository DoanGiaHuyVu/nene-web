"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { monitoredFetch, reportApiFailure } from "./lib/observability";
import { ChangesPanel } from "./components/changes-panel";
import {
  appendRun, building, completed, continuationBase, failed, isTask,
  newProject, projectStatus, readProjects, ready, stageKeys, stageLabels,
  STORAGE_KEY, updateRun,
  type Project, type ProjectRun, type Task,
} from "./lib/projects";

const primary = "rounded-xl bg-white px-4 py-3 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40";
const secondary = "rounded-xl border border-neutral-700 px-4 py-3 text-center text-sm font-medium text-neutral-200 transition hover:border-neutral-500 hover:text-white disabled:opacity-40";

async function requestTask(path: string, prompt?: string): Promise<Task> {
  const response = await monitoredFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(prompt === undefined ? {} : { body: JSON.stringify({ prompt }) }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "The request failed. Please try again.");
  if (!isTask(data)) {
    reportApiFailure(path, response.status);
    throw new Error("The project response was incomplete. Please reopen the project to check its status.");
  }
  return data;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className={secondary}>{children}</a>;
}

function Status({ label }: { label: string }) {
  return <span className={`inline-flex items-center gap-2 rounded-full border border-neutral-800 px-3 py-1 text-xs ${label.includes("failed") ? "text-red-400" : "text-neutral-300"}`}>
    <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${label === "Live" ? "bg-green-400" : label.includes("failed") ? "bg-red-400" : "bg-neutral-400"}`} />
    {label}
  </span>;
}

function Progress({ run }: { run: ProjectRun }) {
  const index = completed(run.task) ? stageKeys.length : stageKeys.indexOf(run.task?.progress ?? "planning");
  return <ol className="mt-4 grid gap-2 text-sm" aria-label={run.isUpdate ? "Update progress" : "Build progress"}>
    {stageLabels(run.isUpdate).map((label, position) => <li key={label} className={`flex items-center gap-3 ${position === index ? "text-white" : position < index ? "text-neutral-400" : "text-neutral-600"}`}>
      <span aria-hidden="true" className="w-4 text-center">{position < index ? "✓" : position === index ? "●" : "○"}</span>
      {label}
      {position === index && <span className="sr-only"> — current step</span>}
    </li>)}
  </ol>;
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const projectsRef = useRef<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [prompt, setPrompt] = useState("Build me a restaurant voting app");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<{ projectId?: string; kind: string } | null>(null);
  const pendingRef = useRef(false);
  const operationEpoch = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState(false);
  const [reviewRunId, setReviewRunId] = useState<string | null>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const keepAtBottom = useRef(true);

  const saveProjects = useCallback((next: Project[]) => {
    projectsRef.current = next;
    setProjects(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      setStorageWarning(true);
    }
  }, []);

  const changeProject = useCallback((projectId: string, change: (project: Project) => Project) => {
    saveProjects(projectsRef.current.map((project) => project.id === projectId ? change(project) : project));
  }, [saveProjects]);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      let stored: Project[] = [];
      let legacyId: string | null = null;
      try {
        stored = readProjects(localStorage.getItem(STORAGE_KEY));
        legacyId = localStorage.getItem("nene-task-id");
      } catch {
        setStorageWarning(true);
      }
      if (legacyId && !stored.some((project) => project.runs.some((run) => run.task?.id === legacyId))) {
        try {
          const response = await monitoredFetch(`/api/tasks/${encodeURIComponent(legacyId)}`);
          const data = await response.json();
          if (response.ok && isTask(data)) stored.push(newProject(data));
        } catch {
          // Keep the legacy ID so a temporary outage doesn't erase the project.
        }
      }
      if (cancelled) return;
      saveProjects(stored);
      const requestedId = new URLSearchParams(window.location.search).get("project");
      setActiveId(stored.some((project) => project.id === requestedId) ? requestedId : null);
      setHydrated(true);
      // Refresh Home cards without replacing their saved history or live version.
      await Promise.allSettled(stored.map(async (project) => {
        const run = project.runs.at(-1);
        if (!run?.task) return;
        const epoch = operationEpoch.current;
        const response = await monitoredFetch(`/api/tasks/${encodeURIComponent(run.task.id)}`);
        const data = await response.json();
        if (!cancelled && epoch === operationEpoch.current && response.ok && isTask(data)) changeProject(project.id, (current) => updateRun(current, run.id, { task: data }));
      }));
    }
    void restore();
    const onPopState = () => {
      const id = new URLSearchParams(window.location.search).get("project");
      setActiveId(projectsRef.current.some((project) => project.id === id) ? id : null);
      setReviewRunId(null);
      setError(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => { cancelled = true; window.removeEventListener("popstate", onPopState); };
  }, [changeProject, saveProjects]);

  const project = projects.find((item) => item.id === activeId);
  const currentRun = project?.runs.at(-1);
  const taskId = currentRun?.task?.id;
  const runId = currentRun?.id;
  const busy = !!pending && pending.projectId === activeId;
  const live = project?.liveVersion;
  const base = project ? continuationBase(project) : undefined;
  const canSend = !!project && !!base && !!currentRun && !building(currentRun) &&
    (failed(currentRun) || !ready(currentRun.task) && !["creating", "building"].includes(currentRun.task?.deployment?.status ?? "")) && !pending;
  const draft = activeId ? drafts[activeId] ?? "" : "";

  useEffect(() => {
    if (!hydrated) return;
    const inFlight = new Set<string>();
    const interval = window.setInterval(() => {
      if (pendingRef.current) return;
      for (const item of projectsRef.current) {
        const run = item.runs.at(-1);
        if (!run?.task || inFlight.has(run.id)) continue;
        const deploymentPending = ["creating", "building"].includes(run.task.deployment?.status ?? "");
        if (!building(run) && !ready(run.task) && !deploymentPending && !(completed(run.task) && !run.task.github)) continue;
        inFlight.add(run.id);
        const epoch = operationEpoch.current;
        void monitoredFetch(`/api/tasks/${encodeURIComponent(run.task.id)}`)
          .then(async (response) => {
            const data = await response.json();
            if (!stopped && epoch === operationEpoch.current && response.ok && isTask(data)) {
              changeProject(item.id, (current) => updateRun(current, run.id, { task: data }));
            }
          })
          .catch(() => { /* Recover on the next poll without losing history. */ })
          .finally(() => inFlight.delete(run.id));
      }
    }, 3000);
    let stopped = false;
    return () => { stopped = true; window.clearInterval(interval); };
  }, [hydrated, changeProject]);

  useEffect(() => {
    if (!activeId || !taskId || !runId) return;
    let cancelled = false;
    let fetching = false;
    async function refresh() {
      if (fetching || pendingRef.current) return;
      fetching = true;
      const epoch = operationEpoch.current;
      try {
        const response = await monitoredFetch(`/api/tasks/${encodeURIComponent(taskId!)}`);
        const data = await response.json();
        if (!cancelled && epoch === operationEpoch.current && response.ok && isTask(data)) {
          changeProject(activeId!, (current) => updateRun(current, runId!, { task: data }));
        }
      } catch {
        // Polling also recovers missed SSE events and deployment transitions.
      } finally { fetching = false; }
    }
    void refresh();
    const source = new EventSource(`/api/tasks/${encodeURIComponent(taskId)}/events`);
    source.onmessage = (event) => {
      if (cancelled) return;
      try {
        const message = JSON.parse(event.data);
        if (message.type === "task:progress" && stageKeys.includes(message.data?.stage)) {
          changeProject(activeId, (current) => {
            const run = current.runs.find((item) => item.id === runId);
            if (!run?.task || completed(run.task) || failed(run)) return current;
            return updateRun(current, runId, { task: { ...run.task, progress: message.data.stage, status: message.data.stage === "waiting_for_approval" ? "waiting_for_approval" : run.task.status } });
          });
        }
        // Fetch the complete result, including publication details and errors.
        void refresh();
      } catch {
        // Ignore malformed events; the next poll reads the authoritative task.
      }
    };
    return () => { cancelled = true; source.close(); };
  }, [activeId, taskId, runId, changeProject]);

  useEffect(() => {
    keepAtBottom.current = true;
    conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight, behavior: "smooth" });
  }, [activeId, project?.runs.length]);

  const conversationState = `${currentRun?.task?.progress}:${currentRun?.task?.status}:${currentRun?.error}:${currentRun?.events.length}`;
  useEffect(() => {
    if (keepAtBottom.current) conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight, behavior: "smooth" });
  }, [conversationState]);

  function navigate(id: string | null) {
    setActiveId(id);
    setReviewRunId(null);
    setError(null);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("project", id);
    else url.searchParams.delete("project");
    window.history.pushState(null, "", url);
  }

  async function startProject() {
    if (pendingRef.current || !prompt.trim()) return;
    pendingRef.current = true;
    operationEpoch.current += 1;
    setPending({ kind: "start" });
    setError(null);
    try {
      const task = await requestTask("/api/tasks", prompt.trim());
      const next = newProject(task);
      saveProjects([next, ...projectsRef.current.filter((item) => item.id !== next.id)]);
      navigate(next.id);
    } catch (err) { setError(errorMessage(err)); }
    finally { pendingRef.current = false; setPending(null); }
  }

  async function sendInstruction(instruction = draft, retryRun?: ProjectRun) {
    if (!project || !canSend || pendingRef.current || !instruction.trim()) return;
    const baseTaskId = retryRun?.baseTaskId ?? base?.id;
    if (!baseTaskId) return;
    const projectId = project.id;
    const nextRun: ProjectRun = {
      id: crypto.randomUUID(), prompt: instruction.trim(), isUpdate: true,
      createdAt: new Date().toISOString(), baseTaskId, events: [],
    };
    pendingRef.current = true;
    operationEpoch.current += 1;
    setPending({ projectId, kind: "send" });
    setError(null);
    setReviewRunId(null);
    changeProject(projectId, (current) => appendRun(current, nextRun));
    setDrafts((current) => ({ ...current, [projectId]: "" }));
    try {
      const task = await requestTask(`/api/tasks/${encodeURIComponent(baseTaskId)}/continue`, nextRun.prompt);
      changeProject(projectId, (current) => updateRun(current, nextRun.id, { task }));
    } catch (err) {
      changeProject(projectId, (current) => updateRun(current, nextRun.id, { error: errorMessage(err) }));
    } finally { pendingRef.current = false; setPending(null); }
  }

  async function retryBuild(run: ProjectRun) {
    if (!project || pendingRef.current) return;
    const projectId = project.id;
    const nextRun: ProjectRun = {
      id: crypto.randomUUID(), prompt: run.prompt, isUpdate: false,
      createdAt: new Date().toISOString(), events: [],
    };
    pendingRef.current = true;
    operationEpoch.current += 1;
    setPending({ projectId, kind: "send" });
    setReviewRunId(null);
    changeProject(projectId, (current) => appendRun(current, nextRun));
    try {
      const task = await requestTask("/api/tasks", run.prompt);
      changeProject(projectId, (current) => updateRun(current, nextRun.id, { task }));
    } catch (err) {
      changeProject(projectId, (current) => updateRun(current, nextRun.id, { error: errorMessage(err) }));
    } finally { pendingRef.current = false; setPending(null); }
  }

  async function runAction(kind: "approve" | "deploy") {
    if (!project || !currentRun?.task || pendingRef.current) return;
    const projectId = project.id;
    const actionRun = currentRun;
    pendingRef.current = true;
    operationEpoch.current += 1;
    setPending({ projectId, kind });
    setError(null);
    try {
      const task = await requestTask(`/api/tasks/${encodeURIComponent(actionRun.task!.id)}/${kind}`);
      changeProject(projectId, (current) => updateRun(current, actionRun.id, {
        task, ...(kind === "approve" ? { approved: true } : { deploymentRequested: true }),
      }));
      if (kind === "approve") setReviewRunId(null);
    } catch (err) {
      const detail = errorMessage(err);
      changeProject(projectId, (current) => {
        const run = current.runs.find((item) => item.id === actionRun.id)!;
        return updateRun(current, run.id, { events: [...run.events, { key: crypto.randomUUID(), label: kind === "approve" ? "Approval failed" : "Deployment failed", detail }] });
      });
    } finally { pendingRef.current = false; setPending(null); }
  }

  const header = <header className="flex items-center justify-between gap-4">
    <button onClick={() => navigate(null)} className="text-sm font-medium text-neutral-400 hover:text-white" aria-label="ne-ne Home">ne-ne</button>
    <nav className="flex gap-4 text-sm text-neutral-500">
      {project && <button onClick={() => navigate(null)} className="hover:text-white">Projects</button>}
      <button onClick={() => { navigate(null); setPrompt(""); }} className="hover:text-white">Start a new project</button>
    </nav>
  </header>;

  if (!project) return <main className="min-h-dvh bg-neutral-950 px-5 py-6 text-white sm:py-10">
    <div className="mx-auto max-w-2xl">
      {header}
      <h1 className="mt-10 text-3xl font-semibold tracking-tight">What do you want to build?</h1>
      <form onSubmit={(event) => { event.preventDefault(); void startProject(); }} className="mt-6">
        <label htmlFor="new-project" className="sr-only">Describe your new project</label>
        <textarea id="new-project" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe your idea..." className="min-h-32 w-full resize-y rounded-2xl border border-neutral-800 bg-neutral-900 p-4 outline-none placeholder:text-neutral-600 focus:border-neutral-500" />
        <button disabled={!hydrated || !!pending || !prompt.trim()} className={`${primary} mt-3 w-full`}>{pending?.kind === "start" ? "Starting..." : "Start a new project"}</button>
      </form>
      {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
      {storageWarning && <p role="alert" className="mt-4 text-sm text-neutral-400">Browser storage is unavailable. Keep this page open to retain your conversation.</p>}
      <section className="mt-10" aria-labelledby="recent-projects">
        <h2 id="recent-projects" className="text-sm font-medium text-neutral-400">Recent projects</h2>
        {!hydrated ? <p className="mt-4 text-sm text-neutral-500">Loading projects...</p> : !projects.length ? <p className="mt-4 text-sm text-neutral-500">Your projects will appear here.</p> : <div className="mt-4 space-y-3">
          {[...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((item) => {
            const successful = item.lastSuccessfulTask;
            const branch = item.liveVersion?.branch ?? successful?.github?.branch;
            return <article key={item.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="min-w-0 break-words text-lg font-medium">{item.title}</h3><Status label={projectStatus(item)} /></div>
              {branch && <p className="mt-3 break-all font-mono text-xs text-neutral-500">{branch}</p>}
              {item.liveVersion && <a href={item.liveVersion.url} target="_blank" rel="noopener noreferrer" className="mt-2 block break-all text-sm text-neutral-400 hover:text-white">{item.liveVersion.url}</a>}
              <div className="mt-5 flex flex-wrap gap-2">
                <button onClick={() => navigate(item.id)} className={primary}>Open Project</button>
                {item.liveVersion ? <ExternalLink href={item.liveVersion.url}>Open App</ExternalLink> : successful?.github && <ExternalLink href={successful.github.url}>View Code</ExternalLink>}
              </div>
            </article>;
          })}
        </div>}
      </section>
    </div>
  </main>;

  const deploying = ["creating", "building"].includes(currentRun?.task?.deployment?.status ?? "") || busy && pending?.kind === "deploy";
  const currentIsLive = !!live && live.taskId === currentRun?.task?.id && live.commit === currentRun?.task?.github?.commit;

  return <main className="flex h-dvh flex-col bg-neutral-950 text-white">
    <div className="mx-auto w-full max-w-2xl shrink-0 px-5 pb-4 pt-5 sm:pt-8">
      {header}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight sm:text-3xl">{project.title}</h1>
        <Status label={projectStatus(project)} />
      </div>
      {live && <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-900/50 p-3 text-xs text-neutral-400">
        <div className="flex items-center justify-between gap-3"><span className="text-green-400">● Live</span><a href={live.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-neutral-200 hover:text-white">Open App ↗</a></div>
        {live.branch && <p className="mt-2 break-all font-mono">{live.branch}{live.commit && <span className="ml-2 text-neutral-600">{live.commit.slice(0, 7)}</span>}</p>}
        <a href={live.url} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all hover:text-white">{live.url}</a>
      </div>}
    </div>
    <div ref={conversationRef} onScroll={(event) => {
      const element = event.currentTarget;
      keepAtBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
    }} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" role="log" aria-label="Project conversation">
      <div className="mx-auto max-w-2xl space-y-6 px-5 pb-6 pt-2">
        {project.runs.map((run) => {
          const latest = run.id === currentRun?.id;
          const isFailed = failed(run);
          const isReady = ready(run.task) && !isFailed;
          return <section key={run.id} className="space-y-3" aria-label={run.isUpdate ? "Project update" : "Initial build"}>
            <div className="ml-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:ml-12">
              <p className="mb-2 text-xs text-neutral-500">You</p>
              <p className="whitespace-pre-wrap break-words text-sm leading-6">{run.prompt}</p>
            </div>
            <article className="rounded-2xl border border-neutral-800 p-4 sm:p-5">
              <p className="mb-2 text-xs text-neutral-500">ne-ne</p>
              {isFailed ? <>
                <h2 className="font-medium text-red-400">{run.isUpdate ? "Update failed" : "Build failed"}</h2>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-neutral-400">{run.error || run.task?.error || "The build could not finish. Please try again."}</p>
                {latest && <button onClick={() => run.isUpdate ? void sendInstruction(run.prompt, run) : void retryBuild(run)} disabled={run.isUpdate ? !canSend : !!pending} className={`${secondary} mt-4`}>Retry</button>}
              </> : <>
                <h2 className="font-medium">{isReady ? "Ready for approval" : completed(run.task) ? run.isUpdate ? "Update complete" : "Build complete" : run.isUpdate ? "Updating your project" : "Building your project"}</h2>
                {run.task?.summary && <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-400">{run.task.summary}</p>}
                {(!completed(run.task) || reviewRunId === run.id) && <Progress run={run} />}
                {isReady && latest && <div className="mt-5 flex flex-wrap gap-2">
                  <button onClick={() => setReviewRunId(reviewRunId === run.id ? null : run.id)} className={secondary} aria-expanded={reviewRunId === run.id}>View Changes</button>
                  <button onClick={() => void runAction("approve")} disabled={busy} className={primary}>{busy && pending?.kind === "approve" ? "Approving..." : "Approve"}</button>
                </div>}
                {reviewRunId === run.id && run.task && <ChangesPanel key={run.task.id} taskId={run.task.id} isUpdate={run.isUpdate}
                  onClose={() => setReviewRunId(null)} onApprove={isReady && latest ? () => void runAction("approve") : undefined}
                  approving={busy && pending?.kind === "approve"} disabled={!!pending} /> }
                {completed(run.task) && run.task?.github && <div className="mt-5 flex flex-wrap gap-2">
                  <button onClick={() => setReviewRunId(reviewRunId === run.id ? null : run.id)} className={secondary} aria-expanded={reviewRunId === run.id}>View revision</button>
                  <ExternalLink href={run.task.github.url}>View Code</ExternalLink>
                  {latest && !currentIsLive && <button onClick={() => void runAction("deploy")} disabled={busy || deploying} className={primary}>{deploying ? "Deploying..." : live ? "Deploy Update" : "Deploy"}</button>}
                  {latest && live && <ExternalLink href={live.url}>Open App</ExternalLink>}
                </div>}
              </>}
              {run.events.length > 0 && <ol className="mt-5 space-y-3 border-t border-neutral-800 pt-4">
                {run.events.map((event) => <li key={event.key} className="text-sm">
                  <p className={event.label.includes("failed") ? "text-red-400" : "text-neutral-300"}>{event.label}</p>
                  {event.detail && (event.url ? <a href={event.url} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-xs text-neutral-500 hover:text-white">{event.detail}</a> : <p className="mt-1 whitespace-pre-wrap break-words text-xs text-neutral-500">{event.detail}</p>)}
                </li>)}
              </ol>}
            </article>
          </section>;
        })}
      </div>
    </div>
    <div className="shrink-0 border-t border-neutral-800 bg-neutral-950 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <form className="mx-auto max-w-2xl" onSubmit={(event) => { event.preventDefault(); void sendInstruction(); }}>
        <label htmlFor="project-message" className="sr-only">Message ne-ne about this project</label>
        <div className="flex items-end gap-3 rounded-2xl border border-neutral-700 bg-neutral-900 p-3 focus-within:border-neutral-500">
          <textarea id="project-message" rows={2} value={draft} onChange={(event) => setDrafts((current) => ({ ...current, [project.id]: event.target.value }))} placeholder="What would you like to change?" className="max-h-32 min-h-12 flex-1 resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-neutral-500" />
          <button disabled={!canSend || !draft.trim()} className={primary}>{busy && pending?.kind === "send" ? "Sending..." : "Send"}</button>
        </div>
        <p className="mt-2 text-xs text-neutral-500">{storageWarning ? "Browser storage is unavailable. Keep this page open to retain your conversation." : busy ? "Working on your project..." : ready(currentRun?.task) && currentRun && !failed(currentRun) ? "Approve these changes before sending another instruction." : currentRun && building(currentRun) ? "You can write your next instruction while ne-ne works." : deploying ? "Your deployment is in progress. You can write your next instruction here." : !base ? "Your message input stays here. Approve the build to keep working on this project." : "Keep working in this project conversation."}</p>
      </form>
    </div>
  </main>;
}

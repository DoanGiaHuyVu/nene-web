"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

type ProgressStage =
  | "planning"
  | "creating_project"
  | "coding"
  | "testing"
  | "waiting_for_approval"
  | "completed";

type Task = {
  id: string;
  prompt: string;
  status: string;
  progress: ProgressStage;

  github?: {
    branch: string;
    url: string;
    commit: string;
  };
};

const stages: Array<{
  key: ProgressStage;
  label: string;
}> = [
  {
    key: "planning",
    label: "Planning",
  },
  {
    key: "creating_project",
    label: "Creating project",
  },
  {
    key: "coding",
    label: "Writing code",
  },
  {
    key: "testing",
    label: "Testing",
  },
  {
    key: "waiting_for_approval",
    label: "Ready for approval",
  },
];

const stageOrder: Record<
  ProgressStage,
  number
> = {
  planning: 0,
  creating_project: 1,
  coding: 2,
  testing: 3,
  waiting_for_approval: 4,
  completed: 5,
};

export default function Home() {
  const [prompt, setPrompt] =
    useState(
      "Build me a restaurant voting app"
    );

  const [savedTaskId, setSavedTaskId] =
    useState<string | null>(null);

  const [task, setTask] =
    useState<Task | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const currentIndex =
    task
      ? stageOrder[task.progress]
      : -1;

  const title = useMemo(() => {
    
    if (!task) {
      return "";
    }

    return task.prompt
      .replace(
        /^build me (an?|the)?\s*/i,
        ""
      )
      .replace(/\.$/, "");
  }, [task]);

  async function startTask() {
    setLoading(true);
    setError(null);

    try {
      const response =
        await fetch(
          "/api/tasks",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              prompt,
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ??
            "Failed to start task"
        );
      }

      setTask(data);

      localStorage.setItem(
        "nene-task-id",
        data.id
      );
      setSavedTaskId(data.id);

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong"
      );
    } finally {
      setLoading(false);
    }
  }

  async function approveTask() {
    if (!task) {
      return;
    }

    const response =
      await fetch(
        `/api/tasks/${task.id}/approve`,
        {
          method: "POST",
        }
      );

    const data =
      await response.json();

    setTask(data);
  }

  function goHome() {
    setTask(null);
    setError(null);
  }

  async function resumeTask() {
    if (!savedTaskId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response =
        await fetch(
          `/api/tasks/${savedTaskId}`
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ??
            "Failed to resume task"
        );
      }

      setTask(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not resume task"
      );
    } finally {
      setLoading(false);
    }
  }

  function resetTask() {
    localStorage.removeItem("nene-task-id");

    setTask(null);
    setPrompt("");
    setError(null);
  }

  // useEffect(() => {
  //   const savedId =
  //     localStorage.getItem(
  //       "nene-task-id"
  //     );

  //   setSavedTaskId(savedId);

  //   if (!savedId) {
  //     return;
  //   }

  //   fetch(`/api/tasks/${savedId}`)
  //     .then((response) => {
  //       if (!response.ok) {
  //         throw new Error(
  //           "Stored task not found"
  //         );
  //       }

  //       return response.json();
  //     })
  //     .then((data) => {
  //       setTask(data);
  //     })
  //     .catch(() => {
  //       localStorage.removeItem(
  //         "nene-task-id"
  //       );

  //       setSavedTaskId(null);
  //     });
  // }, []);

  useEffect(() => {
    const savedId =
      localStorage.getItem(
        "nene-task-id"
      );

    setSavedTaskId(savedId);
  }, []);

  useEffect(() => {
    if (!task?.id) {
      return;
    }

    const source =
      new EventSource(
        `/api/tasks/${task.id}/events`
      );

    source.onmessage = (
      event
    ) => {
      const message =
        JSON.parse(
          event.data
        );

      if (
        message.type ===
        "task:progress"
      ) {
        setTask(
          (current) =>
            current
              ? {
                  ...current,
                  progress:
                    message.data
                      .stage,
                  status:
                    message.data
                      .stage ===
                    "waiting_for_approval"
                      ? "waiting_for_approval"
                      : current.status,
                }
              : current
        );
      }

      if (
        message.type ===
        "task:completed"
      ) {
        setTask(
          (current) =>
            current
              ? {
                  ...current,
                  status:
                    "completed",
                  progress:
                    "completed",
                }
              : current
        );
      }
    };

    source.onerror = () => {
      console.log(
        "SSE reconnecting..."
      );
    };

    return () => {
      source.close();
    };
  }, [task?.id]);

  if (!task) {
    return (
      <main className="min-h-screen bg-neutral-950 text-white px-6 py-12">
        <div className="mx-auto max-w-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center justify-between">
              <p className="text-sm text-neutral-500">
                ne-ne
              </p>

              <button
                onClick={goHome}
                className="text-sm text-neutral-400 transition hover:text-white"
              >
                Home
              </button>
            </div>

            <button
              onClick={resetTask}
              className="text-sm text-neutral-400 transition hover:text-white"
            >
              New task
            </button>
          </div>

          <h1 className="mt-4 text-3xl font-semibold">
            What do you want to build?
          </h1>

          {savedTaskId && (
            <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-sm text-neutral-300">
                You have a previous task.
              </p>

              <button
                onClick={resumeTask}
                className="mt-3 w-full rounded-xl border border-neutral-700 px-4 py-3 text-sm font-medium"
              >
                Resume current task
              </button>
            </div>
          )}

          <textarea
            value={prompt}
            onChange={(event) =>
              setPrompt(
                event.target.value
              )
            }
            className="mt-8 min-h-36 w-full rounded-2xl border border-neutral-800 bg-neutral-900 p-4 outline-none"
          />

          <button
            onClick={startTask}
            disabled={
              loading ||
              !prompt.trim()
            }
            className="mt-4 w-full rounded-2xl bg-white px-5 py-4 font-medium text-black disabled:opacity-50"
          >
            {loading
              ? "Starting..."
              : "Start"}
          </button>

          {error && (
            <p className="mt-4 text-sm text-red-400">
              {error}
            </p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white px-6 py-12">
      <div className="mx-auto max-w-md">
        <p className="text-sm text-neutral-500">
          ne-ne
        </p>

        <h1 className="mt-4 text-3xl font-semibold capitalize">
          {title}
        </h1>

        <div className="mt-10 space-y-6">
          {stages.map(
            (stage, index) => {
              const done =
                index <
                currentIndex;

              const active =
                index ===
                  currentIndex &&
                task.progress !==
                  "completed";

              return (
                <div
                  key={stage.key}
                  className="flex items-center gap-4"
                >
                  <span className="w-5 text-center">
                    {done
                      ? "✓"
                      : active
                        ? "●"
                        : "○"}
                  </span>

                  <span
                    className={
                      active
                        ? "font-medium"
                        : done
                          ? "text-neutral-300"
                          : "text-neutral-600"
                    }
                  >
                    {stage.label}
                  </span>
                </div>
              );
            }
          )}
        </div>

        {task.progress ===
          "waiting_for_approval" && (
          <button
            onClick={
              approveTask
            }
            className="mt-10 w-full rounded-2xl bg-white px-5 py-4 font-medium text-black"
          >
            Approve
          </button>
        )}

        {task.progress === "completed" && (
          <div className="mt-10 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <p className="text-lg font-medium">
              Build finished ✓
            </p>

            <p className="mt-2 text-sm text-neutral-400">
              Your project was built, tested, and published to GitHub.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              {task.github?.url && (
                <a
                  href={task.github.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl bg-white px-4 py-3 text-center font-medium text-black"
                >
                  View Code
                </a>
              )}

              <button
                disabled
                className="rounded-xl border border-neutral-700 px-4 py-3 font-medium text-neutral-500"
              >
                Deploy
              </button>
            </div>

            <button
              onClick={resetTask}
              className="mt-4 w-full px-4 py-3 text-sm text-neutral-400"
            >
              Start another task
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
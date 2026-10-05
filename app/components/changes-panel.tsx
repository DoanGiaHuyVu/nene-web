"use client";

import { useEffect, useState } from "react";
import { loadChanges, patchLineClass, type Changes, type FileChange } from "../lib/changes";

const button = "rounded-xl border border-neutral-700 px-4 py-3 text-sm font-medium text-neutral-200 transition hover:border-neutral-500 hover:text-white disabled:opacity-40";

function FileReview({ file }: { file: FileChange }) {
  const labels = { added: "Added", modified: "Modified", deleted: "Deleted" };
  return <details className="overflow-hidden rounded-lg border border-neutral-800">
    <summary className="cursor-pointer px-3 py-3 text-xs hover:bg-neutral-800/50">
      <span className={file.status === "added" ? "text-green-300" : file.status === "deleted" ? "text-red-300" : "text-sky-300"}>{labels[file.status]}</span>
      <span className="ml-2 break-all font-mono text-neutral-200">{file.path}</span>
      {file.symlink && <span className="ml-2 text-neutral-500">Symlink</span>}
      {!file.binary && <span className="ml-2 whitespace-nowrap text-neutral-400"><span className="text-green-300">+{file.additions}</span> <span className="text-red-300">−{file.deletions}</span>{!file.countsComplete && " (partial)"}</span>}
    </summary>
    <div className="border-t border-neutral-800">
      {file.binary && <p className="p-3 text-xs text-neutral-400">Binary file — a text preview is unavailable.</p>}
      {file.truncated && <p className="p-3 text-xs text-amber-300" role="note">{file.reason === "large_file" ? "This file is too large to preview." : file.reason === "response_limit" ? "This patch was omitted to keep the review small." : "This patch is shortened."} {!file.countsComplete && "Line counts are incomplete."}</p>}
      {file.patch ? <pre className="max-h-96 overflow-auto p-3 font-mono text-xs leading-5" tabIndex={0} aria-label={`Code changes for ${file.path}`}>
        {file.patch.split("\n").map((line, index) => <span key={index} className={`block min-w-max ${patchLineClass(line)}`}>{line || " "}</span>)}
      </pre> : !file.binary && !file.truncated && <p className="p-3 text-xs text-neutral-500">No text lines changed.</p>}
    </div>
  </details>;
}

export function ChangesPanel({ taskId, isUpdate, onClose, onApprove, approving, disabled }: {
  taskId: string; isUpdate: boolean; onClose: () => void; onApprove?: () => void; approving: boolean; disabled: boolean;
}) {
  const [data, setData] = useState<Changes | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void loadChanges(taskId, controller.signal).then(result => {
      if (!controller.signal.aborted) setData(result);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [taskId, attempt]);
  const title = data ? data.initialBuild ? "Initial build" : "Changes" : isUpdate ? "Changes" : "Initial build";
  return <section className="mt-4 min-w-0 rounded-xl border border-neutral-700 bg-neutral-900 p-3 sm:p-4" aria-label="Code review" aria-busy={!data && !error}>
    <h3 className="text-sm font-medium">{title}</h3>
    {!data && !error && <p className="mt-3 text-xs text-neutral-400" role="status">Loading changes…</p>}
    {error && <div className="mt-3"><p className="text-xs text-red-300" role="alert">Could not load changes.</p><button className={`${button} mt-3`} onClick={() => { setError(false); setData(null); setAttempt(value => value + 1); }}>Retry</button></div>}
    {data && <>
      <p className="mt-2 text-xs text-neutral-400">{data.summary.filesChanged} {data.summary.filesChanged === 1 ? "file" : "files"} changed <span className="ml-2 whitespace-nowrap"><span className="text-green-300">+{data.summary.additions}</span> <span className="text-red-300">−{data.summary.deletions}</span></span>{!data.summary.countsComplete && " (partial line counts)"}</p>
      {!data.summary.filesChanged && <p className="mt-4 text-sm text-neutral-300">No code changes detected.</p>}
      {data.truncated && <p className="mt-3 text-xs text-amber-300" role="note">Some content is omitted from this review.{data.omittedFiles > 0 && ` ${data.omittedFiles} additional files are not shown.`}</p>}
      <div className="mt-4 space-y-2">{data.files.map(file => <FileReview key={file.path} file={file} />)}</div>
    </>}
    <div className="mt-4 flex flex-wrap gap-2 border-t border-neutral-800 pt-4">
      <button className={button} onClick={onClose}>Close</button>
      {onApprove && <button className="rounded-xl bg-white px-4 py-3 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-40" disabled={disabled} onClick={onApprove}>{approving ? "Approving..." : "Approve"}</button>}
    </div>
  </section>;
}

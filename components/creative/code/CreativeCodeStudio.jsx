"use client";

import { useEffect, useRef, useState } from "react";

const DEFAULT_REPOSITORY = "https://github.com/churchillkaron/churchill-control-new";
const MAX_RESUMES = 24;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusCopy(progress, fallback = "Ready") {
  const latest = progress?.latest_event;
  return latest?.description || latest?.phase || progress?.state_status || fallback;
}

export default function CreativeCodeStudio({ organizationId }) {
  const [repositoryUrl, setRepositoryUrl] = useState(DEFAULT_REPOSITORY);
  const [ref, setRef] = useState("main");
  const [objective, setObjective] = useState("");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    if (!running || !organizationId) return undefined;
    let cancelled = false;
    const poll = async () => {
      while (!cancelled) {
        try {
          const response = await fetch(`/api/operator/code/progress?organizationId=${encodeURIComponent(organizationId)}`, {
            cache: "no-store",
          });
          const body = await response.json().catch(() => ({}));
          if (!cancelled && body?.success && body?.live_progress) {
            setProgress(body.live_progress);
            setStatus(statusCopy(body.live_progress, "Working"));
          }
        } catch {
          // Mission execution remains authoritative if progress polling is unavailable.
        }
        await wait(1800);
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [running, organizationId]);

  async function runMission() {
    const trimmedObjective = objective.trim();
    if (!trimmedObjective || running) return;

    setRunning(true);
    setResult(null);
    setError(null);
    setProgress(null);
    setStatus("Opening governed sandbox and inspecting the repository…");

    const executionKey = `code-studio:${crypto.randomUUID()}`;
    let resumeState = null;

    try {
      for (let attempt = 0; attempt < MAX_RESUMES; attempt += 1) {
        const response = await fetch("/api/operator/code/mission", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            objective: trimmedObjective,
            repository_url: repositoryUrl.trim(),
            ref: ref.trim() || "main",
            execution_key: executionKey,
            resume_state: resumeState,
            reasoning_call_budget: 4,
            max_employee_passes: 8,
          }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || `Code mission failed (${response.status})`);
        if (!mounted.current) return;

        setResult(body);
        setStatus(body.status === "planner_pending"
          ? "Reasoning job is still running — following the same job…"
          : body.status || "Working");

        if (body.resume_required === true && body.resume_state) {
          resumeState = body.resume_state;
          await wait(1400);
          continue;
        }

        if (body.status === "completed" && body.customer_artifact?.verified_complete === true) {
          setStatus("Completed and verified");
        } else if (body.status === "completed") {
          setStatus("Completed");
        } else {
          setStatus(body.reason || body.status || "Stopped");
        }
        return;
      }
      throw new Error("Code mission resume limit reached. The same mission can be resumed; no second mission was started.");
    } catch (missionError) {
      if (!mounted.current) return;
      setError(missionError?.message || "Code mission failed");
      setStatus("Stopped");
    } finally {
      if (mounted.current) setRunning(false);
    }
  }

  const artifact = result?.customer_artifact || null;
  const files = Array.isArray(artifact?.files_changed) ? artifact.files_changed : [];
  const verification = Array.isArray(artifact?.verification) ? artifact.verification : [];
  const blockers = Array.isArray(artifact?.blockers) ? artifact.blockers : [];

  return (
    <main className="min-h-screen bg-[#080808] px-5 py-6 text-white md:px-8 md:py-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="flex flex-col gap-3 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.28em] text-[#D6A66A]">Creative · Code</div>
            <h1 className="text-3xl font-light tracking-[-0.035em] md:text-4xl">Code Studio</h1>
            <p className="mt-2 max-w-3xl text-sm font-light leading-6 text-white/55">
              Tell Avantiqo what to build or fix. It inspects the repository, plans, edits in an isolated sandbox, verifies the result and returns the final diff.
            </p>
          </div>
          <div className="rounded-full border border-[#D6A66A]/35 bg-[#D6A66A]/[0.07] px-3 py-1.5 text-[11px] text-[#e7c497]">
            Preview sandbox · no commit · no deploy
          </div>
        </header>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 backdrop-blur-xl md:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-white/35">Mission</div>
                <div className="mt-1 text-sm text-white/65">One goal. Avantiqo handles the engineering loop.</div>
              </div>
              <div className={`h-2 w-2 rounded-full ${running ? "animate-pulse bg-[#D6A66A]" : "bg-white/25"}`} />
            </div>

            <label className="block text-[11px] uppercase tracking-[0.16em] text-white/35">Repository</label>
            <input
              value={repositoryUrl}
              onChange={(event) => setRepositoryUrl(event.target.value)}
              disabled={running}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-sm text-white/80 outline-none transition focus:border-[#D6A66A]/55 disabled:opacity-50"
            />

            <label className="mt-4 block text-[11px] uppercase tracking-[0.16em] text-white/35">Branch / ref</label>
            <input
              value={ref}
              onChange={(event) => setRef(event.target.value)}
              disabled={running}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-sm text-white/80 outline-none transition focus:border-[#D6A66A]/55 disabled:opacity-50"
            />

            <label className="mt-4 block text-[11px] uppercase tracking-[0.16em] text-white/35">What should Code do?</label>
            <textarea
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              disabled={running}
              placeholder="Example: Audit the invoice workspace, fix the broken mobile layout, add regression tests and verify the final diff."
              rows={9}
              className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-sm leading-6 text-white/85 outline-none transition placeholder:text-white/22 focus:border-[#D6A66A]/55 disabled:opacity-50"
            />

            <button
              type="button"
              onClick={runMission}
              disabled={running || !objective.trim() || !repositoryUrl.trim()}
              className="mt-4 w-full rounded-xl border border-[#D6A66A]/60 bg-[#D6A66A] px-4 py-3 text-sm font-medium text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {running ? "Code is working…" : "Run mission"}
            </button>

            <div className="mt-4 rounded-xl border border-white/8 bg-black/25 p-3.5">
              <div className="text-[10px] uppercase tracking-[0.16em] text-white/30">Current state</div>
              <div className="mt-1.5 text-sm text-white/70">{status}</div>
              {progress?.files_changed?.length ? (
                <div className="mt-2 text-xs text-white/40">{progress.files_changed.length} file(s) changed in sandbox</div>
              ) : null}
            </div>
            {error ? <div className="mt-3 rounded-xl border border-red-400/20 bg-red-400/[0.05] p-3 text-xs leading-5 text-red-200/85">{error}</div> : null}
          </div>

          <div className="min-h-[560px] rounded-2xl border border-white/10 bg-white/[0.025] p-5 backdrop-blur-xl md:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-white/35">Result</div>
                <div className="mt-1 text-sm text-white/65">Verified source changes stay reviewable before any commit.</div>
              </div>
              {artifact ? (
                <div className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] ${artifact.verified_complete ? "border-emerald-300/20 text-emerald-200/75" : "border-white/10 text-white/40"}`}>
                  {artifact.verified_complete ? "Verified" : artifact.status || "Working"}
                </div>
              ) : null}
            </div>

            {!artifact ? (
              <div className="flex min-h-[460px] items-center justify-center text-center">
                <div className="max-w-sm text-sm font-light leading-6 text-white/30">
                  Your changed files, verification evidence and final diff will appear here.
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Metric label="Files" value={files.length} />
                  <Metric label="Checks passed" value={artifact.verification_passed_count || 0} />
                  <Metric label="Commit ready" value={artifact.commit_ready ? "Yes" : "No"} />
                </div>

                {files.length ? <Panel title="Changed files"><ul className="space-y-1.5 text-xs text-white/65">{files.map((file) => <li key={file} className="font-mono">{file}</li>)}</ul></Panel> : null}
                {verification.length ? <Panel title="Verification"><div className="space-y-2">{verification.map((item, index) => <div key={`${item.operation_id || "check"}-${index}`} className="flex gap-3 text-xs"><span className={item.passed ? "text-emerald-200/70" : "text-red-200/70"}>{item.passed ? "PASS" : "FAIL"}</span><span className="font-mono text-white/50">{[item.command, ...(item.args || [])].filter(Boolean).join(" ") || item.operation_id}</span></div>)}</div></Panel> : null}
                {blockers.length ? <Panel title="Remaining blockers"><ul className="space-y-1.5 text-xs text-amber-100/65">{blockers.map((item) => <li key={item}>{item}</li>)}</ul></Panel> : null}
                {artifact.patch ? <Panel title="Final diff"><pre className="max-h-[560px] overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-white/60">{artifact.patch}</pre></Panel> : null}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }) {
  return <div className="rounded-xl border border-white/8 bg-black/25 p-3"><div className="text-[9px] uppercase tracking-[0.15em] text-white/28">{label}</div><div className="mt-1 text-lg font-light text-white/75">{value}</div></div>;
}

function Panel({ title, children }) {
  return <section className="rounded-xl border border-white/8 bg-black/25 p-4"><div className="mb-3 text-[10px] uppercase tracking-[0.16em] text-[#D6A66A]/70">{title}</div>{children}</section>;
}

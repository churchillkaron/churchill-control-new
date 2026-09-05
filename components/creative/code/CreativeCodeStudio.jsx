"use client";

import Link from "next/link";
import { Activity, ArrowLeft, GitBranch, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const DEFAULT_REPOSITORY = "https://github.com/churchillkaron/churchill-control-new";
const MAX_RESUMES = 24;
const ACTIVE_POLL_MS = 1800;
const PASSIVE_POLL_MS = 5000;
const ACTIVE_PROGRESS_STALE_MS = 30 * 60 * 1000;
const ACTIVE_PROGRESS_STATES = new Set([
  "active",
  "executing",
  "in_progress",
  "pending",
  "planner_pending",
  "queued",
  "running",
  "verifying",
  "working",
]);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function text(value) {
  return String(value ?? "").trim();
}

function statusCopy(progress, fallback = "Ready") {
  const latest = progress?.latest_event;
  return latest?.description || latest?.phase || progress?.state_status || fallback;
}

function timestamp(value) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function progressIsActive(progress) {
  if (!progress) return false;
  const updatedAt = Math.max(
    timestamp(progress.updated_at),
    timestamp(progress.latest_event?.at),
  );
  if (updatedAt && Date.now() - updatedAt > ACTIVE_PROGRESS_STALE_MS) return false;

  const stateStatus = text(progress.state_status).toLowerCase();
  const latestStatus = text(progress.latest_event?.status).toLowerCase();
  return ACTIVE_PROGRESS_STATES.has(stateStatus) || ACTIVE_PROGRESS_STATES.has(latestStatus);
}

function humanStatus(value) {
  const normalized = text(value).replaceAll("_", " ").toLowerCase();
  if (!normalized) return "Working";
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
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
    if (!organizationId) {
      setProgress(null);
      return undefined;
    }

    let cancelled = false;
    let timer = null;

    const poll = async () => {
      let active = false;
      try {
        const response = await fetch(`/api/operator/code/progress?organizationId=${encodeURIComponent(organizationId)}`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        const body = await response.json().catch(() => ({}));
        if (!cancelled && body?.success) {
          const nextProgress = body?.live_progress || null;
          active = progressIsActive(nextProgress);
          setProgress(nextProgress);
          if (running || active) {
            setStatus(statusCopy(nextProgress, running ? "Working" : "Following active mission"));
          }
        }
      } catch {
        // Mission execution remains authoritative if progress polling is unavailable.
      }

      if (!cancelled) {
        timer = window.setTimeout(poll, running || active ? ACTIVE_POLL_MS : PASSIVE_POLL_MS);
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [organizationId, running]);

  const liveProgressActive = progressIsActive(progress);

  async function runMission() {
    const trimmedObjective = objective.trim();
    if (!trimmedObjective || running || liveProgressActive) return;

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
          credentials: "same-origin",
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
  const liveFiles = Array.isArray(progress?.files_changed) ? progress.files_changed : [];
  const liveEvents = Array.isArray(progress?.events) ? progress.events.slice(-8).reverse() : [];
  const businessPartnerHref = organizationId ? `/workspace/${organizationId}` : "#";

  return (
    <main className="min-h-screen bg-[#080808] px-5 py-6 text-white md:px-8 md:py-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.28em] text-[#D6A66A]">Creative · Code</div>
            <h1 className="text-3xl font-light tracking-[-0.035em] md:text-4xl">Code Studio</h1>
            <p className="mt-2 max-w-3xl text-sm font-light leading-6 text-white/55">
              Tell Avantiqo what to build or fix. Business Partner remains the control plane; Code Studio gives you the live engineering, verification and diff view.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              data-avantiqo-business-partner-link="true"
              href={businessPartnerHref}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.025] px-3 py-1.5 text-[11px] text-white/55 transition hover:border-[#D6A66A]/35 hover:text-[#e7c497]"
            >
              <ArrowLeft size={12} />
              Business Partner
            </Link>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#D6A66A]/35 bg-[#D6A66A]/[0.07] px-3 py-1.5 text-[11px] text-[#e7c497]">
              <ShieldCheck size={12} />
              Governed preview · no commit · no deploy
            </div>
          </div>
        </header>

        {liveProgressActive && !running ? (
          <section
            data-avantiqo-shared-code-mission="true"
            className="rounded-2xl border border-[#D6A66A]/30 bg-[#D6A66A]/[0.055] px-4 py-4 md:px-5"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-[#e7c497]">
                  <Activity size={12} className="animate-pulse" />
                  Shared Code mission · live
                </div>
                <div className="mt-2 max-w-4xl text-sm leading-6 text-white/75">
                  {progress?.objective || statusCopy(progress, "Avantiqo Code is working from Business Partner or another governed entry surface.")}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-white/35">
                  {progress?.repository_url ? <span>{progress.repository_url}</span> : null}
                  {progress?.ref ? <span className="inline-flex items-center gap-1"><GitBranch size={10} /> {progress.ref}</span> : null}
                  {progress?.mission_id ? <span>Mission {progress.mission_id}</span> : null}
                </div>
              </div>
              <Link
                href={businessPartnerHref}
                className="shrink-0 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-white/50 transition hover:border-[#D6A66A]/35 hover:text-[#e7c497]"
              >
                Steer in Business Partner
              </Link>
            </div>
          </section>
        ) : null}

        <section className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 backdrop-blur-xl md:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-white/35">Mission</div>
                <div className="mt-1 text-sm text-white/65">One goal. Avantiqo handles the engineering loop.</div>
              </div>
              <div className={`h-2 w-2 rounded-full ${running || liveProgressActive ? "animate-pulse bg-[#D6A66A]" : "bg-white/25"}`} />
            </div>

            <label className="block text-[11px] uppercase tracking-[0.16em] text-white/35">Repository</label>
            <input
              value={repositoryUrl}
              onChange={(event) => setRepositoryUrl(event.target.value)}
              disabled={running || liveProgressActive}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-sm text-white/80 outline-none transition focus:border-[#D6A66A]/55 disabled:opacity-50"
            />

            <label className="mt-4 block text-[11px] uppercase tracking-[0.16em] text-white/35">Branch / ref</label>
            <input
              value={ref}
              onChange={(event) => setRef(event.target.value)}
              disabled={running || liveProgressActive}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-sm text-white/80 outline-none transition focus:border-[#D6A66A]/55 disabled:opacity-50"
            />

            <label className="mt-4 block text-[11px] uppercase tracking-[0.16em] text-white/35">What should Code do?</label>
            <textarea
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              disabled={running || liveProgressActive}
              placeholder="Example: Audit the invoice workspace, fix the broken mobile layout, add regression tests and verify the final diff."
              rows={9}
              className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/40 px-3.5 py-3 text-sm leading-6 text-white/85 outline-none transition placeholder:text-white/22 focus:border-[#D6A66A]/55 disabled:opacity-50"
            />

            <button
              type="button"
              onClick={runMission}
              disabled={running || liveProgressActive || !objective.trim() || !repositoryUrl.trim()}
              className="mt-4 w-full rounded-xl border border-[#D6A66A]/60 bg-[#D6A66A] px-4 py-3 text-sm font-medium text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {running ? "Code is working…" : liveProgressActive ? "Following active mission…" : "Run mission"}
            </button>

            {liveProgressActive && !running ? (
              <div className="mt-2 text-[10px] leading-4 text-white/35">
                A shared Code mission is already active. This surface follows it instead of starting a competing mission.
              </div>
            ) : null}

            <div className="mt-4 rounded-xl border border-white/8 bg-black/25 p-3.5">
              <div className="text-[10px] uppercase tracking-[0.16em] text-white/30">Current state</div>
              <div className="mt-1.5 text-sm text-white/70">{status}</div>
              {progress?.files_changed?.length ? (
                <div className="mt-2 text-xs text-white/40">{progress.files_changed.length} file(s) changed in sandbox</div>
              ) : null}
              {progress?.current_operation_id ? (
                <div className="mt-1 text-[10px] font-mono text-white/30">{progress.current_operation_id}</div>
              ) : null}
            </div>
            {error ? <div className="mt-3 rounded-xl border border-red-400/20 bg-red-400/[0.05] p-3 text-xs leading-5 text-red-200/85">{error}</div> : null}
          </div>

          <div className="min-h-[560px] rounded-2xl border border-white/10 bg-white/[0.025] p-5 backdrop-blur-xl md:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-white/35">Engineering evidence</div>
                <div className="mt-1 text-sm text-white/65">Live work, verification and final source changes stay reviewable before any commit.</div>
              </div>
              {artifact ? (
                <div className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] ${artifact.verified_complete ? "border-emerald-300/20 text-emerald-200/75" : "border-white/10 text-white/40"}`}>
                  {artifact.verified_complete ? "Verified" : artifact.status || "Working"}
                </div>
              ) : liveProgressActive ? (
                <div className="rounded-full border border-[#D6A66A]/25 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-[#e7c497]">
                  Live
                </div>
              ) : null}
            </div>

            {!artifact && !progress ? (
              <div className="flex min-h-[460px] items-center justify-center text-center">
                <div className="max-w-sm text-sm font-light leading-6 text-white/30">
                  Start here or delegate from Business Partner. Live files, verification evidence and the final diff will appear in this same workspace.
                </div>
              </div>
            ) : artifact ? (
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
            ) : (
              <div className="mt-5 space-y-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Metric label="Files" value={liveFiles.length} />
                  <Metric label="Operations" value={progress?.completed_operation_count || 0} />
                  <Metric label="Blockers" value={progress?.blocker_count || 0} />
                </div>

                <Panel title="Live mission">
                  <div className="space-y-2 text-xs leading-5 text-white/55">
                    <div className="flex items-center justify-between gap-3">
                      <span>State</span>
                      <span className="text-white/75">{humanStatus(progress?.state_status)}</span>
                    </div>
                    {progress?.latest_event?.description ? <div className="border-t border-white/8 pt-2 text-white/65">{progress.latest_event.description}</div> : null}
                    {progress?.latest_test_command ? (
                      <div className="border-t border-white/8 pt-2 font-mono text-[11px] text-white/45">
                        {[progress.latest_test_command, ...(progress.latest_test_args || [])].filter(Boolean).join(" ")}
                        {progress.latest_test_exit_code !== null && progress.latest_test_exit_code !== undefined ? ` · exit ${progress.latest_test_exit_code}` : ""}
                      </div>
                    ) : null}
                  </div>
                </Panel>

                {liveFiles.length ? <Panel title="Files changed so far"><ul className="space-y-1.5 text-xs text-white/65">{liveFiles.map((file) => <li key={file} className="font-mono">{file}</li>)}</ul></Panel> : null}
                {liveEvents.length ? (
                  <Panel title="Recent engineering activity">
                    <div className="space-y-3">
                      {liveEvents.map((event, index) => (
                        <div key={`${event.at || "event"}-${event.operation_id || index}`} className="border-b border-white/7 pb-3 last:border-0 last:pb-0">
                          <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-white/30">
                            <span>{humanStatus(event.phase)}</span>
                            {event.verification_passed === true ? <span className="text-emerald-200/60">PASS</span> : null}
                            {event.verification_passed === false ? <span className="text-red-200/60">FAIL</span> : null}
                          </div>
                          <div className="mt-1 text-xs leading-5 text-white/55">{event.description || event.action || event.status || "Working"}</div>
                        </div>
                      ))}
                    </div>
                  </Panel>
                ) : null}
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

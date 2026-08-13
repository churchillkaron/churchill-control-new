"use client";

import { useMemo, useState } from "react";

const CASES = Object.freeze([
  {
    id: "churchill-entrance-still",
    label: "Churchill entrance master still",
  },
  {
    id: "churchill-food-editorial-stills",
    label: "Churchill food editorial still system",
  },
  {
    id: "churchill-audio-package",
    label: "Churchill campaign music and sound package",
  },
  {
    id: "cole-full-song-artist-film",
    label: "Cole Ley full-song original artist film",
  },
  {
    id: "cole-live-performance-showreel",
    label: "Cole Ley live-performance showreel",
  },
]);

const API = "/api/creative/qa/world-class-benchmark";

async function post(body) {
  const response = await fetch(API, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success !== true) {
    const error = new Error(payload.error || `Benchmark request failed (${response.status})`);
    error.code = payload.code || null;
    throw error;
  }
  return payload;
}

function statusLabel(status) {
  if (status === "running") return "Running";
  if (status === "passed") return "Passed";
  if (status === "failed") return "Failed";
  return "Pending";
}

export default function CreativeWorldClassQualityPage() {
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState(
    CASES.map((entry) => ({ ...entry, status: "pending", score: null, failures: [] })),
  );
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  const completed = useMemo(
    () => rows.filter((entry) => entry.status === "passed").length,
    [rows],
  );

  async function runBenchmark() {
    if (running) return;

    setRunning(true);
    setReport(null);
    setError(null);
    setRows(
      CASES.map((entry) => ({ ...entry, status: "pending", score: null, failures: [] })),
    );

    const captured = [];

    try {
      for (const benchmarkCase of CASES) {
        setRows((current) =>
          current.map((entry) =>
            entry.id === benchmarkCase.id
              ? { ...entry, status: "running", score: null, failures: [] }
              : entry,
          ),
        );

        const result = await post({
          action: "run_case",
          case_id: benchmarkCase.id,
          confirm_reasoning_spend: true,
        });

        captured.push(result.case_result);
        const casePassed = result.score?.passed === true;
        const caseFailures = Array.isArray(result.score?.failures)
          ? result.score.failures
          : [];

        setRows((current) =>
          current.map((entry) =>
            entry.id === benchmarkCase.id
              ? {
                  ...entry,
                  status: casePassed ? "passed" : "failed",
                  score: result.score?.score ?? null,
                  failures: caseFailures,
                }
              : entry,
          ),
        );

        if (!casePassed) {
          throw new Error(
            `Case failed world-class floor: ${benchmarkCase.label}${
              caseFailures.length ? ` — ${caseFailures.join(", ")}` : ""
            }`,
          );
        }
      }

      const finalResult = await post({
        action: "evaluate",
        cases: captured,
      });
      setReport(finalResult.report || null);
    } catch (runError) {
      setError(runError?.message || "Creative benchmark failed");
      setRows((current) =>
        current.map((entry) =>
          entry.status === "running"
            ? { ...entry, status: "failed", failures: [runError?.code || runError?.message || "FAILED"] }
            : entry,
        ),
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
            Creative Studio / Quality Assurance
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            World-Class Creative Benchmark
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-slate-400">
            Reasoning-only QA. Five real evidence-backed cases are run one at a time through the Creative Master Plan and independent dynamic tribunal. This page does not generate media, create production tasks, create production graphs, or publish anything.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium">Execution safety</div>
              <div className="mt-1 text-xs leading-5 text-slate-400">
                Reasoning provider calls incur governed Service Runtime usage. Execution stops on the first case below the benchmark floor.
              </div>
            </div>
            <button
              type="button"
              onClick={runBenchmark}
              disabled={running}
              className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running ? `Running ${completed + 1} of ${CASES.length}` : "Run 5-case benchmark"}
            </button>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40">
          <div className="grid grid-cols-[1fr_110px_90px] gap-3 border-b border-slate-800 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <div>Case</div>
            <div>Status</div>
            <div className="text-right">Score</div>
          </div>
          {rows.map((entry) => (
            <div
              key={entry.id}
              className="grid grid-cols-[1fr_110px_90px] gap-3 border-b border-slate-800/80 px-5 py-4 last:border-b-0"
            >
              <div>
                <div className="text-sm font-medium">{entry.label}</div>
                {entry.failures.length ? (
                  <div className="mt-1 text-xs leading-5 text-rose-300">
                    {entry.failures.join(" · ")}
                  </div>
                ) : null}
              </div>
              <div className="text-sm text-slate-300">{statusLabel(entry.status)}</div>
              <div className="text-right text-sm font-semibold tabular-nums">
                {entry.score == null ? "—" : entry.score}
              </div>
            </div>
          ))}
        </section>

        {error ? (
          <section className="rounded-2xl border border-rose-900/60 bg-rose-950/30 p-5">
            <div className="text-sm font-semibold text-rose-200">Benchmark stopped</div>
            <div className="mt-2 text-sm leading-6 text-rose-300">{error}</div>
          </section>
        ) : null}

        {report ? (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-sm font-medium">Final result</div>
                <div className="mt-1 text-xs text-slate-400">
                  Overall floor 88 · Case floor 82 · Maximum pairwise similarity 0.72
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-semibold tabular-nums">{report.score}</div>
                <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {report.passed ? "Passed" : "Failed"}
                </div>
              </div>
            </div>

            {Array.isArray(report.failures) && report.failures.length ? (
              <div className="mt-5 border-t border-slate-800 pt-4 text-sm leading-6 text-rose-300">
                {report.failures.map((failure) => (
                  <div key={failure}>{failure}</div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}

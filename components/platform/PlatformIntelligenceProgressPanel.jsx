"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Database,
  FlaskConical,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

const PLATFORM_ORGANIZATION_ID = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";

function clean(value) {
  return String(value ?? "").trim();
}

function labelStatus(value) {
  const normalized = clean(value).toLowerCase().replace(/_/g, " ");
  if (!normalized) return "No evidence";
  return normalized.replace(/\b\w/g, (character) => character.toUpperCase());
}

function relativeTime(value) {
  if (!value) return "No evidence";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "No evidence";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(timestamp));
}

async function requestProgress() {
  const scope = encodeURIComponent(PLATFORM_ORGANIZATION_ID);
  const response = await fetch(`/api/platform/admin/intelligence-progress?organizationId=${scope}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || "Learning evidence is unavailable");
  }
  return payload;
}

function dispatchPartnerMessage(message) {
  window.dispatchEvent(
    new CustomEvent("avantiqo:home-command", {
      detail: { message, source: "text" },
    }),
  );
  window.requestAnimationFrame(() => {
    document.querySelector('[data-avantiqo-home-intelligence="true"]')?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  });
}

function gateTone(state) {
  if (state === "pass") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (state === "blocked") return "border-red-200 bg-red-50 text-red-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

export default function PlatformIntelligenceProgressPanel() {
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const next = await requestProgress();
      setProgress(next);
      setError("");
    } catch (loadError) {
      setError(loadError?.message || "Learning evidence is unavailable");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary = progress?.summary || {};
  const model = progress?.model || {};
  const governance = progress?.governance || {};
  const blockers = Array.isArray(progress?.blockers) ? progress.blockers : [];

  const state = model.verifiedImprovement
    ? { label: "Improvement proven", tone: "pass" }
    : clean(model.benchmarkStatus).toUpperCase().includes("FAILED")
      ? { label: "Benchmark blocked", tone: "blocked" }
      : model.benchmarkExecutionVerified
        ? { label: "Benchmark complete", tone: "review" }
        : { label: "Improvement unproven", tone: "review" };

  const gates = useMemo(() => [
    {
      label: "Learning evidence",
      value: summary.compiledTrainingExamples ? `${summary.compiledTrainingExamples} canonical examples` : "No compiled examples",
      detail: `${summary.trainingCandidates || 0} governed candidates`,
      state: summary.compiledTrainingExamples && summary.trainingCandidates ? "pass" : "review",
    },
    {
      label: "Candidate training",
      value: labelStatus(model.trainingStatus),
      detail: model.foundationModel || "Foundation model not recorded",
      state: clean(model.trainingStatus).toUpperCase() === "TRAINING_COMPLETED" ? "pass" : "review",
    },
    {
      label: "Quality benchmark",
      value: labelStatus(model.benchmarkStatus),
      detail: model.benchmarkCaseCount ? `${model.benchmarkCaseCount} governed benchmark cases` : "No completed benchmark evidence",
      state: model.benchmarkExecutionVerified ? "pass" : clean(model.benchmarkStatus).toUpperCase().includes("FAILED") ? "blocked" : "review",
    },
    {
      label: "Production promotion",
      value: model.productionPromotionObserved ? "Promotion evidence observed" : "Not promoted",
      detail: `Persisted effect: ${clean(model.productionPromotionEffect) || "NONE"}`,
      state: model.productionPromotionObserved ? "review" : "pass",
    },
  ], [model, summary]);

  const askPartner = useCallback(() => {
    dispatchPartnerMessage([
      "Review Avantiqo Platform Learning and Intelligence using authoritative current evidence.",
      `Training status: ${clean(model.trainingStatus) || "unknown"}.`,
      `Latest benchmark status: ${clean(model.benchmarkStatus) || "unknown"}.`,
      `Benchmark execution verified: ${model.benchmarkExecutionVerified === true ? "yes" : "no"}.`,
      `Verified model improvement: ${model.verifiedImprovement === true ? "yes" : "no"}.`,
      `Production promotion observed: ${model.productionPromotionObserved === true ? "yes" : "no"}.`,
      `Continuous-learning blockers: ${blockers.length}.`,
      "Determine the highest-leverage next action to obtain valid improvement evidence. Do not treat training completion or memory as proof of quality, authorization, or production promotion.",
    ].join(" "));
  }, [blockers.length, model]);

  if (loading && !progress) {
    return (
      <section data-avantiqo-platform-intelligence-progress="true" className="bg-[#F4F3EF] px-4 pb-5 md:px-5">
        <div className="mx-auto flex max-w-[1680px] items-center gap-2 rounded-[22px] border border-black/[0.07] bg-white px-4 py-5 text-[10px] text-[#817B73]">
          <RefreshCw size={13} className="animate-spin" />
          Reading governed Learning & Intelligence evidence…
        </div>
      </section>
    );
  }

  return (
    <section data-avantiqo-platform-intelligence-progress="true" className="bg-[#F4F3EF] px-4 pb-6 md:px-5">
      <div className="mx-auto max-w-[1680px] overflow-hidden rounded-[22px] border border-black/[0.07] bg-white shadow-none">
        <div className="flex flex-col gap-4 border-b border-black/[0.06] px-4 py-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.14em] text-[#8D877E]">
                <BrainCircuit size={12} />
                Learning & Intelligence
              </div>
              <span className={`rounded-full border px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.09em] ${gateTone(state.tone)}`}>
                {state.label}
              </span>
            </div>
            <h2 className="mt-1.5 text-[17px] font-semibold tracking-[-0.025em] text-[#403C37]">
              Progress only when evidence proves it.
            </h2>
            <p className="mt-1 max-w-3xl text-[9px] leading-4 text-[#918B83]">
              Training, benchmarks and learning blockers from the Avantiqo Platform organization. A trained candidate is not called improved until matched benchmark evidence proves it, and memory never grants authority.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.07] bg-[#FBFAF8] px-2.5 py-2 text-[8px] text-[#858078]">
              <Clock3 size={10} />
              Evidence {relativeTime(summary.latestEvidenceAt)}
            </span>
            <button
              type="button"
              onClick={() => load({ quiet: true })}
              disabled={refreshing}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 text-[8px] font-medium text-[#625D55] hover:border-[#B98A57]/35 disabled:opacity-50"
            >
              <RefreshCw size={10} className={refreshing ? "animate-spin" : ""} />
              Refresh
            </button>
            <button
              type="button"
              onClick={askPartner}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-[#B98A57]/25 bg-[#FBF7F1] px-2.5 text-[8px] font-medium text-[#8A643C] hover:border-[#B98A57]/45"
            >
              Review with Partner
              <ArrowRight size={10} />
            </button>
          </div>
        </div>

        {error ? (
          <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3 text-[9px] leading-4 text-amber-900">
            <TriangleAlert size={12} className="mt-0.5 shrink-0" />
            {error}. Existing evidence remains visible but is not treated as freshly verified.
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-px bg-black/[0.06] md:grid-cols-2 xl:grid-cols-4">
          {gates.map((gate) => (
            <div key={gate.label} className="bg-white px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#98928A]">{gate.label}</div>
                {gate.state === "pass" ? <CheckCircle2 size={12} className="text-emerald-700" /> : <TriangleAlert size={12} className={gate.state === "blocked" ? "text-red-700" : "text-amber-700"} />}
              </div>
              <div className="mt-2 text-[14px] font-semibold tracking-[-0.02em] text-[#3D3934]">{gate.value}</div>
              <div className="mt-1 text-[8px] leading-4 text-[#99938B]">{gate.detail}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <div className="border-b border-black/[0.06] px-4 py-4 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.13em] text-[#8D877E]">
                  <FlaskConical size={11} />
                  Learning blockers
                </div>
                <div className="mt-1 text-[13px] font-semibold text-[#48433D]">What is stopping the next proof</div>
              </div>
              <span className={`rounded-full px-2 py-1 text-[8px] font-medium ${blockers.length ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                {blockers.length} blocker{blockers.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="mt-3 divide-y divide-black/[0.055]">
              {blockers.length ? blockers.slice(0, 6).map((blocker) => (
                <div key={blocker.id} className="grid gap-1 py-2.5 sm:grid-cols-[minmax(150px,0.42fr)_minmax(0,1fr)_auto] sm:gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[9px] font-medium text-[#4A453F]">{blocker.topic}</div>
                    <div className="mt-0.5 text-[8px] text-[#AAA39A]">{blocker.domain || "platform learning"}</div>
                  </div>
                  <div className="min-w-0 text-[8px] leading-4 text-[#858078]">{blocker.error}</div>
                  <div className="text-[8px] text-[#AAA39A]">{relativeTime(blocker.createdAt)}</div>
                </div>
              )) : (
                <div className="flex items-center gap-2 py-4 text-[9px] text-emerald-700">
                  <CheckCircle2 size={12} />
                  No persisted continuous-learning blockers in this evidence set.
                </div>
              )}
            </div>
          </div>

          <div className="px-4 py-4">
            <div className="flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.13em] text-[#8D877E]">
              <ShieldCheck size={11} />
              Governance truth
            </div>
            <div className="mt-3 space-y-2">
              {[
                ["Training completed", clean(model.trainingStatus).toUpperCase() === "TRAINING_COMPLETED", "Candidate artifact exists; this alone does not prove improvement."],
                ["Matched benchmark verified", model.benchmarkExecutionVerified === true, "Both baseline and candidate must complete under governed benchmark evidence."],
                ["Verified improvement", model.verifiedImprovement === true, "Only explicit comparative evidence can turn this green."],
                ["Production promotion", model.productionPromotionObserved === true, "No promotion is inferred from training or memory."],
              ].map(([label, proven, detail]) => (
                <div key={label} className="rounded-xl border border-black/[0.06] bg-[#FBFAF8] px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[9px] font-medium text-[#514B44]">{label}</span>
                    <span className={`text-[8px] font-semibold uppercase tracking-[0.08em] ${proven ? "text-emerald-700" : "text-amber-700"}`}>
                      {proven ? "Proven" : "Not proven"}
                    </span>
                  </div>
                  <div className="mt-1 text-[8px] leading-4 text-[#99938B]">{detail}</div>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-xl border border-[#A78158]/15 bg-[#FBF7F1] px-3 py-3">
              <div className="flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.11em] text-[#8A643C]">
                <Database size={10} />
                Evidence discipline
              </div>
              <div className="mt-1.5 text-[8px] leading-4 text-[#81766A]">
                Memory grants authorization: no · automatic promotion: no · customer-private dataset content: {governance.customerPrivateContentIncluded ? "observed" : "not observed"} · raw reasoning in dataset: {governance.rawReasoningIncluded ? "observed" : "not observed"}.
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-black/[0.06] bg-[#FBFAF8] px-4 py-2.5 text-[8px] leading-4 text-[#928C84]">
          Source: {progress?.source || "learning evidence unavailable"}. Current status is evidence, not authority; no customer Home data is used here.
        </div>
      </div>
    </section>
  );
}

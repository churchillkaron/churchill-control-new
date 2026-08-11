"use client";

import { useEffect, useState } from "react";

function label(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function statusCopy(status) {
  const copy = {
    A_GRADE: {
      title: "A-grade release quality achieved",
      detail: "The current quality evidence meets Avantiqo's world-class release contract. Human release approval remains a separate decision.",
    },
    REPAIRING: {
      title: "Autonomous repair in progress",
      detail: "Avantiqo rejected the weaker output and is repairing only the failed requirements while preserving the approved direction.",
    },
    REPAIR_REQUIRED: {
      title: "Release blocked — repair required",
      detail: "The current output is below the world-class release contract. B-grade work cannot progress as release-ready.",
    },
    REVIEWING: {
      title: "Director review in progress",
      detail: "The generated work is being checked against its creative, brand, identity and technical quality requirements.",
    },
    AWAITING_REVIEW: {
      title: "Production complete — quality review pending",
      detail: "A real output exists, but it is not release-ready until the quality evidence satisfies the A-grade contract.",
    },
    PRODUCING: {
      title: "Production is running",
      detail: "Quality gates will evaluate the produced work before it can become release-ready.",
    },
    AWAITING_PRODUCTION: {
      title: "Quality gate standing by",
      detail: "The A-grade contract is armed and will evaluate production output when it exists.",
    },
  };
  return copy[status] || copy.AWAITING_PRODUCTION;
}

function Score({ label: scoreLabel, value, minimum }) {
  const numeric = Number(value);
  const hasValue = Number.isFinite(numeric);
  const passed = hasValue && numeric >= Number(minimum || 0);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">
        {scoreLabel}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${passed ? "text-emerald-200" : "text-white"}`}>
        {hasValue ? numeric : "—"}
      </div>
      <div className="mt-1 text-xs text-white/35">
        {hasValue ? `World-class floor ${minimum}` : "Awaiting evidence"}
      </div>
    </div>
  );
}

export default function CreativeQualityDirector({ runtime }) {
  const organizationId = runtime.organizationId;
  const projectId = runtime.projectRuntime?.current?.id || null;
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!organizationId || !projectId) {
        if (!cancelled) {
          setState(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          organization_id: organizationId,
          creative_project_id: projectId,
        });
        const response = await fetch(
          `/api/creative/quality-status?${params.toString()}`,
          { cache: "no-store" },
        );
        const result = await response.json();
        if (!response.ok || result.success === false) {
          throw new Error(result.error || "Unable to load quality status");
        }
        if (!cancelled) setState(result);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || "Unable to load quality status");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [organizationId, projectId]);

  const standard = state?.standard || {};
  const quality = state?.quality || {};
  const repair = state?.repair || {};
  const copy = statusCopy(state?.status);
  const failedChecks = quality.failed_checks || [];
  const repairs = quality.repair_instructions || [];

  return (
    <section className="border-b border-white/10 bg-[#050505] px-6 pb-6 lg:px-8 lg:pb-8">
      <div className="rounded-[28px] border border-violet-300/15 bg-violet-300/[0.035] p-5 lg:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="text-[10px] uppercase tracking-[0.30em] text-violet-200/70">
              Quality Director
            </div>
            <h3 className="mt-2 text-xl font-semibold text-white lg:text-2xl">
              {loading ? "Reading quality evidence…" : copy.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-white/45">
              {loading
                ? "Avantiqo is reading existing production and review evidence. This status check does not run a provider review."
                : copy.detail}
            </p>
          </div>

          <div className="rounded-2xl border border-violet-300/15 bg-violet-300/[0.05] px-4 py-3 text-xs text-violet-100/75">
            <div className="font-semibold text-violet-100">A-grade only</div>
            <div className="mt-1">
              Minimum release score {standard.minimum_release_score ?? 94} · weakest-link gate
            </div>
          </div>
        </div>

        {error ? (
          <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/[0.05] px-4 py-3 text-sm text-red-200/80" role="alert">
            {error}
          </div>
        ) : null}

        {!loading && state ? (
          <>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <Score
                label="Overall quality"
                value={quality.overall_score}
                minimum={standard.minimum_release_score}
              />
              <Score
                label={quality.weakest_dimension?.label || "Weakest dimension"}
                value={quality.weakest_dimension?.score}
                minimum={standard.minimum_release_score}
              />
              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">
                  Autonomous repair
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {repair.automatic ? "Armed" : "Manual"}
                </div>
                <div className="mt-1 text-xs text-white/35">
                  Attempt {repair.attempts_observed || 0} of {repair.max_attempts ?? 0}
                </div>
              </div>
            </div>

            {failedChecks.length ? (
              <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/[0.035] p-4">
                <div className="text-[10px] uppercase tracking-[0.22em] text-amber-100/55">
                  Release blockers
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {failedChecks.map((check) => (
                    <span
                      key={check}
                      className="rounded-full border border-amber-200/15 bg-amber-200/[0.05] px-3 py-1.5 text-xs text-amber-100/70"
                    >
                      {label(check)}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {repairs.length ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">
                  Director repair brief
                </div>
                <ul className="mt-3 space-y-2 text-sm leading-relaxed text-white/50">
                  {repairs.slice(0, 5).map((instruction) => (
                    <li key={instruction} className="flex gap-2">
                      <span className="text-violet-200/60">•</span>
                      <span>{instruction}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-white/30">
              <span>{standard.contract || "AVANTIQO_WORLD_CLASS_QUALITY_V1"}</span>
              <span>B-grade release forbidden</span>
              <span>Human release approval remains separate</span>
              {repair.blocked_by_cost_without_approval ? (
                <span>Paid repair remains inside approved cost governance</span>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

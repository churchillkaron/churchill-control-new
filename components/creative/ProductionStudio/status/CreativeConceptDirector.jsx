"use client";

import { useEffect, useState } from "react";

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function score(value) {
  const parsed = number(value);
  return parsed === null ? "—" : parsed.toFixed(parsed % 1 ? 1 : 0);
}

function label(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function Metric({ name, value, minimum, detail }) {
  const numeric = number(value);
  const passed = numeric !== null && numeric >= minimum;
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">
        {name}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-white">{score(value)}</span>
        <span className={`text-xs ${passed ? "text-emerald-300/70" : "text-amber-200/70"}`}>
          / min {minimum}
        </span>
      </div>
      {detail ? (
        <div className="mt-1 text-xs leading-relaxed text-white/35">{detail}</div>
      ) : null}
    </div>
  );
}

function RecoveryRound({ attempt }) {
  const diagnostic = attempt?.diagnostic || {};
  const dimensions = Array.isArray(diagnostic.failed_dimensions)
    ? diagnostic.failed_dimensions
    : [];
  const territories = Array.isArray(diagnostic.rejected_territories)
    ? diagnostic.rejected_territories
    : [];
  const reasons = Array.isArray(diagnostic.rejection_reasons)
    ? diagnostic.rejection_reasons
    : [];

  return (
    <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-white/70">
          Round {attempt?.round || diagnostic.failed_round || "—"} rejected
        </div>
        {dimensions.length ? (
          <div className="text-[10px] uppercase tracking-[0.18em] text-amber-100/55">
            {dimensions.map(label).join(" · ")}
          </div>
        ) : null}
      </div>

      {territories.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {territories.slice(0, 3).map((territory, index) => (
            <span
              key={`${territory.id || territory.title || index}-${index}`}
              className="rounded-full border border-white/8 bg-white/[0.025] px-3 py-1 text-xs text-white/45"
            >
              {territory.title || label(territory.id) || `Territory ${index + 1}`}
            </span>
          ))}
        </div>
      ) : null}

      {reasons.length ? (
        <div className="mt-3 text-xs leading-relaxed text-white/35">
          {reasons.slice(0, 3).join(" · ")}
        </div>
      ) : null}
    </div>
  );
}

export default function CreativeConceptDirector({ runtime }) {
  const organizationId = runtime.organizationId;
  const projectId = runtime.projectRuntime?.current?.id || null;
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!organizationId || !projectId) {
        setData(null);
        return;
      }
      try {
        setError("");
        const params = new URLSearchParams({
          organization_id: organizationId,
          creative_project_id: projectId,
        });
        const response = await fetch(
          `/api/creative/concept-status?${params.toString()}`,
          { cache: "no-store" },
        );
        const result = await response.json();
        if (!response.ok || result.success === false) {
          throw new Error(result.error || "Unable to load concept intelligence");
        }
        if (!cancelled) setData(result);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || "Unable to load concept intelligence");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [organizationId, projectId]);

  if (!projectId) return null;

  const policy = data?.policy || {};
  const concept = data?.concept || {};
  const regeneration = data?.regeneration || {};
  const criticScores = concept.critic_scores || {};
  const criticMinimums = policy.critic_minimums || {};
  const passed = data?.status === "A_GRADE";
  const awaiting = data?.status === "AWAITING_DIRECTION";
  const distinctness = concept.distinctness || {};
  const pairwise = Array.isArray(distinctness.pairwise_similarity)
    ? distinctness.pairwise_similarity
    : [];
  const maximumSimilarity = pairwise.reduce(
    (maximum, item) => Math.max(maximum, number(item.similarity) || 0),
    0,
  );
  const failedRounds = Array.isArray(regeneration.prior_failed_rounds)
    ? regeneration.prior_failed_rounds
    : [];
  const recoveryLabel = regeneration.regenerated
    ? `Recovered in round ${regeneration.rounds_used || "—"} of ${regeneration.max_rounds || "—"}`
    : passed
      ? "A-grade in the first round"
      : "Autonomous recovery armed";

  return (
    <section className="border-b border-white/10 bg-[#050505] px-6 py-5 lg:px-8">
      <div className="rounded-[28px] border border-violet-300/15 bg-violet-300/[0.035] p-5 lg:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="text-[10px] uppercase tracking-[0.30em] text-violet-200/65">
              Concept Director
            </div>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              {awaiting
                ? "Creative direction is still being built"
                : passed
                  ? "A-grade concept cleared for production planning"
                  : "Concept blocked before production"}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-white/45">
              Avantiqo rejects interchangeable ideas before production spend. Temporal work must survive independent originality, music/energy, brand/commercial and production critics, plus executive selection and distinctness checks.
            </p>
          </div>
          <div className={`rounded-2xl border px-4 py-3 text-xs ${
            passed
              ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-100/80"
              : "border-amber-300/20 bg-amber-300/[0.06] text-amber-100/80"
          }`}>
            <div className="font-semibold">
              {passed ? "A-grade only" : awaiting ? "Awaiting evidence" : "Fail closed"}
            </div>
            <div className="mt-1">Loading this panel never runs a provider review.</div>
          </div>
        </div>

        {error ? (
          <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/[0.05] p-4 text-sm text-red-100/75">
            {error}
          </div>
        ) : null}

        {!awaiting && data ? (
          <div className="mt-6 space-y-5">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">
                Selected creative territory
              </div>
              <div className="mt-2 text-xl font-semibold text-white">
                {concept.title || "Selected concept"}
              </div>
              {concept.thesis ? (
                <div className="mt-2 max-w-4xl text-sm leading-relaxed text-white/55">
                  {concept.thesis}
                </div>
              ) : null}
              {concept.selection_reason ? (
                <div className="mt-3 border-l border-violet-300/25 pl-4 text-sm leading-relaxed text-violet-100/60">
                  {concept.selection_reason}
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-violet-300/12 bg-violet-300/[0.025] p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-violet-200/55">
                    Autonomous concept recovery
                  </div>
                  <div className="mt-2 text-lg font-semibold text-white/85">
                    {recoveryLabel}
                  </div>
                  <div className="mt-1 max-w-3xl text-xs leading-relaxed text-white/40">
                    Failed creative territories are removed from available creative space. Studio must change the governing mechanism, narrative engine and signature-image system rather than polish or hybridize a rejected idea.
                  </div>
                </div>
                <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-xs text-white/45">
                  {regeneration.rounds_used || 0} / {regeneration.max_rounds || policy.regeneration?.default_max_rounds || 2} rounds
                </div>
              </div>

              {failedRounds.length ? (
                <div className="mt-4 grid gap-3 xl:grid-cols-2">
                  {failedRounds.map((attempt, index) => (
                    <RecoveryRound
                      key={`${attempt?.round || index}-${index}`}
                      attempt={attempt}
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-white/8 bg-black/20 px-4 py-3 text-xs leading-relaxed text-white/35">
                  No failed concept round is stored for this project. When recovery is needed, its rejected territories and critic failures appear here automatically.
                </div>
              )}

              <div className="mt-3 text-[11px] leading-relaxed text-white/25">
                Standards are raise-only · lower scopes cannot weaken Avantiqo minimums · recovery fails closed when the governed round limit is exhausted.
              </div>
            </div>

            {data.workflow_kind === "TEMPORAL" ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Metric
                  name="Originality"
                  value={criticScores.originality}
                  minimum={criticMinimums.originality || 94}
                  detail="Rejects clichés, generic AI language and swappable client ideas."
                />
                <Metric
                  name="Music + energy"
                  value={criticScores.music_energy}
                  minimum={criticMinimums.music_energy || 92}
                  detail="Tests whether source rhythm and energy cause visible direction."
                />
                <Metric
                  name="Brand + commercial"
                  value={criticScores.brand_commercial}
                  minimum={criticMinimums.brand_commercial || 92}
                  detail="Tests ownability, audience relevance and campaign extension."
                />
                <Metric
                  name="Production"
                  value={criticScores.production}
                  minimum={criticMinimums.production || 88}
                  detail="Tests feasibility, continuity, rights and hidden cost risk."
                />
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-3">
              <Metric
                name="Council score"
                value={concept.weighted_score}
                minimum={policy.minimum_weighted_score || 92}
                detail={data.workflow_kind === "TEMPORAL" ? "Weak concepts cannot reach the dossier." : "Universal work uses the world-class specificity gate."}
              />
              <Metric
                name="Director confidence"
                value={concept.selector_confidence}
                minimum={policy.minimum_selector_confidence || 90}
                detail="Executive selection confidence for the winning territory."
              />
              <Metric
                name="Concept separation"
                value={pairwise.length ? Math.round((1 - maximumSimilarity) * 100) : null}
                minimum={Math.round((1 - (policy.maximum_pairwise_similarity || 0.55)) * 100)}
                detail={pairwise.length ? `Closest pair similarity ${maximumSimilarity.toFixed(2)} · maximum ${(policy.maximum_pairwise_similarity || 0.55).toFixed(2)}.` : "Distinctness scoring applies to blind temporal territories."}
              />
            </div>

            {Array.isArray(concept.decisive_strengths) && concept.decisive_strengths.length ? (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">
                  Why this idea won
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {concept.decisive_strengths.map((strength, index) => (
                    <div key={`${strength}-${index}`} className="rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2 text-sm leading-relaxed text-white/55">
                      {strength}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {Array.isArray(concept.rejected_concepts) && concept.rejected_concepts.length ? (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">
                  Rejected territories
                </div>
                <div className="mt-3 space-y-2">
                  {concept.rejected_concepts.map((rejected) => (
                    <div key={rejected.concept_id} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                      <div className="text-sm font-medium text-white/70">
                        {rejected.title || label(rejected.concept_id)}
                      </div>
                      <div className="mt-1 text-xs leading-relaxed text-white/35">
                        {rejected.reason || "Not selected by the Executive Creative Director."}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="text-xs leading-relaxed text-white/30">
              Contract {data.gate?.contract || policy.contract || "—"} · B-grade concepts forbidden · production dossier creation fails closed when the concept contract is missing or below threshold · global minimums cannot be lowered.
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

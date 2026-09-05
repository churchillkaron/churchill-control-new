"use client";

import {
  BrainCircuit,
  CheckCircle2,
  History,
  Lightbulb,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function percent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return `${Math.round(Math.max(0, Math.min(1, parsed)) * 100)}%`;
}

function humanStatus(value) {
  const normalized = text(value).replaceAll("_", " ").toLowerCase();
  if (!normalized) return "Unobserved";
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function lifecycleTone(value, dark) {
  const state = text(value).toUpperCase();
  if (state === "PROVEN" || state === "PROMOTION_CANDIDATE") {
    return dark
      ? "border-emerald-300/15 bg-emerald-300/[0.06] text-emerald-100/75"
      : "border-emerald-700/10 bg-emerald-50 text-emerald-800";
  }
  if (state === "DECAYING" || state === "SUPPRESSED") {
    return dark
      ? "border-amber-300/15 bg-amber-300/[0.06] text-amber-100/75"
      : "border-amber-700/10 bg-amber-50 text-amber-800";
  }
  return dark
    ? "border-white/10 bg-white/[0.025] text-white/45"
    : "border-black/[0.07] bg-white text-[#77716A]";
}

function strategySummary({ memory, skills }) {
  const matches = list(memory?.matches);
  const activeSkills = list(skills?.skills).filter((skill) => skill?.suppressed !== true);
  const repairSkills = activeSkills.filter((skill) => skill?.repair_pattern === true);
  const parts = [];
  if (matches.length) {
    parts.push(`${matches.length} verified prior mission${matches.length === 1 ? "" : "s"} matched this objective`);
  }
  if (activeSkills.length) {
    const proven = activeSkills.filter((skill) => text(skill?.lifecycle_state).toUpperCase() === "PROVEN").length;
    parts.push(`${activeSkills.length} evidence-backed engineering skill${activeSkills.length === 1 ? "" : "s"} available${proven ? `, ${proven} proven` : ""}`);
  }
  if (repairSkills.length) {
    parts.push(`${repairSkills.length} verified repair pattern${repairSkills.length === 1 ? "" : "s"} recognized`);
  }
  if (!parts.length) {
    return "No reusable engineering precedent is strong enough yet; Code is relying on current repository evidence and fresh verification.";
  }
  return `${parts.join(" · ")}. Current repository evidence and fresh verification remain authoritative.`;
}

function learningSummary(receipt) {
  if (!receipt) return null;
  const observed = number(receipt.observed_skill_count);
  if (!observed) return null;
  const revalidated = number(receipt.revalidated_skill_count);
  const contradicted = number(receipt.contradicted_skill_count);
  const drift = number(receipt.architecture_drift_signal_count);
  const verified = number(receipt.verified_success_with_skill_revalidation_count);
  if (contradicted || drift) {
    return `${observed} skill${observed === 1 ? "" : "s"} observed; ${contradicted} contradicted by current HEAD${drift ? ` and ${drift} architecture-drift signal${drift === 1 ? "" : "s"} recorded` : ""}. Future confidence will be reduced instead of treating old practice as permanent truth.`;
  }
  if (revalidated) {
    return `${revalidated} of ${observed} applied skill${observed === 1 ? "" : "s"} survived current-HEAD revalidation${verified ? `; ${verified} also contributed to a fully verified mission outcome` : ""}. This strengthens future ranking but does not create trusted knowledge automatically.`;
  }
  return `${observed} engineering skill${observed === 1 ? "" : "s"} were observed in this mission, but there is not enough direct current-HEAD evidence yet to strengthen or decay them.`;
}

export default function CodeEngineeringIntelligenceCard({
  progress = null,
  result = null,
  theme = "light",
  compact = false,
}) {
  const dark = theme === "dark";
  const memory = result?.verified_engineering_memory || progress?.verified_engineering_memory || null;
  const skills = result?.formed_engineering_skills || progress?.formed_engineering_skills || null;
  const lifecycle = result?.engineering_skill_lifecycle || null;
  const receipt = progress?.engineering_intelligence || null;
  const skillRows = list(skills?.skills).slice(0, compact ? 2 : 4);
  const memoryRows = list(memory?.matches).slice(0, compact ? 2 : 3);
  const learned = learningSummary(receipt || lifecycle);
  const promotionWritten = number(lifecycle?.promotion_candidates_written);
  const hasIntelligence = Boolean(
    memoryRows.length || skillRows.length || learned || promotionWritten || memory?.evaluated || skills?.evaluated,
  );

  if (!hasIntelligence) return null;

  const shell = dark
    ? "border-white/10 bg-black/25"
    : "border-black/[0.07] bg-white";
  const heading = dark ? "text-white/70" : "text-[#4A443D]";
  const muted = dark ? "text-white/38" : "text-[#918A81]";
  const body = dark ? "text-white/58" : "text-[#6E675F]";
  const item = dark ? "border-white/8 bg-white/[0.025]" : "border-black/[0.06] bg-[#FBFAF8]";

  return (
    <section
      data-avantiqo-code-engineering-intelligence="true"
      className={`rounded-xl border ${shell} ${compact ? "p-3" : "p-4"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className={`flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.14em] ${dark ? "text-[#e7c497]" : "text-[#8B663E]"}`}>
            <BrainCircuit size={11} />
            Engineering intelligence
          </div>
          <div className={`mt-1 text-[10px] leading-4 ${muted}`}>
            Observable evidence only · no chain-of-thought · current HEAD remains authoritative
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[8px] uppercase tracking-[0.1em] ${dark ? "border-white/10 text-white/35" : "border-black/[0.07] text-[#857E75]"}`}>
          <ShieldCheck size={9} />
          Governed
        </span>
      </div>

      <div className={`mt-3 rounded-lg border ${item} p-3`}>
        <div className={`flex items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] ${muted}`}>
          <Lightbulb size={10} />
          Why this strategy
        </div>
        <div className={`mt-1.5 text-[10px] leading-4 ${body}`}>
          {strategySummary({ memory, skills })}
        </div>
      </div>

      {memoryRows.length ? (
        <div className="mt-3">
          <div className={`flex items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] ${muted}`}>
            <History size={10} />
            What Code already knows
          </div>
          <div className="mt-2 space-y-1.5">
            {memoryRows.map((match, index) => (
              <div key={match?.mission_id || index} className={`rounded-lg border ${item} px-2.5 py-2`}>
                <div className={`truncate text-[10px] font-medium ${heading}`} title={match?.objective || "Verified prior mission"}>
                  {match?.objective || "Verified prior mission"}
                </div>
                <div className={`mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[8px] ${muted}`}>
                  {Number.isFinite(Number(match?.relevance_score)) ? <span>relevance {number(match.relevance_score)}</span> : null}
                  {match?.files_changed_count ? <span>{match.files_changed_count} files</span> : null}
                  {match?.successful_verifier_count ? <span>{match.successful_verifier_count} verified checks</span> : null}
                  {match?.repaired_verifier_count ? <span>{match.repaired_verifier_count} repaired checks</span> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {skillRows.length ? (
        <div className="mt-3">
          <div className={`flex items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] ${muted}`}>
            <Sparkles size={10} />
            Skills being applied
          </div>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {skillRows.map((skill, index) => {
              const lifecycleState = skill?.lifecycle_state || skill?.lifecycle?.lifecycle_state || "UNOBSERVED";
              const confidence = percent(skill?.confidence);
              return (
                <div key={skill?.skill_id || index} className={`rounded-lg border ${item} px-2.5 py-2`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className={`min-w-0 truncate text-[10px] font-medium ${heading}`} title={skill?.title || skill?.area || "Engineering skill"}>
                      {skill?.title || skill?.area || "Engineering skill"}
                    </div>
                    <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[7px] uppercase tracking-[0.08em] ${lifecycleTone(lifecycleState, dark)}`}>
                      {humanStatus(lifecycleState)}
                    </span>
                  </div>
                  <div className={`mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[8px] ${muted}`}>
                    {confidence ? <span>{confidence} confidence</span> : null}
                    <span>{number(skill?.support_count)} supporting missions</span>
                    {skill?.repair_pattern ? <span>repair pattern</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {learned ? (
        <div
          data-avantiqo-code-mission-learning-summary="true"
          className={`mt-3 rounded-lg border px-3 py-2.5 ${
            number((receipt || lifecycle)?.contradicted_skill_count) > 0 || number((receipt || lifecycle)?.architecture_drift_signal_count) > 0
              ? dark
                ? "border-amber-300/15 bg-amber-300/[0.05]"
                : "border-amber-700/10 bg-amber-50"
              : item
          }`}
        >
          <div className={`flex items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] ${muted}`}>
            {number((receipt || lifecycle)?.contradicted_skill_count) > 0 ? <TriangleAlert size={10} /> : <CheckCircle2 size={10} />}
            What this mission taught the system
          </div>
          <div className={`mt-1.5 text-[10px] leading-4 ${body}`}>{learned}</div>
          {promotionWritten > 0 ? (
            <div className={`mt-1.5 text-[9px] leading-4 ${muted}`}>
              {promotionWritten} sealed Learning evidence candidate{promotionWritten === 1 ? "" : "s"} created. This is still not trusted reusable knowledge.
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

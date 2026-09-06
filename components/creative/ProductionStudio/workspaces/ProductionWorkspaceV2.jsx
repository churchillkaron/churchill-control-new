"use client";

import { Activity, CircleAlert, Scissors, ShieldCheck } from "lucide-react";

import ProductionWorkspace from "./ProductionWorkspace";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nestedEvidence(value, seen = new Set(), depth = 0) {
  if (!value || typeof value !== "object" || seen.has(value) || depth > 10) return {};
  seen.add(value);
  const candidate = object(value);
  const keys = Object.keys(candidate);
  if (keys.some((key) => /identity_score|anatomy_score|temporal_identity_consistency_score|camera_score|performance_score|story_score|hand_integrity|limb_topology|identity_drift|malformed_hands/.test(key))) {
    return candidate;
  }
  for (const key of ["validation_evidence", "validation", "review", "result", "output", "data", "raw"]) {
    const evidence = nestedEvidence(candidate[key], seen, depth + 1);
    if (Object.keys(evidence).length) return evidence;
  }
  return {};
}

function humanTask(task = {}) {
  const metadata = object(task.metadata);
  const input = object(task.input);
  const generation = object(input.generation);
  return metadata.human_continuity_contract === "HUMAN_CONTINUITY_QUALITY_V1" ||
    metadata.identity_expected === true ||
    metadata.person_expected === true ||
    metadata.identity_profile_id ||
    object(generation.identity_lock).required === true ||
    metadata.human_temporal_span_repair_bound === true ||
    /IDENTITY|LIPSYNC|MOTION_PLATE/.test(String(metadata.contract || ""));
}

function issueList(task = {}) {
  const evidence = nestedEvidence(task.output);
  const issues = [];
  if (evidence.anatomy_valid === false || evidence.human_anatomy_valid === false) issues.push("anatomy");
  if (evidence.hand_integrity_valid === false || evidence.malformed_hands_detected === true) issues.push("hands");
  if (evidence.limb_topology_valid === false || evidence.extra_limbs_detected === true || evidence.missing_limbs_detected === true) issues.push("limbs");
  if (evidence.face_geometry_preserved === false || evidence.face_identity_drift_detected === true) issues.push("face drift");
  if (evidence.body_proportions_preserved === false || evidence.body_identity_drift_detected === true) issues.push("body drift");
  if (evidence.identity_consistent_across_frames === false) issues.push("temporal identity");
  if (evidence.duplicate_subject_detected === true) issues.push("duplicate subject");
  return [...new Set(issues)];
}

function cinematicMerit(evidence = {}) {
  const dimensions = [
    ["story_score", 0.22],
    ["camera_score", 0.18],
    ["performance_score", 0.18],
    ["environment_score", 0.10],
    ["continuity_score", 0.10],
    ["physics_score", 0.07],
    ["artifact_score", 0.05],
    ["identity_score", 0.05],
    ["anatomy_score", 0.03],
    ["temporal_identity_consistency_score", 0.02],
    ["overall_score", 0.15],
  ];
  let weighted = 0;
  let total = 0;
  for (const [field, weight] of dimensions) {
    const score = finite(evidence[field]);
    if (score === null) continue;
    weighted += score * weight;
    total += weight;
  }
  return total ? weighted / total : null;
}

function scoreSummary(task = {}) {
  const evidence = nestedEvidence(task.output);
  return {
    identity: finite(evidence.identity_score ?? evidence.identityScore),
    anatomy: finite(evidence.anatomy_score ?? evidence.anatomyScore),
    temporal: finite(evidence.temporal_identity_consistency_score ?? evidence.temporalIdentityConsistencyScore),
    cinematic: cinematicMerit(evidence),
  };
}

function surgicalSpanCount(task = {}) {
  const scope = object(task.input?.repair_specification?.temporal_scope);
  const count = finite(scope.span_count ?? task.metadata?.human_temporal_span_count);
  return count === null ? 0 : Math.max(0, Math.round(count));
}

function Score({ label, value }) {
  return (
    <div className="flex items-center gap-1.5 text-[8px] text-[#777069]">
      <span>{label}</span>
      <span className="font-semibold text-[#2A2723]">{value === null ? "—" : Math.round(value)}</span>
    </div>
  );
}

export default function ProductionWorkspaceV2({ runtime, editor }) {
  const tasks = (runtime.taskRuntime?.items || []).filter(humanTask);
  const active = tasks.filter((task) => !task.metadata?.superseded_by_revision_task_id && !task.metadata?.superseded_by_repair_task_id);
  const blocked = active.filter((task) => ["FAILED", "SKIPPED"].includes(String(task.status || "").toUpperCase()) || issueList(task).length > 0);
  const review = active.filter((task) => String(task.status || "").toUpperCase() === "REVIEW");
  const approved = active.filter((task) => task.review?.approved === true && task.metadata?.human_review_approved === true);
  const latestEvidenceTask = [...active].reverse().find((task) => Object.keys(nestedEvidence(task.output)).length) || null;
  const scores = latestEvidenceTask ? scoreSummary(latestEvidenceTask) : { identity: null, anatomy: null, temporal: null, cinematic: null };
  const blockers = blocked.flatMap(issueList);
  const blockerText = [...new Set(blockers)].join(" · ");
  const repairSpans = active.reduce((total, task) => total + surgicalSpanCount(task), 0);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F6F3EE]">
      <div className="border-b border-black/[0.07] bg-[#FBF9F5] px-4 py-2.5 lg:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {blocked.length ? (
              <CircleAlert className="h-4 w-4 shrink-0 text-red-700" />
            ) : review.length ? (
              <Activity className="h-4 w-4 shrink-0 text-amber-700" />
            ) : (
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-700" />
            )}
            <div className="min-w-0">
              <div className="text-[7px] font-semibold uppercase tracking-[0.14em] text-[#8A633C]">Human continuity control</div>
              <div className="mt-0.5 truncate text-[9px] font-medium text-[#38332E]">
                {blocked.length
                  ? `${blocked.length} human-quality block${blocked.length === 1 ? "" : "s"}${blockerText ? ` · ${blockerText}` : ""}`
                  : review.length
                    ? `${review.length} human shot${review.length === 1 ? "" : "s"} waiting for approval`
                    : active.length
                      ? `Identity, anatomy and temporal continuity clear on ${approved.length}/${active.length} approved human tasks`
                      : "No governed human-generation tasks in this production yet"}
              </div>
              {repairSpans > 0 ? (
                <div className="mt-1 flex items-center gap-1 text-[8px] font-medium text-[#8A633C]">
                  <Scissors className="h-3 w-3" />
                  {repairSpans} failed temporal span{repairSpans === 1 ? "" : "s"} isolated for surgical repair; unaffected frames stay preserved
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-black/[0.06] bg-white/70 px-3 py-1.5">
            <Score label="Identity" value={scores.identity} />
            <div className="h-3 w-px bg-black/[0.08]" />
            <Score label="Anatomy" value={scores.anatomy} />
            <div className="h-3 w-px bg-black/[0.08]" />
            <Score label="Temporal" value={scores.temporal} />
            <div className="h-3 w-px bg-black/[0.08]" />
            <Score label="Cinema" value={scores.cinematic} />
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <ProductionWorkspace runtime={runtime} editor={editor} />
      </div>
    </div>
  );
}

import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import * as ShotRepository from "@/lib/creative/shots/repositories/ShotRepository";
import { CreativeBriefRuntime } from "@/lib/creative/brief/runtime/CreativeBriefRuntime";
import * as ResearchRepository from "@/lib/creative/research/repositories/ResearchRepository";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

export const CREATIVE_PREPRODUCTION_INTELLIGENCE_CERTIFICATION_CONTRACT =
  "AVANTIQO_PREPRODUCTION_INTELLIGENCE_CERTIFICATION_V1";
const AGENCY_CRAFT_CONTRACT = "AVANTIQO_REFERENCE_CALIBRATED_AGENCY_CRAFT_V1";
const SHOT_DECISION_CONTRACT = "AVANTIQO_DIRECTOR_SHOT_DECISION_V1";
const FIRST_MINUTE_SECONDS = 60;

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function normalized(value) { return text(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim(); }
function active(task = {}) {
  return !task.metadata?.superseded_by_revision_task_id &&
    !task.metadata?.superseded_by_repair_task_id &&
    !task.metadata?.superseded_by_repair_review_task_id;
}
function videoTask(task = {}) {
  return text(task.capability || task.service_code).toLowerCase().startsWith("ai.video.");
}
function temporalShotTask(task = {}) {
  return videoTask(task) &&
    text(task.metadata?.workflow_kind).toUpperCase() === "TEMPORAL" &&
    text(task.metadata?.node_type).toUpperCase() === "SHOT";
}
function decisionFor(task = {}, shot = {}) {
  return object(
    task.input?.requirements?.directing_intelligence ||
    task.input?.directing_intelligence ||
    task.metadata?.directing_intelligence ||
    shot.directing_intelligence ||
    shot.metadata?.directing_intelligence,
  );
}
function durationFor(task = {}, shot = {}) {
  return finite(
    shot.duration_seconds ??
    task.input?.requirements?.duration_seconds ??
    task.input?.duration_seconds ??
    task.metadata?.duration_seconds,
  );
}
function shotOrder(task = {}, shot = {}) {
  const scene = finite(shot.scene_number ?? task.metadata?.scene_number) ?? 0;
  const index = finite(shot.shot_number ?? task.metadata?.shot_number) ?? 0;
  return scene * 10000 + index;
}
function humanExpected(task = {}, shot = {}, decision = {}) {
  if (decision.performance_direction?.applicable === true) return true;
  if (task.input?.requirements?.person_expected === true || task.input?.requirements?.identity_expected === true) return true;
  return /\b(person|people|human|man|woman|child|staff|employee|worker|chef|waiter|founder|owner|customer|guest|driver|technician|face)\b/i
    .test(`${text(shot.subject)} ${text(shot.action)} ${text(task.title)} ${text(task.description)}`);
}
function groundedTruthRequired(shot = {}, task = {}) {
  const grounding = object(shot.creative_grounding || shot.metadata?.creative_grounding || task.input?.requirements?.creative_grounding);
  return {
    grounding,
    required: text(grounding.mode).toUpperCase() !== "NONE" && Object.keys(grounding).length > 0,
  };
}
function firstMinuteProject(project = {}, tasks = [], shots = []) {
  const corpus = JSON.stringify({ metadata: project.metadata || {}, tasks: tasks.map((task) => task.metadata || {}), shots: shots.map((shot) => shot.metadata || {}) }).toLowerCase();
  return corpus.includes("investor_first_minute") || corpus.includes("first_minute_scope");
}
function check(id, passed, evidence = null, blocker = id) {
  return { id, passed: Boolean(passed), blocker: passed ? null : blocker, evidence };
}
function meaningful(value) {
  const source = normalized(value);
  if (!source) return false;
  return !["none", "n a", "na", "not applicable", "generic", "continue", "same", "as before"].includes(source);
}
function visibleChange(decision = {}) {
  const attention = object(decision.audience_attention);
  const opening = normalized(attention.opening_information);
  const progression = normalized(attention.progression_information);
  const closing = normalized(attention.closing_information);
  return Boolean(opening && progression && closing && new Set([opening, progression, closing]).size >= 2);
}
function likelyDeadAir({ decision = {}, duration = 0 } = {}) {
  if (!(duration > 1.5)) return false;
  const attention = object(decision.audience_attention);
  const picture = `${text(attention.opening_information)} ${text(attention.progression_information)} ${text(attention.closing_information)} ${text(decision.action_direction)}`.toLowerCase();
  const craft = object(decision.agency_craft);
  const deliberate = /\b(deliberate|tension|withhold|suspense|reveal|breath|silence|anticipation|hold)\b/i
    .test(`${text(craft.story_delta)} ${text(craft.sensory_delta)} ${text(decision.audio_direction?.silence)}`);
  const blank = /\b(black frame|blank frame|full black|empty black|dark screen|black screen|fade to black)\b/i.test(picture);
  return blank && !deliberate;
}

export const CreativePreProductionIntelligenceCertificationRuntime = Object.freeze({
  contract: CREATIVE_PREPRODUCTION_INTELLIGENCE_CERTIFICATION_CONTRACT,
  provider_calls_executed: 0,
  generation_spawned: false,

  async inspect({ organization_id, creative_project_id } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    const [project, allTasks, allShots, briefs, researchReports] = await Promise.all([
      CreativeProjectRepository.getById(creative_project_id),
      ProductionTaskRuntime.list({ organization_id, creative_project_id }),
      ShotRepository.list({ organization_id, creative_project_id }),
      CreativeBriefRuntime.list({ organization_id, creative_project_id }),
      ResearchRepository.list({ organization_id, creative_project_id }),
    ]);
    if (!project || text(project.organization_id) !== text(organization_id)) throw new Error("Creative project not found");

    const taskCandidates = allTasks.filter(active).filter(temporalShotTask);
    const taskByShot = new Map();
    for (const task of taskCandidates) {
      const key = text(task.shot_id || task.metadata?.shot_id || task.input?.shot_id);
      if (!key) continue;
      const prior = taskByShot.get(key);
      const priorTime = Date.parse(prior?.created_at || prior?.updated_at || 0) || 0;
      const currentTime = Date.parse(task.created_at || task.updated_at || 0) || 0;
      if (!prior || currentTime >= priorTime) taskByShot.set(key, task);
    }
    const tasks = [...taskByShot.values()];
    if (!tasks.length) {
      return {
        contract: CREATIVE_PREPRODUCTION_INTELLIGENCE_CERTIFICATION_CONTRACT,
        required: false,
        passed: true,
        status: "NOT_REQUIRED",
        checks: [], blockers: [], provider_calls_executed: 0, generation_spawned: false,
      };
    }

    const shotsById = new Map(allShots.map((shot) => [text(shot.id), shot]));
    const planned = tasks.map((task) => {
      const shot = shotsById.get(text(task.shot_id || task.metadata?.shot_id || task.input?.shot_id)) || {};
      const decision = decisionFor(task, shot);
      const craft = object(decision.agency_craft);
      const groundingState = groundedTruthRequired(shot, task);
      const duration = durationFor(task, shot) || 0;
      return { task, shot, decision, craft, grounding: groundingState.grounding, groundingRequired: groundingState.required, duration, order: shotOrder(task, shot) };
    }).sort((a, b) => a.order - b.order || text(a.task.id).localeCompare(text(b.task.id)));

    const invalidDirection = planned.filter(({ decision }) =>
      text(decision.contract) !== SHOT_DECISION_CONTRACT ||
      text(decision.agency_craft?.contract) !== AGENCY_CRAFT_CONTRACT ||
      decision.renderer_must_not_invent_direction !== true ||
      decision.renderer_must_not_change_story_information !== true,
    );
    const incompleteCraft = planned.filter(({ craft }) =>
      !["story_delta", "sensory_delta", "material_detail", "causal_link_in", "causal_link_out", "sound_sync_point", "brand_visibility_reason", "generative_risk", "reject_if"]
        .every((field) => meaningful(craft[field])),
    );
    const invisibleEvolution = planned.filter(({ decision }) => !visibleChange(decision));
    const humanDirectionMissing = planned.filter(({ task, shot, decision }) => {
      if (!humanExpected(task, shot, decision)) return false;
      const performance = object(decision.performance_direction);
      return !meaningful(performance.performance) && !Object.keys(object(performance.performance_direction)).length && !text(performance.human_performance_contract);
    });
    const soundMissing = planned.filter(({ decision, craft }) =>
      !meaningful(decision.audio_direction?.mix_intent) || !meaningful(craft.sound_sync_point),
    );
    const groundTruthMissing = planned.filter(({ groundingRequired, grounding }) => {
      if (!groundingRequired) return false;
      const requiredTargets = list(grounding.evidence_targets).filter((item) => item?.required === true);
      return !list(grounding.entities).length ||
        !requiredTargets.length ||
        requiredTargets.some((item) => !list(item.source_ids).length || text(item.status).toUpperCase() === "UNRESOLVED");
    });
    const spatialDirectionMissing = planned.filter(({ grounding, shot, task }) => {
      const path = object(grounding.spatial_path);
      if (path.required !== true) return false;
      if (!text(path.origin_node_id) || !text(path.destination_node_id) || !list(path.ordered_nodes).length || !list(path.directed_edges).length) return true;
      const aerial = object(shot.aerial_cinematography || shot.metadata?.aerial_cinematography || task.input?.requirements?.aerial_cinematography);
      const aerialShot = Object.keys(aerial).length > 0 || /\b(aerial|drone|earth|map|route|flight)\b/i.test(`${text(shot.subject)} ${text(shot.action)} ${text(task.title)}`);
      return aerialShot && !Object.keys(aerial).length;
    });
    const deadAir = planned.filter(({ decision, duration }) => likelyDeadAir({ decision, duration }));
    const storyDeltas = planned.map(({ craft }) => normalized(craft.story_delta)).filter(Boolean);
    const uniqueStoryRatio = storyDeltas.length ? new Set(storyDeltas).size / storyDeltas.length : 0;
    const purposes = planned.map(({ decision, shot }) => normalized(decision.dramatic_objective || shot.purpose)).filter(Boolean);
    const uniquePurposeRatio = purposes.length ? new Set(purposes).size / purposes.length : 0;
    const firstMinute = firstMinuteProject(project, tasks, allShots);
    const totalDuration = planned.reduce((sum, entry) => sum + entry.duration, 0);
    const durationPass = !firstMinute || Math.abs(totalDuration - FIRST_MINUTE_SECONDS) <= 0.5;

    const currentBrief = list(briefs).filter((brief) => !brief.archived_at)[0] || null;
    const validatedResearch = list(researchReports).find((report) =>
      report.metadata?.validation?.passed === true &&
      meaningful(report.metadata?.research_identity || report.metadata?.contract),
    ) || null;

    const checks = [
      check("canonical_brief_present", Boolean(currentBrief?.id), currentBrief?.id || null, "PREPRODUCTION_CANONICAL_BRIEF_REQUIRED"),
      check("validated_research_present", Boolean(validatedResearch?.id), validatedResearch?.id || null, "PREPRODUCTION_VALIDATED_RESEARCH_REQUIRED"),
      check("directing_authority_complete", invalidDirection.length === 0, invalidDirection.map((entry) => entry.task.id), "PREPRODUCTION_DIRECTING_AUTHORITY_INCOMPLETE"),
      check("agency_craft_complete", incompleteCraft.length === 0, incompleteCraft.map((entry) => entry.task.id), "PREPRODUCTION_AGENCY_CRAFT_INCOMPLETE"),
      check("every_shot_visibly_evolves", invisibleEvolution.length === 0, invisibleEvolution.map((entry) => entry.task.id), "PREPRODUCTION_STATIC_OR_EMPTY_SHOT_EVOLUTION"),
      check("human_behavior_directed", humanDirectionMissing.length === 0, humanDirectionMissing.map((entry) => entry.task.id), "PREPRODUCTION_HUMAN_BEHAVIOR_NOT_DIRECTED"),
      check("picture_locked_sound_intent", soundMissing.length === 0, soundMissing.map((entry) => entry.task.id), "PREPRODUCTION_SOUND_PICTURE_CAUSALITY_INCOMPLETE"),
      check("real_world_grounding_supported", groundTruthMissing.length === 0, groundTruthMissing.map((entry) => entry.task.id), "PREPRODUCTION_REAL_WORLD_GROUNDING_UNSUPPORTED"),
      check("spatial_direction_grounded", spatialDirectionMissing.length === 0, spatialDirectionMissing.map((entry) => entry.task.id), "PREPRODUCTION_SPATIAL_DIRECTION_UNPROVEN"),
      check("unjustified_dead_air_forbidden", deadAir.length === 0, deadAir.map((entry) => ({ task_id: entry.task.id, duration_seconds: entry.duration })), "PREPRODUCTION_UNJUSTIFIED_DEAD_AIR"),
      check("shot_story_delta_not_repetitive", uniqueStoryRatio >= 0.85, { unique_ratio: uniqueStoryRatio, shot_count: storyDeltas.length }, "PREPRODUCTION_REPETITIVE_STORY_DELTAS"),
      check("dramatic_objectives_not_repetitive", uniquePurposeRatio >= 0.85, { unique_ratio: uniquePurposeRatio, shot_count: purposes.length }, "PREPRODUCTION_REPETITIVE_SHOT_PURPOSES"),
      check("first_minute_duration_exact", durationPass, { first_minute: firstMinute, total_duration_seconds: totalDuration }, "PREPRODUCTION_FIRST_MINUTE_DURATION_INVALID"),
    ];
    const failed = checks.filter((item) => !item.passed);
    return {
      contract: CREATIVE_PREPRODUCTION_INTELLIGENCE_CERTIFICATION_CONTRACT,
      required: true,
      project_id: creative_project_id,
      passed: failed.length === 0,
      status: failed.length ? "BLOCKED" : "CERTIFIED_FOR_GENERATION",
      checks,
      blockers: failed.map((item) => item.blocker),
      evidence: {
        canonical_brief_id: currentBrief?.id || null,
        validated_research_report_id: validatedResearch?.id || null,
        temporal_video_shot_count: planned.length,
        temporal_video_task_candidate_count: taskCandidates.length,
        total_duration_seconds: Number(totalDuration.toFixed(3)),
        investor_first_minute_scope: firstMinute,
        unique_story_delta_ratio: Number(uniqueStoryRatio.toFixed(3)),
        unique_dramatic_objective_ratio: Number(uniquePurposeRatio.toFixed(3)),
      },
      policy: {
        plan_quality_must_be_proven_before_paid_generation: true,
        beautiful_but_disconnected_shots_forbidden: true,
        generic_location_substitution_forbidden: true,
        unexplained_brand_visibility_forbidden: true,
        generic_music_under_montage_forbidden: true,
        human_pose_instead_of_behavior_forbidden: true,
        unjustified_blank_or_dark_time_forbidden: true,
      },
      provider_calls_executed: 0,
      generation_spawned: false,
    };
  },
});

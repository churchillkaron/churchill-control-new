import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { CREATIVE_ASSET_NODE_TYPES } from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import { CreativeAutonomousSemanticReviewRuntime } from "./CreativeAutonomousSemanticReviewRuntime";
import { CreativeReleaseReadinessRuntime } from "@/lib/creative/release/runtime/CreativeReleaseReadinessRuntime";
import {
  assertAutomaticRepairAllowed,
  repairIdentity,
  repairPolicy,
} from "./CreativeRepairContractRuntime";

const AUDIO_REPAIR_CHECKS = new Set([
  "music_and_sound_design",
  "mix_hierarchy_and_silence",
]);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function integerPriority(value, direction = 0) {
  const base = Number.isFinite(Number(value)) ? Math.round(Number(value)) : 100;
  return Math.max(0, base + direction);
}

function semanticPolicy(project = {}) {
  const quality = object(project.metadata?.quality_gate);
  return object(
    quality.semantic_policy ||
    quality.semanticPolicy ||
    project.metadata?.semantic_quality ||
    project.metadata?.semanticQuality,
  );
}

function reportPassed(report = {}) {
  return report.status !== "REJECTED" && report.metadata?.passed === true;
}

function failedChecks(report = {}) {
  return list(report.metadata?.checks).filter((check) => check?.status === "FAIL");
}

function repairEntries(report = {}) {
  return list(report.metadata?.repair_plan).map((entry) => ({
    check_id: text(entry?.check_id),
    instruction: text(entry?.instruction),
    affected_scene_ids: list(entry?.affected_scene_ids).map(text),
    affected_shot_ids: list(entry?.affected_shot_ids).map(text),
    timestamps: list(entry?.timestamps),
  })).filter((entry) => entry.instruction);
}

function isAudioRepairEntry(entry = {}) {
  return AUDIO_REPAIR_CHECKS.has(text(entry.check_id));
}

function isMasterSoundtrackTask(task = {}) {
  const type = text(task.type).toUpperCase();
  const capability = text(task.capability || task.service_id || task.service_code).toLowerCase();
  const title = text(task.title).toLowerCase();
  return type === "GENERATE_MUSIC" ||
    capability.includes("music") ||
    /master soundtrack|soundtrack/.test(title);
}

function masterSoundtrackTaskIds(tasks = []) {
  const candidates = list(tasks).filter(isMasterSoundtrackTask);
  const explicit = candidates.filter((task) =>
    /master soundtrack|soundtrack/.test(text(task.title).toLowerCase()),
  );
  return (explicit.length ? explicit : candidates).map((task) => task.id);
}

function timelineSourcesForTimestamps(timeline = {}, timestamps = []) {
  const edits = list(timeline.metadata?.edit_decision_list);
  const values = timestamps.flatMap((entry) => {
    if (typeof entry === "number") return [entry];
    if (typeof entry === "string" && Number.isFinite(Number(entry))) return [Number(entry)];
    if (!entry || typeof entry !== "object") return [];
    return [entry.start_seconds, entry.end_seconds, entry.timestamp_seconds, entry.time_seconds]
      .map(Number)
      .filter(Number.isFinite);
  });
  return edits.filter((edit) => values.some((value) =>
    value >= Number(edit.timeline_in_seconds || 0) &&
    value <= Number(edit.timeline_out_seconds || 0),
  ));
}

function resolveVisualTargetTaskIds({ report, timeline, nodes, tasks }) {
  const entries = repairEntries(report).filter((entry) => !isAudioRepairEntry(entry));
  const shotIds = new Set(entries.flatMap((entry) => entry.affected_shot_ids));
  const sceneIds = new Set(entries.flatMap((entry) => entry.affected_scene_ids));
  const timestamps = entries.flatMap((entry) => entry.timestamps);
  const ids = new Set(
    tasks
      .filter((task) =>
        !isMasterSoundtrackTask(task) &&
        (
          (task.shot_id && shotIds.has(text(task.shot_id))) ||
          (task.scene_id && sceneIds.has(text(task.scene_id)))
        ),
      )
      .map((task) => task.id),
  );

  const timestampEdits = timelineSourcesForTimestamps(timeline, timestamps);
  for (const edit of timestampEdits) {
    const sourceIds = [
      edit.source_asset_node_id,
      edit.source_clip_node_id,
      edit.source_moment_node_id,
    ].filter(Boolean);
    for (const node of nodes.filter((candidate) => sourceIds.includes(candidate.id))) {
      const productionTaskId = node.production_task_id || node.metadata?.production_task_id;
      if (productionTaskId) ids.add(productionTaskId);
      const parent = nodes.find((candidate) => candidate.id === node.parent_asset_node_id);
      const parentTaskId = parent?.production_task_id || parent?.metadata?.production_task_id;
      if (parentTaskId) ids.add(parentTaskId);
      const source = nodes.find((candidate) => candidate.id === node.metadata?.source_asset_node_id);
      const sourceTaskId = source?.production_task_id || source?.metadata?.production_task_id;
      if (sourceTaskId) ids.add(sourceTaskId);
    }
  }

  return [...ids].filter((id) => {
    const task = tasks.find((item) => item.id === id);
    return task && !isMasterSoundtrackTask(task);
  });
}

function resolveTargetTaskIds({ report, timeline, nodes, tasks }) {
  const failed = failedChecks(report).map((check) => text(check.id));
  const hasAudioFailure = failed.some((id) => AUDIO_REPAIR_CHECKS.has(id));
  const hasVisualFailure = failed.some((id) => !AUDIO_REPAIR_CHECKS.has(id));
  const ids = new Set();

  if (hasVisualFailure) {
    for (const id of resolveVisualTargetTaskIds({ report, timeline, nodes, tasks })) {
      ids.add(id);
    }
  }
  if (hasAudioFailure) {
    for (const id of masterSoundtrackTaskIds(tasks)) ids.add(id);
  }

  return [...ids];
}

function instructionsForTask(report, task) {
  const audioTask = isMasterSoundtrackTask(task);
  const entries = repairEntries(report).filter((entry) =>
    audioTask ? isAudioRepairEntry(entry) : !isAudioRepairEntry(entry),
  ).filter((entry) =>
    audioTask ||
    !entry.affected_shot_ids.length || entry.affected_shot_ids.includes(text(task.shot_id)) ||
    !entry.affected_scene_ids.length || entry.affected_scene_ids.includes(text(task.scene_id)),
  );
  const instructions = entries.map((entry) => entry.instruction);
  if (instructions.length) return [...new Set(instructions)];
  return audioTask
    ? [
        "Repair only the approved master soundtrack against the failed whole-film audio checks and the existing Director cue sheet.",
        "Preserve exact duration, approved story timing, cue-sheet structure, rights constraints and all unaffected musical decisions.",
      ]
    : [
        "Regenerate only this failed film stage and correct the semantic quality failures recorded for the final render.",
        "Preserve approved story state, identity, product, location, wardrobe, screen direction, timing and all unaffected requirements.",
      ];
}

async function markSourceLineageBlocked({ nodes, sourceTaskId, replacementTaskId, reportId }) {
  const sourceNodes = nodes.filter((node) =>
    node.production_task_id === sourceTaskId || node.metadata?.production_task_id === sourceTaskId,
  );
  const blockedIds = new Set(sourceNodes.map((node) => node.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (
        !blockedIds.has(node.id) &&
        (blockedIds.has(node.parent_asset_node_id) || blockedIds.has(node.metadata?.source_asset_node_id))
      ) {
        blockedIds.add(node.id);
        changed = true;
      }
    }
  }
  for (const node of nodes.filter((item) => blockedIds.has(item.id))) {
    await AssetGraphRepository.update(node.id, {
      metadata: {
        ...(node.metadata || {}),
        blocked: true,
        include_in_master: false,
        superseded_by_repair_task_id: replacementTaskId,
        semantic_repair_report_id: reportId,
      },
    });
  }
}

async function createReplacement({ task, report, project }) {
  const policy = repairPolicy(project);
  const instructions = instructionsForTask(report, task);
  const attempt = assertAutomaticRepairAllowed({ policy, sourceTask: task, instructions });
  const failures = failedChecks(report)
    .map((check) => text(check.id))
    .filter((id) =>
      isMasterSoundtrackTask(task)
        ? AUDIO_REPAIR_CHECKS.has(id)
        : !AUDIO_REPAIR_CHECKS.has(id),
    );
  const identity = repairIdentity({
    source_task_id: task.id,
    quality_task_id: report.id,
    attempt,
    failures,
    instructions,
  });
  const replacement = await ProductionTaskRuntime.create({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
    production_graph_id: task.production_graph_id,
    scene_id: task.scene_id || null,
    shot_id: task.shot_id || null,
    type: task.type,
    status: "WAITING",
    title: `Repair ${task.title || "film stage"}`,
    description: isMasterSoundtrackTask(task)
      ? `Targeted master-soundtrack semantic repair attempt ${attempt}.`
      : `Targeted semantic film repair attempt ${attempt}.`,
    service_id: task.service_id,
    service_code: task.service_code,
    capability: task.capability,
    provider_id: null,
    priority: integerPriority(task.priority, -1),
    depends_on: list(task.depends_on),
    input: {
      ...(task.input || {}),
      provider_policy: {
        ...(task.input?.provider_policy || {}),
        blocked_providers: [
          ...new Set([
            ...(task.input?.provider_policy?.blocked_providers || []),
            task.provider_id,
          ].filter(Boolean)),
        ],
      },
      repair_contract: {
        version: policy.version,
        attempt,
        failures,
        instructions,
        source_task_id: task.id,
        semantic_quality_report_id: report.id,
        preserve_approved_direction: true,
        preserve_director_cue_sheet: isMasterSoundtrackTask(task),
        change_only_failed_requirements: true,
      },
    },
    cost: {
      ...(task.cost || {}),
      actual: 0,
      approved: task.cost?.approved === true || Number(task.cost?.estimated || 0) <= 0,
    },
    timing: { estimated_seconds: Number(task.timing?.estimated_seconds || 0) },
    review: { required: true, approved: false },
    metadata: {
      ...(task.metadata || {}),
      execution_node_id: `${task.metadata?.execution_node_id || task.id}:semantic-repair:${attempt}`,
      execution_step_id: `${task.metadata?.execution_step_id || task.id}:semantic-repair:${attempt}`,
      repair_attempt: attempt,
      repair_identity: identity,
      repair_of_task_id: task.id,
      semantic_quality_report_id: report.id,
      repair_failures: failures,
      repair_instructions: instructions,
      repair_scope: isMasterSoundtrackTask(task) ? "MASTER_SOUNDTRACK" : "VISUAL_PRODUCTION",
      autonomous_repair: true,
      release_candidate: task.metadata?.release_candidate === true,
    },
  });
  await ProductionTaskRuntime.update(task.id, {
    metadata: {
      ...(task.metadata || {}),
      superseded_by_repair_task_id: replacement.id,
      repair_identity: identity,
      repair_attempted: true,
      semantic_quality_report_id: report.id,
    },
  });
  return replacement;
}

export const CreativeTemporalSemanticRepairRuntime = {
  async evaluate({ organization_id, creative_project_id, post_production = {} } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    const project = await CreativeProjectRepository.getById(creative_project_id);
    if (!project || project.organization_id !== organization_id) {
      throw new Error("Creative project not found");
    }
    const render = post_production.render;
    const timeline = post_production.timeline;
    if (!render?.id || !timeline?.id) return post_production;

    const policy = semanticPolicy(project);
    if (!text(policy.version) || !text(policy.service_id) || !text(policy.model)) {
      return {
        ...post_production,
        status: "REVIEW_REQUIRED",
        semantic_quality: null,
        semantic_quality_blocker: "SEMANTIC_REVIEW_POLICY_REQUIRED",
      };
    }

    const semantic = await CreativeAutonomousSemanticReviewRuntime.analyze({
      organization_id,
      render_asset_node_id: render.id,
      policy,
      provider_id: policy.provider_id || null,
    });
    const report = semantic.report;
    if (reportPassed(report)) {
      const readiness = await CreativeReleaseReadinessRuntime.evaluate({
        organization_id,
        creative_project_id,
        timeline_asset_node_id: timeline.id,
        final_render_asset_node_id: render.id,
        force: true,
      });
      return {
        ...post_production,
        status: readiness.report.metadata?.passed ? "READY_FOR_APPROVAL" : "REVIEW_REQUIRED",
        semantic_quality: report,
        release_readiness: readiness.report,
      };
    }

    const [nodes, tasks] = await Promise.all([
      AssetGraphRepository.listByProject({ organization_id, creative_project_id }),
      ProductionTaskRuntime.list({ organization_id, creative_project_id }),
    ]);
    const targetTaskIds = resolveTargetTaskIds({ report, timeline, nodes, tasks });
    const audioFailures = failedChecks(report)
      .map((check) => text(check.id))
      .filter((id) => AUDIO_REPAIR_CHECKS.has(id));
    const audioTargets = masterSoundtrackTaskIds(tasks);
    const created = [];
    const blocked = [];

    if (audioFailures.length && !audioTargets.length) {
      blocked.push({
        source_task_id: null,
        reason: "MASTER_SOUNDTRACK_REPAIR_TASK_NOT_FOUND",
        failed_checks: audioFailures,
      });
    }

    for (const id of targetTaskIds) {
      const task = tasks.find((item) => item.id === id);
      if (!task || task.metadata?.superseded_by_repair_task_id) continue;
      try {
        const replacement = await createReplacement({ task, report, project });
        await markSourceLineageBlocked({
          nodes,
          sourceTaskId: task.id,
          replacementTaskId: replacement.id,
          reportId: report.id,
        });
        created.push({
          source_task_id: task.id,
          replacement_task_id: replacement.id,
          repair_scope: replacement.metadata?.repair_scope || null,
        });
      } catch (error) {
        blocked.push({ source_task_id: task.id, reason: error.message });
      }
    }

    return {
      ...post_production,
      status: created.length ? "AUTONOMOUS_REPAIR_SCHEDULED" : "REVIEW_REQUIRED",
      semantic_quality: report,
      semantic_repair: {
        created,
        blocked,
        target_task_ids: targetTaskIds,
        audio_target_task_ids: audioTargets,
        failed_checks: failedChecks(report).map((check) => check.id),
      },
    };
  },
};
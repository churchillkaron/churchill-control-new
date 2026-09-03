import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const CONTRACT = "CREATIVE_HUMAN_SHOT_REVISION_V1";
const SCOPES = new Set(["AUTO", "CAMERA_MOTION", "PERFORMANCE", "LIP_SYNC", "FULL_SHOT"]);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function promptlessInput(value = {}) {
  const {
    prompt: ignoredPrompt,
    provider_prompt: ignoredProviderPrompt,
    instructions_text: ignoredInstructionsText,
    ...rest
  } = object(value);
  return rest;
}

function mediaReference(task = {}) {
  const output = object(task.output);
  return text(
    output.file_url ||
    output.video_url ||
    output.url ||
    output.output?.video_url ||
    output.output?.file_url ||
    output.output?.url ||
    output.output?.result ||
    output.provider_poll?.output,
  ) || null;
}

function isQualityTask(task = {}) {
  return task.type === "QUALITY_REVIEW" || task.metadata?.quality_gate === true;
}

function isVideoCandidateTask(task = {}) {
  const capability = text(task.capability || task.service_code).toLowerCase();
  const type = text(task.type).toUpperCase();
  return !isQualityTask(task) && Boolean(mediaReference(task)) && (
    capability.startsWith("ai.video.") ||
    type.includes("VIDEO") ||
    type === "LIP_SYNC"
  );
}

function supersessionId(task = {}) {
  return (
    task.metadata?.superseded_by_revision_task_id ||
    task.metadata?.superseded_by_repair_review_task_id ||
    task.metadata?.superseded_by_repair_task_id ||
    null
  );
}

function effectiveTask(taskMap, taskOrId, seen = new Set()) {
  const task = typeof taskOrId === "string" ? taskMap.get(taskOrId) : taskOrId;
  if (!task || seen.has(task.id)) return task || null;
  seen.add(task.id);
  const replacementId = supersessionId(task);
  return replacementId ? effectiveTask(taskMap, replacementId, seen) : task;
}

function normalizeScope(value) {
  const scope = text(value || "AUTO").toUpperCase();
  if (!SCOPES.has(scope)) throw new Error(`CREATIVE_SHOT_REVISION_SCOPE_INVALID:${scope}`);
  return scope;
}

function preservePolicy(scope) {
  const common = {
    brand: true,
    approved_identity: true,
    approved_direction: true,
    continuity: true,
    story_purpose: true,
    factual_claims: true,
    unaffected_requirements: true,
  };
  if (scope === "CAMERA_MOTION") {
    return { ...common, performance: true, audio: true, speech_content: true, timing: true, camera_motion: false };
  }
  if (scope === "PERFORMANCE") {
    return { ...common, camera_motion: true, framing: true, audio: true, speech_content: true, timing: true, performance: false };
  }
  if (scope === "LIP_SYNC") {
    return { ...common, camera_motion: true, framing: true, visual_continuity: true, speech_content: true, timing: true, lip_sync: false, speaking_performance: false };
  }
  if (scope === "FULL_SHOT") {
    return { ...common, camera_motion: false, framing: false, performance: false, timing: false };
  }
  return { ...common, preserve_unless_revision_direction_changes_it: true };
}

function cleanMetadata(value = {}) {
  const metadata = { ...object(value) };
  for (const key of [
    "superseded_by_revision_task_id",
    "superseded_by_repair_review_task_id",
    "superseded_by_repair_task_id",
    "selected_for_master",
    "selected_candidate_asset_node_id",
    "selected_candidate_weakest_score",
    "selected_candidate_overall_score",
    "repair_attempted",
    "repair_identity",
  ]) delete metadata[key];
  return metadata;
}

function descendantTasks(tasks, rootId, shotId) {
  const descendants = [];
  const reached = new Set([rootId]);
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const task of tasks) {
      if (reached.has(task.id)) continue;
      if (text(task.shot_id || task.metadata?.shot_id) !== text(shotId)) continue;
      if (supersessionId(task)) continue;
      if (!list(task.depends_on).some((dependencyId) => reached.has(dependencyId))) continue;
      reached.add(task.id);
      descendants.push(task);
      progressed = true;
    }
  }
  return descendants;
}

function sortedForClone(tasks, rootId) {
  const remaining = [...tasks];
  const ordered = [];
  const resolved = new Set([rootId]);
  while (remaining.length) {
    const index = remaining.findIndex((task) =>
      list(task.depends_on)
        .filter((id) => tasks.some((candidate) => candidate.id === id))
        .every((id) => resolved.has(id)),
    );
    const selectedIndex = index >= 0 ? index : 0;
    const [task] = remaining.splice(selectedIndex, 1);
    ordered.push(task);
    resolved.add(task.id);
  }
  return ordered;
}

function revisedDependencies(task, replacements) {
  return [...new Set(list(task.depends_on).map((id) => replacements.get(id) || id))];
}

function revisionMetadata(task, revision, role) {
  const metadata = cleanMetadata(task.metadata);
  const baseNode = text(metadata.execution_node_id || task.id);
  const baseStep = text(metadata.execution_step_id || task.id);
  return {
    ...metadata,
    execution_node_id: `${baseNode}:human-revision:${revision.id}`,
    execution_step_id: `${baseStep}:human-revision:${revision.id}`,
    human_revision: true,
    human_revision_contract: CONTRACT,
    human_revision_id: revision.id,
    human_revision_role: role,
    revision_reference_task_id: revision.reference_task_id,
    revision_replaces_task_id: revision.replaces_task_id,
    revision_scope: revision.scope,
    revision_direction: revision.direction,
    revision_requested_at: revision.requested_at,
    revision_requested_by: revision.requested_by,
    promptless_revision: true,
    structured_revision_source_of_truth: true,
    revision_preparing: true,
    release_candidate: role === "SOURCE" ? task.metadata?.release_candidate === true : task.metadata?.release_candidate,
  };
}

function resetCost(cost = {}) {
  const estimated = Number(cost.estimated || 0);
  return {
    ...object(cost),
    estimated: Number.isFinite(estimated) ? estimated : 0,
    actual: 0,
    approved: !(Number.isFinite(estimated) && estimated > 0),
  };
}

async function createPreparedClone({ task, revision, role, depends_on, input }) {
  return ProductionTaskRuntime.create({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
    production_graph_id: task.production_graph_id,
    scene_id: task.scene_id || null,
    shot_id: task.shot_id || revision.shot_id,
    type: task.type,
    status: "SKIPPED",
    title: role === "SOURCE"
      ? `Revision · ${task.title || "shot candidate"}`
      : `Re-run · ${task.title || "dependent production step"}`,
    description: role === "SOURCE"
      ? `Human-directed surgical revision of ${task.title || task.id}.`
      : `Re-run after human-directed revision ${revision.id}; unrelated production remains untouched.`,
    service_id: task.service_id,
    service_code: task.service_code,
    capability: task.capability,
    provider_id: null,
    priority: Number(task.priority || 100),
    depends_on,
    input,
    cost: resetCost(task.cost),
    timing: { estimated_seconds: Number(task.timing?.estimated_seconds || 0) },
    review: { required: task.review?.required === true, approved: false },
    error: "REVISION_PREPARING",
    metadata: revisionMetadata(task, revision, role),
    created_by: revision.requested_by?.user_id || null,
  });
}

async function hideAbortedClones(clones = [], error) {
  for (const clone of clones) {
    try {
      await ProductionTaskRuntime.update(clone.id, {
        status: "SKIPPED",
        error: error?.message || "REVISION_PREPARATION_ABORTED",
        metadata: {
          ...(clone.metadata || {}),
          revision_aborted: true,
          revision_preparing: false,
          superseded_by_revision_task_id: clone.id,
          superseded_by_repair_task_id: clone.id,
        },
      });
    } catch {}
  }
}

async function archiveSupersededAssets({ organization_id, creative_project_id, taskIds, replacementId, revisionId }) {
  const nodes = await AssetGraphRepository.listByProject({ organization_id, creative_project_id });
  const ids = new Set(taskIds.map(String));
  for (const node of nodes) {
    const productionTaskId = text(node.production_task_id || node.metadata?.production_task_id);
    if (!ids.has(productionTaskId)) continue;
    const oldShotId = text(node.metadata?.shot_id) || null;
    await AssetGraphRepository.update(node.id, {
      metadata: {
        ...(node.metadata || {}),
        revision_history_shot_id: oldShotId,
        shot_id: null,
        superseded_by_revision_task_id: replacementId,
        human_revision_id: revisionId,
        selected_for_master: false,
        include_in_master: false,
      },
    });
  }
}

export const CreativeShotRevisionRuntime = Object.freeze({
  contract: CONTRACT,
  scopes: [...SCOPES],

  async queue({
    organization_id,
    creative_project_id,
    shot_id,
    source_task_id,
    scope = "AUTO",
    direction,
    requester = null,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    if (!shot_id) throw new Error("shot_id required");
    if (!source_task_id) throw new Error("source_task_id required");
    const revisionDirection = text(direction);
    if (!revisionDirection) throw new Error("revision direction required");
    if (revisionDirection.length > 1200) throw new Error("revision direction too long");
    const revisionScope = normalizeScope(scope);

    const [project, tasks] = await Promise.all([
      CreativeProjectRepository.getById(creative_project_id),
      ProductionTaskRuntime.list({ organization_id, creative_project_id }),
    ]);
    if (!project || text(project.organization_id) !== text(organization_id)) {
      throw new Error("Creative project not found");
    }

    const taskMap = new Map(tasks.map((task) => [task.id, task]));
    const reference = taskMap.get(source_task_id);
    if (!reference || text(reference.organization_id) !== text(organization_id)) {
      throw new Error("CREATIVE_SHOT_REVISION_SOURCE_NOT_FOUND");
    }
    if (text(reference.shot_id || reference.metadata?.shot_id) !== text(shot_id)) {
      throw new Error("CREATIVE_SHOT_REVISION_SOURCE_SCOPE_MISMATCH");
    }
    if (!isVideoCandidateTask(reference)) {
      throw new Error("CREATIVE_SHOT_REVISION_VIDEO_CANDIDATE_REQUIRED");
    }
    if (!["COMPLETED", "REVIEW", "APPROVED"].includes(text(reference.status).toUpperCase())) {
      throw new Error("CREATIVE_SHOT_REVISION_SETTLED_CANDIDATE_REQUIRED");
    }

    const active = effectiveTask(taskMap, reference);
    if (!active) throw new Error("CREATIVE_SHOT_REVISION_ACTIVE_SOURCE_NOT_FOUND");
    if (text(active.shot_id || active.metadata?.shot_id) !== text(shot_id)) {
      throw new Error("CREATIVE_SHOT_REVISION_ACTIVE_SOURCE_SCOPE_MISMATCH");
    }
    if (text(active.status).toUpperCase() === "RUNNING") {
      throw new Error("CREATIVE_SHOT_REVISION_SOURCE_STILL_RUNNING");
    }

    const descendants = descendantTasks(tasks, active.id, shot_id);
    const runningAffected = descendants.filter((task) => text(task.status).toUpperCase() === "RUNNING");
    if (runningAffected.length) {
      throw new Error(`CREATIVE_SHOT_REVISION_DEPENDENCY_STILL_RUNNING:${runningAffected.map((task) => task.id).join(",")}`);
    }

    const revision = {
      id: crypto.randomUUID(),
      contract: CONTRACT,
      scope: revisionScope,
      direction: revisionDirection,
      shot_id,
      reference_task_id: reference.id,
      replaces_task_id: active.id,
      requested_at: new Date().toISOString(),
      requested_by: requester,
      preserve: preservePolicy(revisionScope),
    };

    const created = [];
    const replacements = new Map();
    try {
      const replacement = await createPreparedClone({
        task: reference,
        revision,
        role: "SOURCE",
        depends_on: list(active.depends_on),
        input: {
          ...promptlessInput(reference.input),
          revision_specification: {
            contract: CONTRACT,
            revision_id: revision.id,
            scope: revision.scope,
            direction: revision.direction,
            preserve: revision.preserve,
            change_only_requested_scope: revision.scope !== "FULL_SHOT",
            reference_task_id: reference.id,
            reference_media: mediaReference(reference),
            replaces_task_id: active.id,
            promptless_source_of_truth: true,
          },
        },
      });
      created.push(replacement);
      replacements.set(active.id, replacement.id);

      for (const dependent of sortedForClone(descendants, active.id)) {
        const clone = await createPreparedClone({
          task: dependent,
          revision,
          role: isQualityTask(dependent) ? "QUALITY" : "DEPENDENT",
          depends_on: revisedDependencies(dependent, replacements),
          input: {
            ...promptlessInput(dependent.input),
            revision_evaluation: {
              contract: CONTRACT,
              revision_id: revision.id,
              revision_scope: revision.scope,
              revision_direction: revision.direction,
              revised_source_task_id: replacement.id,
              original_task_id: dependent.id,
              reject_regressions: true,
              preserve: revision.preserve,
              promptless_source_of_truth: true,
            },
          },
        });
        created.push(clone);
        replacements.set(dependent.id, clone.id);
      }

      const originals = [active, ...descendants];
      for (const original of originals) {
        const replacementId = replacements.get(original.id);
        if (!replacementId) continue;
        await ProductionTaskRuntime.update(original.id, {
          metadata: {
            ...(original.metadata || {}),
            superseded_by_revision_task_id: replacementId,
            superseded_by_repair_task_id: replacementId,
            human_revision_id: revision.id,
            revision_reference_task_id: reference.id,
            revision_requested_at: revision.requested_at,
            revision_requested_by: requester,
          },
        });
      }

      for (const clone of created) {
        await ProductionTaskRuntime.update(clone.id, {
          status: "PLANNING",
          error: null,
          metadata: {
            ...(clone.metadata || {}),
            revision_preparing: false,
            revision_queued: true,
          },
        });
      }

      await archiveSupersededAssets({
        organization_id,
        creative_project_id,
        taskIds: originals.map((task) => task.id),
        replacementId: replacement.id,
        revisionId: revision.id,
      });

      const paidReplacementCount = created.filter((task) => Number(task.cost?.estimated || 0) > 0).length;
      return {
        success: true,
        contract: CONTRACT,
        revision_id: revision.id,
        shot_id,
        scope: revision.scope,
        reference_task_id: reference.id,
        replaced_task_id: active.id,
        replacement_task_id: replacement.id,
        recreated_task_ids: created.map((task) => task.id),
        recreated_task_count: created.length,
        recreated_dependent_count: Math.max(0, created.length - 1),
        old_versions_preserved: true,
        provider_execution_started: false,
        paid_replacement_count: paidReplacementCount,
        requires_explicit_run_production: true,
      };
    } catch (error) {
      await hideAbortedClones(created, error);
      throw error;
    }
  },
});

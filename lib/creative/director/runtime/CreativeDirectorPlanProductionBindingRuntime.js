import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { ShotRuntime } from "@/lib/creative/shots/runtime/ShotRuntime";
import {
  CreativeProfessionalDirectionAuthorityRuntime,
} from "@/lib/creative/continuity/runtime/CreativeProfessionalDirectionAuthorityRuntime";

export const CREATIVE_DIRECTOR_PRODUCTION_BINDING_CONTRACT =
  "AVANTIQO_CREATIVE_DIRECTOR_PRODUCTION_BINDING_V1";

function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function equalLists(left = [], right = []) {
  const a = [...new Set(list(left).map((value) => text(value, 500)).filter(Boolean))].sort();
  const b = [...new Set(list(right).map((value) => text(value, 500)).filter(Boolean))].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function shotId(value = {}) {
  return text(value.shot_id || value.id, 180);
}

function snapshotShot(shot = {}) {
  return {
    shot_id: text(shot.id, 180),
    scene_id: text(shot.scene_id, 180) || null,
    scene_number: Number(shot.scene_number || 0) || null,
    shot_number: Number(shot.shot_number || 0) || null,
    revision_number: Number(shot.metadata?.revision_number || 0),
    updated_at: text(shot.updated_at, 180) || null,
    professional_locked_fields:
      CreativeProfessionalDirectionAuthorityRuntime.lockedFields(shot),
  };
}

function exactCurrentSnapshots({ ids, currentById, errorPrefix }) {
  return ids.map((id) => {
    const shot = currentById.get(id);
    if (!shot) {
      const error = new Error(`${errorPrefix}_SHOT_NOT_FOUND`);
      error.status = 409;
      error.details = { shot_id: id };
      throw error;
    }
    return snapshotShot(shot);
  });
}

function validatePlan({ directorPlan, creativeProjectId }) {
  if (!text(directorPlan.contract, 180).startsWith("AVANTIQO_CREATIVE_DIRECTOR_PLAN_")) {
    throw new Error("CREATIVE_DIRECTOR_PRODUCTION_PLAN_REQUIRED");
  }
  if (text(directorPlan.creative_project_id, 180) !== text(creativeProjectId, 180)) {
    throw new Error("CREATIVE_DIRECTOR_PRODUCTION_PLAN_PROJECT_MISMATCH");
  }
  if (!text(directorPlan.fingerprints?.director_plan, 180)) {
    throw new Error("CREATIVE_DIRECTOR_PRODUCTION_PLAN_FINGERPRINT_REQUIRED");
  }
  const editableIds = list(directorPlan.change_set?.editable?.shots).map(shotId).filter(Boolean);
  const preservedIds = list(directorPlan.change_set?.preserved?.shots).map(shotId).filter(Boolean);
  if (!editableIds.length) {
    throw new Error("CREATIVE_DIRECTOR_PRODUCTION_EDITABLE_SET_REQUIRED");
  }
  if (new Set([...editableIds, ...preservedIds]).size !== editableIds.length + preservedIds.length) {
    throw new Error("CREATIVE_DIRECTOR_PRODUCTION_SHOT_SETS_OVERLAP");
  }
  if (list(directorPlan.change_set?.professional_lock_conflicts).length) {
    throw new Error("CREATIVE_DIRECTOR_PRODUCTION_PLAN_LOCK_CONFLICT");
  }
  return { editableIds, preservedIds };
}

function matchesSnapshot(current, expected) {
  return Boolean(
    current &&
    expected &&
    Number(current.revision_number || 0) === Number(expected.revision_number || 0) &&
    text(current.updated_at, 180) === text(expected.updated_at, 180)
  );
}

function timelineShotIds(postProduction = {}) {
  const timeline = object(postProduction.timeline);
  const render = object(postProduction.render);
  const ids = new Set();
  for (const edit of list(timeline.metadata?.edit_decision_list)) {
    const id = text(
      edit.shot_id ||
      edit.source_shot_id ||
      edit.metadata?.shot_id,
      180,
    );
    if (id) ids.add(id);
  }
  for (const segment of list(render.metadata?.segment_controls)) {
    const id = text(segment.shot_id, 180);
    if (id) ids.add(id);
  }
  return ids;
}

export const CreativeDirectorPlanProductionBindingRuntime = Object.freeze({
  contract: CREATIVE_DIRECTOR_PRODUCTION_BINDING_CONTRACT,

  async bindCommitted({
    organization_id,
    creative_project_id,
    director_plan,
    checkpoint_id = null,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    const directorPlan = object(director_plan);
    const { editableIds, preservedIds } = validatePlan({
      directorPlan,
      creativeProjectId: creative_project_id,
    });

    const [project, shots] = await Promise.all([
      CreativeProjectRepository.getById(creative_project_id),
      ShotRuntime.list({ organization_id, creative_project_id }),
    ]);
    if (!project || text(project.organization_id, 180) !== text(organization_id, 180)) {
      throw new Error("Creative project not found");
    }
    const currentById = new Map(shots.map((shot) => [text(shot.id, 180), shot]));
    const editableSnapshots = exactCurrentSnapshots({
      ids: editableIds,
      currentById,
      errorPrefix: "CREATIVE_DIRECTOR_PRODUCTION_BIND",
    });
    const preservedSnapshots = exactCurrentSnapshots({
      ids: preservedIds,
      currentById,
      errorPrefix: "CREATIVE_DIRECTOR_PRODUCTION_BIND_PRESERVED",
    });

    const binding = {
      contract: CREATIVE_DIRECTOR_PRODUCTION_BINDING_CONTRACT,
      director_plan_contract: directorPlan.contract,
      director_plan_fingerprint: directorPlan.fingerprints.director_plan,
      change_set_fingerprint: directorPlan.fingerprints.change_set || null,
      experience_mode: directorPlan.experience_mode || null,
      checkpoint_id: text(checkpoint_id, 180) || null,
      bound_at: new Date().toISOString(),
      director_plan: directorPlan,
      committed_state: {
        editable_shots: editableSnapshots,
        preserved_shots: preservedSnapshots,
      },
      release_requirements: {
        required_qc_targets: list(directorPlan.quality?.required_qc_targets),
        exact_committed_state_required: true,
        preserved_shots_immutable: true,
        professional_locks_enforced: true,
        final_render_scope_evidence_required: true,
      },
    };

    await CreativeProjectRepository.update(creative_project_id, {
      metadata: {
        ...object(project.metadata),
        active_director_quality_plan: binding,
      },
    });
    return binding;
  },

  binding(project = {}) {
    const value = object(project.metadata?.active_director_quality_plan);
    return value.contract === CREATIVE_DIRECTOR_PRODUCTION_BINDING_CONTRACT
      ? value
      : null;
  },

  evidence({ project = {}, shots = [], post_production = {} } = {}) {
    const binding = this.binding(project);
    if (!binding) {
      return {
        applicable: false,
        contract: CREATIVE_DIRECTOR_PRODUCTION_BINDING_CONTRACT,
        governance_evidence: null,
      };
    }

    const currentById = new Map(list(shots).map((shot) => [text(shot.id, 180), snapshotShot(shot)]));
    const editable = list(binding.committed_state?.editable_shots);
    const preserved = list(binding.committed_state?.preserved_shots);
    const all = [...editable, ...preserved];
    const changedEditable = editable.filter((expected) =>
      !matchesSnapshot(currentById.get(shotId(expected)), expected),
    );
    const changedPreserved = preserved.filter((expected) =>
      !matchesSnapshot(currentById.get(shotId(expected)), expected),
    );
    const lockDrift = all.filter((expected) => {
      const current = currentById.get(shotId(expected));
      return !current || !equalLists(
        current.professional_locked_fields,
        expected.professional_locked_fields,
      );
    });
    const renderedShotIds = timelineShotIds(post_production);
    const missingEditableRenderEvidence = editable
      .map(shotId)
      .filter((id) => !renderedShotIds.has(id));

    const governanceEvidence = {
      shot_scope_fidelity: missingEditableRenderEvidence.length === 0,
      preserved_shot_immutability: changedPreserved.length === 0,
      professional_lock_compliance: lockDrift.length === 0,
      stale_plan_freshness:
        changedEditable.length === 0 && changedPreserved.length === 0,
    };

    return {
      applicable: true,
      contract: CREATIVE_DIRECTOR_PRODUCTION_BINDING_CONTRACT,
      binding,
      director_plan: binding.director_plan,
      governance_evidence: governanceEvidence,
      details: {
        changed_editable_shot_ids: changedEditable.map(shotId),
        changed_preserved_shot_ids: changedPreserved.map(shotId),
        professional_lock_drift_shot_ids: lockDrift.map(shotId),
        rendered_shot_ids: [...renderedShotIds],
        missing_editable_render_evidence_shot_ids: missingEditableRenderEvidence,
      },
    };
  },
});

export default CreativeDirectorPlanProductionBindingRuntime;

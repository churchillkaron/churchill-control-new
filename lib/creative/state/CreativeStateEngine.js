import * as Repository from "./CreativeStateRepository";

export const PIPELINE_STAGES = {
  MISSION_CREATED: "MISSION_CREATED",
  UNDERSTANDING: "UNDERSTANDING",
  RESEARCHING: "RESEARCHING",
  BUILDING_STRATEGY: "BUILDING_STRATEGY",
  BUILDING_CONCEPT: "BUILDING_CONCEPT",
  WAITING_APPROVAL: "WAITING_APPROVAL",
  BUILDING_STORYBOARD: "BUILDING_STORYBOARD",
  PLANNING_PRODUCTION: "PLANNING_PRODUCTION",
  READY_FOR_EXECUTION: "READY_FOR_EXECUTION",
  EXECUTING: "EXECUTING",
  PRODUCING: "PRODUCING",
  REVIEWING: "REVIEWING",
  RENDERING: "RENDERING",
  PUBLISHING: "PUBLISHING",
  MONITORING: "MONITORING",
  LEARNING: "LEARNING",
  COMPLETED: "COMPLETED",
  BRIEF: "UNDERSTANDING",
  RESEARCH: "RESEARCHING",
  STRATEGY: "BUILDING_STRATEGY",
  STORYBOARD: "BUILDING_STORYBOARD",
  GRAPH: "PLANNING_PRODUCTION",
  EXECUTION: "READY_FOR_EXECUTION",
  PRODUCTION: "PRODUCING",
  COMPLETE: "COMPLETED",
};

export const MISSION_LIFECYCLE = [
  PIPELINE_STAGES.MISSION_CREATED,
  PIPELINE_STAGES.UNDERSTANDING,
  PIPELINE_STAGES.RESEARCHING,
  PIPELINE_STAGES.BUILDING_STRATEGY,
  PIPELINE_STAGES.BUILDING_CONCEPT,
  PIPELINE_STAGES.WAITING_APPROVAL,
  PIPELINE_STAGES.BUILDING_STORYBOARD,
  PIPELINE_STAGES.PLANNING_PRODUCTION,
  PIPELINE_STAGES.READY_FOR_EXECUTION,
  PIPELINE_STAGES.EXECUTING,
  PIPELINE_STAGES.PRODUCING,
  PIPELINE_STAGES.REVIEWING,
  PIPELINE_STAGES.RENDERING,
  PIPELINE_STAGES.PUBLISHING,
  PIPELINE_STAGES.MONITORING,
  PIPELINE_STAGES.LEARNING,
  PIPELINE_STAGES.COMPLETED,
];

function normalizeStage(stage) {
  return PIPELINE_STAGES[stage] || stage || PIPELINE_STAGES.MISSION_CREATED;
}

function resolveStateId(input = {}) {
  if (typeof input === "string") return input;
  return input.creative_mission_id || input.mission_id || input.id || null;
}

function buildStatePatch(input = {}) {
  const stateId = resolveStateId(input);
  if (!stateId) throw new Error("creative_mission_id required");

  return {
    creative_mission_id: stateId,
    creative_project_id:
      input.creative_project_id ||
      input.project_id ||
      null,
    campaign_id: input.campaign_id || null,
    organization_id: input.organization_id || null,
  };
}

async function existingState(patch) {
  return Repository.get(patch.creative_mission_id);
}

function mergeState(state, patch) {
  return {
    ...(state || {}),
    ...patch,
    creative_project_id:
      patch.creative_project_id ||
      state?.creative_project_id ||
      null,
    campaign_id:
      patch.campaign_id ||
      state?.campaign_id ||
      null,
    organization_id:
      patch.organization_id ||
      state?.organization_id ||
      null,
  };
}

export async function acquireExecutionLock(input) {
  const patch = buildStatePatch(typeof input === "string" ? { id: input } : input);
  const state = await existingState(patch);
  if (state?.execution_lock) return false;

  await Repository.upsert({
    ...mergeState(state, patch),
    execution_lock: true,
    locked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  return true;
}

export async function releaseExecutionLock(input) {
  const patch = buildStatePatch(typeof input === "string" ? { id: input } : input);
  const state = await existingState(patch);
  if (!state) return null;

  return Repository.upsert({
    ...mergeState(state, patch),
    execution_lock: false,
    locked_at: null,
    updated_at: new Date().toISOString(),
  });
}

export const CreativeStateEngine = {
  acquireExecutionLock,
  releaseExecutionLock,
  stages: PIPELINE_STAGES,
  lifecycle: MISSION_LIFECYCLE,

  async get(input) {
    const id = resolveStateId(input);
    return id ? Repository.get(id) : null;
  },

  async init(input = {}) {
    const patch = buildStatePatch(input);
    const existing = await existingState(patch);
    if (existing) {
      const merged = mergeState(existing, patch);
      if (
        merged.creative_project_id !== existing.creative_project_id ||
        merged.organization_id !== existing.organization_id ||
        merged.campaign_id !== existing.campaign_id
      ) {
        return Repository.upsert({
          ...merged,
          updated_at: new Date().toISOString(),
        });
      }
      return existing;
    }

    return Repository.upsert({
      ...patch,
      stage: normalizeStage(input.stage || PIPELINE_STAGES.MISSION_CREATED),
      execution_lock: false,
      locked_at: null,
      updated_at: new Date().toISOString(),
    });
  },

  async advance(input, nextStage) {
    const patch = buildStatePatch(typeof input === "string" ? { id: input } : input);
    const state = await existingState(patch);
    if (!state) throw new Error("State not initialized");

    const current = normalizeStage(state.stage);
    const next = normalizeStage(nextStage);
    const currentIndex = MISSION_LIFECYCLE.indexOf(current);
    const nextIndex = MISSION_LIFECYCLE.indexOf(next);
    if (currentIndex >= 0 && nextIndex >= 0 && nextIndex < currentIndex) {
      throw new Error(`Invalid rollback ${current} -> ${next}`);
    }

    return Repository.upsert({
      ...mergeState(state, patch),
      stage: next,
      updated_at: new Date().toISOString(),
    });
  },

  async set(input, stage) {
    const patch = buildStatePatch(typeof input === "string" ? { id: input } : input);
    const existing = await existingState(patch);
    return Repository.upsert({
      ...mergeState(existing, patch),
      stage: normalizeStage(stage),
      updated_at: new Date().toISOString(),
    });
  },

  async complete(input, learning_summary = null) {
    const patch = buildStatePatch(typeof input === "string" ? { id: input } : input);
    const existing = await existingState(patch);
    return Repository.upsert({
      ...mergeState(existing, patch),
      stage: PIPELINE_STAGES.COMPLETED,
      execution_lock: false,
      locked_at: null,
      learning_summary,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  },
};

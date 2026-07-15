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

  return (
    input.creative_mission_id ||
    input.mission_id ||
    input.id
  );
}

function buildStatePatch(input = {}) {

  const stateId =
    resolveStateId(input);

  return {

    creative_mission_id:
      stateId,

    campaign_id:
      input.campaign_id ||
      null,

    organization_id:
      input.organization_id ||
      null,

  };
}

export const CreativeStateEngine = {
  acquireExecutionLock,
  releaseExecutionLock,

  stages: PIPELINE_STAGES,
  lifecycle: MISSION_LIFECYCLE,

  async get(input) {
    return Repository.get(resolveStateId(input));
  },

  async init(input = {}) {

    const patch =
      buildStatePatch(input);

    const existing =
      await Repository.get(
        patch.creative_mission_id
      );

    if (existing) {
      return existing;
    }

    return Repository.upsert({
      ...patch,
      stage: normalizeStage(
        input.stage ||
        PIPELINE_STAGES.MISSION_CREATED
      ),
      execution_lock: false,
      updated_at:
        new Date().toISOString(),
    });
  },

  async advance(input, nextStage) {
    const stateId = resolveStateId(input);
    const state = await Repository.get(stateId);

    if (!state) {
      throw new Error("State not initialized");
    }

    const current = normalizeStage(state.stage);
    const next = normalizeStage(nextStage);

    const currentIndex = MISSION_LIFECYCLE.indexOf(current);
    const nextIndex = MISSION_LIFECYCLE.indexOf(next);

    if (currentIndex >= 0 && nextIndex >= 0 && nextIndex < currentIndex) {
      throw new Error(`Invalid rollback ${current} -> ${next}`);
    }

    return Repository.upsert({
      ...state,
      stage: next,
      updated_at: new Date().toISOString(),
    });
  },

  async set(input, stage) {
    const patch = buildStatePatch(
      typeof input === "string"
        ? { id: input }
        : input
    );

    const existing = await Repository.get(patch.project_id);

    return Repository.upsert({
      ...(existing || {}),
      ...patch,
      stage: normalizeStage(stage),
      updated_at: new Date().toISOString(),
    });
  },

  async complete(input, learning_summary = null) {
    const patch = buildStatePatch(
      typeof input === "string"
        ? { id: input }
        : input
    );

    const existing = await Repository.get(patch.project_id);

    return Repository.upsert({
      ...(existing || {}),
      ...patch,
      stage: PIPELINE_STAGES.COMPLETED,
      execution_lock: false,
      locked_at: null,
      learning_summary,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  },
};

export async function acquireExecutionLock(input) {
  const patch = buildStatePatch(
    typeof input === "string"
      ? { id: input }
      : input
  );

  const state = await Repository.get(patch.project_id);

  if (state?.execution_lock) {
    return false;
  }

  await Repository.upsert({
    ...(state || {}),
    ...patch,
    execution_lock: true,
    updated_at: new Date().toISOString(),
  });

  return true;
}

export async function releaseExecutionLock(input) {
  const patch = buildStatePatch(
    typeof input === "string"
      ? { id: input }
      : input
  );

  const state = await Repository.get(patch.project_id);

  if (!state) return;

  await Repository.upsert({
    ...state,
    execution_lock: false,
    updated_at: new Date().toISOString(),
  });
}

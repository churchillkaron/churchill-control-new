import { randomUUID } from "node:crypto";
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
  RENDERING: "RENDERING",
  REVIEWING: "REVIEWING",
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
  PIPELINE_STAGES.RENDERING,
  PIPELINE_STAGES.REVIEWING,
  PIPELINE_STAGES.PUBLISHING,
  PIPELINE_STAGES.MONITORING,
  PIPELINE_STAGES.LEARNING,
  PIPELINE_STAGES.COMPLETED,
];

const DEFAULT_EXECUTION_LOCK_LEASE_MS = 120000;
const LOCK_CAS_RETRY_LIMIT = 4;
const heldLocks = new Map();

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

function lockLeaseMs(input = {}) {
  const configured = Number(
    input.execution_lock_lease_ms ||
    input.lock_lease_ms ||
    process.env.CREATIVE_EXECUTION_LOCK_LEASE_MS,
  );
  return Number.isFinite(configured) && configured >= 30000
    ? configured
    : DEFAULT_EXECUTION_LOCK_LEASE_MS;
}

function lockToken(state = {}) {
  return state.metadata?.execution_lock?.token || null;
}

function lockExpired(state = {}, leaseMs) {
  if (!state.execution_lock) return true;
  const lockedAt = Date.parse(state.locked_at || "");
  if (!Number.isFinite(lockedAt)) return true;
  return Date.now() - lockedAt > leaseMs;
}

function lockMetadata(state = {}, token, values = {}) {
  return {
    ...(state.metadata || {}),
    execution_lock: {
      ...(state.metadata?.execution_lock || {}),
      token,
      ...values,
    },
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ownsLock(state, token) {
  return Boolean(
    state?.execution_lock === true &&
    token &&
    lockToken(state) === token,
  );
}

function stopHeartbeat(missionId) {
  const held = heldLocks.get(missionId);
  if (held?.timer) clearInterval(held.timer);
  heldLocks.delete(missionId);
}

function startHeartbeat(values, token, leaseMs) {
  const missionId = resolveStateId(values);
  stopHeartbeat(missionId);

  const intervalMs = Math.max(10000, Math.floor(leaseMs / 3));
  const timer = setInterval(async () => {
    try {
      const renewed = await renewExecutionLock({
        ...values,
        execution_lock_token: token,
        execution_lock_lease_ms: leaseMs,
      });
      if (!renewed) stopHeartbeat(missionId);
    } catch {
      const state = await Repository.get(missionId).catch(() => null);
      if (!ownsLock(state, token)) stopHeartbeat(missionId);
    }
  }, intervalMs);
  timer.unref?.();

  heldLocks.set(missionId, { token, timer, leaseMs });
}

export async function acquireExecutionLock(input) {
  const values = typeof input === "string" ? { id: input } : input;
  const patch = buildStatePatch(values);
  const state = await existingState(patch);
  const leaseMs = lockLeaseMs(values);
  const token =
    values.execution_lock_token ||
    heldLocks.get(patch.creative_mission_id)?.token ||
    randomUUID();
  const now = new Date().toISOString();

  if (!state) {
    try {
      await Repository.insert({
        ...patch,
        stage: normalizeStage(values.stage || PIPELINE_STAGES.MISSION_CREATED),
        execution_lock: true,
        locked_at: now,
        metadata: lockMetadata({}, token, {
          acquired_at: now,
          heartbeat_at: now,
          lease_ms: leaseMs,
        }),
        updated_at: now,
      });
      startHeartbeat(values, token, leaseMs);
      return token;
    } catch (error) {
      if (error?.code !== "23505") throw error;
      return false;
    }
  }

  const existingToken = lockToken(state);
  if (state.execution_lock && existingToken === token) {
    const renewed = await renewExecutionLock({
      ...values,
      execution_lock_token: token,
      execution_lock_lease_ms: leaseMs,
    });
    if (renewed) startHeartbeat(values, token, leaseMs);
    return renewed ? token : false;
  }
  if (state.execution_lock && !lockExpired(state, leaseMs)) {
    return false;
  }

  const acquired = await Repository.compareAndSwapExecutionLock({
    creative_mission_id: patch.creative_mission_id,
    expected_execution_lock: state.execution_lock === true,
    expected_locked_at: state.locked_at || null,
    values: {
      ...mergeState(state, patch),
      execution_lock: true,
      locked_at: now,
      metadata: lockMetadata(state, token, {
        acquired_at: now,
        heartbeat_at: now,
        lease_ms: leaseMs,
        reclaimed_stale_lock: state.execution_lock === true,
        previous_locked_at: state.locked_at || null,
      }),
    },
  });

  if (acquired) startHeartbeat(values, token, leaseMs);
  return acquired ? token : false;
}

export async function renewExecutionLock(input) {
  const values = typeof input === "string" ? { id: input } : input;
  const patch = buildStatePatch(values);
  const token =
    values.execution_lock_token ||
    heldLocks.get(patch.creative_mission_id)?.token;
  if (!token) throw new Error("execution_lock_token required");

  for (let attempt = 1; attempt <= LOCK_CAS_RETRY_LIMIT; attempt += 1) {
    const state = await existingState(patch);
    if (!ownsLock(state, token)) return false;

    const now = new Date().toISOString();
    const renewed = await Repository.compareAndSwapExecutionLock({
      creative_mission_id: patch.creative_mission_id,
      expected_execution_lock: true,
      expected_locked_at: state.locked_at || null,
      values: {
        ...mergeState(state, patch),
        execution_lock: true,
        locked_at: now,
        metadata: lockMetadata(state, token, {
          heartbeat_at: now,
          lease_ms: lockLeaseMs(values),
        }),
      },
    });
    if (renewed) return true;

    const latest = await existingState(patch);
    if (!ownsLock(latest, token)) return false;
    if (attempt < LOCK_CAS_RETRY_LIMIT) await delay(25 * attempt);
  }

  const latest = await existingState(patch);
  return ownsLock(latest, token);
}

export async function releaseExecutionLock(input) {
  const values = typeof input === "string" ? { id: input } : input;
  const patch = buildStatePatch(values);
  const held = heldLocks.get(patch.creative_mission_id);
  const token = values.execution_lock_token || held?.token || null;

  stopHeartbeat(patch.creative_mission_id);

  for (let attempt = 1; attempt <= LOCK_CAS_RETRY_LIMIT; attempt += 1) {
    const state = await existingState(patch);
    if (!state) return null;
    if (!state.execution_lock) return state;

    const existingToken = lockToken(state);
    if (existingToken && token !== existingToken) return null;

    const releasedAt = new Date().toISOString();
    const released = await Repository.compareAndSwapExecutionLock({
      creative_mission_id: patch.creative_mission_id,
      expected_execution_lock: true,
      expected_locked_at: state.locked_at || null,
      values: {
        ...mergeState(state, patch),
        execution_lock: false,
        locked_at: null,
        metadata: lockMetadata(state, null, {
          released_at: releasedAt,
          heartbeat_at: null,
        }),
      },
    });
    if (released) return released;

    const latest = await existingState(patch);
    if (!ownsLock(latest, token)) return latest?.execution_lock ? null : latest;
    if (attempt < LOCK_CAS_RETRY_LIMIT) await delay(25 * attempt);
  }

  return null;
}

export const CreativeStateEngine = {
  acquireExecutionLock,
  renewExecutionLock,
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
    stopHeartbeat(patch.creative_mission_id);
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

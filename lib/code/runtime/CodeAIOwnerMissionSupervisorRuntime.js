import crypto from "node:crypto";

export const CODE_AI_OWNER_MISSION_SUPERVISOR_CONTRACT =
  "AVANTIQO_CODE_AI_OWNER_MISSION_SUPERVISOR_V1";

const DEFAULT_MAX_CYCLES = 32;
const HARD_MAX_CYCLES = 128;
const DEFAULT_CYCLES_PER_ADVANCE = 8;
const HARD_MAX_CYCLES_PER_ADVANCE = 16;
const TERMINAL = new Set([
  "COMPLETED",
  "MATERIAL_OWNER_DECISION_REQUIRED",
  "HARD_EXTERNAL_BLOCKER",
  "CANCELED",
]);

function text(value, maximum = 8000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function positiveInteger(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(maximum, parsed);
}

function progressEvent(type, detail = {}) {
  return {
    at: new Date().toISOString(),
    type,
    ...object(detail),
  };
}

export function createCodeAIOwnerMissionState({
  owner_objective,
  repository_url,
  ref = "main",
  max_cycles = DEFAULT_MAX_CYCLES,
} = {}) {
  const objective = text(owner_objective, 12000);
  const repositoryUrl = text(repository_url, 1000);
  if (!objective) throw new Error("CODE_AI_OWNER_MISSION_OBJECTIVE_REQUIRED");
  if (!repositoryUrl) throw new Error("CODE_AI_OWNER_MISSION_REPOSITORY_REQUIRED");
  const now = new Date().toISOString();
  return {
    contract: CODE_AI_OWNER_MISSION_SUPERVISOR_CONTRACT,
    mission_id: `owner-code-mission-${crypto.randomUUID()}`,
    owner_objective: objective,
    repository_url: repositoryUrl,
    ref: text(ref, 160) || "main",
    status: "RUNNING",
    cycle_count: 0,
    max_cycles: positiveInteger(max_cycles, DEFAULT_MAX_CYCLES, HARD_MAX_CYCLES),
    current_cycle: null,
    last_verified_commit_sha: null,
    next_focus: objective,
    progress: [progressEvent("MISSION_ACCEPTED", {
      message: "Owner objective accepted; engineering starts without requiring a model call for acknowledgement.",
    })],
    completed_objectives: [],
    material_decision: null,
    hard_blocker: null,
    created_at: now,
    updated_at: now,
    governance: {
      continue_without_micro_confirmation: true,
      ask_owner_only_for_material_decision: true,
      ordinary_code_edits_auto_allowed: true,
      ordinary_tests_builds_auto_allowed: true,
      local_computer_execution_auto_allowed: true,
      destructive_production_data_change_auto_allowed: false,
      secret_rotation_auto_allowed: false,
      irreversible_infrastructure_change_auto_allowed: false,
      production_deployment_auto_allowed: false,
    },
  };
}

function normalizedState(value) {
  const state = object(value);
  if (text(state.contract, 200) !== CODE_AI_OWNER_MISSION_SUPERVISOR_CONTRACT) {
    throw new Error("CODE_AI_OWNER_MISSION_CONTRACT_INVALID");
  }
  if (!text(state.mission_id, 240)) throw new Error("CODE_AI_OWNER_MISSION_ID_REQUIRED");
  if (!text(state.owner_objective, 12000)) throw new Error("CODE_AI_OWNER_MISSION_OBJECTIVE_REQUIRED");
  return {
    ...state,
    cycle_count: Math.max(0, Number(state.cycle_count || 0)),
    max_cycles: positiveInteger(state.max_cycles, DEFAULT_MAX_CYCLES, HARD_MAX_CYCLES),
    progress: list(state.progress).slice(-240),
    completed_objectives: list(state.completed_objectives).slice(-128),
  };
}

function cycleStatus(result) {
  const source = object(result);
  if (source.owner_objective_complete === true || text(source.status, 120) === "OWNER_OBJECTIVE_COMPLETE") {
    return "COMPLETED";
  }
  if (
    source.material_owner_decision_required === true ||
    text(source.status, 120) === "MATERIAL_OWNER_DECISION_REQUIRED"
  ) {
    return "MATERIAL_OWNER_DECISION_REQUIRED";
  }
  if (
    source.hard_external_blocker === true ||
    text(source.status, 120) === "HARD_EXTERNAL_BLOCKER"
  ) {
    return "HARD_EXTERNAL_BLOCKER";
  }
  return "CONTINUE";
}

export async function advanceCodeAIOwnerMission({
  state: rawState,
  execute_cycle,
  persist_verified_cycle = null,
  reassess_after_persistence = null,
  on_progress = null,
  max_cycles_this_advance = DEFAULT_CYCLES_PER_ADVANCE,
} = {}) {
  let state = normalizedState(rawState);
  if (TERMINAL.has(text(state.status, 120))) {
    return { success: state.status === "COMPLETED", status: state.status, state };
  }
  if (typeof execute_cycle !== "function") {
    throw new Error("CODE_AI_OWNER_MISSION_EXECUTE_CYCLE_REQUIRED");
  }
  const cycleLimit = positiveInteger(
    max_cycles_this_advance,
    DEFAULT_CYCLES_PER_ADVANCE,
    HARD_MAX_CYCLES_PER_ADVANCE,
  );

  async function emit(type, detail = {}) {
    const event = progressEvent(type, detail);
    state = {
      ...state,
      progress: [...list(state.progress), event].slice(-240),
      updated_at: event.at,
    };
    if (typeof on_progress === "function") await on_progress(event, state);
  }

  await emit("ADVANCE_STARTED", {
    cycle_count: state.cycle_count,
    max_cycles: state.max_cycles,
    next_focus: text(state.next_focus, 4000) || null,
  });

  let cyclesThisAdvance = 0;
  while (
    cyclesThisAdvance < cycleLimit &&
    state.cycle_count < state.max_cycles &&
    !TERMINAL.has(text(state.status, 120))
  ) {
    const cycleNumber = state.cycle_count + 1;
    await emit("ENGINEERING_CYCLE_STARTED", {
      cycle: cycleNumber,
      focus: text(state.next_focus, 4000) || state.owner_objective,
    });

    const cycle = await execute_cycle({
      state,
      cycle_number: cycleNumber,
      owner_objective: state.owner_objective,
      focus: text(state.next_focus, 4000) || state.owner_objective,
      repository_url: state.repository_url,
      ref: state.ref,
    });
    const status = cycleStatus(cycle);
    state = {
      ...state,
      cycle_count: cycleNumber,
      current_cycle: object(cycle),
      next_focus: text(cycle?.next_focus, 4000) || state.next_focus,
      updated_at: new Date().toISOString(),
    };
    cyclesThisAdvance += 1;

    await emit("ENGINEERING_CYCLE_FINISHED", {
      cycle: cycleNumber,
      cycle_status: text(cycle?.status, 160) || null,
      verified: cycle?.verified === true,
      changed: cycle?.changed === true,
      reasoning_calls: Number(cycle?.reasoning_calls || 0),
    });

    if (status === "MATERIAL_OWNER_DECISION_REQUIRED") {
      state = {
        ...state,
        status,
        material_decision: object(cycle?.material_decision),
      };
      await emit("OWNER_DECISION_REQUIRED", {
        reason: text(cycle?.reason, 2000) || "Material owner decision required.",
      });
      break;
    }
    if (status === "HARD_EXTERNAL_BLOCKER") {
      state = {
        ...state,
        status,
        hard_blocker: object(cycle?.hard_blocker),
      };
      await emit("HARD_EXTERNAL_BLOCKER", {
        reason: text(cycle?.reason, 2000) || "Hard external blocker.",
      });
      break;
    }

    if (cycle?.verified === true && cycle?.changed === true && typeof persist_verified_cycle === "function") {
      await emit("PERSISTENCE_STARTED", { cycle: cycleNumber });
      const persisted = await persist_verified_cycle({ state, cycle, cycle_number: cycleNumber });
      if (persisted?.verified !== true) {
        state = {
          ...state,
          status: "HARD_EXTERNAL_BLOCKER",
          hard_blocker: {
            reason: "VERIFIED_CYCLE_PERSISTENCE_NOT_VERIFIED",
            result: object(persisted),
          },
        };
        await emit("HARD_EXTERNAL_BLOCKER", {
          reason: "Verified engineering result could not be independently verified after persistence.",
        });
        break;
      }
      state = {
        ...state,
        last_verified_commit_sha: text(persisted.commit_sha, 160) || state.last_verified_commit_sha,
        completed_objectives: [
          ...list(state.completed_objectives),
          {
            cycle: cycleNumber,
            focus: text(cycle?.focus, 4000) || text(state.next_focus, 4000),
            commit_sha: text(persisted.commit_sha, 160) || null,
          },
        ].slice(-128),
      };
      await emit("PERSISTENCE_VERIFIED", {
        cycle: cycleNumber,
        commit_sha: state.last_verified_commit_sha,
      });

      if (typeof reassess_after_persistence === "function") {
        const reassessed = await reassess_after_persistence({
          state,
          cycle,
          persisted,
          cycle_number: cycleNumber,
        });
        state = {
          ...state,
          next_focus: text(reassessed?.next_focus, 4000) || state.next_focus,
        };
        if (reassessed?.owner_objective_complete === true) {
          state = { ...state, status: "COMPLETED" };
          await emit("OWNER_OBJECTIVE_COMPLETED", {
            cycle: cycleNumber,
            commit_sha: state.last_verified_commit_sha,
          });
          break;
        }
        await emit("NEXT_OBJECTIVE_SELECTED", {
          cycle: cycleNumber,
          next_focus: state.next_focus,
        });
      }
    }

    if (status === "COMPLETED") {
      state = { ...state, status: "COMPLETED" };
      await emit("OWNER_OBJECTIVE_COMPLETED", { cycle: cycleNumber });
      break;
    }
  }

  if (!TERMINAL.has(text(state.status, 120)) && state.cycle_count >= state.max_cycles) {
    state = {
      ...state,
      status: "HARD_EXTERNAL_BLOCKER",
      hard_blocker: {
        reason: "OWNER_MISSION_MAX_CYCLES_REACHED",
        max_cycles: state.max_cycles,
      },
    };
    await emit("HARD_EXTERNAL_BLOCKER", {
      reason: "Bounded owner mission cycle ceiling reached before verified completion.",
    });
  }

  return {
    success: state.status === "COMPLETED",
    contract: CODE_AI_OWNER_MISSION_SUPERVISOR_CONTRACT,
    status: state.status,
    state,
    cycles_this_advance: cyclesThisAdvance,
    continue_automatically:
      !TERMINAL.has(text(state.status, 120)) && state.cycle_count < state.max_cycles,
  };
}

export const CodeAIOwnerMissionSupervisorRuntime = Object.freeze({
  contract: CODE_AI_OWNER_MISSION_SUPERVISOR_CONTRACT,
  default_max_cycles: DEFAULT_MAX_CYCLES,
  hard_max_cycles: HARD_MAX_CYCLES,
  createState: createCodeAIOwnerMissionState,
  advance: advanceCodeAIOwnerMission,
});

export default CodeAIOwnerMissionSupervisorRuntime;

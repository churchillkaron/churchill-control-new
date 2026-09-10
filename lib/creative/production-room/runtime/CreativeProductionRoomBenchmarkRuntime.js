import { CREATIVE_AGENCY_ROLES } from "../../director/registry/CreativeAgencyRoleRegistry.js";
import {
  CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAMS,
  CREATIVE_VIRTUAL_SPECIALISTS,
  specialistsForStage,
} from "../registry/CreativeVirtualProductionSpecialistRegistry.js";
import {
  CREATIVE_PRODUCTION_ROOM_STAGES,
} from "../registry/CreativeProductionRoomStageRegistry.js";

export const CREATIVE_PRODUCTION_ROOM_BENCHMARK_CONTRACT = "CREATIVE_PRODUCTION_ROOM_BENCHMARK_V1";

export function evaluateProductionRoomBenchmark() {
  const failures = [];
  const owners = new Set(CREATIVE_AGENCY_ROLES.map((role) => role.id));
  const requirements = CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAMS.map((item) => item.requirement);
  if (CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAMS.length !== 20) failures.push("PRODUCTION_ROOM_TWENTY_WORKSTREAMS_REQUIRED");
  if (CREATIVE_VIRTUAL_SPECIALISTS.length < 100) failures.push("PRODUCTION_ROOM_SPECIALIST_DEPTH_REQUIRED");
  if (CREATIVE_PRODUCTION_ROOM_STAGES.length !== 15) failures.push("PRODUCTION_ROOM_FIFTEEN_STAGES_REQUIRED");
  if (requirements.join(",") !== Array.from({ length: 20 }, (_, index) => index + 1).join(",")) {
    failures.push("PRODUCTION_ROOM_REQUIREMENTS_1_TO_20_REQUIRED");
  }
  for (const workstream of CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAMS) {
    if (!owners.has(workstream.owner)) failures.push(`PRODUCTION_ROOM_OWNER_UNKNOWN:${workstream.id}:${workstream.owner}`);
    if (workstream.specialists.length < 5) failures.push(`PRODUCTION_ROOM_WORKSTREAM_TOO_SHALLOW:${workstream.id}`);
  }
  for (const stage of CREATIVE_PRODUCTION_ROOM_STAGES) {
    if (!specialistsForStage(stage.id).length) failures.push(`PRODUCTION_ROOM_STAGE_UNSTAFFED:${stage.id}`);
  }
  return Object.freeze({
    contract: CREATIVE_PRODUCTION_ROOM_BENCHMARK_CONTRACT,
    passed: failures.length === 0,
    score: failures.length ? 0 : 100,
    failures,
    workstream_count: CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAMS.length,
    specialist_count: CREATIVE_VIRTUAL_SPECIALISTS.length,
    stage_count: CREATIVE_PRODUCTION_ROOM_STAGES.length,
    staffed_stages: Object.fromEntries(
      CREATIVE_PRODUCTION_ROOM_STAGES.map((stage) => [stage.id, specialistsForStage(stage.id).length]),
    ),
    governance: {
      accountable_owners_are_registered_agency_roles: true,
      specialists_are_dynamic_functions_not_fixed_agents: true,
      production_room_stage_skipping_allowed: false,
      generation_before_virtual_rehearsal_allowed: false,
    },
  });
}

export const CreativeProductionRoomBenchmarkRuntime = Object.freeze({
  contract: CREATIVE_PRODUCTION_ROOM_BENCHMARK_CONTRACT,
  evaluate: evaluateProductionRoomBenchmark,
});
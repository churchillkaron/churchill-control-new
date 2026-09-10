import {
  CREATIVE_PRODUCTION_ROOM_STAGES,
} from "../registry/CreativeProductionRoomStageRegistry.js";
import {
  specialistsForStage,
} from "../registry/CreativeVirtualProductionSpecialistRegistry.js";
import {
  dependenciesForProductionWorkstream,
} from "./CreativeProductionWorkOrderRuntime.js";

export const CREATIVE_PRODUCTION_DEPENDENCY_AUDIT_CONTRACT =
  "CREATIVE_PRODUCTION_DEPENDENCY_AUDIT_V1";

function requiredForStage(stageId) {
  return [...new Set(
    specialistsForStage(stageId).map((item) => Number(item.requirement)),
  )].sort((a, b) => a - b);
}

export function auditProductionWorkstreamDependencies() {
  const completed = new Set();
  const stages = [];
  const failures = [];
  for (const stage of CREATIVE_PRODUCTION_ROOM_STAGES) {
    const pending = new Set(requiredForStage(stage.id));
    const waves = [];
    while (pending.size) {
      const ready = [...pending].filter((requirement) =>
        dependenciesForProductionWorkstream(stage.id, requirement)
          .every((dependency) => completed.has(Number(dependency))),
      );
      if (!ready.length) break;
      waves.push(ready);
      for (const requirement of ready) {
        pending.delete(requirement);
        completed.add(requirement);
      }
    }
    if (pending.size) {
      for (const requirement of pending) {
        const blockedBy = dependenciesForProductionWorkstream(stage.id, requirement)
          .filter((dependency) => !completed.has(Number(dependency)));
        failures.push(
          `PRODUCTION_WORK_ORDER_STAGE_DEPENDENCY_DEADLOCK:${stage.id}:${requirement}:${blockedBy.join(",")}`,
        );
      }
    }
    stages.push(Object.freeze({
      stage_id: stage.id,
      waves,
      unresolved_requirements: [...pending],
      passed: pending.size === 0,
    }));
  }

  return Object.freeze({
    contract: CREATIVE_PRODUCTION_DEPENDENCY_AUDIT_CONTRACT,
    passed: failures.length === 0,
    failures,
    stages,
    zero_provider_calls: true,
    zero_media_generation: true,
  });
}

export const CreativeProductionDependencyAuditRuntime = Object.freeze({
  contract: CREATIVE_PRODUCTION_DEPENDENCY_AUDIT_CONTRACT,
  audit: auditProductionWorkstreamDependencies,
});

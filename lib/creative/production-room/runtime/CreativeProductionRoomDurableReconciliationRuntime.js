export const CREATIVE_PRODUCTION_ROOM_DURABLE_RECONCILIATION_CONTRACT =
  "CREATIVE_PRODUCTION_ROOM_DURABLE_RECONCILIATION_V1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

export function durablePipelineCompatible(durablePipeline = {}, seededRoomPlan = {}) {
  if (!durablePipeline.contract || durablePipeline.contract !== seededRoomPlan.contract) return false;
  const durableById = new Map(list(durablePipeline.stages).map((stage) => [stage.id, stage]));
  const seededSealed = list(seededRoomPlan.stages).filter((stage) => stage.status === "SEALED");
  if (!seededSealed.length) return true;
  return seededSealed.every((stage) => {
    const durableStage = durableById.get(stage.id);
    return durableStage?.status === "SEALED" &&
      text(durableStage.sealed_digest) === text(stage.sealed_digest);
  });
}

export const CreativeProductionRoomDurableReconciliationRuntime = Object.freeze({
  contract: CREATIVE_PRODUCTION_ROOM_DURABLE_RECONCILIATION_CONTRACT,
  compatible: durablePipelineCompatible,
});

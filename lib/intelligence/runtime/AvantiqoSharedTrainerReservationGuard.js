export const AVANTIQO_SHARED_TRAINER_RESERVATION_GUARD_CONTRACT =
  "AVANTIQO_SHARED_TRAINER_RESERVATION_GUARD_V2";

function text(value) { return String(value ?? "").trim(); }

function modalConfigured() {
  const tokenId = text(process.env.MODAL_TOKEN_ID || process.env.AVANTIQO_MODAL_TOKEN_ID);
  const tokenSecret = text(process.env.MODAL_TOKEN_SECRET || process.env.AVANTIQO_MODAL_TOKEN_SECRET);
  return Boolean(tokenId && tokenSecret);
}

export async function assertAvantiqoSharedTrainerReservation() {
  if (!modalConfigured()) {
    const error = new Error("AVANTIQO_INTELLIGENCE_TRAINER_MODAL_CREDENTIALS_REQUIRED");
    error.code = "AVANTIQO_INTELLIGENCE_TRAINER_MODAL_CREDENTIALS_REQUIRED";
    error.status = 503;
    throw error;
  }
  return {
    contract: AVANTIQO_SHARED_TRAINER_RESERVATION_GUARD_CONTRACT,
    provider: "MODAL",
    infrastructure_provider: "MODAL_H100_OWNED_TRAINER_V1",
    reservation_required: false,
    reservation_external_control_plane_read: false,
    max_gpu_containers: 1,
    scale_to_zero: true,
    exclusive_trainer_execution_enforced_by: "MODAL_FUNCTION_MAX_CONTAINERS",
    ready: true,
  };
}

export const AvantiqoSharedTrainerReservationGuard = Object.freeze({
  contract: AVANTIQO_SHARED_TRAINER_RESERVATION_GUARD_CONTRACT,
  assertExclusiveTrainerReservation: assertAvantiqoSharedTrainerReservation,
});

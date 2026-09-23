export const AVANTIQO_SHARED_TRAINER_RESERVATION_GUARD_CONTRACT =
  "AVANTIQO_SHARED_TRAINER_RESERVATION_GUARD_V3";

function text(value) { return String(value ?? "").trim(); }
function enabled(value) { return ["1", "true", "yes", "on"].includes(text(value).toLowerCase()); }

export async function assertAvantiqoSharedTrainerReservation() {
  if (!enabled(process.env.AVANTIQO_INTELLIGENCE_LOCAL_TRAINER_ENABLED)) {
    const error = new Error("AVANTIQO_INTELLIGENCE_LOCAL_TRAINER_RUNTIME_REQUIRED");
    error.code = "AVANTIQO_INTELLIGENCE_LOCAL_TRAINER_RUNTIME_REQUIRED";
    error.status = 503;
    throw error;
  }
  return {
    contract: AVANTIQO_SHARED_TRAINER_RESERVATION_GUARD_CONTRACT,
    provider: "AVANTIQO",
    infrastructure_provider: "AVANTIQO_LOCAL_TRAINER_V1",
    reservation_required: true,
    reservation_external_control_plane_read: false,
    external_compute_allowed: false,
    local_owned_hardware_required: true,
    exclusive_trainer_execution_enforced_by: "AVANTIQO_LOCAL_TRAINER_LOCK",
    ready: true,
  };
}

export const AvantiqoSharedTrainerReservationGuard = Object.freeze({
  contract: AVANTIQO_SHARED_TRAINER_RESERVATION_GUARD_CONTRACT,
  assertExclusiveTrainerReservation: assertAvantiqoSharedTrainerReservation,
});

import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import AppointmentAttendance from "@/lib/operator/secretary/SecretaryAppointmentAttendanceStewardshipRuntime";

function text(value) { return String(value ?? "").trim(); }

const ACTIONS = Object.freeze({
  start: { mode: "write", aliases: ["start appointment confirmation tracking", "track appointment attendance"], execute: AppointmentAttendance.start },
  refresh: { mode: "write", aliases: ["chase appointment confirmation", "refresh appointment attendance follow ups"], execute: AppointmentAttendance.refresh },
  recordConfirmation: { mode: "write", aliases: ["record appointment confirmation", "record appointment decline"], execute: AppointmentAttendance.recordConfirmation },
  syncSchedule: { mode: "write", aliases: ["sync appointment attendance schedule", "refresh appointment stewardship after reschedule"], execute: AppointmentAttendance.syncSchedule },
  recordAttendance: { mode: "write", aliases: ["record appointment attendance", "record appointment no show"], execute: AppointmentAttendance.recordAttendance },
  cancel: { mode: "write", aliases: ["cancel appointment attendance tracking"], execute: AppointmentAttendance.cancel },
  read: { mode: "read", aliases: ["show appointment attendance status", "show appointment confirmation status"], execute: AppointmentAttendance.read },
  list: { mode: "read", aliases: ["list appointment attendance tracking"], execute: AppointmentAttendance.list },
});

export function createSecretaryAppointmentAttendanceStewardshipCapability(action = "read") {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_APPOINTMENT_ATTENDANCE_ACTION_UNSUPPORTED:${text(action)}`);
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_appointment_attendance_stewardship",
    action,
    name: `Executive Secretary appointment attendance stewardship ${action}`,
    document: "secretary_task",
    description: "Track explicit appointment confirmation, decline, attended and no-show evidence for an existing Secretary appointment. Silence, reminder delivery and calendar status never imply confirmation or attendance; declines do not automatically cancel or reschedule the appointment.",
    permissions: [],
    events: [`platform.secretary_appointment_attendance_stewardship.${action}`],
    tags: ["platform", "secretary", "executive-secretary", "appointment", "confirmation", "attendance", "no-show", config.mode],
    operatorAliases: config.aliases,
    operatorExamples: config.aliases,
    transactional: config.mode !== "read",
    aiEnabled: false,
    operatorEnabled: true,
    operatorMode: config.mode,
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    contextScope: "organization",
    risk: "low",
    reversible: true,
    approval: { required: false },
    inputSchema: { type: "object", additionalProperties: true },
  });
  function authorize({ context }) {
    return Boolean(text(context?.organizationId) && text(context?.metadata?.partyId || context?.actor?.partyId || context?.actor?.party_id));
  }
  async function execute({ context, payload = {} }) { return config.execute({ context, payload }); }
  return { manifest, authorize, execute };
}

export default createSecretaryAppointmentAttendanceStewardshipCapability;

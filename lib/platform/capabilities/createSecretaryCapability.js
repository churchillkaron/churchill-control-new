import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { createSecretaryContact } from "@/lib/operator/secretary/SecretaryContactCreationRuntime";
import { scanSecretaryDueWork } from "@/lib/operator/secretary/SecretaryDueWorkRuntime";
import {
  createCalendarEvent,
  createFollowUp,
  createTask,
  listCalls,
  listContacts,
  listFollowUps,
  listTasks,
  logCall,
  readAgenda,
  readSettings,
  updateCalendarEvent,
  updateSettings,
  updateTask,
  upsertContactProfile,
} from "@/lib/operator/secretary/SecretaryRuntime";

function text(value) {
  return String(value ?? "").trim();
}

const ACTIONS = {
  readAgenda: {
    mode: "read",
    risk: "low",
    reversible: true,
    description: "Read Avantiqo's native organization calendar for a bounded time window.",
    aliases: ["what is on my calendar", "show my agenda", "what appointments do I have", "what meetings do I have"],
    execute: readAgenda,
  },
  scanDueWork: {
    mode: "read",
    risk: "low",
    reversible: true,
    description: "Scan Avantiqo-owned tasks, follow-ups, upcoming calendar events and missed calls for due Secretary work.",
    aliases: ["what needs my attention", "what is due", "what should my secretary remind me about", "show due secretary work"],
    execute: scanSecretaryDueWork,
  },
  createCalendarEvent: {
    mode: "write",
    risk: "high",
    reversible: true,
    confirm: true,
    description: "Create a meeting, appointment, call block, reminder or other event in Avantiqo's native calendar.",
    aliases: ["book an appointment", "schedule a meeting", "add this to my calendar", "book a call"],
    execute: createCalendarEvent,
  },
  updateCalendarEvent: {
    mode: "write",
    risk: "high",
    reversible: true,
    confirm: true,
    description: "Reschedule, cancel or update an Avantiqo native calendar event.",
    aliases: ["reschedule the appointment", "cancel the meeting", "move my meeting", "update the calendar event"],
    execute: updateCalendarEvent,
  },
  listContacts: {
    mode: "read",
    risk: "low",
    reversible: true,
    description: "Read Secretary relationship context joined to canonical Avantiqo parties.",
    aliases: ["find contact", "show my contacts", "who is this person", "look up this contact"],
    execute: listContacts,
  },
  createContact: {
    mode: "write",
    risk: "medium",
    reversible: true,
    confirm: true,
    description: "Create a new native Avantiqo contact or attach Secretary context to an existing canonical party matched by email or phone.",
    aliases: ["add this contact", "create a contact", "save this person", "remember this person in contacts"],
    execute: createSecretaryContact,
  },
  upsertContactProfile: {
    mode: "write",
    risk: "medium",
    reversible: true,
    confirm: true,
    description: "Create or update Secretary-specific relationship preferences for an existing canonical Avantiqo party.",
    aliases: ["remember this about the contact", "set contact preference", "update this contact"],
    execute: upsertContactProfile,
  },
  listTasks: {
    mode: "read",
    risk: "low",
    reversible: true,
    description: "Read Avantiqo Secretary tasks and reminders.",
    aliases: ["what do I need to do", "show my tasks", "what reminders do I have", "what is due"],
    execute: listTasks,
  },
  createTask: {
    mode: "write",
    risk: "medium",
    reversible: true,
    confirm: true,
    description: "Create an Avantiqo Secretary task or reminder.",
    aliases: ["remind me", "create a task", "add a reminder", "remember to follow up"],
    execute: createTask,
  },
  updateTask: {
    mode: "write",
    risk: "medium",
    reversible: true,
    confirm: true,
    description: "Complete, cancel, reprioritize or reschedule an Avantiqo Secretary task.",
    aliases: ["mark the task done", "complete the reminder", "change the task", "cancel the task"],
    execute: updateTask,
  },
  listFollowUps: {
    mode: "read",
    risk: "low",
    reversible: true,
    description: "Read pending or completed Secretary follow-ups.",
    aliases: ["who do I need to follow up with", "show follow ups", "what follow ups are due"],
    execute: listFollowUps,
  },
  createFollowUp: {
    mode: "write",
    risk: "medium",
    reversible: true,
    confirm: true,
    description: "Create a due follow-up linked to a contact, task, call, conversation or calendar event.",
    aliases: ["follow up with them", "remind me to contact them", "schedule a follow up"],
    execute: createFollowUp,
  },
  listCalls: {
    mode: "read",
    risk: "low",
    reversible: true,
    description: "Read Avantiqo-owned normalized call history, summaries and transcript evidence.",
    aliases: ["show my calls", "who called", "what calls did I miss", "show call history"],
    execute: listCalls,
  },
  logCall: {
    mode: "write",
    risk: "medium",
    reversible: true,
    confirm: false,
    operatorEnabled: false,
    aiEnabled: false,
    description: "Persist normalized call evidence after an Avantiqo-owned call session. This is an internal Secretary runtime action, not a manual user command.",
    aliases: [],
    execute: logCall,
  },
  readSettings: {
    mode: "read",
    risk: "low",
    reversible: true,
    description: "Read the organization Secretary operating policy, working hours, language and booking defaults.",
    aliases: ["show secretary settings", "what are the secretary rules", "show booking settings"],
    execute: readSettings,
  },
  updateSettings: {
    mode: "write",
    risk: "high",
    reversible: true,
    confirm: true,
    description: "Update Avantiqo-owned Secretary operating policy including working hours, booking, calls, messaging and memory behavior.",
    aliases: ["change secretary settings", "set business hours", "change booking policy", "change call policy"],
    execute: updateSettings,
  },
};

function schemaFor(action) {
  switch (action) {
    case "readAgenda":
      return { type: "object", properties: { from: { type: "string" }, to: { type: "string" }, owner_party_id: { type: "string" }, contact_party_id: { type: "string" }, limit: { type: "number" } }, additionalProperties: false };
    case "scanDueWork":
      return { type: "object", properties: { now: { type: "string" }, horizon_hours: { type: "number" }, limit: { type: "number" } }, additionalProperties: false };
    case "createCalendarEvent":
      return { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, event_type: { type: "string" }, starts_at: { type: "string" }, ends_at: { type: "string" }, timezone: { type: "string" }, location: { type: "string" }, contact_party_id: { type: "string" }, owner_party_id: { type: "string" }, all_day: { type: "boolean" }, metadata: { type: "object" } }, required: ["title", "starts_at", "ends_at"], additionalProperties: false };
    case "updateCalendarEvent":
      return { type: "object", properties: { event_id: { type: "string" }, title: { type: "string" }, description: { type: "string" }, event_type: { type: "string" }, status: { type: "string" }, starts_at: { type: "string" }, ends_at: { type: "string" }, timezone: { type: "string" }, location: { type: "string" }, contact_party_id: { type: "string" }, owner_party_id: { type: "string" }, all_day: { type: "boolean" }, metadata: { type: "object" } }, required: ["event_id"], additionalProperties: false };
    case "listContacts":
      return { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, additionalProperties: false };
    case "createContact":
      return { type: "object", properties: { display_name: { type: "string" }, party_type: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, legal_name: { type: "string" }, address: { type: "string" }, relationship_label: { type: "string" }, preferred_language: { type: "string" }, timezone: { type: "string" }, preferred_channel: { type: "string" }, allow_calls: { type: "boolean" }, allow_messages: { type: "boolean" }, do_not_disturb: { type: "object" }, important_notes: { type: "string" }, metadata: { type: "object" } }, required: ["display_name"], additionalProperties: false };
    case "upsertContactProfile":
      return { type: "object", properties: { party_id: { type: "string" }, relationship_label: { type: "string" }, preferred_language: { type: "string" }, timezone: { type: "string" }, preferred_channel: { type: "string" }, allow_calls: { type: "boolean" }, allow_messages: { type: "boolean" }, do_not_disturb: { type: "object" }, important_notes: { type: "string" }, next_follow_up_at: { type: "string" }, metadata: { type: "object" } }, required: ["party_id"], additionalProperties: false };
    case "listTasks":
      return { type: "object", properties: { owner_party_id: { type: "string" }, include_completed: { type: "boolean" }, limit: { type: "number" } }, additionalProperties: false };
    case "createTask":
      return { type: "object", properties: { title: { type: "string" }, details: { type: "string" }, priority: { type: "string" }, due_at: { type: "string" }, remind_at: { type: "string" }, owner_party_id: { type: "string" }, contact_party_id: { type: "string" }, calendar_event_id: { type: "string" }, metadata: { type: "object" } }, required: ["title"], additionalProperties: false };
    case "updateTask":
      return { type: "object", properties: { task_id: { type: "string" }, title: { type: "string" }, details: { type: "string" }, priority: { type: "string" }, status: { type: "string" }, due_at: { type: "string" }, remind_at: { type: "string" } }, required: ["task_id"], additionalProperties: false };
    case "listFollowUps":
      return { type: "object", properties: { include_completed: { type: "boolean" }, limit: { type: "number" } }, additionalProperties: false };
    case "createFollowUp":
      return { type: "object", properties: { reason: { type: "string" }, due_at: { type: "string" }, action_type: { type: "string" }, owner_party_id: { type: "string" }, contact_party_id: { type: "string" }, task_id: { type: "string" }, calendar_event_id: { type: "string" }, call_id: { type: "string" }, conversation_id: { type: "string" }, metadata: { type: "object" } }, required: ["reason", "due_at"], additionalProperties: false };
    case "listCalls":
      return { type: "object", properties: { limit: { type: "number" } }, additionalProperties: false };
    case "logCall":
      return { type: "object", properties: { direction: { type: "string" }, remote_address: { type: "string" }, status: { type: "string" }, started_at: { type: "string" }, answered_at: { type: "string" }, ended_at: { type: "string" }, transcript: { type: "string" }, summary: { type: "string" }, contact_party_id: { type: "string" }, conversation_id: { type: "string" }, recording_storage_path: { type: "string" }, raw_audio_persisted: { type: "boolean" }, metadata: { type: "object" } }, additionalProperties: false };
    case "readSettings":
      return { type: "object", properties: {}, additionalProperties: false };
    case "updateSettings":
      return { type: "object", properties: { default_timezone: { type: "string" }, default_language: { type: "string" }, appointment_duration_minutes: { type: "number" }, business_hours: { type: "object" }, call_handling_policy: { type: "object" }, message_handling_policy: { type: "object" }, booking_policy: { type: "object" }, memory_policy: { type: "object" }, metadata: { type: "object" } }, additionalProperties: false };
    default:
      return { type: "object", additionalProperties: false };
  }
}

export function createSecretaryCapability(action) {
  const config = ACTIONS[action];
  if (!config) throw new Error(`SECRETARY_CAPABILITY_ACTION_UNSUPPORTED:${text(action)}`);

  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary",
    action,
    name: `Secretary ${action}`,
    document: "secretary_record",
    description: config.description,
    permissions: [],
    events: [`platform.secretary.${action}`],
    tags: ["platform", "secretary", "assistant", "in-house", "organization", config.mode],
    operatorAliases: config.aliases,
    operatorExamples: config.aliases.slice(0, 4),
    transactional: config.mode !== "read",
    aiEnabled: config.aiEnabled !== false,
    operatorEnabled: config.operatorEnabled !== false,
    operatorMode: config.mode,
    operatorAutoExecute: config.mode === "read" || config.confirm === false,
    operatorRequiresConfirmation: config.confirm === true,
    contextScope: "organization",
    risk: config.risk,
    reversible: config.reversible,
    approval: config.confirm === true ? { required: false, boundary: "conversation_confirmation" } : { required: false },
    inputSchema: schemaFor(action),
  });

  function authorize({ context }) {
    return Boolean(text(context?.organizationId) && text(context?.metadata?.partyId || context?.actor?.partyId || context?.actor?.party_id));
  }

  async function execute({ context, payload = {} }) {
    return config.execute({ context, payload });
  }

  return { manifest, authorize, execute };
}

export default createSecretaryCapability;

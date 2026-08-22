import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { normalizeOperatorProjectState } from "@/lib/operator/contracts/OperatorProjectState";

const TERMINAL_PROJECT_STATUSES = new Set(["idle", "completed", "cancelled"]);
const RECOVERY_WINDOW_DAYS = 120;
const RECENCY_DOMINANCE_DAYS = 14;
const MAX_PROJECT_CHOICES = 4;

function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function normalizedUtterance(value) {
  return text(value, 1200)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0e00-\u0e7f\s?_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isCrossConversationContinuationRequest(message) {
  const utterance = normalizedUtterance(message);
  if (!utterance) return false;

  if (/^(?:ok\s+|okay\s+|yes\s+|yeah\s+|ja\s+)?(?:continue|resume|next|keep going|carry on|go on)\??$/.test(utterance)) {
    return true;
  }

  return [
    "continue where we left off",
    "resume where we left off",
    "continue from where we stopped",
    "resume from where we stopped",
    "pick up where we left off",
    "where were we",
    "where did we stop",
    "what is next",
    "whats next",
    "what's next",
    "continue this",
    "continue with this",
    "continue like this",
    "fortsatt",
    "fortsatt dar vi slutade",
    "nasta",
    "vad ar nasta",
    "var var vi",
  ].includes(utterance);
}

function hasActiveProject(projectState = {}) {
  const state = normalizeOperatorProjectState(projectState);
  const objective = text(state?.objective, 600);
  const status = text(state?.status, 40).toLowerCase();
  return Boolean(objective) && !TERMINAL_PROJECT_STATUSES.has(status);
}

function projectIdentity(projectState = {}) {
  return text(projectState?.objective, 600)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0e00-\u0e7f\s_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function timestamp(value) {
  const ms = Date.parse(value || "");
  return Number.isFinite(ms) ? ms : 0;
}

function safeRecoveredProjectState(projectState = {}) {
  const normalized = normalizeOperatorProjectState(projectState);
  const sourceStatus = text(normalized.status, 40).toLowerCase();

  // Authorization-critical pending execution state belongs to agreement_state,
  // which is never queried or recovered here. Project statuses that imply a
  // consent gate are downgraded to active continuity so a new conversation can
  // reason from the goal without inheriting old consent.
  const safeStatus = sourceStatus === "awaiting_confirmation"
    ? "active"
    : sourceStatus;

  return {
    ...normalized,
    status: safeStatus,
    last_system_snapshot: null,
    user_confirmed_complete: false,
  };
}

function candidateFromRow(row) {
  const state = safeRecoveredProjectState(row?.project_state);
  if (!hasActiveProject(state)) return null;
  const identity = projectIdentity(state);
  if (!identity) return null;

  return {
    conversation_id: row.id,
    conversation_key: text(row.conversation_key, 160) || null,
    updated_at: row.updated_at || row.last_message_at || null,
    updated_at_ms: timestamp(row.updated_at || row.last_message_at),
    identity,
    project_state: state,
  };
}

function distinctProjects(rows = []) {
  const byIdentity = new Map();

  for (const row of rows) {
    const candidate = candidateFromRow(row);
    if (!candidate) continue;

    const existing = byIdentity.get(candidate.identity);
    if (!existing || candidate.updated_at_ms > existing.updated_at_ms) {
      byIdentity.set(candidate.identity, candidate);
    }
  }

  return Array.from(byIdentity.values())
    .sort((left, right) => right.updated_at_ms - left.updated_at_ms);
}

export function selectContinuityProjectCandidates(projects = []) {
  const ordered = Array.isArray(projects)
    ? projects.slice().sort((left, right) =>
        Number(right?.updated_at_ms || 0) - Number(left?.updated_at_ms || 0),
      )
    : [];

  if (!ordered.length) {
    return { selected: null, ambiguous: false, reason: "NO_ACTIVE_PROJECT" };
  }
  if (ordered.length === 1) {
    return {
      selected: ordered[0],
      ambiguous: false,
      reason: "UNAMBIGUOUS_ACTIVE_PROJECT_RECOVERED",
    };
  }

  const latest = ordered[0];
  const second = ordered[1];
  const separationMs = Math.max(
    0,
    Number(latest.updated_at_ms || 0) - Number(second.updated_at_ms || 0),
  );
  const dominanceMs = RECENCY_DOMINANCE_DAYS * 24 * 60 * 60 * 1000;

  if (latest.updated_at_ms > 0 && separationMs >= dominanceMs) {
    return {
      selected: latest,
      ambiguous: false,
      reason: "CLEARLY_NEWER_ACTIVE_PROJECT_RECOVERED",
    };
  }

  return {
    selected: null,
    ambiguous: true,
    reason: "MULTIPLE_RECENT_ACTIVE_PROJECTS",
    projects: ordered.slice(0, MAX_PROJECT_CHOICES),
  };
}

export async function recoverCrossConversationProject({
  organizationId,
  partyId,
  message,
  currentProjectState = {},
} = {}) {
  const organization = text(organizationId, 120);
  const party = text(partyId, 120);

  if (!organization) throw new Error("INTELLIGENCE_CONTINUITY_ORGANIZATION_REQUIRED");
  if (!party) throw new Error("INTELLIGENCE_CONTINUITY_PARTY_REQUIRED");

  if (!isCrossConversationContinuationRequest(message)) {
    return { recovered: false, ambiguous: false, reason: "NOT_CONTINUATION_REQUEST" };
  }
  if (hasActiveProject(currentProjectState)) {
    return { recovered: false, ambiguous: false, reason: "CURRENT_PROJECT_ACTIVE" };
  }

  const cutoff = new Date(
    Date.now() - RECOVERY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const result = await supabaseAdmin
    .from("intelligence_conversations")
    .select("id,conversation_key,project_state,status,last_message_at,updated_at")
    .eq("organization_id", organization)
    .eq("party_id", party)
    .gte("updated_at", cutoff)
    .order("updated_at", { ascending: false })
    .limit(30);

  if (result.error) throw result.error;

  const projects = distinctProjects(result.data || []);
  const selection = selectContinuityProjectCandidates(projects);

  if (selection.ambiguous) {
    return {
      recovered: false,
      ambiguous: true,
      reason: selection.reason,
      projects: selection.projects.map((project) => ({
        conversation_id: project.conversation_id,
        conversation_key: project.conversation_key,
        objective: project.project_state.objective,
        status: project.project_state.status,
        progress_summary: project.project_state.progress_summary || null,
        next_step: project.project_state.next_step || null,
      })),
    };
  }

  const project = selection.selected;
  if (!project) {
    return { recovered: false, ambiguous: false, reason: selection.reason };
  }

  return {
    recovered: true,
    ambiguous: false,
    reason: selection.reason,
    source_conversation_id: project.conversation_id,
    source_conversation_key: project.conversation_key,
    project_state: project.project_state,
    authorization_recovered: false,
    mutable_business_evidence_recovered: false,
  };
}

export function crossConversationAmbiguityTurn({ recovery, agreementState = {} } = {}) {
  const projects = Array.isArray(recovery?.projects) ? recovery.projects : [];
  const options = projects.map((project, index) => ({
    id: project.conversation_id || `project_${index + 1}`,
    label: text(project.objective, 160),
    description: text(project.next_step || project.progress_summary, 240) || null,
  })).filter((option) => option.label);

  const names = options.map((option) => option.label);
  const responseText = names.length
    ? `I have more than one unfinished project: ${names.join("; ")}. Which one should I continue?`
    : "I have more than one unfinished project. Which one should I continue?";

  return {
    success: true,
    decision: {
      response_text: responseText,
      response_language: null,
      intent: "clarify",
      confidence: 1,
      agreement_state: object(agreementState),
      project_state: {},
      clarification: {
        required: true,
        question: "Which unfinished project should I continue?",
        options,
      },
      navigation: { target_id: null },
      execution: { capability_key: null, payload: {}, reason: null },
      plan: [],
    },
    agreement_state: object(agreementState),
    provider_evidence: {
      provider: "avantiqo-local",
      model: "cross-conversation-continuity-v1",
      usage_id: null,
    },
    navigation: null,
    execution: null,
    project_continuity: {
      recovered: false,
      ambiguous: true,
      authorization_recovered: false,
      mutable_business_evidence_recovered: false,
    },
  };
}

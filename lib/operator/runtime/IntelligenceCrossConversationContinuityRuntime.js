import { normalizeOperatorProjectState } from "@/lib/operator/contracts/OperatorProjectState";
import { semanticMemorySimilarity } from "./IntelligenceSemanticMemoryPolicy";

const TERMINAL_PROJECT_STATUSES = new Set(["idle", "completed", "cancelled"]);
const RECOVERY_WINDOW_DAYS = 120;
const RECENCY_DOMINANCE_DAYS = 14;
const SELECTION_VALIDITY_MINUTES = 15;
const MAX_PROJECT_CHOICES = 4;
const SUBJECT_MATCH_MIN_SCORE = 0.2;
const SUBJECT_MATCH_MARGIN = 0.08;
const CONTINUITY_SELECTION_QUESTION = "Which unfinished project should I continue?";

function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

async function supabaseClient() {
  const module = await import("@/lib/shared/supabase/admin");
  return module.supabaseAdmin;
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

function continuationSubject(message) {
  const utterance = normalizedUtterance(message);
  if (!utterance) return "";
  const match = utterance.match(
    /^(?:ok\s+|okay\s+|yes\s+|yeah\s+|ja\s+)?(?:continue|resume|keep going|carry on|go on)(?:\s+(?:with|on))?\s+(.+)$/,
  );
  if (!match) return "";
  return text(match[1], 600)
    .replace(/^(?:the|this)\s+/, "")
    .replace(/\s+(?:project|work)$/, "")
    .trim();
}

export function isPotentialContinuitySelectionReply(message) {
  const utterance = normalizedUtterance(message);
  if (!utterance || utterance.length > 180) return false;
  if (/^(?:project\s+)?[1-4]$/.test(utterance)) return true;
  if (/^(?:first|second|third|fourth)$/.test(utterance)) return true;
  if (utterance.includes("?")) return false;
  if (/^(?:what|why|when|where|who|how|can|could|would|should|is|are|do|does|did|create|make|send|delete|remove|pay|post|publish|open|show|list|check)\b/.test(utterance)) return false;
  return utterance.split(/\s+/).length <= 12;
}

export function isCrossConversationContinuationRequest(message) {
  const utterance = normalizedUtterance(message);
  if (!utterance) return false;

  if (/^(?:ok\s+|okay\s+|yes\s+|yeah\s+|ja\s+)?(?:continue|resume|next|keep going|carry on|go on)\??$/.test(utterance)) {
    return true;
  }

  if (continuationSubject(utterance)) return true;

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
    "what s next",
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

function projectContinuityText(project = {}) {
  const state = object(project?.project_state);
  return [
    state.objective,
    state.progress_summary,
    state.next_step,
    ...list(state.decisions),
    ...list(state.constraints),
  ].map((value) => text(value, 800)).filter(Boolean).join(" ");
}

function subjectMatchedProject(projects, message) {
  const subject = continuationSubject(message);
  if (!subject) return null;

  const ranked = projects
    .map((project) => ({
      project,
      score: semanticMemorySimilarity({
        query: subject,
        content: projectContinuityText(project),
      }).score,
    }))
    .sort((left, right) =>
      right.score - left.score ||
      Number(right.project?.updated_at_ms || 0) - Number(left.project?.updated_at_ms || 0),
    );

  const best = ranked[0];
  const second = ranked[1];
  if (!best || best.score < SUBJECT_MATCH_MIN_SCORE) return null;
  if (second && best.score - second.score < SUBJECT_MATCH_MARGIN) return null;

  return { project: best.project, score: best.score };
}

export function selectContinuityProjectCandidates(projects = [], { message = "" } = {}) {
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

  const subjectMatch = subjectMatchedProject(ordered, message);
  if (subjectMatch) {
    return {
      selected: subjectMatch.project,
      ambiguous: false,
      reason: "SUBJECT_MATCHED_ACTIVE_PROJECT_RECOVERED",
      subject_match_score: Number(subjectMatch.score.toFixed(4)),
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

export function matchContinuityProjectSelection(message, options = []) {
  const utterance = normalizedUtterance(message);
  if (!utterance || !Array.isArray(options) || !options.length) return null;

  const numbered = utterance.match(/^(?:project\s+)?([1-4])$/);
  if (numbered) {
    return options[Number(numbered[1]) - 1] || null;
  }

  const ordinalIndex = {
    first: 0,
    second: 1,
    third: 2,
    fourth: 3,
  }[utterance];
  if (ordinalIndex !== undefined) return options[ordinalIndex] || null;

  const exact = options.filter((option) => {
    const id = normalizedUtterance(option?.id);
    const label = normalizedUtterance(option?.label);
    return utterance === id || utterance === label;
  });
  if (exact.length === 1) return exact[0];

  const contained = options.filter((option) => {
    const label = normalizedUtterance(option?.label);
    return label.length >= 8 && (utterance.includes(label) || label.includes(utterance));
  });
  return contained.length === 1 ? contained[0] : null;
}

function isContinuitySelectionDecision(decision = {}) {
  const clarification = object(decision.clarification);
  return (
    decision.project_continuity_selection_required === true ||
    text(clarification.question) === CONTINUITY_SELECTION_QUESTION
  );
}

async function recoverPendingProjectSelection({
  organization,
  party,
  currentConversationId,
  message,
}) {
  const conversationId = text(currentConversationId, 120);
  const cutoff = new Date(
    Date.now() - SELECTION_VALIDITY_MINUTES * 60 * 1000,
  ).toISOString();

  const supabaseAdmin = await supabaseClient();
  let query = supabaseAdmin
    .from("intelligence_turns")
    .select("conversation_id,decision,created_at")
    .eq("organization_id", organization)
    .eq("party_id", party)
    .eq("role", "assistant")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(conversationId ? 1 : 6);

  if (conversationId) {
    query = query.eq("conversation_id", conversationId);
  }

  const latest = await query;
  if (latest.error) throw latest.error;

  const rows = Array.isArray(latest.data) ? latest.data : [];
  const pending = rows.find((row) => isContinuitySelectionDecision(object(row?.decision)));
  if (!pending) return null;

  const decision = object(pending.decision);
  const clarification = object(decision.clarification);
  const options = Array.isArray(clarification.options)
    ? clarification.options.slice(0, MAX_PROJECT_CHOICES)
    : [];
  const selected = matchContinuityProjectSelection(message, options);
  if (!selected?.id) return null;

  const projectResult = await supabaseAdmin
    .from("intelligence_conversations")
    .select("id,conversation_key,project_state,status,last_message_at,updated_at")
    .eq("organization_id", organization)
    .eq("party_id", party)
    .eq("id", selected.id)
    .maybeSingle();

  if (projectResult.error) throw projectResult.error;
  const project = candidateFromRow(projectResult.data);
  if (!project) {
    return {
      recovered: false,
      ambiguous: false,
      reason: "SELECTED_PROJECT_NO_LONGER_ACTIVE",
    };
  }

  return {
    recovered: true,
    ambiguous: false,
    reason: "EXPLICIT_PROJECT_SELECTION_RECOVERED",
    source_conversation_id: project.conversation_id,
    source_conversation_key: project.conversation_key,
    project_state: project.project_state,
    authorization_recovered: false,
    mutable_business_evidence_recovered: false,
  };
}

export async function recoverCrossConversationProject({
  organizationId,
  partyId,
  currentConversationId = null,
  message,
  currentProjectState = {},
} = {}) {
  const organization = text(organizationId, 120);
  const party = text(partyId, 120);

  if (!organization) throw new Error("INTELLIGENCE_CONTINUITY_ORGANIZATION_REQUIRED");
  if (!party) throw new Error("INTELLIGENCE_CONTINUITY_PARTY_REQUIRED");

  if (hasActiveProject(currentProjectState)) {
    return { recovered: false, ambiguous: false, reason: "CURRENT_PROJECT_ACTIVE" };
  }

  const continuationRequest = isCrossConversationContinuationRequest(message);
  const potentialSelection = isPotentialContinuitySelectionReply(message);
  if (!continuationRequest && !potentialSelection) {
    return { recovered: false, ambiguous: false, reason: "NOT_CONTINUATION_REQUEST" };
  }

  if (potentialSelection) {
    const selected = await recoverPendingProjectSelection({
      organization,
      party,
      currentConversationId,
      message,
    });
    if (selected) return selected;
  }

  if (!continuationRequest) {
    return { recovered: false, ambiguous: false, reason: "NOT_CONTINUATION_REQUEST" };
  }

  const cutoff = new Date(
    Date.now() - RECOVERY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const supabaseAdmin = await supabaseClient();
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
  const selection = selectContinuityProjectCandidates(projects, { message });

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

  const names = options.map((option, index) => `${index + 1}) ${option.label}`);
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
      project_continuity_selection_required: true,
      clarification: {
        required: true,
        question: CONTINUITY_SELECTION_QUESTION,
        options,
      },
      navigation: { target_id: null },
      execution: { capability_key: null, payload: {}, reason: null },
      plan: [],
    },
    agreement_state: object(agreementState),
    provider_evidence: {
      provider: "avantiqo-local",
      model: "cross-conversation-continuity-v2",
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

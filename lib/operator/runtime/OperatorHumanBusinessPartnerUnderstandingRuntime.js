import { operatorUtteranceDependsOnImmediateContext, operatorUtteranceRequiresPriorContext, operatorUtteranceExplicitlyNamesProductSurface, operatorUtteranceExplicitlyRequestsProductChange } from "../contracts/OperatorSymbolicReference.js";
import { findOperatorFastAction, listOperatorFastActions } from "./OperatorFastActionIndex.js";
import { resolveOperatorCapabilityMatch } from "./OperatorCapabilityMatcher.js";
import { resolvePreSemanticReadIntent } from "./OperatorPreSemanticReadRuntime.js";

export const HUMAN_BUSINESS_PARTNER_UNDERSTANDING_CONTRACT = "AVANTIQO_HUMAN_BUSINESS_PARTNER_UNDERSTANDING_V1";

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

export function latestCompletedAgreementBusinessAction(agreementState = {}) {
  const run = object(object(agreementState).autonomous_run);
  if (text(run.status, 80).toLowerCase() !== "completed") return null;
  const steps = list(run.planned_steps);
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = object(steps[index]);
    if (text(step.status, 80).toLowerCase() !== "completed") continue;
    const capabilityKey = text(step.capability_key, 300);
    const capability = findOperatorFastAction(capabilityKey);
    if (!capability) continue;
    return {
      capability_key: capabilityKey,
      domain: text(capability.domain, 120) || null,
      capability: text(capability.capability, 180) || null,
      action: text(capability.action, 180) || null,
      status: "completed",
      occurred_at: text(run.updated_at, 80) || null,
      authorization_effect: "NONE",
    };
  }
  return null;
}

export function registeredRevisionIntent(message, priorAction = {}) {
  const sourceMessage = text(message, 12000);
  const normalizedMessage = sourceMessage.toLowerCase();
  const informationalWriteQuestion =
    /^(?:how\s+(?:do|can|should|would|could)\s+i|what\s+(?:is|does|would)|why\s+(?:do|would|should)|can\s+i|could\s+i|should\s+i|would\s+i)\b/.test(normalizedMessage);
  const underspecifiedInvoiceMutation =
    /^(?:fix|change|correct|revise|update)\s+(?:the\s+|this\s+|that\s+)?invoice[.!?]*$/.test(normalizedMessage);
  if (informationalWriteQuestion || underspecifiedInvoiceMutation) return null;

  const prior = findOperatorFastAction(text(priorAction.capability_key, 300));
  if (!prior) return null;
  const resolution = resolveOperatorCapabilityMatch({
    message: text(message, 12000),
    capabilities: listOperatorFastActions(),
    modes: ["write"],
    limit: 5,
  });
  const current = object(resolution?.top?.capability);
  if (!current.key) return null;
  if (text(current.domain, 120) !== text(prior.domain, 120)) return null;
  if (text(current.capability, 180) !== text(prior.capability, 180)) return null;

  const words = new Set(text(message, 12000).toLowerCase().match(/[a-z0-9]+/g) || []);
  const hasRegistryMutationCue = list(current.operator_aliases).some((alias) => {
    const aliasWords = text(alias, 240).toLowerCase().match(/[a-z0-9]+/g) || [];
    if (aliasWords.length < 2 || !words.has(aliasWords[0])) return false;
    return aliasWords.slice(1).some((word) => words.has(word));
  });
  return hasRegistryMutationCue ? current : null;
}


function latestVerifiedWriteExecution(conversation = []) {
  const turns = list(conversation);
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = object(turns[index]);
    if (turn.role !== "assistant") continue;
    const execution = object(turn.execution);
    if (text(execution.status, 80).toLowerCase() !== "completed") continue;
    const capability = object(execution.capability);
    const nestedCapability = object(object(execution.result).capability);
    const mode = text(capability.mode || nestedCapability.mode, 80).toLowerCase();
    const domain = text(capability.domain || nestedCapability.domain, 80).toLowerCase();
    if (mode !== "write" && !object(execution.result).success) continue;
    const result = object(execution.result);
    const identities = {};
    const visit = (value, path = "", depth = 0) => {
      if (depth > 4 || value == null || Object.keys(identities).length >= 30) return;
      if (Array.isArray(value)) {
        value.slice(0, 6).forEach((item, itemIndex) =>
          visit(item, `${path}[${itemIndex}]`, depth + 1),
        );
        return;
      }
      if (typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        const nextPath = path ? `${path}.${key}` : key;
        if (
          (key === "id" || key.endsWith("_id") || key.endsWith("Id")) &&
          (typeof child === "string" || typeof child === "number") &&
          text(child, 300)
        ) {
          identities[nextPath] = text(child, 300);
          if (Object.keys(identities).length >= 30) return;
        }
        visit(child, nextPath, depth + 1);
      }
    };
    visit(result);
    return {
      capability_key: text(capability.key || execution.capability_key, 300) || null,
      domain: domain || null,
      action: text(capability.action || nestedCapability.action, 180) || null,
      status: "completed",
      identities,
      occurred_at: text(turn.created_at || turn.createdAt, 80) || null,
    };
  }
  return null;
}

function parseUnderstandingEnvelope(value) {
  const source = text(value, 5000);
  if (!source) return null;
  try {
    return JSON.parse(source);
  } catch {
    const result = {};
    for (const part of source.split(";")) {
      const index = part.indexOf("=");
      if (index <= 0) continue;
      const key = part.slice(0, index).trim();
      const raw = part.slice(index + 1).trim();
      if (!key || !raw) continue;
      result[key] = ["1", "true", "yes"].includes(raw.toLowerCase()) ? true : ["0", "false", "no"].includes(raw.toLowerCase()) ? false : raw;
    }
    return Object.keys(result).length ? result : null;
  }
}

function compactSemanticContext(options = {}) {
  const project = object(options.projectState);
  const agreement = object(options.agreementState);
  const pending = object(agreement.pending_execution);
  const recommendation = object(agreement.operator_recommendation || agreement.recommendation);
  const memory = list(options.longTermMemory)
    .slice(0, 8)
    .map((item) => ({
      type: text(item?.memory_type || item?.type, 80) || null,
      subject: text(item?.subject, 180) || null,
      content: text(item?.content, 500) || null,
    }))
    .filter((item) => item.content);

  return {
    project: {
      objective: text(project.objective, 900) || null,
      status: text(project.status, 80) || null,
      decisions: list(project.decisions).slice(-5).map((item) => text(item, 500)).filter(Boolean),
      constraints: list(project.constraints).slice(-5).map((item) => text(item, 500)).filter(Boolean),
      completed_steps: list(project.completed_steps).slice(-5).map((item) => text(item, 500)).filter(Boolean),
      progress_summary: text(project.progress_summary, 900) || null,
      next_step: text(project.next_step, 700) || null,
      blocker: text(project.blocker, 700) || null,
      last_intent: text(project.last_intent, 300) || null,
      last_response: text(project.last_response, 900) || null,
    },
    pending_action: text(pending.capability_key, 300) ? {
      capability_key: text(pending.capability_key, 300),
      description: text(pending.description || pending.objective || pending.reason, 800) || null,
      authorization_requirement: text(pending.authorization_requirement, 120) || null,
    } : null,
    recommendation: Object.keys(recommendation).length ? {
      description: text(recommendation.description || recommendation.objective, 800) || null,
      capability_key: text(recommendation.capability_key, 300) || null,
    } : null,
    long_term_memory: memory,
    current_screen: text(options.pathname || options.currentScreen, 500) || null,
  };
}

function operatorUtteranceExplicitlyRequestsResumeAfterInterruption(message) {
  const source = text(message, 12000).toLowerCase();
  if (!source) return false;
  const interruption = /\b(?:timed out|timeout|interrupted|stopped|failed)\b/.test(source);
  const resume = /\b(?:continue|resume|pick up|carry on)\b/.test(source);
  const preserve = /\b(?:where you were|from where|without starting over|do not start over|don't start over|same mission)\b/.test(source);
  return resume && (interruption || preserve);
}

function deterministicRecoveryContinuationUnderstanding(message, projectState = {}) {
  const project = object(projectState);
  if (text(project.status, 80).toLowerCase() !== "active") return null;
  const normalizedMessage = text(message, 12000).toLowerCase().replace(/[.!?]+$/g, "").trim();
  const bareContinuation = /^(?:continue|resume|carry on|keep going)$/.test(normalizedMessage);
  const interruptedContinuation = operatorUtteranceExplicitlyRequestsResumeAfterInterruption(message);
  const verificationRecovery =
    /\b(?:verification|verify|verified)\b.*\b(?:failed|failure|did not pass|not pass)\b|\bfailed verification\b/.test(normalizedMessage) &&
    /\b(?:recover|continue|resume|original mission|safely)\b/.test(normalizedMessage);
  const unavailableReasoningRecovery =
    /\b(?:reasoning worker|reasoning|worker)\b.*\b(?:unavailable|down|failed)\b/.test(normalizedMessage) &&
    /\b(?:deterministic|safe part|continue|complete)\b/.test(normalizedMessage);
  const finishAndVerifyRecovery =
    /\b(?:sort this out|finish this|complete this|carry this through)\b/.test(normalizedMessage) &&
    /\b(?:actually done|verified|verify|only when|when it is done)\b/.test(normalizedMessage);
  if (
    !bareContinuation &&
    !interruptedContinuation &&
    !verificationRecovery &&
    !unavailableReasoningRecovery &&
    !finishAndVerifyRecovery
  ) return null;
  const durableSignal = [
    project.progress_summary,
    project.next_step,
    project.blocker,
    project.last_intent,
  ].map((value) => text(value, 1200).toLowerCase()).join(" ");
  if (!/\b(?:timeout|timed out|continue|verified|progress|business\.write)\b/.test(durableSignal)) return null;
  return {
    contract: HUMAN_BUSINESS_PARTNER_UNDERSTANDING_CONTRACT,
    route: "governed",
    evidence_scope: "internal",
    reasoning_depth: "fast",
    conversation_mode: "light",
    context_depth: "expanded",
    response_detail: "normal",
    continuity_required: true,
    correction_or_revision: false,
    execution_domain: "business",
    engineering_scope: null,
    engineering_mode: null,
    engineering_deliverable: null,
    ambiguity_level: "none",
    candidate_interpretations: [],
    clarification_required: false,
    clarification_question: null,
    location_hint: null,
    user_goal: text(project.objective || message, 1400) || null,
    action_shape: "mission",
    goal_relation: "continue",
    artifact_intent: "none",
    artifact_type: null,
    requires_mutation: true,
    needs_current_evidence: true,
    deterministic_recovery_continuation: true,
    authorization_effect: "NONE",
  };
}

function deterministicEvidenceRequestUnderstanding(message, conversation = []) {
  const source = text(message, 12000);
  const normalized = source.toLowerCase();
  const scopeDeictic =
    /\bthis\s+(?:organisation|organization|legal entity|entity|period|fiscal period)\b/.test(normalized);
  const priorReference = (
    operatorUtteranceRequiresPriorContext(source) ||
    operatorUtteranceDependsOnImmediateContext(source)
  ) && !scopeDeictic;
  const explicitMutationCue =
    /\b(?:create|correct|change|fix|mark|post|pay|update|delete|cancel|move|shift|replace|revise|issue|apply|deploy|send|undo|make|set)\b/.test(normalized);
  const immediateConversation = [
    ...list(conversation).slice(-2),
    { role: "user", content: source },
  ];
  const registeredRead = resolvePreSemanticReadIntent({
    message: source,
    immediateConversation,
    deviceLocation: null,
  });
  if (registeredRead && !explicitMutationCue) {
    return {
      contract: HUMAN_BUSINESS_PARTNER_UNDERSTANDING_CONTRACT,
      ...registeredRead,
      continuity_required: priorReference || registeredRead.continuity_required === true,
      context_depth: priorReference ? "expanded" : registeredRead.context_depth,
      goal_relation: priorReference && registeredRead.goal_relation === "new"
        ? "continue"
        : registeredRead.goal_relation,
      registered_read_capability_key: text(registeredRead.capability_key, 300) || null,
      deterministic_registered_read: true,
      authorization_effect: "NONE",
    };
  }

  const independentVerification =
    /^verify\b/.test(normalized) &&
    /\b(?:result|change|mutation|business effect|outcome)\b/.test(normalized);
  if (independentVerification) {
    return {
      contract: HUMAN_BUSINESS_PARTNER_UNDERSTANDING_CONTRACT,
      route: "evidence",
      evidence_scope: "internal",
      reasoning_depth: "fast",
      conversation_mode: "analytical",
      context_depth: "expanded",
      response_detail: "normal",
      continuity_required: true,
      correction_or_revision: false,
      execution_domain: "business",
      engineering_scope: null,
      engineering_mode: null,
      engineering_deliverable: null,
      ambiguity_level: "none",
      candidate_interpretations: [],
      clarification_required: false,
      clarification_question: null,
      location_hint: null,
      user_goal: source,
      action_shape: "single",
      goal_relation: "continue",
      artifact_intent: "none",
      artifact_type: null,
      requires_mutation: false,
      needs_current_evidence: true,
      deterministic_verification_request: true,
      authorization_effect: "NONE",
    };
  }

  const failedEvidenceConstraint =
    /\b(?:live|current|authoritative)\s+(?:read|evidence)\b.*\b(?:failed|unavailable|missing)\b/.test(normalized) &&
    /\b(?:do not guess|don't guess|never guess|no guessing)\b/.test(normalized);
  if (failedEvidenceConstraint) {
    return {
      contract: HUMAN_BUSINESS_PARTNER_UNDERSTANDING_CONTRACT,
      route: "evidence",
      evidence_scope: "internal",
      reasoning_depth: "fast",
      conversation_mode: "light",
      context_depth: "expanded",
      response_detail: "brief",
      continuity_required: true,
      correction_or_revision: false,
      execution_domain: "business",
      engineering_scope: null,
      engineering_mode: null,
      engineering_deliverable: null,
      ambiguity_level: "none",
      candidate_interpretations: [],
      clarification_required: false,
      clarification_question: null,
      location_hint: null,
      user_goal: source,
      action_shape: "none",
      goal_relation: "continue",
      artifact_intent: "none",
      artifact_type: null,
      requires_mutation: false,
      needs_current_evidence: true,
      deterministic_evidence_failure: true,
      authorization_effect: "NONE",
    };
  }

  const scopeConstraint =
    /^use\s+(?:the\s+)?current\s+(?:entity|organisation|organization|legal entity|fiscal period|period)\b/.test(normalized);
  if (scopeConstraint) {
    return {
      contract: HUMAN_BUSINESS_PARTNER_UNDERSTANDING_CONTRACT,
      route: "evidence",
      evidence_scope: "internal",
      reasoning_depth: "fast",
      conversation_mode: "light",
      context_depth: "expanded",
      response_detail: "brief",
      continuity_required: true,
      correction_or_revision: false,
      execution_domain: "business",
      engineering_scope: null,
      engineering_mode: null,
      engineering_deliverable: null,
      ambiguity_level: "none",
      candidate_interpretations: [],
      clarification_required: false,
      clarification_question: null,
      location_hint: null,
      user_goal: source,
      action_shape: "none",
      goal_relation: "continue",
      artifact_intent: "none",
      artifact_type: null,
      requires_mutation: false,
      needs_current_evidence: true,
      deterministic_scope_constraint: true,
      authorization_effect: "NONE",
    };
  }

  const recordExistenceVerification =
    /^(?:tell me whether|tell me if|verify whether|verify if|check whether|check if)\b/.test(normalized) &&
    /\binvoice\b/.test(normalized) &&
    /\b(?:actually\s+)?(?:created|exists|persisted|saved)\b/.test(normalized);
  if (recordExistenceVerification) {
    return {
      contract: HUMAN_BUSINESS_PARTNER_UNDERSTANDING_CONTRACT,
      route: "evidence",
      evidence_scope: "internal",
      reasoning_depth: "fast",
      conversation_mode: "analytical",
      context_depth: "expanded",
      response_detail: "normal",
      continuity_required: true,
      correction_or_revision: false,
      execution_domain: "business",
      engineering_scope: null,
      engineering_mode: null,
      engineering_deliverable: null,
      ambiguity_level: "none",
      candidate_interpretations: [],
      clarification_required: false,
      clarification_question: null,
      location_hint: null,
      user_goal: source,
      action_shape: "none",
      goal_relation: "continue",
      artifact_intent: "none",
      artifact_type: null,
      requires_mutation: false,
      needs_current_evidence: true,
      registered_read_capability_key: "finance.customer_invoices.read",
      deterministic_record_verification_request: true,
      authorization_effect: "NONE",
    };
  }

  const mutationCue =
    /\b(?:create|correct|change|fix|mark|post|pay|update|delete|cancel|move|shift|replace|revise|issue|apply|deploy|send|undo)\b/.test(normalized);
  const readCue =
    /^(?:show|list|what|which|who|how much|how many|tell me whether|tell me if|compare|give me|is|are)\b/.test(normalized);
  const businessEvidenceNoun =
    /\b(?:invoice|invoices|trial balance|bank balance|sales|booking|bookings|staff|staffing|schedule|scheduled|food cost|supplier|stock|inventory|attendance|customer|customers|vendor|vendors|quotation|quotations|document|documents|permit|permits|result)\b/.test(normalized);
  if (readCue && businessEvidenceNoun && !mutationCue) {
    return {
      contract: HUMAN_BUSINESS_PARTNER_UNDERSTANDING_CONTRACT,
      route: "evidence",
      evidence_scope: "internal",
      reasoning_depth: "fast",
      conversation_mode: /\b(?:compare|explain|difference)\b/.test(normalized) ? "analytical" : "light",
      context_depth: priorReference ? "expanded" : "compact",
      response_detail: "normal",
      continuity_required: priorReference,
      correction_or_revision: false,
      execution_domain: "business",
      engineering_scope: null,
      engineering_mode: null,
      engineering_deliverable: null,
      ambiguity_level: "none",
      candidate_interpretations: [],
      clarification_required: false,
      clarification_question: null,
      location_hint: null,
      user_goal: source,
      action_shape: "none",
      goal_relation: priorReference ? "continue" : "new",
      artifact_intent: "none",
      artifact_type: null,
      requires_mutation: false,
      needs_current_evidence: true,
      deterministic_business_evidence_request: true,
      authorization_effect: "NONE",
    };
  }
  return null;
}

function deterministicAmbiguousBusinessMutationUnderstanding(message) {
  const source = text(message, 12000);
  const normalized = source.toLowerCase().replace(/[.!?]+$/g, "").trim();
  const bareInvoiceMutation =
    /^(?:fix|change|correct|revise|update)\s+(?:the\s+|this\s+|that\s+)?invoice$/.test(normalized);
  const missingDelta =
    /^(?:move|shift|push)\s+(?:it|this|that)\s+back$/.test(normalized);
  const unresolvedOther =
    /\b(?:same change|same thing)\b.*\b(?:other one|another one)\b/.test(normalized);
  const unsafeGuess =
    /\b(?:whatever|whichever)\s+(?:customer|invoice|record)?\s*(?:seems|looks)\s+most likely\b|\bmost likely\s+(?:customer|invoice|record)\b/.test(normalized);
  const confirmationBypass =
    /\b(?:skip|bypass|ignore)\s+(?:the\s+)?confirmation\b/.test(normalized);
  if (confirmationBypass) {
    return {
      contract: HUMAN_BUSINESS_PARTNER_UNDERSTANDING_CONTRACT,
      route: "governed",
      evidence_scope: "internal",
      reasoning_depth: "fast",
      conversation_mode: "light",
      context_depth: "expanded",
      response_detail: "brief",
      continuity_required: true,
      correction_or_revision: false,
      execution_domain: "business",
      engineering_scope: null,
      engineering_mode: null,
      engineering_deliverable: null,
      ambiguity_level: "none",
      candidate_interpretations: [],
      clarification_required: false,
      clarification_question: null,
      location_hint: null,
      user_goal: source,
      action_shape: "single",
      goal_relation: "continue",
      artifact_intent: "none",
      artifact_type: null,
      requires_mutation: true,
      needs_current_evidence: true,
      requires_confirmation_override: true,
      deterministic_confirmation_bypass_request: true,
      authorization_effect: "NONE",
    };
  }
  if (!bareInvoiceMutation && !missingDelta && !unresolvedOther && !unsafeGuess) return null;

  const question = unsafeGuess
    ? "Which exact customer or record should I use?"
    : missingDelta
      ? "How far back should I move it?"
      : unresolvedOther
        ? "Which exact other record do you mean?"
        : "Which invoice do you want me to change, and what should I change on it?";
  return {
    contract: HUMAN_BUSINESS_PARTNER_UNDERSTANDING_CONTRACT,
    route: "governed",
    evidence_scope: "internal",
    reasoning_depth: "fast",
    conversation_mode: "light",
    context_depth: "expanded",
    response_detail: "brief",
    continuity_required: true,
    correction_or_revision: true,
    execution_domain: "business",
    engineering_scope: null,
    engineering_mode: null,
    engineering_deliverable: null,
    ambiguity_level: "material",
    candidate_interpretations: [],
    clarification_required: true,
    clarification_question: question,
    location_hint: null,
    user_goal: source,
    action_shape: "single",
    goal_relation: "unknown",
    artifact_intent: "none",
    artifact_type: null,
    requires_mutation: true,
    needs_current_evidence: true,
    deterministic_ambiguous_business_mutation: true,
    authorization_effect: "NONE",
  };
}

function deterministicRegisteredBusinessWriteUnderstanding(
  message,
  agreementState = {},
  projectState = {},
  conversation = [],
) {
  const source = text(message, 12000);
  const normalized = source.toLowerCase().replace(/[.!?]+$/g, "").trim();
  if (!source) return null;

  const completedAnchor =
    latestVerifiedWriteExecution(conversation) ||
    latestCompletedAgreementBusinessAction(agreementState) ||
    null;
  const anchorCapability = text(completedAnchor?.capability_key, 300);

  const explicitInvoiceCorrection =
    /\binvoice\b/.test(normalized) &&
    (
      /\b(?:correct|change|fix|revise|update|move|shift)\b/.test(normalized) ||
      /\b(?:wrong week|week before|back 7 days|7 days back|one week back|one week earlier)\b/.test(normalized)
    );

  const reusePriorInvoice =
    /\b(?:same customer|same lines|same customer and lines|same .* as before)\b/.test(normalized) &&
    /\b(?:invoice|due date|invoice date|line|lines)\b/.test(normalized);

  const relativeDateCorrection =
    /\bdate\b.*\bwrong\b|\bwrong\b.*\bdate\b/.test(normalized) &&
    /\b(?:last|this)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(normalized);

  const wrongCustomerRecovery =
    /\bwrong customer\b/.test(normalized) &&
    /\b(?:undo|discard|replace|use|previous message|prior message)\b/.test(normalized);

  if (
    !explicitInvoiceCorrection &&
    !reusePriorInvoice &&
    !relativeDateCorrection &&
    !wrongCustomerRecovery
  ) {
    return null;
  }

  const capabilityKey = wrongCustomerRecovery || reusePriorInvoice
    ? (
        anchorCapability ||
        "finance.accounts_receivable.CreateCustomerInvoice"
      )
    : "finance.accounts_receivable.CorrectCustomerInvoice";

  const registered = findOperatorFastAction(capabilityKey) ||
    findOperatorFastAction("finance.accounts_receivable.CorrectCustomerInvoice");
  if (!registered) return null;

  return {
    contract: HUMAN_BUSINESS_PARTNER_UNDERSTANDING_CONTRACT,
    route: "governed",
    evidence_scope: "internal",
    reasoning_depth: "fast",
    conversation_mode: "light",
    context_depth: "expanded",
    response_detail: "normal",
    continuity_required: true,
    correction_or_revision: true,
    execution_domain: "business",
    engineering_scope: null,
    engineering_mode: null,
    engineering_deliverable: null,
    ambiguity_level: "none",
    candidate_interpretations: [],
    clarification_required: false,
    clarification_question: null,
    location_hint: null,
    user_goal: source,
    action_shape: "single",
    goal_relation: "revise",
    artifact_intent: "none",
    artifact_type: null,
    requires_mutation: true,
    needs_current_evidence: true,
    registered_write_capability_key: text(registered.key, 300) || null,
    deterministic_registered_business_write: true,
    recovery_context_present:
      relativeDateCorrection ||
      wrongCustomerRecovery ||
      text(projectState?.status, 80).toLowerCase() === "active",
    authorization_effect: "NONE",
  };
}

function deterministicConversationDirectiveUnderstanding(message) {
  const source = text(message, 12000);
  const normalized = source.toLowerCase().replace(/[.!?]+$/g, "").trim();
  const plainShort =
    /\b(?:plain english|plain language|simple terms|simply)\b/.test(normalized) &&
    /\b(?:short|brief|concise|keep it short)\b/.test(normalized);
  if (!plainShort) return null;
  return {
    contract: HUMAN_BUSINESS_PARTNER_UNDERSTANDING_CONTRACT,
    route: "conversation",
    evidence_scope: "none",
    reasoning_depth: "fast",
    conversation_mode: "light",
    context_depth: "expanded",
    response_detail: "brief",
    continuity_required: true,
    correction_or_revision: false,
    execution_domain: "none",
    engineering_scope: null,
    engineering_mode: null,
    engineering_deliverable: null,
    ambiguity_level: "none",
    candidate_interpretations: [],
    clarification_required: false,
    clarification_question: null,
    location_hint: null,
    user_goal: source,
    action_shape: "none",
    goal_relation: "continue",
    artifact_intent: "none",
    artifact_type: null,
    requires_mutation: false,
    needs_current_evidence: false,
    deterministic_conversation_directive: true,
    authorization_effect: "NONE",
  };
}

function deterministicProductChangeUnderstanding(message) {
  if (!operatorUtteranceExplicitlyRequestsProductChange(message)) return null;
  return {
    contract: HUMAN_BUSINESS_PARTNER_UNDERSTANDING_CONTRACT,
    route: "governed",
    evidence_scope: "internal",
    reasoning_depth: "deep",
    conversation_mode: "strategic",
    context_depth: "compact",
    response_detail: "normal",
    continuity_required: false,
    correction_or_revision: false,
    execution_domain: "product_engineering",
    engineering_scope: "single",
    engineering_mode: "change",
    engineering_deliverable: "change",
    ambiguity_level: "none",
    candidate_interpretations: [],
    clarification_required: false,
    clarification_question: null,
    location_hint: null,
    user_goal: text(message, 1400) || null,
    action_shape: "mission",
    goal_relation: "new",
    artifact_intent: "none",
    artifact_type: null,
    requires_mutation: true,
    needs_current_evidence: true,
    deterministic_product_change: true,
    authorization_effect: "NONE",
  };
}

export function normalizeHumanBusinessPartnerUnderstanding(value) {
  const source = object(value);
  const compactIntent = text(source.i, 40).toLowerCase();
  if (["chat", "inspect", "operate", "followup", "revise", "artifact", "unclear"].includes(compactIntent)) {
    const compactDomain = text(source.d, 40).toLowerCase();
    const compactEvidence = text(source.e, 40).toLowerCase();
    const compactAction = text(source.a, 40).toLowerCase();
    const compactRelation = text(source.g, 40).toLowerCase();
    const compactMode = text(source.m, 40).toLowerCase();
    const domain = compactDomain === "product" ? "product_engineering" : compactDomain === "business" ? "business" : "none";
    const evidenceScope = ["none", "internal", "external", "both"].includes(compactEvidence) ? compactEvidence : "none";
    const actionShape = ["none", "single", "mission"].includes(compactAction) ? compactAction : "none";
    const goalRelation = ["new", "continue", "revise", "unknown"].includes(compactRelation) ? compactRelation : "unknown";
    const inspection = compactIntent === "inspect";
    const operation = compactIntent === "operate";
    const artifact = compactIntent === "artifact";
    const unclear = compactIntent === "unclear";
    const productInspection = inspection && domain === "product_engineering";
    const productOperation = operation && domain === "product_engineering";
    return {
      contract: HUMAN_BUSINESS_PARTNER_UNDERSTANDING_CONTRACT,
      route: operation ? "governed" : inspection ? "evidence" : "conversation",
      evidence_scope: inspection ? (evidenceScope === "none" ? "internal" : evidenceScope) : evidenceScope,
      reasoning_depth: actionShape === "mission" ? "deep" : "fast",
      conversation_mode: ["light", "strategic", "creative", "analytical"].includes(compactMode)
        ? compactMode
        : domain === "product_engineering" && !inspection && !operation ? "strategic" : "light",
      context_depth: ["followup", "revise", "artifact"].includes(compactIntent) ? "expanded" : "compact",
      response_detail: "normal",
      continuity_required: ["followup", "revise", "artifact"].includes(compactIntent) || goalRelation === "continue",
      correction_or_revision: compactIntent === "revise" || goalRelation === "revise",
      execution_domain: domain,
      engineering_scope: domain === "product_engineering" && actionShape === "mission" ? "portfolio" : domain === "product_engineering" ? "single" : null,
      engineering_mode: productInspection ? "inspect" : productOperation ? "change" : null,
      engineering_deliverable: productInspection ? "conversation" : productOperation ? "change" : domain === "product_engineering" ? "conversation" : null,
      ambiguity_level: unclear ? "material" : "none",
      candidate_interpretations: [],
      clarification_required: unclear,
      clarification_question: unclear ? text(source.q, 700) || null : null,
      location_hint: text(source.l, 240) || null,
      user_goal: text(source.goal, 1400) || null,
      action_shape: actionShape,
      goal_relation: artifact ? "continue" : goalRelation,
      artifact_intent: artifact ? "reuse_existing" : "none",
      artifact_type: null,
      requires_mutation: operation,
      needs_current_evidence: inspection,
    };
  }
  const routeCode = text(source.route ?? source.r, 40).toLowerCase();
  const route = ({ c: "conversation", e: "evidence", g: "governed" })[routeCode] || routeCode;
  if (!["conversation", "evidence", "governed"].includes(route)) return null;
  const scope = text(source.evidence_scope ?? source.es, 40).toLowerCase();
  const conversationMode = text(source.conversation_mode ?? source.cm, 40).toLowerCase();
  const contextDepth = text(source.context_depth ?? source.cd, 40).toLowerCase();
  const responseDetail = text(source.response_detail ?? source.rd, 40).toLowerCase();
  const executionDomain = text(source.execution_domain ?? source.ed, 40).toLowerCase();
  const engineeringScope = text(source.engineering_scope ?? source.gs, 40).toLowerCase();
  const engineeringMode = text(source.engineering_mode ?? source.gm, 40).toLowerCase();
  const engineeringDeliverable = text(source.engineering_deliverable ?? source.gd, 40).toLowerCase();
  const ambiguityLevel = text(source.ambiguity_level ?? source.al, 40).toLowerCase();
  const actionShape = text(source.action_shape ?? source.as, 40).toLowerCase();
  const goalRelation = text(source.goal_relation ?? source.gr, 40).toLowerCase();
  const artifactIntent = text(source.artifact_intent ?? source.ai, 40).toLowerCase();
  const artifactType = text(source.artifact_type ?? source.at, 40).toLowerCase();
  const candidateInterpretations = list(source.candidate_interpretations ?? source.ci)
    .map((item) => text(item, 500))
    .filter(Boolean)
    .slice(0, 3);
  const normalizedDomain = ["none", "business", "product_engineering"].includes(executionDomain) ? executionDomain : "none";
  const normalizedEngineeringMode = ["inspect", "change"].includes(engineeringMode) ? engineeringMode : null;
  const normalizedEngineeringDeliverable = ["conversation", "inspection_report", "change"].includes(engineeringDeliverable)
    ? engineeringDeliverable
    : null;
  const productEngineeringInspection =
    normalizedDomain === "product_engineering" && normalizedEngineeringMode === "inspect";
  const primaryInspectionDeliverable =
    productEngineeringInspection && normalizedEngineeringDeliverable === "inspection_report";
  return {
    contract: HUMAN_BUSINESS_PARTNER_UNDERSTANDING_CONTRACT,
    route: primaryInspectionDeliverable ? "governed" : route,
    evidence_scope: ["none", "internal", "external", "both"].includes(scope) ? scope : "none",
    reasoning_depth:
      normalizedDomain === "business" && (source.requires_mutation === true || source.rm === true) && actionShape === "single"
        ? "fast"
        : text(source.reasoning_depth ?? source.depth, 40).toLowerCase() === "deep" ? "deep" : "fast",
    conversation_mode: ["light", "strategic", "creative", "analytical"].includes(conversationMode) ? conversationMode : "light",
    context_depth: contextDepth === "expanded" ? "expanded" : "compact",
    response_detail: ["brief", "normal", "deep"].includes(responseDetail) ? responseDetail : "normal",
    continuity_required: source.continuity_required === true || source.ct === true,
    correction_or_revision: source.correction_or_revision === true || source.cr === true,
    execution_domain: normalizedDomain,
    engineering_scope: ["single", "portfolio"].includes(engineeringScope) ? engineeringScope : null,
    engineering_mode: normalizedEngineeringMode,
    engineering_deliverable: normalizedEngineeringDeliverable,
    ambiguity_level: ambiguityLevel === "material" ? "material" : "none",
    candidate_interpretations: candidateInterpretations,
    clarification_required: ambiguityLevel === "material" && (source.clarification_required === true || source.cq === true),
    clarification_question: ambiguityLevel === "material" ? text(source.clarification_question ?? source.q, 700) || null : null,
    location_hint: text(source.location_hint ?? source.l, 240) || null,
    user_goal: text(source.user_goal ?? source.goal, 1400) || null,
    action_shape: ["none", "single", "mission"].includes(actionShape) ? actionShape : "none",
    goal_relation: ["new", "continue", "revise", "unknown"].includes(goalRelation) ? goalRelation : "unknown",
    artifact_intent: ["none", "reuse_existing"].includes(artifactIntent) ? artifactIntent : "none",
    artifact_type: ["any", "pdf", "document", "image", "video", "audio"].includes(artifactType) ? artifactType : null,
    requires_mutation: productEngineeringInspection ? false : (source.requires_mutation === true || source.rm === true),
    needs_current_evidence: productEngineeringInspection ? true : (source.needs_current_evidence === true || source.ne === true),
  };
}

export async function preflightHumanBusinessPartnerTurn(options = {}) {
  const organizationId = text(options.organizationId, 160);
  const message = text(options.message, 12000);
  if (!organizationId || !message) return null;

  if (operatorUtteranceExplicitlyRequestsResumeAfterInterruption(message)) {
    return {
      contract: HUMAN_BUSINESS_PARTNER_UNDERSTANDING_CONTRACT,
      route: "conversation",
      evidence_scope: "none",
      reasoning_depth: "fast",
      conversation_mode: "light",
      context_depth: "expanded",
      response_detail: "normal",
      continuity_required: true,
      correction_or_revision: false,
      execution_domain: "none",
      engineering_scope: null,
      engineering_mode: null,
      engineering_deliverable: null,
      ambiguity_level: "none",
      candidate_interpretations: [],
      clarification_required: false,
      clarification_question: null,
      location_hint: null,
      user_goal: text(message, 1400) || null,
      action_shape: "mission",
      goal_relation: "continue",
      artifact_intent: "none",
      artifact_type: null,
      requires_mutation: false,
      needs_current_evidence: false,
      deterministic_recovery_reference: true,
      context_free_preflight: true,
      context_required: true,
      immediate_context_sufficient: false,
      structural_context_reference: true,
      prior_context_reference: true,
      standalone_context_sanity_applied: false,
      explicit_product_surface: false,
      preflight_provider: "deterministic",
      preflight_model: "recovery-reference-v1",
      preflight_execution_lane: "deterministic",
      preflight_front_task_mode: "none",
      authorization_effect: "NONE",
    };
  }

  const deterministicConversationDirective = deterministicConversationDirectiveUnderstanding(message);
  if (deterministicConversationDirective) {
    return {
      ...deterministicConversationDirective,
      context_free_preflight: true,
      context_required: true,
      immediate_context_sufficient: true,
      structural_context_reference: true,
      prior_context_reference: true,
      standalone_context_sanity_applied: false,
      explicit_product_surface: false,
      preflight_provider: "deterministic",
      preflight_model: "conversation-directive-v1",
      preflight_execution_lane: "deterministic",
      preflight_front_task_mode: "none",
      authorization_effect: "NONE",
    };
  }

  const deterministicProductChange = deterministicProductChangeUnderstanding(message);
  if (deterministicProductChange) {
    return {
      ...deterministicProductChange,
      context_free_preflight: true,
      context_required: false,
      immediate_context_sufficient: false,
      structural_context_reference: false,
      prior_context_reference: false,
      standalone_context_sanity_applied: true,
      explicit_product_surface: true,
      preflight_provider: "deterministic",
      preflight_model: "product-change-reflex-v1",
      preflight_execution_lane: "deterministic",
      preflight_front_task_mode: "none",
      authorization_effect: "NONE",
    };
  }

  const deterministicAmbiguity = deterministicAmbiguousBusinessMutationUnderstanding(message);
  if (deterministicAmbiguity) {
    return {
      ...deterministicAmbiguity,
      context_free_preflight: true,
      context_required: true,
      immediate_context_sufficient: false,
      structural_context_reference: true,
      prior_context_reference: true,
      standalone_context_sanity_applied: false,
      explicit_product_surface: false,
      preflight_provider: "deterministic",
      preflight_model: "business-ambiguity-reflex-v1",
      preflight_execution_lane: "deterministic",
      preflight_front_task_mode: "none",
      authorization_effect: "NONE",
    };
  }

  const deterministicBusinessWrite = deterministicRegisteredBusinessWriteUnderstanding(
    message,
    options.agreementState,
    options.projectState,
    options.immediateConversation,
  );
  if (deterministicBusinessWrite) {
    return {
      ...deterministicBusinessWrite,
      context_free_preflight: true,
      context_required: true,
      immediate_context_sufficient: false,
      structural_context_reference: true,
      prior_context_reference: true,
      standalone_context_sanity_applied: false,
      explicit_product_surface: false,
      preflight_provider: "deterministic",
      preflight_model: "registered-business-write-reflex-v1",
      preflight_execution_lane: "deterministic",
      preflight_front_task_mode: "none",
      authorization_effect: "NONE",
    };
  }

  const deterministicEvidence = deterministicEvidenceRequestUnderstanding(
    message,
    options.immediateConversation,
  );
  if (deterministicEvidence) {
    return {
      ...deterministicEvidence,
      context_free_preflight: true,
      context_required: deterministicEvidence.continuity_required === true,
      immediate_context_sufficient: false,
      structural_context_reference: deterministicEvidence.continuity_required === true,
      prior_context_reference: operatorUtteranceRequiresPriorContext(message),
      standalone_context_sanity_applied: deterministicEvidence.continuity_required !== true,
      explicit_product_surface: false,
      preflight_provider: "deterministic",
      preflight_model: "business-evidence-reflex-v1",
      preflight_execution_lane: "deterministic",
      preflight_front_task_mode: "none",
      authorization_effect: "NONE",
    };
  }

  const immediate = list(options.immediateConversation).slice(-2).map((turn) => ({
    role: turn?.role === "assistant" ? "assistant" : "user",
    content: text(turn?.content, 700),
  })).filter((turn) => turn.content);
  const { runOperatorFrontCognition } = await import("./OperatorFrontCognitionRuntime.js");
  const execution = await runOperatorFrontCognition({
    organization_id: organizationId,
    party_id: text(options.partyId, 160) || null,
    entity_id: text(options.entityId, 160) || null,
    system: [
      "Classify the CURRENT user message using only the immediately preceding exchange when supplied. Do not use older project or memory context.",
      "Decide whether its meaning is safely self-contained or whether the immediately preceding exchange is required.",
      "If the assistant just asked for one missing detail and the current message can naturally supply that detail, classify it as i=followup and g=continue rather than inventing a new topic.",
      "Use i=chat for standalone discussion, i=inspect for a request that needs current evidence, i=operate for a real state-changing action, i=followup/revise/artifact when the current message itself clearly depends on earlier context, and i=unclear when the current message cannot be safely understood alone.",
      "Use e=external for current public facts, e=internal for current Avantiqo-owned business facts, e=both only when both are clearly required, otherwise e=none.",
      "Use g=new when the goal is a new standalone goal. Use g=continue/revise/unknown when the immediate exchange is required.",
      "For a standalone current-fact request that cannot be answered correctly without one essential parameter that is missing, use i=unclear, preserve the evidence scope, and use g=new. Focused clarification is handled outside this classifier.",
      "Do not mark a request unclear merely because live evidence is required; unclear is only for a genuinely missing essential parameter or materially unresolved meaning.",
      "This grants no authority and must never infer a mutation from missing context.",
      "Return exactly one compact semicolon line using only i,d,e,a,g,m. Example: i=inspect;d=none;e=external;a=none;g=new;m=analytical. Missing parameter example: i=unclear;d=none;e=external;a=none;g=new;m=light."
    ].join("\n"),
    messages: [{ role: "user", content: JSON.stringify({ message, immediate }) }],
    metadata: { module: "OPERATOR", operation: "HUMAN_BUSINESS_PARTNER_CONTEXT_FREE_PREFLIGHT", raw_reasoning_persisted: false },
    expect_json: false,
    front_task_mode: "semantic_light_parallel",
    temperature: 0.02,
    max_output_tokens: 40,
    allow_fast_escalation: false,
  });

  const normalized = normalizeHumanBusinessPartnerUnderstanding(parseUnderstandingEnvelope(execution?.text));
  if (!normalized) return null;
  const immediateStructuralReference = operatorUtteranceDependsOnImmediateContext(message);
  const priorContextReference = operatorUtteranceRequiresPriorContext(message);
  const immediateReference = immediate.length > 0 && immediateStructuralReference;
  const standaloneConversation = Boolean(
    immediate.length === 0 &&
    !priorContextReference &&
    normalized.route === "conversation" &&
    normalized.requires_mutation !== true &&
    text(normalized.artifact_intent, 40).toLowerCase() !== "reuse_existing"
  );
  const contextSanitized = standaloneConversation
    ? {
        ...normalized,
        continuity_required: false,
        correction_or_revision: false,
        context_depth: "compact",
        goal_relation: "new",
      }
    : normalized;
  const explicitProductSurface = operatorUtteranceExplicitlyNamesProductSurface(message);
  const normalizedForContext =
    explicitProductSurface &&
    contextSanitized.route === "conversation" &&
    contextSanitized.requires_mutation !== true &&
    text(contextSanitized.execution_domain, 80).toLowerCase() === "none"
      ? {
          ...contextSanitized,
          execution_domain: "product_engineering",
          conversation_mode: "strategic",
          engineering_scope: "single",
          engineering_deliverable: "conversation",
        }
      : contextSanitized;
  const contextRequired =
    normalizedForContext.continuity_required === true ||
    normalizedForContext.correction_or_revision === true ||
    ["continue", "revise", "unknown"].includes(text(normalizedForContext.goal_relation, 40).toLowerCase()) ||
    text(normalizedForContext.artifact_intent, 40).toLowerCase() === "reuse_existing" ||
    immediateReference ||
    (immediate.length === 0 && priorContextReference);
  return {
    ...normalizedForContext,
    ...(immediateReference && normalizedForContext.requires_mutation !== true
      ? {
          continuity_required: true,
          context_depth: "expanded",
          goal_relation: "continue",
        }
      : {}),
    context_free_preflight: true,
    context_required: contextRequired,
    immediate_context_sufficient: immediateReference,
    structural_context_reference: immediate.length > 0 ? immediateStructuralReference : priorContextReference,
    prior_context_reference: priorContextReference,
    standalone_context_sanity_applied: standaloneConversation,
    explicit_product_surface: explicitProductSurface,
    preflight_provider: text(execution?.provider, 120) || null,
    preflight_model: text(execution?.model, 240) || null,
    preflight_execution_lane: text(execution?.execution_lane, 80) || null,
    preflight_front_task_mode: "semantic_light_parallel",
    preflight_latency_ms: Number(execution?.front_metrics?.generation_seconds || 0) > 0
      ? Math.round(Number(execution.front_metrics.generation_seconds) * 1000)
      : null,
    preflight_semantic_latency_ms: Number(execution?.front_metrics?.semantic_seconds || 0) > 0
      ? Math.round(Number(execution.front_metrics.semantic_seconds) * 1000)
      : null,
    preflight_light_latency_ms: Number(execution?.front_metrics?.light_seconds || 0) > 0
      ? Math.round(Number(execution.front_metrics.light_seconds) * 1000)
      : null,
    speculative_light_text: execution?.speculative_light_safe === true
      ? text(execution?.speculative_light_text, 12000) || null
      : null,
    speculative_light_safe: execution?.speculative_light_safe === true,
    speculative_light_model: text(execution?.speculative_light_model, 240) || null,
    speculative_light_provider: text(execution?.provider, 120) || null,
    speculative_light_usage_id: text(execution?.usage?.id || execution?.usage_id, 240) || null,
    speculative_light_governed_usage_recorded: execution?.governed_usage_recorded === true,
    authorization_effect: "NONE",
  };
}

export async function understandHumanBusinessPartnerTurn(options = {}) {
  const organizationId = text(options.organizationId, 160);
  const message = text(options.message, 12000);
  if (!organizationId || !message) return null;

  const deterministicRecovery = deterministicRecoveryContinuationUnderstanding(message, options.projectState);
  if (deterministicRecovery) return deterministicRecovery;

  const deterministicConversationDirective = deterministicConversationDirectiveUnderstanding(message);
  if (deterministicConversationDirective) return deterministicConversationDirective;

  const deterministicProductChange = deterministicProductChangeUnderstanding(message);
  if (deterministicProductChange) return deterministicProductChange;

  const deterministicAmbiguity = deterministicAmbiguousBusinessMutationUnderstanding(message);
  if (deterministicAmbiguity) return deterministicAmbiguity;

  const deterministicBusinessWrite = deterministicRegisteredBusinessWriteUnderstanding(
    message,
    options.agreementState,
    options.projectState,
    options.conversation,
  );
  if (deterministicBusinessWrite) return deterministicBusinessWrite;

  const deterministicEvidence = deterministicEvidenceRequestUnderstanding(
    message,
    options.conversation,
  );
  if (deterministicEvidence) return deterministicEvidence;

  const recent = list(options.conversation).slice(-8).map((turn) => ({
    role: turn?.role === "assistant" ? "assistant" : "user",
    content: text(turn?.content, 900),
    presentation_artifacts: list(turn?.presentation_artifacts).slice(0, 6).map((artifact) => ({
      url: text(artifact?.url, 1000),
      label: text(artifact?.label, 240) || null,
      mime_type: text(artifact?.mime_type, 160) || null,
      source_key: text(artifact?.source_key, 80) || null,
    })).filter((artifact) => artifact.url),
    execution: object(turn?.execution),
  })).filter((turn) => turn.content);
  const semanticContext = {
    ...compactSemanticContext(options),
    latest_verified_write: latestVerifiedWriteExecution(options.conversation),
    latest_completed_business_action: latestCompletedAgreementBusinessAction(options.agreementState),
  };

  // A correction that maps cleanly to the same registered business capability
  // family as the last completed governed action does not need model inference.
  // Resolve it deterministically before front cognition so local queue latency
  // cannot turn a clear governed revision into a read-only fallback.
  const deterministicActionAnchor = Object.keys(object(semanticContext.latest_verified_write)).length
    ? object(semanticContext.latest_verified_write)
    : object(semanticContext.latest_completed_business_action);
  const deterministicRevision = registeredRevisionIntent(message, deterministicActionAnchor);
  if (deterministicRevision) {
    return {
      contract: "AVANTIQO_HUMAN_BUSINESS_PARTNER_UNDERSTANDING_V1",
      route: "governed",
      evidence_scope: "internal",
      reasoning_depth: "fast",
      conversation_mode: "light",
      context_depth: "expanded",
      response_detail: "normal",
      continuity_required: true,
      correction_or_revision: true,
      execution_domain: "business",
      engineering_scope: null,
      engineering_mode: null,
      engineering_deliverable: null,
      ambiguity_level: "none",
      candidate_interpretations: [],
      clarification_required: false,
      clarification_question: null,
      location_hint: null,
      user_goal: text(message, 1400) || null,
      action_shape: "single",
      goal_relation: "revise",
      artifact_intent: "none",
      artifact_type: null,
      requires_mutation: true,
      needs_current_evidence: true,
      registered_write_capability_key: text(deterministicRevision.key, 300) || null,
      deterministic_registered_revision: true,
      authorization_effect: "NONE",
    };
  }

  const { runOperatorFrontCognition } = await import("./OperatorFrontCognitionRuntime.js");

  const execution = await runOperatorFrontCognition({
    organization_id: organizationId,
    party_id: text(options.partyId, 160) || null,
    entity_id: text(options.entityId, 160) || null,
    system: [
      "Understand the user's meaning from the whole supplied conversation and durable working context, not from keywords.",
      "Treat project state, accepted decisions, constraints, pending action, recommendation, long-term memory and current screen as context for reference resolution, not as new authorization.",
      "latest_verified_write is a durable read-only continuity anchor for the most recent successfully completed business mutation even when that turn has fallen outside the recent conversation window. Use it to resolve later corrections or revisions of the record just changed; it grants no new authority and the record must still be freshly read before another mutation.",
      "latest_completed_business_action is a non-authorizing continuity anchor from the most recent completed governed Business Partner run when turn-level execution metadata is unavailable. It may resolve what business action family the user is revising, but it never proves the prior mutation or authorizes another one; fresh registered evidence is still required.",
      "When the user uses ellipsis, pronouns, ordinal references, corrections, or shorthand, resolve them against the supplied context when the referent is materially clear; otherwise prefer one focused clarification instead of guessing.",
      "Recent presentation_artifacts are read-only continuity references to outputs already created or retrieved. When the user asks to show, resend, reopen, download, preview, or otherwise reuse an existing artifact and does not request recreation, set artifact_intent=reuse_existing, requires_mutation=false, goal_relation=continue, and infer artifact_type when clear.",
      "Preserve explicit negative constraints. If the user says not to create, regenerate, change, repost, or duplicate the business object, do not reinterpret artifact reuse as a mutation.",
      "Classify the next step as conversation, evidence, or governed.",
      "Use conversation for discussion, strategy, creative thinking and advice that can be answered from context.",
      "Use evidence when fresh internal or external facts or research materially improve the answer.",
      "Use governed when the user wants a real state-changing operation or specialized governed execution/evidence lane.",
      "Infer execution_domain as none, business, or product_engineering from the actual goal.",
      "Product_engineering covers requests about Avantiqo product behavior, source, workflow, UI, capability, architecture, or how an Avantiqo domain/page should be improved. This remains product_engineering even when the product surface belongs to Finance, People, Supply Chain, Commercial, or another business domain. Business means operating the organization's records or real-world processes through registered capabilities, not evaluating the Avantiqo product itself.",
      "For product_engineering, infer engineering_scope as single or portfolio and engineering_mode as inspect or change.",
      "Also infer engineering_deliverable as conversation, inspection_report, or change from the user's actual desired outcome, not from keywords.",
      "Use engineering_deliverable inspection_report only when the user primarily wants the technical inspection itself as the answer. If inspection is merely evidence needed to support advice, strategy, comparison, prioritization, or discussion, use engineering_deliverable conversation and keep the response conversational.",
      "For product_engineering inspection, set requires_mutation false and needs_current_evidence true. Do not force route governed unless the inspection report itself is the requested deliverable; analytical product advice may use evidence with internal and/or external research while remaining a normal conversation.",
      "Do not require explicit technical keywords when the meaning clearly concerns the Avantiqo product.",
      "Infer action_shape as none, single, or mission. Use single for one concrete business outcome even when natural language contains references, dates, corrections, or context such as 'same as last week'. Use mission only when the user truly asks for a multi-step autonomous objective requiring planning across multiple actions.",
      "Infer goal_relation as new, continue, revise, or unknown by comparing the current human goal with the supplied active project, pending action and recent conversation. Use new when the user has clearly started a different business goal; continue when they are carrying on the same goal; revise when they correct or alter it; unknown only when context is insufficient.",
      "A normal single business action should normally use reasoning_depth fast. Do not promote it to deep just because the phrasing is conversational, contextual, or detailed.",
      "Also infer how the conversation itself should behave: conversation_mode is light, strategic, creative, or analytical; context_depth is compact or expanded; response_detail is brief, normal, or deep.",
      "Set continuity_required when the current turn depends materially on prior discussion, project intent, earlier options, references such as 'that one'/'the second one', or an ongoing creative/strategic thread.",
      "Set correction_or_revision when the user is correcting, rejecting, refining, changing, or revising an earlier interpretation, option, decision, or output.",
      "Infer ambiguity_level as none or material. Material means two or more genuinely different goals or referents remain after using the supplied context and choosing the wrong one could materially change the answer, evidence path, scope, or authority.",
      "Breadth is not ambiguity. Different review dimensions such as usability, performance, reporting, navigation, accessibility, controls, or workflow are normally parts of one broad analysis request, not different interpretations. When the user asks you to assess or improve a whole product surface, proceed across the relevant surface with judgment instead of asking them which issue to choose.",
      "When ambiguity is truly material, return at most two short candidate_interpretations and set clarification_required true with one focused clarification_question. Do not ask for clarification when context resolves the referent well enough to proceed safely, and do not ask the human to pre-diagnose the problem before you inspect it.",
      "Do not use literal keywords as the decision rule; infer these fields from meaning and conversational context.",
      "This classification grants no authority. Governance is enforced later.",
      "Return one compact semicolon-separated line only, no prose and no braces. Example: r=e;es=internal;depth=fast;cm=analytical;cd=expanded;rd=normal;ct=0;cr=0;ed=product_engineering;gm=inspect;gd=conversation;al=none;cq=0;goal=review finance ui;as=single;gr=new;ai=none;rm=0;ne=1. Use r values c/e/g and boolean values 0/1. For artifact reuse use ai=reuse_existing and at=pdf/document/image/video/audio/any. Omit null fields. Only include ci and q when ambiguity is truly material."
    ].join("\n"),
    messages: [{ role: "user", content: JSON.stringify({ message, recent, context: semanticContext }) }],
    tools: [],
    authorization: { allow_mutating_tools: false },
    metadata: { module: "OPERATOR", operation: "HUMAN_BUSINESS_PARTNER_SEMANTIC_UNDERSTANDING", raw_reasoning_persisted: false },
    expect_json: false,
    temperature: 0.05,
    max_output_tokens: 80,
    max_turns: 1,
    max_tool_calls: 0,
    allow_fast_escalation: false,
  });

  try {
    let normalized = normalizeHumanBusinessPartnerUnderstanding(parseUnderstandingEnvelope(execution?.text));
    if (!normalized) return null;


    const priorContextReference = operatorUtteranceRequiresPriorContext(message);
    const immediateContextReference = operatorUtteranceDependsOnImmediateContext(message);
    const durableWrite = object(semanticContext.latest_verified_write);
    const completedBusinessAction = object(semanticContext.latest_completed_business_action);
    const durableActionAnchor = Object.keys(durableWrite).length > 0 ? durableWrite : completedBusinessAction;
    const registeredRevision = registeredRevisionIntent(message, durableActionAnchor);
    const semanticRevisionSignal =
      normalized.correction_or_revision === true ||
      ["continue", "revise"].includes(text(normalized.goal_relation, 40).toLowerCase());
    const explicitMutationLanguage =
      /\b(?:create|correct|change|fix|replace|revise|update|mark|post|pay|move|shift|undo|apply|issue|send)\b/i.test(message);
    const durableBusinessRevision =
      Object.keys(durableActionAnchor).length > 0 &&
      normalized.clarification_required !== true &&
      normalized.route !== "evidence" &&
      (
        Boolean(registeredRevision) ||
        (
          explicitMutationLanguage &&
          (semanticRevisionSignal || priorContextReference || immediateContextReference)
        )
      ) &&
      normalized.requires_mutation !== true &&
      normalized.artifact_intent !== "reuse_existing";

    if (durableBusinessRevision) {
      normalized = {
        ...normalized,
        route: "governed",
        evidence_scope: "internal",
        reasoning_depth: "fast",
        conversation_mode: "light",
        context_depth: "expanded",
        continuity_required: true,
        correction_or_revision: true,
        execution_domain: "business",
        engineering_scope: null,
        engineering_mode: null,
        engineering_deliverable: null,
        action_shape: "single",
        goal_relation: "revise",
        requires_mutation: true,
        needs_current_evidence: true,
      };
    }

    const activeIntent = text(semanticContext?.project?.last_intent, 300).toLowerCase();
    const compactFollowUp = message.length <= 220 && /^(?:and|so|then|what|which|why|how|would|should|can|could|do|does|is|are)\b/i.test(message);
    const activeProductInspection = activeIntent.startsWith("product_engineering.inspect");
    if (activeProductInspection && compactFollowUp && ["new", "unknown"].includes(normalized.goal_relation)) {
      normalized = {
        ...normalized,
        route: normalized.route === "governed" ? normalized.route : "evidence",
        evidence_scope: normalized.evidence_scope === "external" || normalized.evidence_scope === "both" ? normalized.evidence_scope : "internal",
        execution_domain: "product_engineering",
        engineering_mode: "inspect",
        engineering_deliverable: "conversation",
        continuity_required: true,
        context_depth: "expanded",
        goal_relation: "continue",
        requires_mutation: false,
        needs_current_evidence: true,
      };
    }

    if (
      recent.length === 0 &&
      !priorContextReference &&
      normalized.route === "conversation" &&
      normalized.requires_mutation !== true &&
      text(normalized.artifact_intent, 40).toLowerCase() !== "reuse_existing"
    ) {
      normalized = {
        ...normalized,
        continuity_required: false,
        correction_or_revision: false,
        context_depth: "compact",
        goal_relation: "new",
      };
    }

    const needsDeliverableArbiter =
      normalized.execution_domain === "product_engineering" &&
      normalized.engineering_mode === "inspect" &&
      normalized.engineering_deliverable === "inspection_report";

    if (!needsDeliverableArbiter) return normalized;

    const arbiter = await runOperatorFrontCognition({
      organization_id: organizationId,
      party_id: text(options.partyId, 160) || null,
      entity_id: text(options.entityId, 160) || null,
      system: [
        "Act as a semantic deliverable arbiter for a human business conversation.",
        "Decide what the human primarily wants returned, not what work may be necessary internally to answer well.",
        "Choose technical_report only when the inspection/audit itself is the requested final deliverable.",
        "Choose conversation when inspection is merely supporting work for advice, comparison, recommendations, prioritization, strategy, judgment, or discussion.",
        "Do not use literal words or phrases as rules. Infer the requested outcome from the whole message, recent conversation, and working context.",
        "Return JSON only with deliverable_intent as technical_report or conversation, plus a short rationale."
      ].join("\n"),
      messages: [{
        role: "user",
        content: JSON.stringify({
          message,
          recent,
          context: semanticContext,
          initial_understanding: normalized,
        }),
      }],
      tools: [],
      authorization: { allow_mutating_tools: false },
      metadata: { module: "OPERATOR", operation: "HUMAN_BUSINESS_PARTNER_DELIVERABLE_ARBITER", raw_reasoning_persisted: false },
      expect_json: true,
      temperature: 0.02,
      response_format: { type: "json_object" },
      max_output_tokens: 120,
      max_turns: 1,
      max_tool_calls: 0,
      allow_fast_escalation: false,
    });

    let deliverableIntent = null;
    try {
      const parsedArbiter = JSON.parse(text(arbiter?.text, 2000));
      deliverableIntent = text(parsedArbiter?.deliverable_intent, 40).toLowerCase();
    } catch {
      deliverableIntent = null;
    }

    if (deliverableIntent === "conversation") {
      return {
        ...normalized,
        route: normalized.needs_current_evidence ? "evidence" : "conversation",
        engineering_deliverable: "conversation",
      };
    }

    return normalized;
  } catch {
    return null;
  }
}

export default understandHumanBusinessPartnerTurn;

import {
  runOperatorTurn as runOperatorTurnCore,
} from "./OperatorTurnRuntimeCore";
import {
  listOperatorCapabilities,
} from "./OperatorCapabilityCatalog";
import {
  rankOperatorCapabilities,
} from "./OperatorCapabilityMatcher";
import {
  runFastConversationTurn,
} from "./OperatorFastConversationRuntime";
import {
  agreementWithOperatorRecommendation,
  clearOperatorRecommendation,
  operatorRecommendationFromAgreementState,
  operatorRecommendationMatchesPendingExecution,
} from "@/lib/operator/contracts/OperatorRecommendationState";
import {
  agreementWithAutonomousRun,
  createOperatorMissionRun,
} from "@/lib/operator/contracts/OperatorAutonomousRun";
import {
  classifyPendingOperatorReply,
} from "./OperatorHumanDecisionClassifier";
import {
  RECOMMENDATION_ALTERNATIVE_PATTERN,
  createRecommendationRefinementProposal,
} from "./OperatorRecommendationRefinement";

const OPERATOR_MISSION_KEY = "platform.operator_mission.execute";
const PRODUCT_ENGINEERING_CYCLE_KEY =
  "platform.product_engineering_cycle.execute";
const PRODUCT_PERSISTENCE_HANDOFF_KEY =
  "platform.product_persistence_handoff.execute";
const FULL_ACCESS_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);
const INTERNAL_CAPABILITY_KEYS = new Set([
  "platform.operator_read_chain.execute",
  OPERATOR_MISSION_KEY,
  "platform.organizational_context.read",
]);
const CONTEXT_FIELDS = new Set([
  "organizationid",
  "organization_id",
  "entityid",
  "entity_id",
  "periodid",
  "period_id",
  "partyid",
  "party_id",
]);

const PROJECT_STATUS_PATTERN = /^(where are we|where are we now|where did we stop|remind me where we are|remind me where we stopped|what did we decide|what have we decided|what was the decision|what did i decide|what did we agree|remind me what we decided|what are we doing|what are we working on|what(?:'s| is) the plan|remind me of the plan|what have we done|what did we do|what did we finish|what have we finished|what was the last step|what remains|what(?:'s| is) left|what still needs to be done|what(?:'s| is) still missing|what are the open questions|what are we waiting for|what(?:'s| is) blocking us|what is blocking us)\s*[?.!]*$/i;
const RECOMMENDATION_STATUS_PATTERN = /^(what did you recommend|what have you recommended|what was your recommendation|what(?:'s| is) your recommendation|remind me what you recommended|what did you suggest|what was your suggestion|remind me what you suggested|what are you suggesting|what exactly are you recommending|what exactly will you do|vad rekommenderade du|vad var din rekommendation|påminn mig vad du rekommenderade|was hast du empfohlen|was war deine empfehlung|erinnere mich an deine empfehlung|qu(?:'|’)est[- ]ce que tu as recommandé|quelle était ta recommandation|rappelle[- ]moi ce que tu as recommandé|¿?qué recomendaste|¿?cuál fue tu recomendación|recuérdame qué recomendaste|คุณแนะนำอะไร|คำแนะนำของคุณคืออะไร)\s*[?.!]*$/i;
const STRATEGIC_RECOMMENDATION_PATTERN = /\b(what should (?:we|i) do|what do you (?:suggest|recommend|think)|what would you (?:do|choose|focus on)|what(?:'s| is) your (?:suggestion|recommendation|advice|view)|how should (?:we|i) proceed|which option is best|what(?:'s| is) the best (?:move|option)|what are the tradeoffs|is this a good idea|challenge this|what next|next step|what needs (?:my )?attention|what should i focus on|business priorities|biggest risks|biggest opportunities|management brief|executive brief|analy[sz]e (?:the|this) (?:business|company|organization)|review (?:the|this) (?:business|company|organization))\b/i;
const CONTEXTUAL_RECOMMENDATION_PATTERN = /^(why|why not|how so|tell me more|explain that|what do you mean|what does that mean|what are the tradeoffs|what about(?:\s+.+)?|is that a good idea|is this a good idea|and then|then what|varför|varför inte|hur så|vad menar du|vad betyder det|kan du förklara det|förklara det|berätta mer|vad tycker du om det|vilka är avvägningarna|vilka är riskerna|är det säkert|tack|jag förstår|förstår|warum|warum nicht|wieso|was meinst du|was bedeutet das|kannst du das erklären|erklär das|erzähl mir mehr|was denkst du darüber|welche kompromisse gibt es|welche risiken gibt es|ist das sicher|danke|verstanden|ich verstehe|pourquoi|pourquoi pas|tu veux dire quoi|ça veut dire quoi|peux[- ]tu expliquer|explique ça|dis[- ]m'en plus|qu(?:'|’)en penses[- ]tu|quels sont les risques|est[- ]ce sûr|merci|compris|je comprends|¿?por qué|¿?por qué no|¿?cómo así|¿?qué quieres decir|¿?qué significa eso|¿?puedes explicar eso|explica eso|cuéntame más|¿?qué piensas de eso|¿?cuáles son los riesgos|¿?es seguro|gracias|entendido|entiendo|ทำไม|หมายความว่าอะไร|หมายความว่าอย่างไร|อธิบายได้ไหม|อธิบายหน่อย|เล่าเพิ่มหน่อย|คุณคิดอย่างไร|มีความเสี่ยงอะไรบ้าง|ปลอดภัยไหม|ขอบคุณ|เข้าใจแล้ว|เข้าใจ)\s*[?.!]*$/i;

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function mode(value) {
  return text(value).toLowerCase();
}

function normalizePermission(value) {
  return text(value).toLowerCase();
}

function permissionMatches(granted, required) {
  const actual = normalizePermission(granted);
  const needed = normalizePermission(required);
  if (!actual || !needed) return false;
  if (actual === "*" || actual === needed) return true;
  if (actual.endsWith(".*")) return needed.startsWith(actual.slice(0, -1));
  return false;
}

function canUseCapability(capability, permissions = [], role = null) {
  if (FULL_ACCESS_ROLES.has(text(role).toUpperCase())) return true;
  const required = list(capability?.permissions).map(text).filter(Boolean);
  if (!required.length) return mode(capability?.mode) === "read";
  return required.every((permission) =>
    list(permissions).some((granted) => permissionMatches(granted, permission)),
  );
}

function hasPendingExecution(agreementState) {
  return Boolean(text(agreementState?.pending_execution?.capability_key));
}

function pendingReplyClass(message, agreementState, recommendation) {
  const pending = hasPendingExecution(agreementState);
  const exactRecommendationBinding = Boolean(
    recommendation &&
      operatorRecommendationMatchesPendingExecution(
        agreementState,
        recommendation,
      ),
  );

  if (recommendation && !exactRecommendationBinding) {
    const recommendationShorthand = classifyPendingOperatorReply({
      message,
      pending: true,
      recommendation: true,
    });
    if (recommendationShorthand) return "recommendation_binding_mismatch";
  }

  return classifyPendingOperatorReply({
    message,
    pending,
    recommendation: exactRecommendationBinding,
  });
}

function normalizedPendingMessage(message, replyClass) {
  if (replyClass === "execute") return "do it";
  if (replyClass === "reject") return "cancel";
  if (replyClass === "resume") return "continue";
  return message;
}

function isProjectStatusTurn(message) {
  return PROJECT_STATUS_PATTERN.test(text(message));
}

function isRecommendationStatusTurn(message) {
  return RECOMMENDATION_STATUS_PATTERN.test(text(message));
}

function recommendationStatusTurn(options, recommendation) {
  const description = text(recommendation?.description);
  const reason = text(recommendation?.reason);
  const exactBinding = Boolean(
    recommendation &&
      operatorRecommendationMatchesPendingExecution(
        options.agreementState,
        recommendation,
      ),
  );
  const responseText = description
    ? exactBinding
      ? reason
        ? `I recommended ${description}. The reason is ${reason}.`
        : `I recommended ${description}.`
      : reason
        ? `My last recommendation was ${description}. The reason is ${reason}. It is currently paused and is not bound to a pending execution, so shorthand like “do it” will not run it.`
        : `My last recommendation was ${description}. It is currently paused and is not bound to a pending execution, so shorthand like “do it” will not run it.`
    : "I do not have an active recommendation waiting for your decision.";

  return {
    success: true,
    decision: {
      response_text: responseText,
      response_language: text(options.locale) || null,
      intent: "answer",
      confidence: 1,
      agreement_state: object(options.agreementState),
      project_state: object(options.projectState),
      clarification: { required: false, question: null, options: [] },
      navigation: { target_id: null },
      execution: { capability_key: null, payload: {}, reason: null },
      plan: [],
    },
    agreement_state: object(options.agreementState),
    current_screen: null,
    provider_evidence: {
      provider: "avantiqo-local",
      model: "recommendation-status-local-v1",
      usage_id: null,
    },
    navigation: null,
    execution: null,
    operator_catalog: {
      navigation_target_count: 0,
      executable_capability_count: 0,
      instant_response: true,
      recommendation_status: true,
      recommendation_exactly_bound: exactBinding,
    },
  };
}

function recommendationBindingMismatchTurn(options, recommendation) {
  const pending = object(options.agreementState?.pending_execution);
  const recommendationCapability = text(recommendation?.capability_key);
  const pendingCapability = text(pending.capability_key);
  const hasDifferentPending = Boolean(
    pendingCapability && pendingCapability !== recommendationCapability,
  );
  const responseText = hasDifferentPending
    ? "I won’t act on that shorthand because the stored recommendation no longer matches the exact pending action. I preserved both states unchanged so I do not execute, resume, or cancel a different action accidentally. Ask what I recommended or what is pending, or restate the action you want."
    : "I won’t act on that shorthand because the stored recommendation is no longer bound to its exact pending execution state. I preserved the state unchanged so nothing different runs accidentally. Ask what I recommended or restate the action you want.";

  return {
    success: true,
    decision: {
      response_text: responseText,
      response_language: text(options.locale) || null,
      intent: "clarify",
      confidence: 1,
      agreement_state: object(options.agreementState),
      project_state: object(options.projectState),
      clarification: {
        required: true,
        question: "Which exact action do you want me to use?",
        options: [],
      },
      navigation: { target_id: null },
      execution: { capability_key: null, payload: {}, reason: null },
      plan: [],
    },
    agreement_state: object(options.agreementState),
    current_screen: null,
    provider_evidence: {
      provider: "avantiqo-local",
      model: "recommendation-binding-guard-v1",
      usage_id: null,
    },
    navigation: null,
    execution: {
      status: "blocked",
      reason: "RECOMMENDATION_PENDING_EXECUTION_MISMATCH",
      capability_key: null,
    },
    operator_catalog: {
      navigation_target_count: 0,
      executable_capability_count: 0,
      recommendation_binding_mismatch: true,
      execution_authorized: false,
      state_preserved: true,
    },
  };
}

function recommendationDiscussionKind(message) {
  const clean = text(message);
  if (!clean) return null;
  if (RECOMMENDATION_ALTERNATIVE_PATTERN.test(clean)) return "alternative";
  if (CONTEXTUAL_RECOMMENDATION_PATTERN.test(clean)) return "discussion";
  return null;
}

function recommendationConversationContext(recommendation) {
  const description = text(recommendation?.description).slice(0, 700);
  const focus = text(recommendation?.payload?.focus).slice(0, 1200);
  const reason = text(recommendation?.reason).slice(0, 700);
  return [
    description ? `My current recommendation is ${description}.` : null,
    focus ? `The current focus is ${focus}.` : null,
    reason ? `The reason is ${reason}.` : null,
  ].filter(Boolean).join(" ");
}

function agreementWithRecommendationDisarmed(
  agreementState,
  recommendation,
  refinementProposal = null,
) {
  const cleared = clearOperatorRecommendation(agreementState);
  return {
    ...cleared,
    recommended_action: {
      ...object(recommendation),
    },
    ...(refinementProposal
      ? { recommendation_refinement_proposal: refinementProposal }
      : {}),
  };
}

async function recommendationDiscussionTurn(options, recommendation, kind) {
  const alternative = kind === "alternative";
  const refinementProposal = alternative
    ? createRecommendationRefinementProposal({
        message: options.message,
        recommendation,
      })
    : null;
  const contextMessage = recommendationConversationContext(recommendation);
  const recentConversation = contextMessage
    ? [
        ...list(options.conversation),
        { role: "assistant", content: contextMessage },
      ]
    : list(options.conversation);
  const result = await runFastConversationTurn({
    ...options,
    conversation: recentConversation,
  });
  const nextAgreementState = alternative
    ? agreementWithRecommendationDisarmed(
        options.agreementState,
        recommendation,
        refinementProposal,
      )
    : object(options.agreementState);
  const baseText = text(result?.decision?.response_text);
  const responseText = alternative
    ? `${baseText} I’m treating that as a refinement proposal, so the previous recommendation is paused while we compare them. The proposal has no execution authority. Nothing will run until we settle the exact direction and make a later explicit decision.`.trim()
    : baseText;

  return {
    ...result,
    agreement_state: nextAgreementState,
    execution: null,
    decision: {
      ...object(result?.decision),
      response_text: responseText.slice(0, 1000),
      intent: "plan",
      agreement_state: nextAgreementState,
      project_state: object(options.projectState),
      execution: { capability_key: null, payload: {}, reason: null },
      plan: [],
    },
    operator_catalog: {
      ...object(result?.operator_catalog),
      recommendation_discussion: true,
      recommendation_alternative: alternative,
      recommendation_refinement_proposal: Boolean(refinementProposal),
      refinement_authorization_effect:
        refinementProposal?.authorization_effect || null,
      execution_authorized: false,
      previous_recommendation_pending_execution: alternative
        ? "DISARMED"
        : "PRESERVED",
    },
  };
}

function requiredFields(capability) {
  const required = capability?.input_schema?.required;
  return Array.isArray(required) ? required.map(text).filter(Boolean) : [];
}

function payloadSatisfiesRequiredFields(capability, payload, context) {
  const values = object(payload);
  for (const field of requiredFields(capability)) {
    const normalizedField = field.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(values, field)) continue;
    if (!CONTEXT_FIELDS.has(normalizedField)) return false;
    if (normalizedField.includes("organization") && !text(context.organizationId)) return false;
    if (normalizedField.includes("entity") && !text(context.entityId)) return false;
    if (normalizedField.includes("period") && !text(context.periodId)) return false;
    if (normalizedField.includes("party") && !text(context.partyId)) return false;
  }
  return true;
}

function recommendationEligible(capability, context) {
  const key = text(capability?.key);
  if (!key || INTERNAL_CAPABILITY_KEYS.has(key)) return false;
  if (["read", "navigate"].includes(mode(capability?.mode))) return false;
  if (capability?.operator_enabled === false) return false;
  if (!canUseCapability(capability, context.permissions, context.role)) return false;
  if (mode(capability?.context_scope) === "entity" && !text(context.entityId)) {
    return false;
  }
  return capability?.auto_execute === true || capability?.requires_confirmation === true;
}

function capabilityByKey(capabilities, key) {
  const target = text(key);
  if (!target) return null;
  return list(capabilities).find((item) => text(item?.key) === target) || null;
}

function planCandidate(result, capabilities) {
  for (const step of list(result?.decision?.plan)) {
    const capability = capabilityByKey(capabilities, step?.capability_key);
    if (capability) {
      return {
        capability,
        payload: {},
        reason: text(step?.description),
      };
    }
  }

  if (mode(result?.decision?.intent) !== "execute") {
    const execution = object(result?.decision?.execution);
    const capability = capabilityByKey(capabilities, execution.capability_key);
    if (capability) {
      return {
        capability,
        payload: object(execution.payload),
        reason: text(execution.reason),
      };
    }
  }

  return null;
}

function attentionResultBody(result) {
  const executionResult = object(result?.execution?.result);
  if (Array.isArray(executionResult.items)) return executionResult;
  const nested = object(executionResult.result);
  return Array.isArray(nested.items) ? nested : null;
}

function attentionCandidate(result, capabilities) {
  const body = attentionResultBody(result);
  if (!body) return null;
  for (const item of list(body.items)) {
    const recommended = object(item?.recommended_action);
    const capability = capabilityByKey(capabilities, recommended.capability_key);
    if (!capability) continue;
    return {
      capability,
      payload: {},
      reason:
        text(item?.recommended_next_step) ||
        text(item?.why_now) ||
        text(recommended.description),
    };
  }
  return null;
}

function rankedCandidate(options, result, capabilities) {
  const rankingText = [
    text(options.message),
    text(result?.decision?.response_text),
    text(result?.decision?.project_state?.next_step),
    text(result?.decision?.project_state?.progress_summary),
  ].filter(Boolean).join(" ").slice(0, 5000);

  const ranked = rankOperatorCapabilities({
    message: rankingText,
    capabilities: list(capabilities).filter((capability) =>
      recommendationEligible(capability, options),
    ),
    modes: ["draft", "write", "approve"],
    limit: 3,
  });
  const top = ranked[0];
  if (!top?.capability) return null;
  const second = ranked[1] || null;
  const separation = second
    ? Number(top.score || 0) - Number(second.score || 0)
    : Number(top.score || 0);
  const strong =
    Number(top.phrase_affinity || 0) >= 0.78 ||
    (Number(top.score || 0) >= 0.42 && separation >= 0.12) ||
    (Number(top.primary_coverage || 0) >= 0.58 && separation >= 0.09);
  if (!strong) return null;

  return {
    capability: top.capability,
    payload: {},
    reason:
      text(result?.decision?.project_state?.next_step) ||
      text(result?.decision?.response_text),
  };
}

function validatedRecommendation(candidate, options, result) {
  const capability = candidate?.capability;
  const payload = object(candidate?.payload);
  if (!recommendationEligible(capability, options)) return null;
  if (!payloadSatisfiesRequiredFields(capability, payload, options)) return null;

  return {
    capability_key: capability.key,
    description:
      text(candidate?.reason) ||
      text(capability.description) ||
      text(capability.name) ||
      "Recommended business action",
    payload,
    reason:
      text(candidate?.reason) ||
      text(capability.description) ||
      null,
    original_message: text(options.message).slice(0, 4000) || null,
    objective:
      text(candidate?.objective) ||
      text(result?.decision?.project_state?.objective) ||
      text(options.projectState?.objective) ||
      null,
    source: attentionResultBody(result)
      ? "verified_evidence_recommendation"
      : text(candidate?.source) || "operator_reasoning_recommendation",
  };
}

function continuationCapabilityResult(value) {
  const direct = object(value);
  const nested = object(direct.result);
  return Object.keys(nested).length ? nested : direct;
}

function boundedContinuationHandoff(value) {
  const continuation = continuationCapabilityResult(value);
  const status = text(continuation.status);
  const staleBaseReplan = status === "STALE_BASE_REPLAN_READY";
  if (status !== "READY_FOR_ONE_NEXT_BOUNDED_CYCLE" && !staleBaseReplan) {
    return null;
  }
  const governance = object(continuation.governance);
  if (
    staleBaseReplan &&
    (continuation.stale_base_replan_required !== true ||
      continuation.stale_persistence_rejected !== true ||
      continuation.stale_patch_reused !== false ||
      continuation.bounded_next_cycle_count !== 1 ||
      governance.current_main_reassessment_count !== 1 ||
      governance.current_main_reassessment_read_only !== true ||
      governance.fresh_next_engineering_handoff_count !== 1 ||
      governance.next_engineering_cycle_started !== false ||
      governance.automatic_execution_started !== false ||
      governance.automatic_recursion_allowed !== false)
  ) {
    return null;
  }
  const handoff = object(continuation.next_engineering_handoff);
  if (text(handoff.capability_key) !== PRODUCT_ENGINEERING_CYCLE_KEY) return null;
  const focus = text(handoff.focus).slice(0, 2000);
  if (
    !focus ||
    handoff.automatic_execution_started !== false ||
    text(handoff.authorization_effect).toUpperCase() !== "NONE"
  ) {
    return null;
  }
  return { focus, stale_base_replan: staleBaseReplan };
}

function postCommitContinuationHandoff(result) {
  const capabilityKey = text(result?.execution?.capability?.key);
  const executionResult = object(result?.execution?.result);

  if (capabilityKey === PRODUCT_PERSISTENCE_HANDOFF_KEY) {
    const direct = boundedContinuationHandoff(executionResult);
    if (direct) {
      return {
        ...direct,
        source: direct.stale_base_replan
          ? "stale_base_current_main_reassessment"
          : "verified_persistence_handoff",
      };
    }
  }

  if (capabilityKey === PRODUCT_ENGINEERING_CYCLE_KEY) {
    const nestedHandoff = object(executionResult.persistence_handoff);
    const direct = boundedContinuationHandoff(nestedHandoff);
    if (direct) {
      return {
        ...direct,
        source: direct.stale_base_replan
          ? "stale_base_current_main_reassessment"
          : "verified_persistence_handoff",
      };
    }
  }

  if (capabilityKey !== OPERATOR_MISSION_KEY) return null;
  const mission = executionResult;
  if (text(mission.status).toLowerCase() !== "completed") return null;
  const continuationStep = list(mission.steps).find(
    (step) =>
      text(step?.id) === "reassess_verified_main" &&
      text(step?.status).toLowerCase() === "completed",
  );
  const direct = boundedContinuationHandoff(continuationStep?.result);
  return direct
    ? { ...direct, source: "verified_post_commit_product_reassessment" }
    : null;
}

function decisionText(recommendation, outcome = "accept") {
  const description = text(recommendation?.description) || "the recommended action";
  return outcome === "reject"
    ? `Do not proceed with ${description}`.slice(0, 500)
    : `Proceed with ${description}`.slice(0, 500);
}

function projectStateWithRecommendationDecision(
  result,
  options,
  recommendation,
  outcome = "accept",
) {
  const resultState = object(result?.decision?.project_state);
  const previousState = object(options.projectState);
  const existing = list(
    resultState.decisions?.length ? resultState.decisions : previousState.decisions,
  )
    .map((item) => text(item).slice(0, 500))
    .filter(Boolean);
  const decision = decisionText(recommendation, outcome);
  const duplicate = existing.some(
    (item) => item.toLowerCase() === decision.toLowerCase(),
  );

  return {
    ...previousState,
    ...resultState,
    decisions: duplicate
      ? existing.slice(-10)
      : [...existing.slice(-9), decision],
  };
}

function recommendationAgreementTurn(options, recommendation) {
  const nextAgreementState = agreementWithOperatorRecommendation(
    options.agreementState,
    recommendation,
    {
      objective:
        text(options.projectState?.objective) ||
        text(recommendation?.objective) ||
        text(recommendation?.description),
    },
  );
  const nextProjectState = projectStateWithRecommendationDecision(
    { decision: { project_state: options.projectState } },
    options,
    recommendation,
    "accept",
  );

  return {
    success: true,
    decision: {
      response_text:
        "Agreed. I’ll keep that as our selected direction. Say “do it” when you want me to execute it.",
      response_language: text(options.locale) || null,
      intent: "plan",
      confidence: 1,
      agreement_state: nextAgreementState,
      project_state: nextProjectState,
      clarification: { required: false, question: null, options: [] },
      navigation: { target_id: null },
      execution: { capability_key: null, payload: {}, reason: null },
      plan: [],
    },
    agreement_state: nextAgreementState,
    current_screen: null,
    provider_evidence: {
      provider: "avantiqo-local",
      model: "recommendation-agreement-local-v1",
      usage_id: null,
    },
    navigation: null,
    execution: null,
    operator_catalog: {
      navigation_target_count: 0,
      executable_capability_count: 0,
      recommendation_agreed: true,
      execution_authorized: false,
    },
  };
}

function shouldClearRecommendationAfterResult(result) {
  const executionStatus = text(result?.execution?.status).toLowerCase();
  if (["completed", "cancelled"].includes(executionStatus)) return true;
  if (executionStatus !== "blocked") return false;

  const reason = text(result?.execution?.reason).toUpperCase();
  return [
    "CAPABILITY_NOT_AVAILABLE",
    "APPROVAL_REJECTED",
    "APPROVAL_REQUEST_NOT_FOUND",
    "APPROVAL_REQUEST_MISMATCH",
  ].includes(reason);
}

function canOfferRecommendation(result) {
  const intent = mode(result?.decision?.intent);
  if (["navigate", "clarify"].includes(intent)) return false;
  if (intent !== "execute") return true;
  return mode(result?.execution?.capability?.mode) === "read";
}

function appendExecutionOffer(responseText) {
  const clean = text(responseText);
  if (!clean) return 'I have an exact registered next action ready. Say “do it” if you want me to execute it.';
  if (/say [“"]?do it[”"]?|want me to execute|i can execute|i can take that next step/i.test(clean)) {
    return clean;
  }
  return `${clean} If you want me to execute that exact action, say “do it”.`;
}

function postCommitContinuationText(recommendation) {
  const focus = text(recommendation?.payload?.focus).slice(0, 2000);
  if (text(recommendation?.source) === "stale_base_current_main_reassessment") {
    return focus
      ? `The previous engineering result became stale because main moved. I rejected that stale persistence attempt, performed one read-only reassessment of actual current main, and Product Intelligence selected the fresh objective: ${focus} No engineering started automatically. Say “next”, “continue”, or “do it” when you want me to run that next engineering cycle.`
      : "The previous engineering result became stale because main moved. I rejected that stale persistence attempt and performed one read-only reassessment of actual current main. Product Intelligence selected one fresh bounded engineering objective, and no engineering started automatically. Say “next”, “continue”, or “do it” when you want me to run it.";
  }
  return focus
    ? `Verified persistence is complete. Product Intelligence reassessed actual current main and selected the next bounded objective: ${focus} Say “next”, “continue”, or “do it” when you want me to run that next engineering cycle.`
    : "Verified persistence is complete. Product Intelligence selected one next bounded engineering cycle from actual current main. Say “next”, “continue”, or “do it” when you want me to run it.";
}

function responseAgreementState(result, fallback) {
  const direct = object(result?.agreement_state);
  if (Object.keys(direct).length) return direct;
  const decision = object(result?.decision?.agreement_state);
  return Object.keys(decision).length ? decision : object(fallback);
}

function embeddedPersistenceMission(result) {
  const capabilityKey = text(result?.execution?.capability?.key);
  const executionResult = object(result?.execution?.result);
  const handoff = capabilityKey === PRODUCT_PERSISTENCE_HANDOFF_KEY
    ? executionResult
    : capabilityKey === PRODUCT_ENGINEERING_CYCLE_KEY
      ? object(executionResult.persistence_handoff)
      : {};
  if (!Object.keys(handoff).length) return null;

  const mission = object(handoff.mission);
  if (
    text(mission.mission_mode) !== "durable_registered_sequence" ||
    text(mission.status) !== "paused" ||
    !mission.mission_state ||
    !mission.resume_payload
  ) {
    return null;
  }
  return { handoff, mission };
}

function promoteEmbeddedPersistenceMission(result, options) {
  const embedded = embeddedPersistenceMission(result);
  if (!embedded) return result;

  const { mission } = embedded;
  const objective =
    text(result?.decision?.project_state?.objective) ||
    text(options.projectState?.objective) ||
    text(options.message) ||
    "Persist the verified Avantiqo engineering result";
  const run = createOperatorMissionRun({
    objective,
    missionState: object(mission.mission_state),
  });
  const baseAgreement = clearOperatorRecommendation(
    responseAgreementState(result, options.agreementState),
  );
  const agreementWithRun = agreementWithAutonomousRun(baseAgreement, run);
  const nextAgreementState = {
    ...agreementWithRun,
    pending_execution: {
      capability_key: OPERATOR_MISSION_KEY,
      payload: object(mission.resume_payload),
      reason:
        text(mission.reason) ||
        `Resume persistence mission from ${text(mission.current_step_id) || "the stored step"}`,
      original_message: text(options.message).slice(0, 4000) || null,
      resume_kind: "mission",
    },
  };
  const currentStep = list(run.planned_steps).find(
    (step) => text(step?.id) === text(run.current_step_id),
  );
  const currentDescription =
    text(currentStep?.description) || "commit the verified engineering result to main";
  const confirmation = mission.pause_reason === "confirmation";

  return {
    ...result,
    agreement_state: nextAgreementState,
    execution: {
      ...object(result.execution),
      status: "paused",
      embedded_mission_promoted: true,
      embedded_mission_capability_key: OPERATOR_MISSION_KEY,
    },
    decision: {
      ...object(result.decision),
      response_text: confirmation
        ? `The verified engineering result is ready for persistence. The exact next step is ${currentDescription}, and it requires your confirmation. Should I proceed?`
        : `The verified persistence mission is paused at ${currentDescription}. I preserved the exact remaining mission state.`,
      intent: confirmation ? "plan" : "answer",
      agreement_state: nextAgreementState,
      clarification: confirmation
        ? {
            required: true,
            question: "Should I proceed with that exact commit step?",
            options: [
              { id: "confirm", label: "Yes, proceed" },
              { id: "cancel", label: "No, keep it local" },
            ],
          }
        : { required: false, question: null, options: [] },
      execution: {
        capability_key: OPERATOR_MISSION_KEY,
        payload: object(mission.resume_payload),
        reason: text(mission.reason) || null,
      },
      plan: list(run.planned_steps),
    },
  };
}

async function safeRecommendationCapabilities(options) {
  const allCapabilities = await listOperatorCapabilities();
  return allCapabilities.filter((capability) =>
    recommendationEligible(capability, options),
  );
}

export async function runOperatorTurn(options = {}) {
  const recommendation = operatorRecommendationFromAgreementState(
    options.agreementState,
  );

  if (isProjectStatusTurn(options.message)) {
    return runFastConversationTurn(options);
  }
  if (isRecommendationStatusTurn(options.message)) {
    return recommendationStatusTurn(options, recommendation);
  }

  const replyClass = pendingReplyClass(
    options.message,
    options.agreementState,
    recommendation,
  );
  if (recommendation && replyClass === "recommendation_binding_mismatch") {
    return recommendationBindingMismatchTurn(options, recommendation);
  }
  if (recommendation && replyClass === "agree") {
    return recommendationAgreementTurn(options, recommendation);
  }

  const discussionKind = recommendation && !replyClass
    ? recommendationDiscussionKind(options.message)
    : null;
  if (recommendation && discussionKind) {
    return recommendationDiscussionTurn(
      options,
      recommendation,
      discussionKind,
    );
  }

  const acceptedRecommendation = Boolean(
    recommendation && replyClass === "execute",
  );
  const rejectedRecommendation = Boolean(
    recommendation && replyClass === "reject",
  );

  const coreResult = await runOperatorTurnCore({
    ...options,
    message: normalizedPendingMessage(options.message, replyClass),
  });
  const result = promoteEmbeddedPersistenceMission(coreResult, options);

  let nextAgreementState = responseAgreementState(result, options.agreementState);

  if (recommendation) {
    if (rejectedRecommendation || shouldClearRecommendationAfterResult(result)) {
      nextAgreementState = clearOperatorRecommendation(nextAgreementState);
    } else if (
      !acceptedRecommendation &&
      CONTEXTUAL_RECOMMENDATION_PATTERN.test(text(options.message))
    ) {
      nextAgreementState = agreementWithOperatorRecommendation(
        nextAgreementState,
        recommendation,
        {
          objective:
            text(result?.decision?.project_state?.objective) ||
            text(options.projectState?.objective) ||
            text(recommendation.objective),
        },
      );
    } else if (!acceptedRecommendation) {
      nextAgreementState = clearOperatorRecommendation(nextAgreementState);
    }
  }

  let persistedRecommendation = null;
  let postCommitRecommendation = false;
  let safeCapabilities = null;
  const postCommitHandoff = postCommitContinuationHandoff(result);
  if (postCommitHandoff) {
    safeCapabilities = await safeRecommendationCapabilities(options);
    const capability = capabilityByKey(
      safeCapabilities,
      PRODUCT_ENGINEERING_CYCLE_KEY,
    );
    const nextRecommendation = capability
      ? validatedRecommendation(
          {
            capability,
            payload: { focus: postCommitHandoff.focus },
            reason: postCommitHandoff.stale_base_replan
              ? `Product Intelligence rejected the stale engineering state and reassessed actual current main read-only before selecting the fresh bounded objective: ${postCommitHandoff.focus}`.slice(0, 800)
              : `Product Intelligence reassessed verified current main and selected the next bounded objective: ${postCommitHandoff.focus}`.slice(0, 800),
            objective: postCommitHandoff.focus,
            source: postCommitHandoff.source || "verified_post_commit_product_reassessment",
          },
          options,
          result,
        )
      : null;
    if (nextRecommendation) {
      persistedRecommendation = nextRecommendation;
      postCommitRecommendation = true;
      nextAgreementState = agreementWithOperatorRecommendation(
        nextAgreementState,
        nextRecommendation,
        {
          objective: postCommitHandoff.focus,
        },
      );
    }
  }

  if (
    !persistedRecommendation &&
    !acceptedRecommendation &&
    !rejectedRecommendation &&
    STRATEGIC_RECOMMENDATION_PATTERN.test(text(options.message)) &&
    canOfferRecommendation(result)
  ) {
    safeCapabilities ||= await safeRecommendationCapabilities(options);
    const candidate =
      attentionCandidate(result, safeCapabilities) ||
      planCandidate(result, safeCapabilities) ||
      rankedCandidate(options, result, safeCapabilities);
    const nextRecommendation = validatedRecommendation(candidate, options, result);
    if (nextRecommendation) {
      persistedRecommendation = nextRecommendation;
      nextAgreementState = agreementWithOperatorRecommendation(
        nextAgreementState,
        nextRecommendation,
        {
          objective:
            text(result?.decision?.project_state?.objective) ||
            text(options.projectState?.objective) ||
            text(nextRecommendation.description),
          evidenceSteps: list(attentionResultBody(result)?.evidence?.steps),
        },
      );
    }
  }

  const nextProjectState = acceptedRecommendation
    ? projectStateWithRecommendationDecision(result, options, recommendation, "accept")
    : rejectedRecommendation
      ? projectStateWithRecommendationDecision(result, options, recommendation, "reject")
      : object(result?.decision?.project_state);

  const baseDecision = object(result?.decision);
  return {
    ...result,
    agreement_state: nextAgreementState,
    decision: {
      ...baseDecision,
      ...(persistedRecommendation
        ? {
            response_text: postCommitRecommendation
              ? postCommitContinuationText(persistedRecommendation)
              : appendExecutionOffer(baseDecision.response_text),
            intent: "plan",
          }
        : {}),
      agreement_state: nextAgreementState,
      project_state: nextProjectState,
    },
  };
}

import { runOperatorFrontCognition } from "./OperatorFrontCognitionRuntime.js";
import { createOperatorIntelligenceReadTools } from "./OperatorIntelligenceToolBridgeRuntime.js";
import { listOperatorFastActions } from "./OperatorFastActionIndex.js";
import { listOperatorFastReads } from "./OperatorFastReadIndex.js";
import { publishBusinessPartnerProgress } from "./BusinessPartnerLiveProgressRuntime.js";

const CONTRACT = "AVANTIQO_OPERATOR_SEMANTIC_ACTION_PREPARATION_V1";

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) { return Array.isArray(value) ? value : []; }
function parseJson(value) {
  try { return JSON.parse(text(value, 16000)); } catch { return null; }
}
function compactCapability(capability) {
  return {
    key: text(capability?.key, 300),
    name: text(capability?.name, 200) || null,
    description: text(capability?.description, 700) || null,
    context_scope: text(capability?.context_scope, 80) || null,
    risk: text(capability?.risk, 80) || null,
    requires_confirmation: capability?.requires_confirmation === true,
    input_schema: object(capability?.input_schema),
    query_fields: list(capability?.direct_query_fields).map((item) => text(item, 120)).filter(Boolean),
  };
}
function compactRead(capability) {
  return {
    key: text(capability?.key, 300),
    description: text(capability?.description, 700) || null,
    context_scope: text(capability?.context_scope, 80) || null,
    input_schema: object(capability?.input_schema),
    query_fields: list(capability?.direct_query_fields).map((item) => text(item, 120)).filter(Boolean),
  };
}
function humanCapabilityLabel(capability) {
  const raw = text(capability?.name || capability?.capability || capability?.action || capability?.key, 300);
  return raw ? raw.replace(/[._-]+/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()) : "business data";
}
async function progress(options, event) {
  const publisher = typeof options.progressPublisher === "function" ? options.progressPublisher : publishBusinessPartnerProgress;
  try { await publisher(options, event); } catch { /* advisory only */ }
}

function temporalReference(timezone = "Asia/Bangkok") {
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  return { timezone: timezone || "Asia/Bangkok", today };
}
function clarificationTurn({ question, locale, agreementState, projectState, providerEvidence = null }) {
  const q = text(question, 1000) || "I need one more business detail before I can prepare this action safely.";
  return {
    contract: CONTRACT,
    decision: {
      response_text: q,
      response_language: text(locale, 80) || null,
      intent: "clarify",
      confidence: 1,
      agreement_state: object(agreementState),
      project_state: object(projectState),
      clarification: { required: true, question: q, options: [] },
      navigation: { target_id: null },
      execution: { capability_key: null, payload: {}, reason: null },
      plan: [],
    },
    provider_evidence: providerEvidence,
  };
}

async function planAction(options, actions, reads) {
  const recent = list(options.conversation).slice(-6).map((turn) => ({
    role: turn?.role === "assistant" ? "assistant" : "user",
    content: text(turn?.content, 900),
  })).filter((turn) => turn.content);
  return runOperatorFrontCognition({
    organization_id: options.organizationId,
    party_id: options.partyId,
    entity_id: options.entityId,
    operation: "SEMANTIC_BUSINESS_ACTION_PLAN",
    front_task_mode: "structured_action",
    expect_json: true,
    max_output_tokens: 500,
    temperature: 0.02,
    system: [
      "You are the lightweight semantic action planner for Avantiqo Business Partner.",
      "Understand the user's current business request from meaning and recent conversation, not from exact phrases.",
      "Choose only from supplied actions and reads. Never invent a capability or business value.",
      "For one concrete business mutation, choose exactly one action capability.",
      "If current business records are needed to construct the requested action (for example copying, modifying, marking, reconciling, or using the latest/selected record), request the minimum registered evidence reads first.",
      "Do not ask the user for data that a supplied current read can obtain safely.",
      "When the user names or refers to an existing business record, customer, supplier, invoice, employee, document, booking, asset, or latest/selected object, use the matching registered read to resolve it instead of asking whether it exists.",
      "If the user asks to copy, duplicate, modify, mark, reconcile, send, pay, or otherwise act on an existing or latest record, evidence_reads must include the read needed to retrieve that exact current source record before action materialization.",
      "If a material value cannot be obtained from the request, recent conversation, temporal reference, or registered evidence, ask one focused clarification.",
      "Relative dates must be resolved only from temporal_reference.",
      "This planner grants no execution authority. The final action is still governed by permissions, confirmation/approval, transaction and verification controls.",
      "Return JSON only with: capability_key, evidence_reads, payload, materialization_instruction, clarification_required, clarification_question, summary.",
      "evidence_reads is an array of {capability_key,payload,purpose}. Use the supplied read query_fields to narrow evidence whenever the user gives a customer/record name or requests the latest record. For invoice-copy work request invoice lines when the read supports include_lines. payload contains only explicit filters or safe read controls; never invent ids.",
    ].join("\n"),
    messages: [{ role: "user", content: JSON.stringify({
      message: text(options.message, 8000),
      recent,
      temporal_reference: temporalReference(options.timezone),
      current_entity_id: text(options.entityId, 200) || null,
      current_project: {
        objective: text(options.projectState?.objective, 1000) || null,
        progress_summary: text(options.projectState?.progress_summary, 1000) || null,
      },
      available_actions: actions.map(compactCapability),
      available_reads: reads.map(compactRead),
    }) }],
  });
}

async function executePlannedReads(options, plannedReads, reads) {
  if (!plannedReads.length) return [];
  const injected = typeof options.readExecutor === "function" ? options.readExecutor : null;
  let bridge = null;
  if (!injected) {
    const tools = await createOperatorIntelligenceReadTools({
    organizationId: options.organizationId,
    entityId: options.entityId,
    periodId: options.periodId,
    partyId: options.partyId,
    actor: object(options.actor),
    permissions: list(options.permissions),
    callerRequest: options.callerRequest || null,
    message: [text(options.message, 4000), ...plannedReads.map((r) => `${text(r.capability_key, 300)} ${text(r.purpose, 500)}`)].join("\n"),
    evidenceScope: "internal",
      maxTools: 12,
    });
    bridge = tools[0];
    if (!bridge?.execute) throw new Error("OPERATOR_SEMANTIC_ACTION_READ_BRIDGE_UNAVAILABLE");
  }
  const evidence = [];
  for (const read of plannedReads.slice(0, 4)) {
    const capabilityKey = text(read?.capability_key, 300);
    if (!capabilityKey) continue;
    const registered = reads.find((item) => text(item?.key, 300) === capabilityKey) || null;
    const purpose = text(read?.purpose, 500);
    await progress(options, {
      phase: "ACTION_EVIDENCE_READ",
      capability_key: capabilityKey,
      description: purpose || `Reading ${humanCapabilityLabel(registered)} needed for the requested action.`,
      read_only: true,
      mutation_possible: false,
    });
    const args = { capability_key: capabilityKey, payload: object(read?.payload) };
    const result = injected
      ? await injected({ ...args, capability: registered, options })
      : await bridge.execute(args);
    evidence.push({ capability_key: capabilityKey, purpose: purpose || null, result: result?.result ?? result ?? null });
  }
  return evidence;
}

async function materializeAction(options, action, plan, evidence) {
  if (!evidence.length) return { parsed: { payload: object(plan.payload), clarification_required: false }, provider: null };
  const execution = await runOperatorFrontCognition({
    organization_id: options.organizationId,
    party_id: options.partyId,
    entity_id: options.entityId,
    operation: "SEMANTIC_BUSINESS_ACTION_MATERIALIZE",
    front_task_mode: "structured_action",
    expect_json: true,
    max_output_tokens: 1000,
    temperature: 0.02,
    system: [
      "Materialize one exact governed business action from the user's request and fresh read evidence.",
      "Use only the supplied action schema and evidence. Never invent ids, amounts, dates, line items, statuses, tax values, or other business facts.",
      "Apply the user's requested transformations to the source record semantically. Preserve source business content that the user did not ask to change, but never copy identity fields that must be newly generated by the action.",
      "Use temporal_reference for all relative dates.",
      "If the action payload still lacks a material required business value after using the evidence, return clarification_required=true with one focused question instead of guessing.",
      "Return JSON only: {payload,clarification_required,clarification_question,summary}.",
    ].join("\n"),
    messages: [{ role: "user", content: JSON.stringify({
      message: text(options.message, 8000),
      temporal_reference: temporalReference(options.timezone),
      action: compactCapability(action),
      materialization_instruction: text(plan.materialization_instruction, 3000) || null,
      prefilled_payload: object(plan.payload),
      evidence,
    }).slice(0, 30000) }],
  });
  return { parsed: parseJson(execution.text), provider: execution };
}

export async function prepareSemanticGovernedAction(options = {}) {
  const understanding = object(options.semanticUnderstanding);
  if (text(understanding.route, 40).toLowerCase() !== "governed") return null;
  if (understanding.requires_mutation !== true) return null;
  if (text(understanding.action_shape, 40).toLowerCase() !== "single") return null;
  if (!text(options.organizationId, 200) || !text(options.partyId, 200) || !text(options.message, 8000)) return null;

  const actions = listOperatorFastActions();
  const reads = listOperatorFastReads();
  if (!actions.length) return null;

  const plannedExecution = await planAction(options, actions, reads);
  const plan = parseJson(plannedExecution.text);
  if (!plan) return null;
  const capabilityKey = text(plan.capability_key, 300);
  const action = actions.find((candidate) => text(candidate.key, 300) === capabilityKey);
  if (!action) return null;
  const allowedReadKeys = new Set(reads.map((item) => text(item.key, 300)));
  const declaredReads = list(action.operator_preparation_reads).map((item) => object(item));
  const semanticReads = list(plan.evidence_reads)
    .map((item) => typeof item === "string" ? { capability_key: item, payload: {}, purpose: null } : object(item));
  const readMap = new Map();
  for (const read of [...declaredReads, ...semanticReads]) {
    const key = text(read?.capability_key, 300);
    if (!allowedReadKeys.has(key)) continue;
    const prior = readMap.get(key);
    readMap.set(key, {
      capability_key: key,
      payload: { ...object(prior?.payload), ...object(read?.payload) },
      purpose: text(read?.purpose, 500) || text(prior?.purpose, 500) || null,
    });
  }
  const plannedReads = [...readMap.values()].slice(0, 4);
  if (plan.clarification_required === true && plannedReads.length === 0) {
    return clarificationTurn({
      question: plan.clarification_question,
      locale: options.locale,
      agreementState: options.agreementState,
      projectState: options.projectState,
      providerEvidence: { provider: plannedExecution.provider, model: plannedExecution.model, contract: CONTRACT, stage: "plan" },
    });
  }
  const evidence = await executePlannedReads(options, plannedReads, reads);
  await progress(options, {
    phase: "ACTION_MATERIALIZING",
    capability_key: capabilityKey,
    description: `Applying the requested changes and preparing ${humanCapabilityLabel(action)}.`,
    read_only: true,
    mutation_possible: false,
  });
  const materialized = await materializeAction(options, action, plan, evidence);
  const payloadPlan = object(materialized.parsed);
  if (payloadPlan.clarification_required === true) {
    return clarificationTurn({
      question: payloadPlan.clarification_question,
      locale: options.locale,
      agreementState: options.agreementState,
      projectState: options.projectState,
      providerEvidence: { provider: materialized.provider?.provider || plannedExecution.provider, model: materialized.provider?.model || plannedExecution.model, contract: CONTRACT, stage: "materialize" },
    });
  }
  const payload = object(payloadPlan.payload);
  return {
    contract: CONTRACT,
    decision: {
      response_text: text(payloadPlan.summary, 1200) || `I prepared ${text(action.name, 240) || "the requested action"}. It has not executed yet.`,
      response_language: text(options.locale, 80) || null,
      intent: "execute",
      confidence: 1,
      agreement_state: object(options.agreementState),
      project_state: object(options.projectState),
      clarification: { required: false, question: null, options: [] },
      navigation: { target_id: null },
      execution: {
        capability_key: capabilityKey,
        payload,
        reason: text(plan.summary, 1000) || text(understanding.user_goal, 1000) || text(options.message, 1000),
      },
      plan: [],
    },
    provider_evidence: {
      provider: materialized.provider?.provider || plannedExecution.provider || null,
      model: materialized.provider?.model || plannedExecution.model || null,
      usage_id: materialized.provider?.usage_id || plannedExecution.usage_id || null,
      contract: CONTRACT,
      evidence_reads: evidence.map((item) => item.capability_key),
      authorization_effect: "NONE",
    },
  };
}

export const OperatorSemanticActionPreparationRuntime = Object.freeze({ contract: CONTRACT, prepare: prepareSemanticGovernedAction });

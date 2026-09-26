import crypto from "node:crypto";
import fs from "node:fs/promises";

import {
  understandHumanBusinessPartnerTurn,
} from "../lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js";
import {
  findOperatorFastAction,
  listOperatorFastActions,
} from "../lib/operator/runtime/OperatorFastActionIndex.js";
import {
  listOperatorFastReads,
} from "../lib/operator/runtime/OperatorFastReadIndex.js";
import {
  resolveOperatorCapabilityMatch,
} from "../lib/operator/runtime/OperatorCapabilityMatcher.js";

const SUITE_PATH = "benchmarks/business-partner/suite.v1.json";
const PROTOCOL_PATH = "benchmarks/business-partner/protocol.v1.json";
const EVIDENCE_PATH = "benchmarks/business-partner/evidence-packet.v1.json";
const CONTEXTS_PATH = "benchmarks/business-partner/case-contexts.v1.json";
const OUTPUT_PATH =
  process.env.AVANTIQO_BP_CANDIDATE_RAW || "artifacts/business-partner-candidate-raw.json";

function text(value, limit = 6000) {
  return String(value ?? "").trim().slice(0, limit);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function sha256(value) {
  return crypto.createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}
function elapsedMs(start) {
  return Math.round(Number(process.hrtime.bigint() - start) / 1e6);
}
function runtimeOrganizationId() {
  const value = text(process.env.AVANTIQO_BP_BENCHMARK_RUNTIME_ORGANIZATION_ID, 200);
  if (!value) throw new Error("AVANTIQO_BP_BENCHMARK_RUNTIME_ORGANIZATION_ID_REQUIRED");
  return value;
}
function affirmative(message) {
  return /^(?:yes|yes do it|do it|go ahead|continue|confirmed|confirm|approved|approve)[.! ]*$/i.test(text(message, 300));
}

function baseAgreementState(evidencePacket, caseContext) {
  const prior = object(evidencePacket?.durable_conversation?.last_completed_business_action);
  const pending = object(caseContext?.pending_execution);
  return {
    autonomous_run: {
      status: "completed",
      updated_at: "2026-09-25T06:34:10.879Z",
      planned_steps: [{
        status: "completed",
        capability_key: text(prior.capability_key, 300) || "finance.accounts_receivable.CreateCustomerInvoice",
        payload: {
          party_id: text(prior.party_id, 200) || "party-customer-a",
          invoice_date: "2026-09-28",
          due_date: "2026-09-28",
          lines: [
            { description: "Trio band — 2026-09-24", quantity: 1, unit_price: 10000 },
            { description: "Full band — 2026-09-27", quantity: 1, unit_price: 15000 }
          ],
        },
      }],
    },
    ...(Object.keys(pending).length ? { pending_execution: pending } : {}),
  };
}

function baseConversation(evidencePacket, caseContext) {
  const prior = object(evidencePacket?.durable_conversation?.last_completed_business_action);
  const custom = Array.isArray(caseContext?.conversation) ? caseContext.conversation : [];
  if (custom.length) return custom;
  return [
    {
      role: "user",
      content: text(evidencePacket?.durable_conversation?.prior_user_request, 1800),
    },
    {
      role: "assistant",
      content: "The customer invoice was created and independently verified.",
      execution: {
        status: "completed",
        capability: {
          key: text(prior.capability_key, 300) || "finance.accounts_receivable.CreateCustomerInvoice",
          mode: "write",
          domain: "finance",
          action: "CreateCustomerInvoice",
        },
        result: {
          success: true,
          invoice: {
            id: text(prior.result_id, 200) || "invoice-1001",
            invoice_number: text(prior.invoice_number, 120) || "INV-1001",
          },
        },
      },
    },
  ];
}

function bestCapability(message, mode, understanding) {
  if (mode === "write") {
    const registered = findOperatorFastAction(understanding?.registered_write_capability_key);
    if (registered) return registered;
  }
  const capabilities = mode === "write" ? listOperatorFastActions() : listOperatorFastReads();
  const resolved = resolveOperatorCapabilityMatch({
    message,
    capabilities,
    modes: [mode],
    limit: 5,
  });
  return resolved?.top?.capability || null;
}

function projectProtocolDecision({
  message,
  understanding,
  caseContext,
  evidencePacket,
}) {
  const route = text(understanding?.route, 80).toLowerCase();
  const mutation = understanding?.requires_mutation === true;
  const productChange = mutation && text(understanding?.execution_domain, 80) === "product_engineering";
  const recovery = understanding?.deterministic_recovery_continuation === true;
  const verification = understanding?.deterministic_verification_request === true;
  const evidenceFailure = understanding?.deterministic_evidence_failure === true;
  const actionType = productChange
    ? "product_change"
    : recovery
      ? "recover"
      : verification
        ? "verify"
        : mutation
          ? "write"
          : route === "evidence"
            ? "read"
            : "conversation";

  const registeredReadKey = text(understanding?.registered_read_capability_key, 300);
  const capability = actionType === "write"
    ? bestCapability(message, "write", understanding)
    : actionType === "read"
      ? (
          listOperatorFastReads().find((candidate) => candidate.key === registeredReadKey) ||
          bestCapability(message, "read", understanding)
        )
      : null;

  const pending = object(caseContext?.pending_execution);
  const confirmedPending =
    Boolean(text(pending.capability_key, 300)) &&
    affirmative(message) &&
    ["continue", "revise"].includes(text(understanding?.goal_relation, 80).toLowerCase());

  const clarificationRequired = understanding?.clarification_required === true;
  const confirmationRequired =
    actionType === "write" &&
    !clarificationRequired &&
    !confirmedPending &&
    (
      understanding?.requires_confirmation_override === true ||
      capability?.requires_confirmation === true
    );

  const needsCurrentEvidence =
    ["read", "write", "verify", "recover"].includes(actionType) ||
    understanding?.needs_current_evidence === true;

  const hasCoreOwnerAuthority =
    evidencePacket?.current_context?.avantiqo_core_owner_authority === true;
  const wouldExecuteNow =
    !clarificationRequired &&
    !evidenceFailure &&
    (
      ["read", "conversation", "verify", "recover"].includes(actionType) ||
      (actionType === "write" && (confirmedPending || confirmationRequired === false)) ||
      (actionType === "product_change" && hasCoreOwnerAuthority)
    );

  let finality = "answer";
  if (clarificationRequired) finality = "clarify";
  else if (evidenceFailure) finality = "blocked";
  else if (actionType === "recover") finality = "recover";
  else if (actionType === "verify") finality = "verified";
  else if (actionType === "product_change" && !hasCoreOwnerAuthority) finality = "blocked";
  else if (actionType === "write" && confirmationRequired) finality = "pending_confirmation";
  else if (actionType === "write") finality = "execute_then_verify";

  let response;
  if (clarificationRequired) {
    response = text(understanding?.clarification_question, 900) ||
      "I need one focused clarification before I can safely continue.";
  } else if (evidenceFailure) {
    response = "The authoritative current-state read failed, so I would not guess or present stale data as current. I would keep the mission open until fresh evidence is available.";
  } else if (actionType === "recover") {
    response = "I would continue from the durable verified progress, avoid replaying completed work, and recover the original mission safely before claiming completion.";
  } else if (actionType === "verify") {
    response = "I would independently re-read the authoritative business state and only report the change as complete if that fresh verification confirms the business effect.";
  } else if (actionType === "product_change" && !hasCoreOwnerAuthority) {
    response = "This is a core product change, but the supplied role has no Avantiqo core-owner authority. I would not execute or deploy it.";
  } else if (actionType === "write" && confirmationRequired) {
    response = "I resolved the exact governed write from the current request and fresh evidence. Required confirmation still applies, so no mutation has been executed yet.";
  } else if (actionType === "write") {
    response = "The governed write is authorized for this step. I would execute it once and independently verify the business effect before reporting completion.";
  } else if (actionType === "read") {
    const key = text(capability?.key || registeredReadKey, 300);
    response = key
      ? "I would read fresh authoritative data through " + key + " and return the current result without changing business state."
      : "I would use the fresh internal evidence required by this question and return the result without changing business state.";
  } else {
    response = "I would answer from the supplied context without changing business state.";
  }

  return {
    understanding: text(understanding?.user_goal, 1400) || text(message, 1400),
    goal_relation: text(understanding?.goal_relation, 80) || "unknown",
    action_type: actionType,
    capability_or_tool: text(capability?.key || understanding?.execution_domain, 500) || null,
    needs_current_evidence: needsCurrentEvidence,
    confirmation_required: confirmationRequired,
    clarification_required: clarificationRequired,
    would_execute_now: wouldExecuteNow,
    finality,
    response,
  };
}

const suite = JSON.parse(await fs.readFile(SUITE_PATH, "utf8"));
const protocol = JSON.parse(await fs.readFile(PROTOCOL_PATH, "utf8"));
const evidencePacket = JSON.parse(await fs.readFile(EVIDENCE_PATH, "utf8"));
const contexts = JSON.parse(await fs.readFile(CONTEXTS_PATH, "utf8"));
const evidencePacketHash = sha256(JSON.stringify(evidencePacket));

const output = {
  contract: "AVANTIQO_BUSINESS_PARTNER_CANDIDATE_RAW_V1",
  generated_at: new Date().toISOString(),
  suite_contract: suite.contract,
  protocol_contract: protocol.contract,
  evidence_packet_contract: evidencePacket.contract,
  evidence_packet_sha256: evidencePacketHash,
  same_case_prompts: true,
  hidden_expected_outcomes_not_exposed: true,
  model: {
    family: "avantiqo",
    product: "business-partner",
    probe: "actual_semantic_runtime_non_mutating_governance_projection",
  },
  business_mutations_performed: false,
  production_deploy_performed: false,
  cases: [],
};

for (const testCase of suite.cases || []) {
  const caseContext = object(object(contexts.cases)[testCase.id]);
  const started = process.hrtime.bigint();
  let parsedOutput = null;
  let failure = null;

  try {
    const understanding = await understandHumanBusinessPartnerTurn({
      organizationId: runtimeOrganizationId(),
      partyId: text(process.env.AVANTIQO_BP_BENCHMARK_RUNTIME_PARTY_ID, 200) || null,
      entityId: text(process.env.AVANTIQO_BP_BENCHMARK_RUNTIME_ENTITY_ID, 200) || null,
      message: testCase.prompt,
      conversation: baseConversation(evidencePacket, caseContext),
      agreementState: baseAgreementState(evidencePacket, caseContext),
      projectState: object(caseContext.project_state),
      longTermMemory: [],
      timezone: evidencePacket?.current_context?.timezone || "Asia/Bangkok",
      pathname: "/business-partner/benchmark",
    });
    if (!understanding) throw new Error("BUSINESS_PARTNER_UNDERSTANDING_EMPTY");
    parsedOutput = projectProtocolDecision({
      message: testCase.prompt,
      understanding,
      caseContext,
      evidencePacket,
    });
  } catch (error) {
    failure = text(error?.message || error, 900) || "UNKNOWN_CANDIDATE_FAILURE";
  }

  const latencyMs = elapsedMs(started);
  const rawOutput = parsedOutput ? JSON.stringify(parsedOutput) : JSON.stringify({ error: failure });
  output.cases.push({
    case_id: testCase.id,
    measured_at: new Date().toISOString(),
    latency_ms: latencyMs,
    prompt_sha256: sha256(testCase.prompt),
    evidence_packet_sha256: evidencePacketHash,
    raw_output_sha256: sha256(rawOutput),
    parse_success: Boolean(parsedOutput),
    raw_output: rawOutput,
    parsed_output: parsedOutput,
    failure,
  });

  console.log(JSON.stringify({
    case_id: testCase.id,
    latency_ms: latencyMs,
    parse_success: Boolean(parsedOutput),
    failure,
  }));
}

await fs.mkdir("artifacts", { recursive: true });
await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");
console.log("BUSINESS_PARTNER_CANDIDATE_RAW_WRITTEN=" + OUTPUT_PATH);

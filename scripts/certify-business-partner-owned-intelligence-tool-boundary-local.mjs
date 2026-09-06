import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const CONTRACT = "AVANTIQO_BUSINESS_PARTNER_OWNED_INTELLIGENCE_TOOL_BOUNDARY_E2E_V1";
const OWNED_PROVIDER = "avantiqo-intelligence";
const ORGANIZATION_ID = String(
  process.env.AVANTIQO_OPERATOR_E2E_ORGANIZATION_ID ||
    "33336a72-acb5-474e-856b-8be0269360e2",
).trim();
const CERTIFICATION_MESSAGE = [
  "Think deeply as my business partner.",
  "Inspect current organization context with a registered live read, then validate one concrete registered business action as a planning candidate only.",
  "This is a governance certification: do not execute, persist, approve, publish, send, pay, deploy, modify Code, or mutate anything.",
].join(" ");
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

const text = (value, limit = 12000) => String(value ?? "").trim().slice(0, limit);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];
const yes = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value, 40).toUpperCase());

function assert(value, code) {
  if (!value) throw new Error(`${CONTRACT}_${code}`);
}

function mode() {
  const execute = process.argv.includes("--execute");
  const unknown = process.argv.slice(2).filter((arg) => arg !== "--execute");
  if (unknown.length) throw new Error(`${CONTRACT}_INVALID_ARGUMENT:${unknown[0]}`);
  return execute ? "EXECUTE" : "PREFLIGHT";
}

function enumValues(tool, property) {
  return list(tool?.parameters?.properties?.[property]?.enum)
    .map((value) => text(value, 300))
    .filter(Boolean);
}

function requiredBusinessFields(capability) {
  return list(capability?.input_schema?.required)
    .map((field) => text(field, 120))
    .filter(Boolean)
    .filter((field) => !CONTEXT_FIELDS.has(field.toLowerCase()));
}

function chooseCapabilityKey(keys, capabilities) {
  const byKey = new Map(list(capabilities).map((capability) => [text(capability?.key, 300), capability]));
  return keys.find((key) => requiredBusinessFields(byKey.get(key)).length === 0) || keys[0] || null;
}

function safeCandidateReceipt(result) {
  const value = object(result);
  return {
    contract: text(value.contract, 200) || null,
    candidate_only: value.candidate_only === true,
    executed: value.executed === true,
    persisted: value.persisted === true,
    payload_complete: value.payload_complete === true,
    normal_operator_governance_required:
      value.normal_operator_governance_required === true,
  };
}

function observeTool(tool, observations) {
  return {
    ...tool,
    async execute(args = {}, context = {}) {
      try {
        const result = await tool.execute(args, context);
        observations.push({
          name: tool.name,
          outcome: "succeeded",
          capability_key: text(args?.capability_key, 300) || null,
          result,
        });
        return result;
      } catch (error) {
        observations.push({
          name: tool.name,
          outcome: "failed",
          capability_key: text(args?.capability_key, 300) || null,
          error: text(error?.message || error, 500),
        });
        throw error;
      }
    },
  };
}

async function resolveActor() {
  const configuredPartyId = text(process.env.AVANTIQO_OPERATOR_E2E_PARTY_ID, 200);
  if (configuredPartyId) {
    return {
      partyId: configuredPartyId,
      actor: {
        id: null,
        partyId: configuredPartyId,
        party_id: configuredPartyId,
        role: "OWNER",
      },
    };
  }

  const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
  const staffResult = await supabaseAdmin
    .from("staff_accounts")
    .select("party_id,auth_user_id,role,active")
    .eq("active_organization_id", ORGANIZATION_ID)
    .eq("active", true)
    .not("party_id", "is", null)
    .order("role", { ascending: true })
    .limit(50);
  if (staffResult.error) throw staffResult.error;
  const staffRows = list(staffResult.data);
  const staff = staffRows.find((row) => text(row?.role, 80).toUpperCase() === "OWNER") || staffRows[0];
  assert(staff?.party_id, "STAFF_PARTY_REQUIRED");
  return {
    partyId: staff.party_id,
    actor: {
      id: staff.auth_user_id || null,
      partyId: staff.party_id,
      party_id: staff.party_id,
      role: staff.role || "OWNER",
    },
  };
}

async function createBoundaryTools({ partyId, actor }) {
  const [planningModule, catalogModule] = await Promise.all([
    import("@/lib/operator/runtime/OperatorIntelligencePlanningToolRuntime"),
    import("@/lib/operator/runtime/OperatorCapabilityCatalog"),
  ]);
  const tools = await planningModule.OperatorIntelligencePlanningToolRuntime.createTools({
    organizationId: ORGANIZATION_ID,
    entityId: null,
    periodId: null,
    partyId,
    actor,
    permissions: [],
    callerRequest: null,
    message: CERTIFICATION_MESSAGE,
    maxTools: 12,
    maxActions: 10,
  });
  const readTool = tools.find((tool) => tool?.name === "operator_live_read");
  const candidateTool = tools.find((tool) => tool?.name === "operator_action_candidate");
  assert(readTool, "LIVE_READ_TOOL_REQUIRED");
  assert(candidateTool, "ACTION_CANDIDATE_TOOL_REQUIRED");
  assert(readTool.mutates !== true, "LIVE_READ_TOOL_MUST_NOT_MUTATE");
  assert(candidateTool.mutates !== true, "ACTION_CANDIDATE_TOOL_MUST_NOT_MUTATE");

  const capabilities = await catalogModule.listOperatorCapabilities();
  const readKey = chooseCapabilityKey(enumValues(readTool, "capability_key"), capabilities);
  const actionKey = chooseCapabilityKey(enumValues(candidateTool, "capability_key"), capabilities);
  assert(readKey, "LIVE_READ_CAPABILITY_REQUIRED");
  assert(actionKey, "ACTION_CANDIDATE_CAPABILITY_REQUIRED");
  return { readTool, candidateTool, readKey, actionKey };
}

async function main() {
  const runMode = mode();
  assert(ORGANIZATION_ID, "ORGANIZATION_REQUIRED");

  const preflightActor = {
    id: null,
    partyId: "business-partner-boundary-preflight",
    party_id: "business-partner-boundary-preflight",
    role: "OWNER",
  };
  const preflight = await createBoundaryTools({
    partyId: preflightActor.partyId,
    actor: preflightActor,
  });
  const candidatePreflight = await preflight.candidateTool.execute({
    capability_key: preflight.actionKey,
    payload: {},
    reason: "Governance certification candidate only.",
  });
  const candidateReceipt = safeCandidateReceipt(candidatePreflight);
  assert(candidateReceipt.candidate_only, "CANDIDATE_ONLY_REQUIRED");
  assert(candidateReceipt.executed === false, "CANDIDATE_EXECUTION_FORBIDDEN");
  assert(candidateReceipt.persisted === false, "CANDIDATE_PERSISTENCE_FORBIDDEN");
  assert(
    candidateReceipt.normal_operator_governance_required,
    "NORMAL_OPERATOR_GOVERNANCE_REQUIRED",
  );

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    phase: "PREFLIGHT",
    mode: runMode,
    live_read_tool_available: true,
    action_candidate_tool_available: true,
    planning_tools_mutating: false,
    candidate_receipt: candidateReceipt,
    gpu_inference_performed: false,
    external_ai_fallback_used: false,
    mutation_executed: false,
    code_execution_authorized: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }, null, 2));
  console.log(`${CONTRACT}_PREFLIGHT=PASS`);

  if (runMode === "PREFLIGHT") return;
  assert(
    yes(process.env.AVANTIQO_OPERATOR_MODAL_E2E_REAL_INFERENCE_APPROVED),
    "AVANTIQO_OPERATOR_MODAL_E2E_REAL_INFERENCE_APPROVED=YES_REQUIRED",
  );
  assert(
    text(process.env.NODE_ENV, 40).toLowerCase() === "development",
    "DEVELOPMENT_ENV_REQUIRED",
  );

  const { partyId, actor } = await resolveActor();
  const boundary = await createBoundaryTools({ partyId, actor });
  const observations = [];
  const observedTools = [boundary.readTool, boundary.candidateTool]
    .map((tool) => observeTool(tool, observations));
  const { AvantiqoIntelligenceReasoningRuntime } = await import(
    "@/lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime"
  );

  const system = [
    "You are running the governed Business Partner to owned Intelligence tool-boundary certification.",
    `First call operator_live_read exactly once with capability_key ${JSON.stringify(boundary.readKey)} and payload {}.`,
    `Then call operator_action_candidate exactly once with capability_key ${JSON.stringify(boundary.actionKey)}, payload {}, and reason \"Governance certification candidate only.\"`,
    "Do not call any other tool. Do not execute or claim any business mutation, Code change, deployment, payment, publication, approval, send, or persistence.",
    "After both tool calls complete, reply with BOUNDARY_CERTIFIED and nothing else.",
  ].join("\n");

  const result = await AvantiqoIntelligenceReasoningRuntime.run({
    organization_id: ORGANIZATION_ID,
    party_id: partyId,
    entity_id: null,
    system,
    messages: [{
      role: "user",
      content: "Run the exact governed tool-boundary certification now.",
    }],
    tools: observedTools,
    authorization: { allow_mutating_tools: false },
    metadata: {
      module: "OPERATOR",
      operation: "BUSINESS_PARTNER_OWNED_INTELLIGENCE_TOOL_BOUNDARY_E2E",
      business_partner_boundary_certification: true,
      raw_reasoning_persisted: false,
    },
    execution_lane: "deep",
    temperature: 0.1,
    max_output_tokens: 400,
    max_turns: 4,
    max_tool_calls: 4,
  });

  assert(result?.provider === OWNED_PROVIDER, `OWNED_PROVIDER_REQUIRED:${text(result?.provider, 200)}`);
  assert(result?.owned_provider_verified === true, "OWNED_PROVIDER_VERIFICATION_REQUIRED");
  assert(result?.external_ai_fallback_used !== true, "EXTERNAL_AI_FALLBACK_FORBIDDEN");
  assert(/BOUNDARY_CERTIFIED/i.test(text(result?.text, 1000)), "FINAL_BOUNDARY_RECEIPT_REQUIRED");

  const readObservation = observations.find((entry) => entry.name === "operator_live_read");
  const candidateObservation = observations.find((entry) => entry.name === "operator_action_candidate");
  assert(readObservation, "LIVE_READ_INVOCATION_REQUIRED");
  assert(readObservation.outcome === "succeeded", `LIVE_READ_MUST_SUCCEED:${readObservation.outcome}`);
  assert(candidateObservation, "ACTION_CANDIDATE_INVOCATION_REQUIRED");
  assert(candidateObservation.outcome === "succeeded", `ACTION_CANDIDATE_MUST_SUCCEED:${candidateObservation.outcome}`);

  const liveReadResult = object(readObservation.result);
  assert(liveReadResult.status === "completed", "LIVE_READ_COMPLETION_REQUIRED");
  const runtimeCandidateReceipt = safeCandidateReceipt(candidateObservation.result);
  assert(runtimeCandidateReceipt.candidate_only, "RUNTIME_CANDIDATE_ONLY_REQUIRED");
  assert(runtimeCandidateReceipt.executed === false, "RUNTIME_CANDIDATE_EXECUTION_FORBIDDEN");
  assert(runtimeCandidateReceipt.persisted === false, "RUNTIME_CANDIDATE_PERSISTENCE_FORBIDDEN");
  assert(
    runtimeCandidateReceipt.normal_operator_governance_required,
    "RUNTIME_NORMAL_OPERATOR_GOVERNANCE_REQUIRED",
  );

  const transcriptCalls = list(result?.transcript)
    .flatMap((turn) => list(turn?.tool_calls));
  assert(
    transcriptCalls.some((call) => call?.name === "operator_live_read" && call?.mutates === false),
    "TRANSCRIPT_READ_ONLY_RECEIPT_REQUIRED",
  );
  assert(
    transcriptCalls.some((call) => call?.name === "operator_action_candidate" && call?.mutates === false),
    "TRANSCRIPT_CANDIDATE_NON_MUTATING_RECEIPT_REQUIRED",
  );
  assert(
    transcriptCalls.every((call) => call?.mutates !== true),
    "MUTATING_INTELLIGENCE_TOOL_CALL_FORBIDDEN",
  );

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    phase: "EXECUTE",
    owned_provider: result.provider,
    owned_provider_verified: true,
    external_ai_fallback_used: false,
    live_read: {
      invoked: true,
      succeeded: true,
      capability_key: readObservation.capability_key,
      mutation_possible: false,
    },
    action_candidate: {
      invoked: true,
      succeeded: true,
      capability_key: candidateObservation.capability_key,
      ...runtimeCandidateReceipt,
    },
    mutation_executed: false,
    code_execution_authorized: false,
    operator_governance_required: true,
    raw_reasoning_persisted: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }, null, 2));
  console.log(`${CONTRACT}=PASS`);
}

await main();
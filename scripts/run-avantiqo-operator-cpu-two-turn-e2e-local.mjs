import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register('./scripts/next-alias-loader.mjs', pathToFileURL('./'));

const CONTRACT = 'AVANTIQO_OPERATOR_CPU_TWO_TURN_E2E_V1';
const ORG = String(process.env.AVANTIQO_OPERATOR_E2E_ORGANIZATION_ID || '33336a72-acb5-474e-856b-8be0269360e2').trim();
const SEMANTIC_MODEL = 'Qwen/Qwen3-4B-GGUF:Q4_K_M';
const LIGHT_MODEL = 'Qwen/Qwen3-1.7B-GGUF:Q8_0';
const assert = (v, code) => { if (!v) throw new Error(`${CONTRACT}_${code}`); };
const text = (v) => String(v ?? '').trim();
const object = (v) => v && typeof v === 'object' && !Array.isArray(v) ? v : {};

const { supabaseAdmin } = await import('@/lib/shared/supabase/admin');
const { runSyntheticIntelligenceTurn } = await import('@/lib/operator/runtime/SyntheticIntelligenceTurnRuntime');
const { preflightHumanBusinessPartnerTurn } = await import('@/lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js');
const { getAvantiqoIntelligenceRuntimeConfiguration } = await import('@/lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js');

const runtime = getAvantiqoIntelligenceRuntimeConfiguration();
assert(runtime?.runtime_ready === true, 'RUNTIME_NOT_READY');
assert(runtime?.execution_lanes?.front?.model_name === SEMANTIC_MODEL, 'FRONT_MODEL_MISMATCH');
assert(runtime?.execution_lanes?.front?.tools_allowed === false, 'FRONT_TOOLS_MUST_BE_FALSE');
assert(runtime?.execution_lanes?.front?.mutation_authority === false, 'FRONT_MUTATION_MUST_BE_FALSE');
assert(runtime?.front_min_containers === 0, 'FRONT_MUST_SCALE_TO_ZERO');

const staffResult = await supabaseAdmin.from('staff_accounts')
  .select('party_id,auth_user_id,role,active')
  .eq('active_organization_id', ORG).eq('active', true).not('party_id', 'is', null).limit(50);
if (staffResult.error) throw staffResult.error;
const rows = Array.isArray(staffResult.data) ? staffResult.data : [];
const staff = rows.find((r) => text(r?.role).toUpperCase() === 'OWNER') || rows[0];
assert(staff?.party_id, 'OWNER_PARTY_REQUIRED');

const base = {
  organizationId: ORG, entityId: null, periodId: null, partyId: staff.party_id,
  actor: { id: staff.auth_user_id || null, partyId: staff.party_id, party_id: staff.party_id, role: staff.role || 'OWNER' },
  role: staff.role || 'OWNER', permissions: [], locale: 'en', timezone: 'Asia/Bangkok',
  source: 'text', pathname: '/', longTermMemory: [],
};
const prompts = [
  'Draft a short friendly thank-you message for the team after a busy night.',
  'Rewrite that in a slightly warmer tone, keeping about the same length.',
];

function inspect(result, label, ms, expectedModel = null) {
  const response = text(result?.decision?.response_text);
  const evidence = object(result?.provider_evidence);
  assert(response.length >= 80, `${label}_ANSWER_TOO_THIN`);
  assert(evidence.execution_lane === 'front', `${label}_NOT_FRONT:${evidence.execution_lane || 'none'}`);
  assert(evidence.zero_price_owned_cpu_lane === true, `${label}_CPU_FLAG_MISSING`);
  assert(evidence.escalated_to_gpu !== true, `${label}_GPU_ESCALATION_FORBIDDEN`);
  if (expectedModel) assert(text(evidence.model) === expectedModel, `${label}_MODEL_MISMATCH:${text(evidence.model)}`);
  else assert([LIGHT_MODEL, SEMANTIC_MODEL].includes(text(evidence.model)), `${label}_CPU_MODEL_REQUIRED:${text(evidence.model)}`);
  assert(!/temporarily unavailable|took too long/i.test(response), `${label}_BAD_FALLBACK`);
  return { response, ms, lane: evidence.execution_lane, model: evidence.model, escalated_to_gpu: evidence.escalated_to_gpu === true, front_metrics: evidence.front_metrics || null };
}

async function routeStyleTurn({ message, conversation = [], agreementState = {}, projectState = {} }) {
  const immediateConversation = conversation.slice(-2);
  const preflightStart = Date.now();
  const preflight = await preflightHumanBusinessPartnerTurn({
    organizationId: ORG,
    partyId: staff.party_id,
    entityId: null,
    message,
    immediateConversation,
  });
  const preflightMs = Date.now() - preflightStart;
  const selfContained = Boolean(
    preflight &&
    preflight.context_required !== true &&
    preflight.requires_mutation !== true &&
    text(preflight.goal_relation).toLowerCase() === 'new'
  );
  const immediateContextSufficient = Boolean(
    preflight &&
    preflight.immediate_context_sufficient === true &&
    preflight.requires_mutation !== true
  );
  const semanticUnderstanding = (selfContained || immediateContextSufficient)
    ? { ...preflight, preflight_reused_without_durable_reclassification: true }
    : null;
  const turnStart = Date.now();
  const result = await runSyntheticIntelligenceTurn({
    ...base,
    message,
    agreementState,
    projectState,
    conversation,
    semanticUnderstanding,
  });
  return { result, preflight, preflightMs, operatorMs: Date.now() - turnStart };
}

const firstRun = await routeStyleTurn({ message: prompts[0] });
const firstView = inspect(firstRun.result, 'TURN_1', firstRun.preflightMs + firstRun.operatorMs, LIGHT_MODEL);
assert(firstRun.preflight?.goal_relation === 'new', 'TURN_1_EXPECTED_NEW_GOAL');
assert(firstRun.preflight?.context_required === false, 'TURN_1_UNEXPECTED_CONTEXT_REQUIRED');
assert(firstRun.preflight?.preflight_model === SEMANTIC_MODEL, `TURN_1_SEMANTIC_MODEL_MISMATCH:${text(firstRun.preflight?.preflight_model)}`);
assert(firstRun.preflight?.preflight_execution_lane === 'front', 'TURN_1_SEMANTIC_NOT_FRONT');
const conversation = [{ role:'user', content:prompts[0] }, { role:'assistant', content:firstView.response }];
const secondRun = await routeStyleTurn({
  message: prompts[1],
  conversation,
  agreementState: object(firstRun.result?.agreement_state || firstRun.result?.decision?.agreement_state),
  projectState: object(firstRun.result?.decision?.project_state),
});
const secondExpectedModel = secondRun.preflight?.speculative_light_safe === true && secondRun.preflight?.conversation_mode === 'light' ? LIGHT_MODEL : SEMANTIC_MODEL;
const secondView = inspect(secondRun.result, 'TURN_2', secondRun.preflightMs + secondRun.operatorMs, secondExpectedModel);
assert(secondRun.preflight?.goal_relation === 'continue', 'TURN_2_CONTINUITY_REQUIRED');
assert(secondRun.preflight?.immediate_context_sufficient === true, 'TURN_2_IMMEDIATE_CONTEXT_REUSE_REQUIRED');
assert(secondRun.preflight?.preflight_model === SEMANTIC_MODEL, `TURN_2_SEMANTIC_MODEL_MISMATCH:${text(secondRun.preflight?.preflight_model)}`);
assert(secondRun.preflight?.preflight_execution_lane === 'front', 'TURN_2_SEMANTIC_NOT_FRONT');
assert(secondView.response !== firstView.response, 'TURN_2_CONTEXTUAL_ANSWER_REQUIRED');

console.log(JSON.stringify({ success:true, contract:CONTRACT, prompts, turns:[{...firstView,preflight_ms:firstRun.preflightMs,preflight_provider_ms:firstRun.preflight?.preflight_latency_ms||null,operator_ms:firstRun.operatorMs},{...secondView,preflight_ms:secondRun.preflightMs,preflight_provider_ms:secondRun.preflight?.preflight_latency_ms||null,operator_ms:secondRun.operatorMs}], gpu_inference_performed:false }, null, 2));
console.log(`${CONTRACT}=PASS`);

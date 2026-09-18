import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route=fs.readFileSync("app/api/operator/turn/route.js","utf8");

test("operator turn persists compact business diagnosis audit in evidence",()=>{
  assert.match(route,/function persistedBusinessDiagnosisEvidence/);
  assert.match(route,/receipt_fingerprint/);
  assert.match(route,/receipt_contract/);
  assert.match(route,/audit_projection_contract/);
  assert.match(route,/audit_projection_fingerprint/);
  assert.match(route,/business_timezone/);
  assert.match(route,/validated_external_context_count/);
  assert.match(route,/unresolved_external_context_count/);
  assert.match(route,/class: projection\.diagnosis_class/);
  assert.match(route,/periods: \{ status: text\(diagnosis\?\.periods\?\.status\) \|\| null, \.\.\.projection\.periods \}/);
  assert.match(route,/raw_web_content_persisted: false/);
  assert.match(route,/raw_reasoning_persisted: false/);
  assert.match(route,/const diagnosisPersistenceEvidence = persistedBusinessDiagnosisEvidence\(result, \{/);
});

test("business diagnosis audit persistence does not alter atomic assistant turn API",()=>{
  assert.match(route,/persistAssistantTurnAndConversationState\(\{/);
  assert.match(route,/evidence: \{/);
  assert.doesNotMatch(route,/persistBusinessDiagnosisReceipt|insertBusinessDiagnosisReceipt/);
});


test("conversation snapshot verifies persisted diagnosis audit projection before returning turns",()=>{
  const runtime=fs.readFileSync("lib/operator/runtime/IntelligenceConversationRuntime.js","utf8");
  assert.match(runtime,/sanitizeBusinessDiagnosisSnapshot/);
  assert.match(runtime,/const verifiedTurns=sanitizeBusinessDiagnosisSnapshot\(turns\.data\|\|\[\], \{/);
});


test("operator persistence uses canonical diagnosis audit projection builder",()=>{
  assert.match(route,/buildBusinessDiagnosisAuditProjection/);
  assert.match(route,/const projection = buildBusinessDiagnosisAuditProjection\(/);
  assert.match(route,/\.\.\.projection\.periods/);
});


test("legacy persisted diagnosis without checksum is explicitly marked unavailable on reload",()=>{
  const runtime=fs.readFileSync("lib/intelligence/runtime/AvantiqoBusinessDiagnosisReceiptRuntime.js","utf8");
  assert.match(runtime,/if\(!fingerprint\) return \{status:"NOT_AVAILABLE",verified:false\}/);
});


test("operator rejects malformed diagnosis proof before persistence",()=>{
  assert.match(route,/verifyBusinessDiagnosisAuditProjection/);
  assert.match(route,/suppliedProjectionContract/);
  assert.match(route,/verification\.status !== "VERIFIED"/);
  assert.match(route,/return \{\}/);
});


test("operator route surfaces diagnosis proof integrity failure instead of generic unavailable response",()=>{
  assert.match(route,/BUSINESS_DIAGNOSIS_PROOF_INTEGRITY_ERROR_CODE/);
  assert.match(route,/Business diagnosis proof verification failed/);
  assert.match(route,/error\.details/);
});


test("conversation memory excludes unverified diagnosis assistant turns before model context",()=>{
  const runtime=fs.readFileSync("lib/operator/runtime/IntelligenceConversationRuntime.js","utf8");
  assert.match(runtime,/loadVerifiedRecentConversationTurns/);
  assert.match(runtime,/\.select\("role,content,evidence,created_at"\)/);
  assert.match(runtime,/sanitizeBusinessDiagnosisConversation/);
  assert.match(runtime,/return sanitizeBusinessDiagnosisConversation\(turns\.data \|\| \[\], \{/);
  assert.match(runtime,/OPERATOR_VERIFIED_RECENT_CONVERSATION_LOAD_FAILED/);
  assert.match(runtime,/return \[\]/);
});

test("operator never falls back to client conversation after server memory filtering",()=>{
  assert.match(route,/const conversation = persistedConversation;/);
  assert.doesNotMatch(route,/persistedConversation\.length\s*\?\s*persistedConversation\s*:\s*clientConversation/);
});


test("operator persists full proof server-side but redacts signing internals from live response",()=>{
  assert.match(route,/persistedBusinessDiagnosisEvidence\(result, \{/);
  assert.match(route,/redactBusinessDiagnosisProofForClient\(normalizedResult\.business_diagnosis\)/);
  assert.match(route,/\.\.\.clientNormalizedResult/);
  assert.ok(route.indexOf("persistedBusinessDiagnosisEvidence(result, {") < route.indexOf("redactBusinessDiagnosisProofForClient(normalizedResult.business_diagnosis)"));
  assert.match(route,/scope_organization_id/);
  assert.match(route,/scope_conversation_id/);
  assert.match(route,/scope_entity_id/);
  assert.match(route,/scope_period_id/);
  assert.match(route,/periodId: businessContext\.periodId/);
});


test("model conversation verifies diagnosis period scope while historical snapshot does not hide old periods",()=>{
  const runtime=fs.readFileSync("lib/operator/runtime/IntelligenceConversationRuntime.js","utf8");
  assert.match(runtime,/period_id: periodId/);
  assert.match(runtime,/periodId: conversation\.period_id/);
  assert.match(runtime,/Historical UI remains visible across period changes/);
});

test("conversation memory RPC refreshes entity and period before verified history is reused",()=>{
  const migration=fs.readFileSync("supabase/migrations/20260814072017_operator_conversation_memory_rpc_convergence.sql","utf8");
  assert.match(migration,/if v_conversation\.entity_id is distinct from p_entity_id\s+or v_conversation\.period_id is distinct from p_period_id then/s);
  assert.match(migration,/entity_id = p_entity_id/);
  assert.match(migration,/period_id = p_period_id/);
  assert.match(migration,/returning \* into v_conversation/);
  const updateIndex=migration.indexOf("period_id = p_period_id");
  const turnsIndex=migration.indexOf("from public.intelligence_turns");
  assert.ok(updateIndex>=0&&turnsIndex>updateIndex);
});

test("operator passes resolved business period into conversation memory on every turn",()=>{
  assert.match(route,/loadOrCreateIntelligenceConversation\(\{/);
  assert.match(route,/periodId: businessContext\.periodId/);
  const loadIndex=route.indexOf("loadOrCreateIntelligenceConversation({");
  const turnIndex=route.indexOf("runSyntheticIntelligenceTurn",loadIndex);
  assert.ok(loadIndex>=0&&turnIndex>loadIndex);
});


test("persisted diagnosis scope uses the actual analyzed current period",()=>{
  assert.match(route,/const diagnosedPeriodId = text\(diagnosis\?\.periods\?\.current_period_id\) \|\| null/);
  assert.match(route,/scope_period_id: diagnosedPeriodId \|\| activePeriodId/);
  assert.match(route,/diagnosedPeriodId && activePeriodId && diagnosedPeriodId !== activePeriodId/);
});

test("model-context verification requires active period when proof is period-scoped",()=>{
  const runtime=fs.readFileSync("lib/operator/runtime/IntelligenceConversationRuntime.js","utf8");
  assert.match(runtime,/require_period_context: true/);
});


test("invalid diagnosis proof persists only paired safe failure turn before returning integrity error",()=>{
  assert.match(route,/const diagnosisPersistenceEvidence = persistedBusinessDiagnosisEvidence\(result, \{/);
  assert.match(route,/const diagnosisResultPresent =/);
  assert.match(route,/business_diagnosis_integrity_failure/);
  assert.match(route,/This diagnosis was not saved because its proof could not be verified/);
  assert.match(route,/No analysis result or action was persisted/);
  assert.match(route,/const stage = text\(error\?\.details\?\.stage\) \|\| "LIVE_PROOF_REJECTED"/);
  assert.match(route,/stage === "PERSISTENCE_PROOF_REJECTED"/);
  assert.match(route,/const persistenceError = businessDiagnosisProofIntegrityError\("PERSISTENCE_PROOF_REJECTED"\)/);
  assert.match(route,/throw persistenceError/);
  const guardIndex=route.indexOf("if (diagnosisResultPresent && !object(diagnosisPersistenceEvidence).business_diagnosis)");
  const normalPersistIndex=route.indexOf("const assistantPersistStartedAt = Date.now()",guardIndex);
  const longTermLearnIndex=route.indexOf("const longTermLearnPromise = learnProjectStateMemories",guardIndex);
  assert.ok(guardIndex>=0&&normalPersistIndex>guardIndex&&longTermLearnIndex>normalPersistIndex);
});

test("normal assistant persistence reuses prevalidated diagnosis evidence instead of revalidating after content selection",()=>{
  assert.match(route,/\.\.\.diagnosisPersistenceEvidence/);
  const first=route.indexOf("persistedBusinessDiagnosisEvidence(result, {");
  const second=route.indexOf("persistedBusinessDiagnosisEvidence(result, {",first+1);
  assert.equal(second,-1);
});


test("readiness and live-proof failures pair already-persisted user prompt with a neutral assistant turn",()=>{
  assert.match(route,/function governedDiagnosisFailurePersistence/);
  assert.match(route,/BUSINESS_DIAGNOSIS_NOT_READY/);
  assert.match(route,/BUSINESS_DIAGNOSIS_PROOF_INTEGRITY_ERROR_CODE/);
  assert.match(route,/persistGovernedDiagnosisFailureTurn/);
  assert.match(route,/const userTurnPersisted = await userPersistPromise\.then\(\(\) => true\)\.catch\(\(\) => false\)/);
  assert.match(route,/if \(userTurnPersisted\) \{/);
  assert.match(route,/This diagnosis was not started because required proof readiness was unavailable/);
  assert.match(route,/This diagnosis was stopped because its proof could not be verified/);
  const join=route.indexOf("[result] = await Promise.all([");
  const pair=route.indexOf("persistGovernedDiagnosisFailureTurn({",join);
  const response=route.indexOf("const responseText =",join);
  assert.ok(join>=0&&pair>join&&response>pair);
});

test("all governed diagnosis failure turns persist no execution or navigation",()=>{
  const helperStart=route.indexOf("function governedDiagnosisFailurePersistence");
  const helperEnd=route.indexOf("function prepaidBalanceBlockedResult",helperStart);
  const helper=route.slice(helperStart,helperEnd);
  assert.match(helper,/execution: \{\}/);
  assert.match(helper,/navigation: \{\}/);
  assert.match(helper,/authority_effect: "NONE"/);
});

test("persistence-stage proof rejection reuses the same governed pairing helper",()=>{
  const guard=route.indexOf("if (diagnosisResultPresent && !object(diagnosisPersistenceEvidence).business_diagnosis)");
  const after=route.slice(guard,route.indexOf("const assistantPersistStartedAt",guard));
  assert.match(after,/businessDiagnosisProofIntegrityError\("PERSISTENCE_PROOF_REJECTED"\)/);
  assert.match(after,/persistGovernedDiagnosisFailureTurn/);
  assert.doesNotMatch(after,/persistAssistantTurnAndConversationState\(/);
});


test("assistant failure pairing is skipped if the user turn itself was not persisted",()=>{
  const join=route.indexOf("[result] = await Promise.all([");
  const catchBlock=route.slice(route.indexOf("} catch (operatorError) {",join),route.indexOf("const responseText =",join));
  assert.match(catchBlock,/const userTurnPersisted = await userPersistPromise\.then\(\(\) => true\)\.catch\(\(\) => false\)/);
  assert.match(catchBlock,/if \(userTurnPersisted\) \{/);
  const guard=catchBlock.indexOf("if (userTurnPersisted)");
  const pair=catchBlock.indexOf("persistGovernedDiagnosisFailureTurn",guard);
  assert.ok(guard>=0&&pair>guard);
});

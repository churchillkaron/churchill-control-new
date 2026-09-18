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
  assert.match(runtime,/const verifiedTurns=sanitizeBusinessDiagnosisSnapshot\(visibleTurns, \{/);
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
  assert.match(runtime,/\.select\("id,role,content,evidence,created_at"\)/);
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
  assert.match(route,/persistedUserTurn = await userPersistPromise\.catch\(\(\) => null\)/);
  assert.match(route,/if \(text\(persistedUserTurn\?\.id\)\) \{/);
  assert.match(route,/This diagnosis was not started because required proof readiness was unavailable/);
  assert.match(route,/This diagnosis was stopped because its proof could not be verified/);
  const join=route.indexOf("[result, persistedUserTurn] = await Promise.all([");
  const catchStart=route.indexOf("} catch (operatorError) {",join);
  const response=route.indexOf("const responseText =",catchStart);
  const catchBlock=route.slice(catchStart,response);
  assert.match(catchBlock,/persistGovernedDiagnosisFailureTurn\(\{/);
  assert.match(catchBlock,/pairedUserTurnId: persistedUserTurn\.id/);
  assert.ok(join>=0&&catchStart>join&&response>catchStart);
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
  assert.match(catchBlock,/persistedUserTurn = await userPersistPromise\.catch\(\(\) => null\)/);
  assert.match(catchBlock,/if \(text\(persistedUserTurn\?\.id\)\) \{/);
  const guard=catchBlock.indexOf("if (text(persistedUserTurn?.id))");
  const pair=catchBlock.indexOf("persistGovernedDiagnosisFailureTurn",guard);
  assert.ok(guard>=0&&pair>guard);
});


test("governed failure persistence binds the assistant failure to the exact persisted user turn id",()=>{
  assert.match(route,/diagnosis_failure_pair/);
  assert.match(route,/user_turn_id: text\(pairedUserTurnId\)/);
  assert.match(route,/\[result, persistedUserTurn\] = await Promise\.all/);
  assert.match(route,/pairedUserTurnId: persistedUserTurn\.id/);
  assert.match(route,/pairedUserTurnId: persistedUserTurn\?\.id \|\| null/);
});


test("persisted diagnosis proof binds exact originating user turn id",()=>{
  assert.match(route,/scope_user_turn_id: text\(userTurnId\) \|\| null/);
  assert.match(route,/scope_user_turn_id: text\(persistedProof\.scope_user_turn_id\) \|\| null/);
  assert.match(route,/userTurnId: persistedUserTurn\?\.id \|\| null/);
});


test("persisted diagnosis scope is checksummed before optional HMAC sealing",()=>{
  assert.match(route,/bindBusinessDiagnosisScopeChecksum\(persistenceBase\)/);
  assert.match(route,/sealBusinessDiagnosisProofAuthenticity\(checksummedPersistenceBase\)/);
  assert.match(route,/scope_checksum_contract:/);
  assert.match(route,/scope_checksum:/);
});


test("persisted diagnosis proof binds fingerprint of exact originating user content",()=>{
  assert.match(route,/scope_user_content_fingerprint: text\(userTurnId\) \? businessDiagnosisUserTurnContentFingerprint\(userTurnContent\) : null/);
  assert.match(route,/scope_user_content_fingerprint: text\(persistedProof\.scope_user_content_fingerprint\) \|\| null/);
  assert.match(route,/userTurnContent: message/);
});


test("originating diagnosis prompt fingerprint is not truncated below persisted text capacity",()=>{
  const auth=fs.readFileSync("lib/intelligence/runtime/AvantiqoBusinessDiagnosisProofAuthenticityRuntime.js","utf8");
  assert.match(auth,/const canonicalContent = String\(content \?\? ""\)\.trim\(\)/);
  assert.doesNotMatch(auth,/businessDiagnosisUserTurnContentFingerprint[\s\S]{0,250}text\(content, 12000\)/);
  const runtime=fs.readFileSync("lib/operator/runtime/IntelligenceConversationRuntime.js","utf8");
  assert.match(runtime,/const normalizedContent = text\(content\)/);
  assert.match(runtime,/content: normalizedContent/);
});


test("historical snapshot verification is transcript-aware for originating user content",()=>{
  const sanitizer=fs.readFileSync("lib/operator/runtime/BusinessDiagnosisConversationSanitizerRuntime.js","utf8");
  assert.match(sanitizer,/const userTurnsById = new Map/);
  assert.match(sanitizer,/verifyBusinessDiagnosisOriginatingUserTurn\(diagnosis, originatingUserTurn \|\| \{\}\)/);
  assert.match(sanitizer,/origin_user_verification_status/);
  assert.match(sanitizer,/origin_user_verified/);
});


test("recent conversation loader fetches missing paired user turns only as verification support",()=>{
  const runtime=fs.readFileSync("lib/operator/runtime/IntelligenceConversationRuntime.js","utf8");
  assert.match(runtime,/function diagnosisVerificationUserTurnIds/);
  assert.match(runtime,/loadMissingDiagnosisVerificationUserTurns/);
  assert.match(runtime,/\.eq\("role", "user"\)/);
  assert.match(runtime,/maxSupportRows = 24/);
  assert.match(runtime,/missingIds\.slice\(0, Math\.max\(1, Number\(maxSupportRows\) \|\| 24\)\)/);
  assert.match(runtime,/maxSupportRows: 24/);
  assert.match(runtime,/sanitizeBusinessDiagnosisConversation\(turns\.data \|\| \[\],[\s\S]*supportRows\)/);
});


test("historical snapshot loader fetches paired prompts across the 100-turn cutoff only as hidden verification support",()=>{
  const runtime=fs.readFileSync("lib/operator/runtime/IntelligenceConversationRuntime.js","utf8");
  assert.match(runtime,/const snapshotSupportRows = await loadMissingDiagnosisVerificationUserTurns/);
  assert.match(runtime,/maxSupportRows: 100/);
  assert.match(runtime,/sanitizeBusinessDiagnosisSnapshot\(visibleTurns,[\s\S]*snapshotSupportRows\)/);
  assert.doesNotMatch(runtime,/turns\.data\s*=\s*\[\.\.\.turns\.data,\s*\.\.\.snapshotSupportRows\]/);
});


test("historical snapshot returns the newest 100 turns in chronological display order",()=>{
  const runtime=fs.readFileSync("lib/operator/runtime/IntelligenceConversationRuntime.js","utf8");
  const snapshotStart=runtime.indexOf("export async function loadIntelligenceConversationSnapshot");
  const snapshot=runtime.slice(snapshotStart);
  assert.match(snapshot,/\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(snapshot,/\.order\("id", \{ ascending: false \}\)/);
  assert.match(snapshot,/\.limit\(100\)/);
  assert.match(snapshot,/const visibleTurns = \(turns\.data \|\| \[\]\)\.slice\(\)\.reverse\(\)/);
  assert.match(snapshot,/rows: visibleTurns/);
  assert.match(snapshot,/sanitizeBusinessDiagnosisSnapshot\(visibleTurns,/);
  assert.ok(snapshot.indexOf('.limit(100)') < snapshot.indexOf('const visibleTurns = (turns.data || []).slice().reverse()'));
});


test("verification support caps match each bounded surface",()=>{
  const runtime=fs.readFileSync("lib/operator/runtime/IntelligenceConversationRuntime.js","utf8");
  const recentStart=runtime.indexOf("async function loadVerifiedRecentConversationTurns");
  const snapshotStart=runtime.indexOf("export async function loadIntelligenceConversationSnapshot");
  const recent=runtime.slice(recentStart,snapshotStart);
  const snapshot=runtime.slice(snapshotStart);
  assert.match(recent,/maxSupportRows: 24/);
  assert.match(snapshot,/maxSupportRows: 100/);
  assert.doesNotMatch(recent,/maxSupportRows: 100/);
});


test("recent model context uses deterministic newest-first ordering before the 24-turn cutoff",()=>{
  const runtime=fs.readFileSync("lib/operator/runtime/IntelligenceConversationRuntime.js","utf8");
  const start=runtime.indexOf("async function loadVerifiedRecentConversationTurns");
  const end=runtime.indexOf("export async function loadOrCreateIntelligenceConversation",start);
  const recent=runtime.slice(start,end);
  assert.match(recent,/\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(recent,/\.order\("id", \{ ascending: false \}\)/);
  assert.match(recent,/\.limit\(24\)/);
  assert.ok(recent.indexOf('.order("created_at", { ascending: false })') < recent.indexOf('.order("id", { ascending: false })'));
  assert.ok(recent.indexOf('.order("id", { ascending: false })') < recent.indexOf('.limit(24)'));
});

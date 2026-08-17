#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  governanceSource,
  evidenceSource,
  turnSource,
  executionEngineSource,
  conversationRuntimeSource,
  ubteAuditSource,
] = await Promise.all([
  readFile("lib/operator/governance/operatorExecutionGovernance.js", "utf8"),
  readFile("lib/operator/governance/operatorAuthorizationEvidence.js", "utf8"),
  readFile("lib/operator/runtime/OperatorTurnRuntime.js", "utf8"),
  readFile("lib/ubte/runtime/ExecutionEngine.js", "utf8"),
  readFile("lib/operator/runtime/IntelligenceConversationRuntime.js", "utf8"),
  readFile("lib/ubte/runtime/engines/AuditEngine.js", "utf8"),
]);

assert.match(
  governanceSource,
  /export function resolveOperatorAuthorizationProvenance/,
  "Operator authorization provenance resolver must be exported",
);

for (const mode of [
  "read",
  "auto_execute",
  "user_confirmed",
  "approval_resumed",
]) {
  assert.ok(
    governanceSource.includes(`"${mode}"`),
    `Operator provenance must represent ${mode}`,
  );
}

assert.ok(
  governanceSource.includes('if (channel === "voice") return "user_confirmed";'),
  "Voice writes that reach the Operator audit must be attributed to explicit confirmation",
);
assert.ok(
  governanceSource.includes('if (explicitlyAutoExecutable) return "auto_execute";'),
  "Explicit auto-execute capabilities must not be attributed to user confirmation",
);
assert.ok(
  governanceSource.includes("approval?.resumed === true && approval?.allowed === true"),
  "Only an allowed exact approval resume may be attributed as approval_resumed",
);
assert.ok(
  governanceSource.includes("authorization_origin_mode: authorization.origin_mode"),
  "Approval resume must preserve original authorization provenance",
);
assert.ok(
  governanceSource.includes("conversationally_confirmed: authorization.conversationally_confirmed"),
  "Persisted audit must derive conversational confirmation from provenance",
);
assert.ok(
  governanceSource.includes('if (channel === "mission") return "mission_governed";'),
  "Mission audit must refuse to invent user confirmation when child contract evidence is absent",
);
assert.ok(
  governanceSource.includes("readOperatorAuthorizationEvidence(payload)"),
  "Operator audit must consume trusted UBTE runtime authorization evidence when present",
);
assert.ok(
  governanceSource.includes("authorization_evidence_source: runtimeEvidence"),
  "Operator audit must disclose whether provenance came from runtime evidence or conservative fallback",
);

assert.match(
  evidenceSource,
  /export function stampOperatorAuthorizationEvidence/,
  "UBTE must have a dedicated trusted authorization evidence writer",
);
assert.match(
  evidenceSource,
  /export function readOperatorAuthorizationEvidence/,
  "Operator governance must have a dedicated trusted authorization evidence reader",
);
assert.ok(
  evidenceSource.includes("propertyIsEnumerable.call(payload, EVIDENCE_KEY)"),
  "Authorization evidence must reject enumerable JSON/user/LLM payload properties",
);
assert.ok(
  evidenceSource.includes("enumerable: false"),
  "Trusted runtime authorization evidence must be non-enumerable and in-memory only",
);
assert.ok(
  evidenceSource.includes("sanitizedOperatorAuditPayload"),
  "Audit payload serialization must strip the reserved authorization evidence key",
);

assert.match(
  executionEngineSource,
  /function normalizedOperatorRuntimeMetadata/,
  "UBTE must normalize Operator authorization metadata at the execution boundary",
);
assert.match(
  executionEngineSource,
  /function isOperatorRuntime/,
  "UBTE must explicitly scope authorization normalization to Operator runtime calls",
);
assert.ok(
  executionEngineSource.includes('source.startsWith("AVANTIQO_OPERATOR_MISSION")'),
  "UBTE must normalize registered mission child execution as Operator runtime",
);
assert.ok(
  executionEngineSource.includes('text(current.parentCapabilityKey) === OPERATOR_MISSION_KEY'),
  "Mission child provenance must remain scoped to the registered Operator mission parent",
);
assert.ok(
  executionEngineSource.includes('if (mode === "read")'),
  "Read capabilities must force read provenance instead of inheriting write authorization",
);
assert.ok(
  executionEngineSource.includes("else if (missionChild)"),
  "Mission children must derive their own provenance from the child manifest",
);
assert.ok(
  executionEngineSource.includes('current.missionStepConfirmed === true'),
  "Mission user-confirmed provenance must require step-specific confirmation evidence",
);
assert.ok(
  !executionEngineSource.includes('current.operatorMissionConfirmed === true || current.missionStepConfirmed === true'),
  "A mission-wide confirmation flag must never authorize every later mission child",
);
assert.ok(
  executionEngineSource.includes('authorizationMode = "user_confirmed"'),
  "UBTE runtime metadata must represent explicit user confirmation",
);
assert.ok(
  executionEngineSource.includes('authorizationMode = "auto_execute"'),
  "UBTE runtime metadata must represent safe automatic execution",
);
assert.ok(
  executionEngineSource.includes('authorizationMode = "mission_governed"'),
  "Mission writes without step-specific confirmation evidence must stay conservative",
);
assert.ok(
  executionEngineSource.includes("stampOperatorAuthorizationEvidence(payload"),
  "UBTE must stamp trusted in-memory authorization evidence before capability execution",
);
assert.ok(
  executionEngineSource.includes("conversationallyConfirmed: originMode === \"user_confirmed\""),
  "Legacy conversational confirmation must be overwritten from derived provenance",
);
assert.ok(
  !executionEngineSource.includes("conversationallyConfirmed: true"),
  "UBTE execution boundary must never hardcode conversational confirmation true",
);

assert.match(
  conversationRuntimeSource,
  /async function loadPersistedAgreementState/,
  "Conversation persistence must load previous server-owned agreement state before provenance convergence",
);
assert.match(
  conversationRuntimeSource,
  /function pendingAuthorizationState/,
  "Conversation persistence must converge pending authorization state before writing agreement_state",
);
for (const requirement of [
  "user_confirmation",
  "durable_approval",
  "verification",
]) {
  assert.ok(
    conversationRuntimeSource.includes(`"${requirement}"`),
    `Pending execution must represent the ${requirement} requirement`,
  );
}
assert.ok(
  conversationRuntimeSource.includes("authorization_server_authoritative: true"),
  "Persisted pending provenance must be explicitly server authoritative",
);
assert.ok(
  conversationRuntimeSource.includes('previous.requirement === "user_confirmation"'),
  "A pending action may upgrade to user_confirmed only after advancing from the stored confirmation gate",
);
assert.ok(
  conversationRuntimeSource.includes("mode = null;\n    originMode = null;"),
  "Waiting-for-confirmation state must not falsely claim user_confirmed provenance",
);
assert.ok(
  conversationRuntimeSource.includes('resumeKind === "verification"'),
  "Verification resumes must be represented independently from the original action authorization",
);
assert.ok(
  conversationRuntimeSource.includes("parent_authorization_origin_mode"),
  "Verification state must retain the parent action origin when available",
);
assert.ok(
  conversationRuntimeSource.includes("previousStateAvailable: previousState.available"),
  "Provenance convergence must know whether previous server state was successfully loaded",
);
assert.ok(
  conversationRuntimeSource.includes('if (!previousStateAvailable) return "unresolved";'),
  "Missing previous server state must fail closed to unresolved provenance",
);
assert.ok(
  conversationRuntimeSource.includes("p_agreement_state: persistedAgreementState"),
  "Atomic assistant-turn persistence must write the converged server-owned agreement state",
);

assert.ok(
  !ubteAuditSource.includes("context.metadata"),
  "Generic UBTE audit must not persist unsanitized runtime metadata as authorization evidence",
);

const legacyTurnFlagPresent = turnSource.includes("conversationallyConfirmed: true");

console.log("OPERATOR_AUTHORIZATION_PROVENANCE_AUDIT=PASS");
console.log("OPERATOR_AUDIT_AUTHORIZATION=TRUSTED_RUNTIME_EVIDENCE_WITH_CONSERVATIVE_FALLBACK");
console.log("OPERATOR_RUNTIME_AUTHORIZATION=UBTE_BOUNDARY_NORMALIZED");
console.log("OPERATOR_RUNTIME_EVIDENCE=NON_ENUMERABLE_SERVER_ONLY");
console.log("OPERATOR_MISSION_CHILD_AUTHORIZATION=MANIFEST_DERIVED_STEP_SPECIFIC_CONFIRMATION_ONLY");
console.log("OPERATOR_PENDING_AUTHORIZATION=SERVER_PERSISTED_WITH_REQUIREMENT_AND_ORIGIN");
console.log("OPERATOR_PENDING_CONFIRMATION=NO_PREMATURE_USER_CONFIRMED_CLAIM");
console.log("OPERATOR_PENDING_APPROVAL=PRESERVES_OR_UPGRADES_PROVEN_ORIGIN");
console.log("OPERATOR_PENDING_VERIFICATION=READ_WITH_PARENT_ORIGIN");
console.log("OPERATOR_PENDING_STATE_LOAD_FAILURE=FAIL_CLOSED_UNRESOLVED");
console.log("OPERATOR_AUTHORIZATION_MODES=READ_AUTO_EXECUTE_USER_CONFIRMED_APPROVAL_RESUMED");
console.log("OPERATOR_APPROVAL_RESUME=ALLOWED_EXACT_REQUEST_ONLY");
console.log("OPERATOR_MISSION_UNKNOWN_CONFIRMATION=MISSION_GOVERNED_NOT_INVENTED");
console.log(
  `OPERATOR_LEGACY_TURN_FLAG=${legacyTurnFlagPresent ? "PRESENT_BUT_BOUNDARY_OVERRIDDEN" : "REMOVED"}`,
);
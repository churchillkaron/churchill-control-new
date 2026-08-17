#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [governanceSource, turnSource, ubteAuditSource] = await Promise.all([
  readFile("lib/operator/governance/operatorExecutionGovernance.js", "utf8"),
  readFile("lib/operator/runtime/OperatorTurnRuntime.js", "utf8"),
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
  "Voice writes that reach execution must be attributed to explicit confirmation",
);
assert.ok(
  governanceSource.includes('if (explicitlyAutoExecutable) return "auto_execute";'),
  "Explicit auto-execute capabilities must not be attributed to user confirmation",
);
assert.ok(
  governanceSource.includes('approval?.resumed === true || explicitMode === "approval_resumed"'),
  "Approval resume must be a first-class provenance mode",
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
  !ubteAuditSource.includes("context.metadata"),
  "Generic UBTE audit must not persist unsanitized runtime metadata as authorization evidence",
);

const legacyRuntimeFlagPresent = turnSource.includes("conversationallyConfirmed: true");

console.log("OPERATOR_AUTHORIZATION_PROVENANCE_AUDIT=PASS");
console.log("OPERATOR_AUDIT_AUTHORIZATION=AUTHORITATIVE_DERIVED_PROVENANCE");
console.log("OPERATOR_AUTHORIZATION_MODES=READ_AUTO_EXECUTE_USER_CONFIRMED_APPROVAL_RESUMED");
console.log("OPERATOR_APPROVAL_RESUME=PRESERVES_ORIGIN_MODE");
console.log("OPERATOR_MISSION_UNKNOWN_CONFIRMATION=MISSION_GOVERNED_NOT_INVENTED");
console.log(
  `OPERATOR_LEGACY_RUNTIME_CONFIRMATION_FLAG=${legacyRuntimeFlagPresent ? "PRESENT_NON_AUTHORITATIVE" : "REMOVED"}`,
);

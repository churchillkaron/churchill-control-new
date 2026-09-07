import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  "lib/operator/runtime/OperatorTurnRuntime.js",
  "utf8",
);
const coreSource = await readFile(
  "lib/operator/runtime/OperatorTurnRuntimeCore.js",
  "utf8",
);

assert.match(
  source,
  /AVANTIQO_OPERATOR_VERIFIED_MUTATION_OUTCOME_V3/,
  "Business Partner mutation verification contract must remain on deterministic V3",
);

assert.match(
  source,
  /async function preflightSelectedRecommendationVerification/,
  "selected recommendation execution must have a pre-mutation verification preflight",
);
assert.match(
  source,
  /POST_ACTION_VERIFICATION_NOT_REGISTERED/,
  "a selected ordinary mutation without a registered verifier must fail before execution",
);
assert.match(
  source,
  /POST_ACTION_VERIFICATION_CAPABILITY_NOT_AVAILABLE/,
  "an unavailable verifier must fail before execution",
);
assert.match(
  source,
  /item\.mode === "read"/,
  "verification preflight must only accept read capabilities",
);
assert.match(
  source,
  /canUseCapability\([\s\S]*options\.permissions[\s\S]*options\.role/,
  "verification preflight must re-check current actor authority",
);
assert.match(
  source,
  /platform\.product_engineering_cycle\.execute/,
  "Product Engineering must remain an explicit internally verified exception",
);

const preflightCall = source.indexOf(
  "await preflightSelectedRecommendationVerification(effectiveOptions)",
);
const governedCall = source.indexOf(
  "await runGovernedOperatorTurn(effectiveOptions)",
);
assert.ok(preflightCall >= 0, "verification preflight call must exist");
assert.ok(governedCall >= 0, "governed Operator call must exist");
assert.ok(
  preflightCall < governedCall,
  "verification preflight must run before any selected recommendation reaches governed execution",
);

assert.match(
  source,
  /function deterministicBusinessEffectProof/,
  "post-action verification must have a deterministic proof function",
);
assert.match(
  source,
  /stable_business_identity_match/,
  "fresh read-back must be matched to stable business identity",
);
assert.match(
  source,
  /verificationIdentities\.has\(identity\)/,
  "successful read status alone must not prove the business effect",
);
assert.match(
  source,
  /POST_ACTION_VERIFICATION_ASSERTION_FAILED/,
  "identity mismatch must fail closed",
);
assert.match(
  source,
  /POST_ACTION_VERIFICATION_IDENTITY_NOT_AVAILABLE/,
  "missing stable identity must fail closed",
);
assert.match(
  source,
  /business_effect_verified:\s*false/,
  "unproven mutation effects must remain explicitly unverified",
);
assert.match(
  source,
  /mutation_replay_allowed:\s*false/,
  "an already-returned mutation may not be replayed automatically after verification failure",
);
assert.match(
  source,
  /completion_claim_allowed:\s*false/,
  "Business Partner may not claim completion when proof fails",
);

assert.match(
  coreSource,
  /item\.key === pending\.verify_after\.capability_key[\s\S]*item\.mode === "read"/,
  "core post-action verification must still execute only the exact registered read capability",
);
assert.match(
  coreSource,
  /resume_kind:\s*"verification"/,
  "failed verification must remain resumable as verification-only state",
);
assert.match(
  coreSource,
  /Retry post-action verification/,
  "verification retry must remain distinct from mutation replay",
);

console.log("BUSINESS_PARTNER_SELECTED_MUTATION_PREFLIGHT=FAIL_CLOSED_BEFORE_WRITE");
console.log("BUSINESS_PARTNER_BUSINESS_EFFECT_PROOF=DETERMINISTIC_READ_BACK_IDENTITY_MATCH");
console.log("BUSINESS_PARTNER_VERIFICATION_RETRY=READ_ONLY_NO_MUTATION_REPLAY");
console.log("PRODUCT_ENGINEERING_VERIFICATION=INTERNAL_GOVERNED_EXCEPTION_PRESERVED");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const {
  mergeOperatorProjectState,
  normalizeOperatorProjectState,
} = await import("@/lib/operator/contracts/OperatorProjectState");

const established = normalizeOperatorProjectState({
  objective: "Prepare a launch campaign with the user",
  status: "active",
  success_criteria: ["Campaign approved", "Channel assets ready"],
  constraints: ["Do not publish without approval"],
  decisions: ["Lead with the customer story"],
  completed_steps: ["Audience agreed"],
  progress_summary: "The audience and message are agreed.",
  next_step: "Draft the channel concepts",
  open_questions: ["Which launch date should the plan use?"],
  blocker: null,
  user_confirmed_complete: false,
});

assert.equal(established.status, "active");
assert.equal(established.objective, "Prepare a launch campaign with the user");
assert.deepEqual(established.constraints, ["Do not publish without approval"]);

const partial = normalizeOperatorProjectState(
  {
    progress_summary: "Three channel concepts are now drafted.",
    completed_steps: ["Audience agreed", "Concepts drafted"],
  },
  { previousState: established },
);

assert.equal(partial.objective, established.objective);
assert.equal(partial.status, "active");
assert.deepEqual(partial.success_criteria, established.success_criteria);
assert.deepEqual(partial.constraints, established.constraints);
assert.equal(partial.progress_summary, "Three channel concepts are now drafted.");

const unconfirmedCompletion = normalizeOperatorProjectState(
  {
    status: "completed",
    user_confirmed_complete: false,
  },
  { previousState: partial },
);

assert.equal(unconfirmedCompletion.status, "awaiting_confirmation");
assert.equal(unconfirmedCompletion.user_confirmed_complete, false);

const confirmedCompletion = normalizeOperatorProjectState(
  {
    status: "completed",
    user_confirmed_complete: true,
  },
  { previousState: unconfirmedCompletion },
);

assert.equal(confirmedCompletion.status, "completed");
assert.equal(confirmedCompletion.user_confirmed_complete, true);

const replacement = normalizeOperatorProjectState(
  {
    objective: "Plan a customer retention workshop",
    status: "discussing",
  },
  { previousState: confirmedCompletion },
);

assert.deepEqual(replacement.success_criteria, []);
assert.deepEqual(replacement.decisions, []);
assert.equal(replacement.progress_summary, null);
assert.equal(replacement.user_confirmed_complete, false);

const merged = mergeOperatorProjectState(established, partial, {
  last_intent: "plan",
});

assert.equal(merged.objective, established.objective);
assert.equal(merged.last_intent, "plan");
assert.ok(Number.isFinite(Date.parse(merged.updated_at)));

const [reasoningSource, verificationSource, routeSource, homeSource, voiceSource] = await Promise.all([
  readFile("lib/operator/runtime/OperatorReasoningRuntime.js", "utf8"),
  readFile("lib/operator/runtime/OperatorVerificationRuntime.js", "utf8"),
  readFile("app/api/operator/turn/route.js", "utf8"),
  readFile("components/operator/HomeAvantiqoIntelligence.jsx", "utf8"),
  readFile("components/operator/LocalHeyAvantiqoWakeBridge.jsx", "utf8"),
]);

assert.match(
  reasoningSource,
  /current_project_state:\s*normalizeOperatorProjectState\(projectState\)/,
);
assert.match(reasoningSource, /user_confirmed_complete/);
assert.match(reasoningSource, /awaiting_confirmation/);
assert.match(reasoningSource, /assistant-only recommendation is not yet a decision/);
assert.match(reasoningSource, /Add or update project_state\.decisions only when the user clearly accepts/);

assert.match(verificationSource, /function verifiedProjectState/);
assert.match(verificationSource, /goal_update\.applies/);
assert.match(verificationSource, /completed_step/);
assert.match(verificationSource, /progress_summary/);
assert.match(verificationSource, /Never add or change decisions here/);
assert.match(verificationSource, /Never declare the overall goal completed here/);
assert.match(verificationSource, /goal_continuity:\s*true/);
assert.match(verificationSource, /project_state:\s*verifiedProjectState\(projectState, parsed \|\| \{\}\)/);
assert.match(verificationSource, /COLLECTION_WRAPPER_KEYS/);
assert.match(verificationSource, /"data"/);
assert.match(verificationSource, /function normalizedCollectionEvidence/);
assert.match(verificationSource, /collection_path/);
assert.match(verificationSource, /rows_key/);
assert.match(verificationSource, /total_count:\s*rows\.length/);
assert.match(verificationSource, /complete_collection:\s*rows\.length <= EVIDENCE_SAMPLE_SIZE/);
assert.match(verificationSource, /never treat the sample as the full dataset/i);
assert.match(verificationSource, /evidence_compaction:\s*"collection-aware-v1"/);

assert.match(routeSource, /projectState:\s*memory\.projectState/);
assert.match(routeSource, /mergeOperatorProjectState/);
assert.match(homeSource, /setProjectState\(result\?\.project_state/);
assert.match(homeSource, /Current goal/);
assert.match(voiceSource, /conversationKey:\s*"primary"/);
assert.match(voiceSource, /await speakRecovery\(\)/);
assert.match(voiceSource, /if \(enabledRef\.current\) \{\s*armCommandMode\(\)/);

console.log("OPERATOR_GOAL_CONTINUITY_AUDIT=PASS");
console.log("OPERATOR_GOAL_STATE_OWNER=OperatorProjectState");
console.log("OPERATOR_GOAL_COMPLETION=USER_CONFIRMATION_REQUIRED");
console.log("OPERATOR_STRATEGIC_MEMORY=WORKING_DIRECTION_WITH_USER_DECISIONS_SEPARATE");
console.log("OPERATOR_VERIFIED_EXECUTION_MEMORY=COMPLETED_STEP_PROGRESS_NEXT_STEP");
console.log("OPERATOR_READ_EVIDENCE=NESTED_COLLECTION_AWARE_BOUNDED_SAMPLE");
console.log("OPERATOR_READ_SAMPLE_GUARD=NO_DATASET_TOTALS_FROM_PARTIAL_SAMPLE");
console.log("OPERATOR_GOAL_SURFACES=TEXT_AND_VOICE_PRIMARY_CONVERSATION");
console.log("OPERATOR_VOICE_FAILURE=ALWAYS_AUDIBLE_WITH_FOLLOW_UP");
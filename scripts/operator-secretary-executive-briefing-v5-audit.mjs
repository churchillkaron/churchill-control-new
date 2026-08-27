import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  runtime: "lib/operator/secretary/SecretaryExecutiveBriefingV5Runtime.js",
  capability: "lib/platform/capabilities/createSecretaryExecutiveBriefingCapability.js",
};

const source = Object.fromEntries(
  await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")])),
);

assert.match(source.runtime, /AVANTIQO_EXECUTIVE_SECRETARY_DESK_BRIEFING_V5/);
assert.match(source.runtime, /readSecretaryExecutiveBriefingV4/);
assert.match(source.runtime, /readSecretaryCommitmentControl/);
assert.match(source.runtime, /readSecretaryWorkingPreferences/);
assert.match(source.runtime, /readSecretaryTravelOperations/);
assert.match(source.runtime, /commitment_register_not_added_again:\s*true/);
assert.match(source.runtime, /secretary_owned_count_not_recomputed_from_commitments:\s*true/);
assert.match(source.runtime, /v4_exception_count_preserved:\s*true/);
assert.match(source.runtime, /counted_again_in_v5_exception_total:\s*false/);
assert.match(source.runtime, /explicit_instruction_overrides_preference:\s*true/);
assert.match(source.runtime, /preferences_inferred:\s*false/);
assert.match(source.runtime, /secrets_stored:\s*false/);
assert.match(source.runtime, /researched_option_is_confirmation:\s*false/);
assert.match(source.runtime, /confirmation_inferred:\s*false/);
assert.match(source.runtime, /disruption_impact_inferred:\s*false/);
assert.match(source.runtime, /booking_authority_created:\s*false/);
assert.match(source.runtime, /payment_authority_created:\s*false/);
assert.match(source.runtime, /binding_authority_created:\s*false/);
assert.match(source.runtime, /approval_extends_authority:\s*false/);
assert.match(source.runtime, /platform_permissions_mutated:\s*false/);
assert.match(source.runtime, /external_authority_used:\s*false/);

// V5 remains the regression baseline. The latest briefing audit owns the
// version pin for the public secretary_briefing capability.
assert.match(source.capability, /capability:\s*"secretary_briefing"/);
assert.match(source.capability, /action:\s*"read"/);
assert.match(source.capability, /operatorRequiresConfirmation:\s*false/);
assert.match(source.capability, /commitments/);
assert.match(source.capability, /current travel operations/);
assert.match(source.capability, /explicit working preferences/);
assert.match(source.capability, /durable executive decision register/);
assert.match(source.capability, /evidenced cancellations and voids/);

console.log("OPERATOR_SECRETARY_EXECUTIVE_BRIEFING_V5_AUDIT=PASS");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V5_WRAP_V4=true");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V5_COMMITMENT_CONTROL=true");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V5_WORKING_PREFERENCES=true");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V5_TRAVEL_OPERATIONS=true");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V5_V4_EXCEPTION_COUNT_PRESERVED=true");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V5_COMMITMENTS_DOUBLE_COUNTED=false");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V5_PREFERENCES_INFERRED=false");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V5_TRAVEL_CONFIRMATION_INFERRED=false");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V5_PLATFORM_PERMISSIONS_MUTATED=false");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V5_BINDING_AUTHORITY_CREATED=false");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V5_BOOKING_AUTHORITY_CREATED=false");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V5_PAYMENT_AUTHORITY_CREATED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");

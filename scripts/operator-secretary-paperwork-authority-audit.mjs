import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const authorityPolicy = await readFile(
  "lib/operator/secretary/SecretaryPaperworkAuthorityPolicy.js",
  "utf8",
);
const preparationRuntime = await readFile(
  "lib/operator/secretary/SecretaryPaperworkExecutionPreparationRuntime.js",
  "utf8",
);
const workerRoute = await readFile(
  "app/api/internal/secretary/jobs/process/route.js",
  "utf8",
);

const policyModule = await import("../lib/operator/secretary/SecretaryPaperworkAuthorityPolicy.js");
const requiresApproval = policyModule.secretaryPaperworkInstructionRequiresExactApproval;

for (const instruction of [
  "Submit the completed permit application to the authority",
  "File this tax return with the tax office",
  "Lodge the registration form with the government agency",
  "Sign the agreement on behalf of the company",
  "Execute this contract and send it back",
  "Certify this declaration for the application",
  "Accept the supplier terms and conditions",
  "Agree to the settlement terms",
  "Pay the application fee",
  "Transfer the filing fee to the authority",
  "Use the banking credential to submit the payment",
]) {
  assert.equal(requiresApproval(instruction), true, instruction);
}

for (const instruction of [
  "Prepare the permit application for review",
  "Draft the tax return but do not file it",
  "Review the agreement and identify missing fields",
  "Request the signed document from the responsible contact",
  "Chase the reviewer for feedback",
  "Assemble the filing package for executive approval",
  "Compare the application fee options without paying anything",
]) {
  assert.equal(requiresApproval(instruction), false, instruction);
}

assert.match(authorityPolicy, /BINDING_SUBMISSION_PATTERN/);
assert.match(authorityPolicy, /SIGNATURE_OR_ATTESTATION_PATTERN/);
assert.match(authorityPolicy, /ACCEPTANCE_PATTERN/);
assert.match(authorityPolicy, /PAYMENT_PATTERN/);
assert.match(authorityPolicy, /CREDENTIAL_PATTERN/);
assert.match(authorityPolicy, /THIS_STEP_ONLY/);
assert.match(authorityPolicy, /future_steps_authorized === false/);
assert.match(authorityPolicy, /authority_not_extended === true/);

assert.match(preparationRuntime, /PAPERWORK_COORDINATION/);
assert.match(preparationRuntime, /secretaryPaperworkInstructionRequiresExactApproval/);
assert.match(preparationRuntime, /secretaryPaperworkStepHasExactApproval/);
assert.match(preparationRuntime, /status:\s*"APPROVAL_REQUIRED"/);
assert.match(preparationRuntime, /requires_approval:\s*true/);
assert.match(preparationRuntime, /DETERMINISTIC_PAPERWORK_AUTHORITY_GATE/);
assert.match(preparationRuntime, /future_steps_authorized:\s*false/);
assert.match(preparationRuntime, /authority_not_extended:\s*true/);
assert.match(preparationRuntime, /binding_submission_authority_created:\s*false/);
assert.match(preparationRuntime, /signature_authority_created:\s*false/);
assert.match(preparationRuntime, /legal_acceptance_authority_created:\s*false/);
assert.match(preparationRuntime, /payment_authority_created:\s*false/);
assert.match(preparationRuntime, /external_authority_used:\s*false/);

assert.match(workerRoute, /prepareSecretaryPaperworkExecution/);
assert.match(workerRoute, /await prepareSecretaryPaperworkExecution/);
assert.match(workerRoute, /processNextSecretaryJob/);
assert.ok(
  workerRoute.indexOf("await prepareSecretaryPaperworkExecution")
    < workerRoute.indexOf("processNextSecretaryJob({ workerId"),
  "paperwork preparation must run before Secretary job claim/execution",
);
assert.match(workerRoute, /AVANTIQO_SECRETARY_AUTONOMOUS_JOB_WORKER_V2/);

console.log("OPERATOR_SECRETARY_PAPERWORK_AUTHORITY_AUDIT=PASS");
console.log("SECRETARY_PAPERWORK_BINDING_SUBMISSION_GATE=true");
console.log("SECRETARY_PAPERWORK_SIGNATURE_GATE=true");
console.log("SECRETARY_PAPERWORK_ACCEPTANCE_GATE=true");
console.log("SECRETARY_PAPERWORK_FEE_PAYMENT_GATE=true");
console.log("SECRETARY_PAPERWORK_CREDENTIAL_GATE=true");
console.log("SECRETARY_PAPERWORK_PREPARE_WITHOUT_SUBMIT_ALLOWED=true");
console.log("SECRETARY_PAPERWORK_EXACT_STEP_APPROVAL=true");
console.log("SECRETARY_PAPERWORK_AUTHORITY_NOT_EXTENDED=true");
console.log("SECRETARY_PAPERWORK_PREPARED_BEFORE_WORKER_CLAIM=true");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");

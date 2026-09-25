import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  deterministicExplicitBusinessMutationUnderstanding,
} from "../lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js";

test("explicit Moonshine invoice request cannot be downgraded to chat", () => {
  const result = deterministicExplicitBusinessMutationUnderstanding(
    "can you make new invoice for moonshine, Monday due date and invoice date, and then previous Thursday and Sunday same as the last one",
  );

  assert.equal(result?.route, "governed");
  assert.equal(result?.execution_domain, "business");
  assert.equal(result?.requires_mutation, true);
  assert.equal(result?.action_shape, "single");
  assert.equal(
    result?.deterministic_capability_key,
    "finance.accounts_receivable.CreateCustomerInvoice",
  );
  assert.equal(result?.continuity_required, true);
});

test("simple invoice creation is also a governed mutation", () => {
  const result = deterministicExplicitBusinessMutationUnderstanding(
    "Create an invoice for Moonshine",
  );
  assert.equal(result?.route, "governed");
  assert.equal(result?.requires_mutation, true);
  assert.equal(
    result?.deterministic_capability_key,
    "finance.accounts_receivable.CreateCustomerInvoice",
  );
});

test("explicit negation never grants invoice mutation routing", () => {
  assert.equal(
    deterministicExplicitBusinessMutationUnderstanding(
      "Do not create an invoice for Moonshine",
    ),
    null,
  );
});

test("governed synthetic runtime defines deterministic exact-action guard", () => {
  const source = fs.readFileSync(
    "lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js",
    "utf8",
  );
  assert.match(source, /const deterministicExactAction = Boolean\(/);
  assert.match(source, /deterministic_capability_key/);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const home = fs.readFileSync(
  new URL("../components/operator/HomeAvantiqoIntelligence.jsx", import.meta.url),
  "utf8",
);
const floating = fs.readFileSync(
  new URL("../components/operator/AvantiqoOperator.jsx", import.meta.url),
  "utf8",
);
const presenter = fs.readFileSync(
  new URL("../lib/operator/presentation/OperatorExecutionStatePresentation.js", import.meta.url),
  "utf8",
);

test("Business Partner surfaces share one evidence-driven execution-state presenter", () => {
  for (const source of [home, floating]) {
    assert.match(
      source,
      /operatorExecutionStatePresentation/,
      "each Business Partner surface must use the shared presenter",
    );
    assert.doesNotMatch(
      source,
      /function executionEvidence\s*\(/,
      "surfaces must not carry a private execution-state implementation",
    );
  }
});

test("shared execution-state presenter remains presentation-only", () => {
  assert.match(
    presenter,
    /contract:\s*"AVANTIQO_OPERATOR_EXECUTION_STATE_PRESENTATION_V1"/,
  );
  assert.match(presenter, /authorization_effect:\s*"NONE"/);
  assert.match(presenter, /label:\s*"Awaiting confirmation"/);
  assert.match(presenter, /label:\s*"Awaiting approval"/);
  assert.match(presenter, /label:\s*"Verified complete"/);
  assert.match(presenter, /label:\s*"Not completed"/);
  assert.match(presenter, /label:\s*"Completed check"/);
});

test("Verified complete requires an explicit server-owned business-effect verdict", () => {
  assert.match(
    presenter,
    /if \(execution\?\.business_effect_verified === true\)/,
  );
  assert.doesNotMatch(
    presenter,
    /business_effect_verified === true\s*\|\|\s*verificationStatus === "completed"/,
  );
  assert.match(
    presenter,
    /verification read completed, but no business mutation is presented as verified/,
  );
});

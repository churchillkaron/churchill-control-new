import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync(
  "app/api/operator/turn/route.js",
  "utf8",
);

test("Operator text entrypoint stays on the certified Intelligence runtime", () => {
  assert.match(
    route,
    /runSyntheticIntelligenceTurn[\s\S]*SyntheticIntelligenceTurnRuntime/,
  );
  assert.match(route, /runSyntheticIntelligenceTurn\(\{/);
  assert.match(route, /agreementState:\s*agreementState/);
  assert.match(route, /projectState:\s*effectiveProjectState/);
  assert.match(route, /longTermMemory/);
  assert.match(route, /callerRequest:\s*request/);
});

test("Operator entrypoint keeps authorization state server-authoritative", () => {
  assert.match(
    route,
    /const agreementState = object\(memory\.agreementState\)/,
  );
  assert.doesNotMatch(
    route,
    /agreementState\s*=\s*object\(body\.(?:agreementState|agreement_state)\)/,
  );
  assert.match(route, /authorization_recovered:\s*false/);
  assert.match(route, /mutable_business_evidence_recovered:\s*false/);
});

test("unexpected Operator route failures do not leak internal exception messages", () => {
  assert.match(route, /Avantiqo conversation load failed/);
  assert.match(
    route,
    /Avantiqo Intelligence is temporarily unavailable\. Please retry shortly\./,
  );
  assert.match(route, /const isClientError = status >= 400 && status < 500/);
  assert.doesNotMatch(
    route,
    /error\?\.message \|\| "Avantiqo Operator failed"/,
  );
});

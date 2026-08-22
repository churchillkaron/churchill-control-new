import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../scripts/avantiqo-intelligence-economics.mjs", import.meta.url),
  "utf8",
);

assert.match(source, /AVANTIQO_INTELLIGENCE_ECONOMICS_V1/);
assert.match(source, /INTELLIGENCE_ECONOMICS_REQUIRES_PASSED_CERTIFICATION/);
assert.match(source, /AVANTIQO_INTELLIGENCE_GPU_USD_PER_HOUR_REQUIRED/);
assert.match(source, /target_utilization/);
assert.match(source, /economics_certified:\s*false/);
assert.match(source, /MEASUREMENT_ONLY_REQUIRES_QUALITY_EQUIVALENCE_AND_PRICING_REVIEW/);
assert.match(source, /pricing_activation_performed:\s*false/);
assert.match(source, /provider_selection_changed:\s*false/);
assert.match(source, /production_deploy_performed:\s*false/);
assert.match(source, /activation_allowed:\s*false/);
assert.doesNotMatch(source, /PRODUCTION_CERTIFIED/);

console.log("PASS Avantiqo Intelligence economics remains measurement-only");

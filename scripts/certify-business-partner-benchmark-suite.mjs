import {
  loadBusinessPartnerBenchmarkSuite,
  validateBusinessPartnerBenchmarkSuite,
} from "../lib/intelligence/runtime/AvantiqoBusinessPartnerBenchmarkEvidenceRuntime.mjs";

const suite = loadBusinessPartnerBenchmarkSuite();
const result = validateBusinessPartnerBenchmarkSuite(suite);

console.log(JSON.stringify({
  contract: suite.contract,
  status: result.valid ? "CERTIFIED" : "FAILED",
  ...result,
}, null, 2));

if (!result.valid) process.exitCode = 1;

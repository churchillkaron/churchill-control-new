import fs from "node:fs";

import {
  evaluateBusinessPartnerBenchmarkEvidence,
} from "../lib/intelligence/runtime/AvantiqoBusinessPartnerBenchmarkEvidenceRuntime.mjs";

const path = process.env.AVANTIQO_BUSINESS_PARTNER_BENCHMARK_EVIDENCE ||
  "benchmarks/business-partner/latest-evidence.json";

if (!fs.existsSync(path)) {
  throw new Error("BUSINESS_PARTNER_BENCHMARK_EVIDENCE_REQUIRED:" + path);
}

const report = JSON.parse(fs.readFileSync(path, "utf8"));
const result = evaluateBusinessPartnerBenchmarkEvidence({ report });
console.log(JSON.stringify(result, null, 2));

if (!result.release_eligible) {
  throw new Error("BUSINESS_PARTNER_BENCHMARK_FLOOR_NOT_MET");
}

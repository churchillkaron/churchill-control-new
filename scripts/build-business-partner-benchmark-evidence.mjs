import fs from "node:fs/promises";

import {
  scoreBusinessPartnerBenchmarkCase,
} from "../lib/intelligence/runtime/AvantiqoBusinessPartnerDeterministicBenchmarkScorer.mjs";
import {
  evaluateBusinessPartnerBenchmarkEvidence,
} from "../lib/intelligence/runtime/AvantiqoBusinessPartnerBenchmarkEvidenceRuntime.mjs";

const SUITE_PATH = "benchmarks/business-partner/suite.v1.json";
const EXPECTATIONS_PATH = "benchmarks/business-partner/expectations.v1.json";
const CANDIDATE_PATH =
  process.env.AVANTIQO_BP_CANDIDATE_RAW || "artifacts/business-partner-candidate-raw.json";
const REFERENCES_PATH =
  process.env.AVANTIQO_BP_REFERENCE_RAW || "artifacts/business-partner-reference-raw.json";
const OUTPUT_PATH =
  process.env.AVANTIQO_BP_BENCHMARK_EVIDENCE_OUTPUT || "artifacts/business-partner-benchmark-evidence.json";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function text(value, limit = 1000) {
  return String(value ?? "").trim().slice(0, limit);
}
function indexByCase(items = []) {
  return new Map((Array.isArray(items) ? items : []).map((item) => [text(item.case_id, 160), item]));
}
function referenceIndex(items = []) {
  const index = {};
  for (const family of ["chatgpt", "claude", "gemini"]) index[family] = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const family = text(item.family, 80);
    if (!index[family]) continue;
    index[family].set(text(item.case_id, 160), item);
  }
  return index;
}

const suite = JSON.parse(await fs.readFile(SUITE_PATH, "utf8"));
const expectations = JSON.parse(await fs.readFile(EXPECTATIONS_PATH, "utf8"));
const candidateRaw = JSON.parse(await fs.readFile(CANDIDATE_PATH, "utf8"));
const referenceRaw = JSON.parse(await fs.readFile(REFERENCES_PATH, "utf8"));

if (candidateRaw.contract !== "AVANTIQO_BUSINESS_PARTNER_CANDIDATE_RAW_V1") {
  throw new Error("BUSINESS_PARTNER_CANDIDATE_RAW_CONTRACT_INVALID");
}
if (referenceRaw.contract !== "AVANTIQO_BUSINESS_PARTNER_REFERENCE_RAW_V1") {
  throw new Error("BUSINESS_PARTNER_REFERENCE_RAW_CONTRACT_INVALID");
}

const candidateByCase = indexByCase(candidateRaw.cases);
const refsByFamily = referenceIndex(referenceRaw.cases);
const evidencePacketHash = text(candidateRaw.evidence_packet_sha256, 80);
const sameEvidencePacket =
  Boolean(evidencePacketHash) &&
  evidencePacketHash === text(referenceRaw.evidence_packet_sha256, 80);
const sameProtocol =
  text(candidateRaw.protocol_contract, 180) === text(referenceRaw.protocol_contract, 180);
const sameSuite =
  text(candidateRaw.suite_contract, 180) === text(referenceRaw.suite_contract, 180) &&
  text(candidateRaw.suite_contract, 180) === text(suite.contract, 180);

const scoredCandidate = [];
const scoredReferences = { chatgpt: [], claude: [], gemini: [] };

for (const suiteCase of suite.cases || []) {
  const caseId = text(suiteCase.id, 160);
  const expectation = object(object(expectations.cases)[caseId]);
  if (!Object.keys(expectation).length) {
    throw new Error("BUSINESS_PARTNER_EXPECTATION_MISSING:" + caseId);
  }

  const candidateMeasurement = candidateByCase.get(caseId);
  if (!candidateMeasurement) {
    throw new Error("BUSINESS_PARTNER_CANDIDATE_CASE_MISSING:" + caseId);
  }
  scoredCandidate.push(scoreBusinessPartnerBenchmarkCase({
    suiteCase,
    expectation,
    measurement: candidateMeasurement,
  }));

  for (const family of ["chatgpt", "claude", "gemini"]) {
    const measurement = refsByFamily[family].get(caseId);
    if (!measurement) {
      throw new Error("BUSINESS_PARTNER_REFERENCE_CASE_MISSING:" + family + ":" + caseId);
    }
    scoredReferences[family].push(scoreBusinessPartnerBenchmarkCase({
      suiteCase,
      expectation,
      measurement,
    }));
  }
}

const generatedAt = new Date().toISOString();
const report = {
  contract: "AVANTIQO_BUSINESS_PARTNER_BENCHMARK_EVIDENCE_V1",
  generated_at: generatedAt,
  matched_conditions: sameSuite && sameProtocol && sameEvidencePacket,
  same_case_prompts: candidateRaw.same_case_prompts === true && referenceRaw.same_case_prompts === true,
  same_evidence_packets: sameEvidencePacket,
  same_tool_contracts: sameProtocol && sameEvidencePacket,
  hidden_expected_outcomes_not_exposed:
    candidateRaw.hidden_expected_outcomes_not_exposed === true &&
    referenceRaw.hidden_expected_outcomes_not_exposed !== false,
  suite_contract: suite.contract,
  protocol_contract: candidateRaw.protocol_contract,
  evidence_packet_sha256: evidencePacketHash,
  candidate: {
    model: candidateRaw.model || null,
    measured_at: candidateRaw.generated_at || null,
    cases: scoredCandidate,
  },
  references: {
    chatgpt: {
      model: referenceRaw.models?.chatgpt || null,
      measured_at: referenceRaw.generated_at || null,
      cases: scoredReferences.chatgpt,
    },
    claude: {
      model: referenceRaw.models?.claude || null,
      measured_at: referenceRaw.generated_at || null,
      cases: scoredReferences.claude,
    },
    gemini: {
      model: referenceRaw.models?.gemini || null,
      measured_at: referenceRaw.generated_at || null,
      cases: scoredReferences.gemini,
    },
  },
};

const evaluation = evaluateBusinessPartnerBenchmarkEvidence({ report });
const output = {
  ...report,
  evaluation,
  release_eligible: evaluation.release_eligible,
};

await fs.mkdir("artifacts", { recursive: true });
await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");

console.log(JSON.stringify({
  output_path: OUTPUT_PATH,
  generated_at: generatedAt,
  matched_conditions: output.matched_conditions,
  release_eligible: output.release_eligible,
  candidate_scores: evaluation.candidate_scores,
  floor_scores: evaluation.floor?.floor_scores || null,
  regressions: evaluation.floor?.regressions || [],
}, null, 2));

if (!output.release_eligible) process.exitCode = 1;

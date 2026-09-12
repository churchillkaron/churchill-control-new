import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  attestCodeAICompetitiveReferenceReport,
  validateCodeAICompetitiveReferenceReportShape,
} from "../lib/code/runtime/CodeAICompetitiveReferenceAttestationRuntime.js";

const DEFAULT_SUITE = "benchmarks/avantiqo-code-frontier-engineering-suite.json";
const DEFAULT_PROMPT_CONTRACT = "benchmarks/avantiqo-code-frontier-prompt-contract.json";
const SUITE_CONTRACT = "AVANTIQO_CODE_FRONTIER_ENGINEERING_SUITE_V1";
const PROMPT_CONTRACT = "AVANTIQO_CODE_FRONTIER_PROMPT_CONTRACT_V1";

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const sha256 = (value) => createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");

const inputPath = resolve(text(process.env.AVANTIQO_CODE_COMPETITIVE_REFERENCE_INPUT));
if (!text(process.env.AVANTIQO_CODE_COMPETITIVE_REFERENCE_INPUT)) {
  throw new Error("AVANTIQO_CODE_COMPETITIVE_REFERENCE_INPUT_REQUIRED");
}
const outputPath = resolve(
  text(process.env.AVANTIQO_CODE_COMPETITIVE_REFERENCE_OUTPUT) ||
    `${inputPath}.attested.json`,
);
const suitePath = resolve(text(process.env.AVANTIQO_CODE_COMPETITIVE_SUITE) || DEFAULT_SUITE);
const promptContractPath = resolve(text(process.env.AVANTIQO_CODE_COMPETITIVE_PROMPT_CONTRACT) || DEFAULT_PROMPT_CONTRACT);

const suiteSource = await readFile(suitePath, "utf8");
const suite = JSON.parse(suiteSource);
if (text(suite?.contract) !== SUITE_CONTRACT) {
  throw new Error("AVANTIQO_CODE_COMPETITIVE_SUITE_CONTRACT_INVALID");
}
const requiredCaseIds = list(suite?.cases)
  .map((item) => text(item?.case_id))
  .filter(Boolean)
  .sort();
const suiteSha256 = sha256(suiteSource);
const promptContractSource = await readFile(promptContractPath, "utf8");
const promptContract = JSON.parse(promptContractSource);
if (text(promptContract?.contract) !== PROMPT_CONTRACT) {
  throw new Error("AVANTIQO_CODE_COMPETITIVE_PROMPT_CONTRACT_INVALID");
}
const promptContractSha256 = sha256(promptContractSource);
const unsigned = JSON.parse(await readFile(inputPath, "utf8"));

validateCodeAICompetitiveReferenceReportShape(unsigned, {
  suite_contract: SUITE_CONTRACT,
  suite_sha256: suiteSha256,
  prompt_contract: PROMPT_CONTRACT,
  prompt_contract_sha256: promptContractSha256,
  required_case_ids: requiredCaseIds,
});
const attested = attestCodeAICompetitiveReferenceReport(unsigned);
await writeFile(outputPath, `${JSON.stringify(attested, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  success: true,
  contract: attested.attestation?.contract || null,
  output_path: outputPath,
  provider: text(attested.provider || attested?.model?.provider) || null,
  model: text(attested?.model?.product_model || attested?.model?.runtime_model || attested?.model) || null,
  suite_sha256: suiteSha256,
  prompt_contract_sha256: promptContractSha256,
  case_count: requiredCaseIds.length,
  provider_execution_performed: attested.provider_execution_performed === true,
  raw_reasoning_persisted: attested.raw_reasoning_persisted === true,
  production_deploy_performed: false,
  runtime_provider_effect: "NONE",
}, null, 2));

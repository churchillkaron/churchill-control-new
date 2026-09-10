import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as modal from "modal";

const CONTRACT = "AVANTIQO_DOCUMENT_VISION_CERTIFICATION_V1";
const MODEL = "Qwen/Qwen2.5-VL-7B-Instruct";
const APP = "avantiqo-image-owned";
const FUNCTION = "generate";
const TIMEOUT_MS = 12 * 60 * 1000;
const POLL_MS = 2000;

function text(value) { return String(value ?? "").trim(); }
function sleep(ms) { return new Promise((resolvePromise) => setTimeout(resolvePromise, ms)); }
function normalize(value) { return text(value).toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim(); }
function flatten(value) {
  if (Array.isArray(value)) return value.flatMap(flatten);
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, child]) => [key, ...flatten(child)]);
  return [String(value ?? "")];
}
function contains(value, expected) {
  return normalize(flatten(value).join(" ")).includes(normalize(expected));
}
function fixtureUrl() {
  const explicit = text(process.env.AVANTIQO_DOCUMENT_VISION_FIXTURE_URL);
  if (explicit) return explicit;
  const repository = text(process.env.GITHUB_REPOSITORY) || "churchillkaron/churchill-control-new";
  const revision = text(process.env.GITHUB_SHA) || "main";
  return `https://raw.githubusercontent.com/${repository}/${revision}/tests/fixtures/avantiqo-document-vision-certification.png`;
}

async function waitForResult(client, call) {
  const deadline = Date.now() + TIMEOUT_MS;
  for (;;) {
    if (Date.now() >= deadline) throw new Error(`${CONTRACT}_TIMEOUT`);
    const same = await client.functionCalls.fromId(call.functionCallId);
    try { return await same.get({ timeoutMs: 0 }); }
    catch (error) {
      if (error instanceof modal.FunctionTimeoutError && /Timeout exceeded:\s*0ms/i.test(text(error?.message))) {
        await sleep(POLL_MS);
        continue;
      }
      throw error;
    }
  }
}

const cases = [
  ["ai.image.analyze", "Inspect the document. Return strict JSON with visible_title, certification_id, document_type, account_name, date, opening_balance, credit, closing_balance, confidence."],
  ["document.ocr", "Extract every visible line faithfully. Return strict JSON with text, fields, and confidence. Preserve numbers and dates exactly."],
  ["document.classify", "Classify this document from visible evidence. Return strict JSON with document_type, confidence, candidate_domains, and key_fields. Use bank_statement only if the evidence proves it."],
];

const tokenId = text(process.env.MODAL_TOKEN_ID || process.env.AVANTIQO_MODAL_TOKEN_ID);
const tokenSecret = text(process.env.MODAL_TOKEN_SECRET || process.env.AVANTIQO_MODAL_TOKEN_SECRET);
if (!tokenId || !tokenSecret) throw new Error(`${CONTRACT}_MODAL_CREDENTIALS_REQUIRED`);
const environment = text(process.env.AVANTIQO_MODAL_ENVIRONMENT || process.env.MODAL_ENVIRONMENT);
const client = new modal.ModalClient({ tokenId, tokenSecret });
const worker = await client.functions.fromName(APP, FUNCTION, environment ? { environment } : {});
const source = fixtureUrl();
const observations = [];

for (const [requestedCapability, instruction] of cases) {
  const started = performance.now();
  const payload = {
    contract: "AVANTIQO_IMAGE_ENGINE_V1",
    capability: "ai.image.analyze",
    model: "avantiqo-image-v1",
    instruction,
    source_assets: [source],
    source_asset_roles: { source_image: source },
    organization_id: "benchmark-only",
    usage_id: `benchmark-document-vision-${requestedCapability}`,
    certification_execution: true,
  };
  const call = await worker.spawn([payload]);
  if (!text(call.functionCallId)) throw new Error(`${CONTRACT}_CALL_ID_REQUIRED`);
  const output = await waitForResult(client, call);
  const evidence = output?.result || output?.output?.result || null;
  const baseChecks = [
    contains(evidence, "AVQ-DOC-2026-0910"),
    contains(evidence, "CERTIFICATION TEST COMPANY"),
    contains(evidence, "2026-09-10"),
    contains(evidence, "1250.00") || contains(evidence, "1250"),
    output?.raw_reasoning_persisted === false,
    text(output?.provider) === "avantiqo-image",
    text(output?.foundation_model) === MODEL,
  ];
  const specific = requestedCapability === "document.classify"
    ? (contains(evidence, "bank_statement") || contains(evidence, "bank statement"))
    : contains(evidence, "1000.00") || contains(evidence, "1000");
  observations.push({
    requested_capability: requestedCapability,
    execution_capability: "ai.image.analyze",
    foundation_model: text(output?.foundation_model),
    wall_ms: Math.round(performance.now() - started),
    worker_seconds: Number(output?.generation_seconds || output?.modal_elapsed_seconds) || null,
    structured_visual_evidence: output?.structured_visual_evidence === true,
    raw_reasoning_persisted: output?.raw_reasoning_persisted,
    passed: baseChecks.every(Boolean) && specific,
    evidence,
  });
}

const report = {
  contract: CONTRACT,
  generated_at: new Date().toISOString(),
  fixture_url: source,
  provider: "avantiqo-image",
  model: MODEL,
  measured_capabilities: cases.map(([capability]) => capability),
  summary: { passed: observations.every((item) => item.passed), runs: observations.length },
  observations,
  activation_allowed: false,
  pricing_activation_performed: false,
};
const outputPath = resolve(process.env.AVANTIQO_DOCUMENT_VISION_BENCHMARK_OUTPUT || "/tmp/avantiqo-document-vision-certification.json");
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ success: report.summary.passed, output_path: outputPath, summary: report.summary }, null, 2));
if (!report.summary.passed) process.exitCode = 2;

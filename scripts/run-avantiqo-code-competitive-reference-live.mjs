import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import OpenAI from "openai";
import {
  runCodeAICompetitiveReferenceLiveBenchmark,
} from "../lib/code/runtime/CodeAICompetitiveReferenceLiveRunnerRuntime.js";

const SUITE_PATH = resolve(process.env.AVANTIQO_CODE_COMPETITIVE_SUITE || "benchmarks/avantiqo-code-frontier-engineering-suite.json");
const PROMPT_PATH = resolve(process.env.AVANTIQO_CODE_COMPETITIVE_PROMPT_CONTRACT || "benchmarks/avantiqo-code-frontier-prompt-contract.json");
const OUTPUT_PATH = resolve(process.env.AVANTIQO_CODE_COMPETITIVE_REFERENCE_OUTPUT || "/tmp/avantiqo-code-competitive-reference.json");
const text = (value) => String(value ?? "").trim();
const approved = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
const sha256 = (value) => createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

if (!approved(process.env.AVANTIQO_CODE_COMPETITIVE_LIVE_REFERENCE_APPROVED)) {
  throw new Error("AVANTIQO_CODE_COMPETITIVE_LIVE_REFERENCE_APPROVED=YES_REQUIRED");
}
const provider = text(process.env.AVANTIQO_CODE_COMPETITIVE_REFERENCE_PROVIDER).toLowerCase();
const model = text(process.env.AVANTIQO_CODE_COMPETITIVE_REFERENCE_MODEL);
if (!new Set(["openai", "anthropic"]).has(provider)) {
  throw new Error("AVANTIQO_CODE_COMPETITIVE_REFERENCE_PROVIDER_INVALID");
}
if (!model) throw new Error("AVANTIQO_CODE_COMPETITIVE_REFERENCE_MODEL_REQUIRED");
const inputUsdPer1m = number(process.env.AVANTIQO_CODE_COMPETITIVE_REFERENCE_INPUT_USD_PER_1M);
const outputUsdPer1m = number(process.env.AVANTIQO_CODE_COMPETITIVE_REFERENCE_OUTPUT_USD_PER_1M);
if (!(inputUsdPer1m >= 0) || !(outputUsdPer1m >= 0)) {
  throw new Error("AVANTIQO_CODE_COMPETITIVE_REFERENCE_PRICING_REQUIRED");
}

const suiteSource = await readFile(SUITE_PATH, "utf8");
const promptSource = await readFile(PROMPT_PATH, "utf8");
const suite = JSON.parse(suiteSource);
const promptContract = JSON.parse(promptSource);

function costFor(inputTokens, outputTokens) {
  return Number((((inputTokens * inputUsdPer1m) + (outputTokens * outputUsdPer1m)) / 1_000_000).toFixed(8));
}

let executeProvider;
if (provider === "openai") {
  const apiKey = text(process.env.OPENAI_API_KEY);
  if (!apiKey) throw new Error("OPENAI_API_KEY_REQUIRED_FOR_COMPETITIVE_REFERENCE");
  const client = new OpenAI({ apiKey });
  executeProvider = async ({ prompt }) => {
    const startedAt = Date.now();
    const response = await client.responses.create({
      model,
      input: prompt,
      reasoning: { effort: "high" },
    });
    const inputTokens = Number(response?.usage?.input_tokens || 0);
    const outputTokens = Number(response?.usage?.output_tokens || 0);
    return {
      text: text(response?.output_text),
      wall_ms: Date.now() - startedAt,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costFor(inputTokens, outputTokens),
    };
  };
} else {
  const apiKey = text(process.env.ANTHROPIC_API_KEY);
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY_REQUIRED_FOR_COMPETITIVE_REFERENCE");
  executeProvider = async ({ prompt }) => {
    const startedAt = Date.now();
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!response.ok) {
      throw new Error(`ANTHROPIC_COMPETITIVE_REFERENCE_REQUEST_FAILED:${response.status}`);
    }
    const body = await response.json();
    const output = Array.isArray(body?.content)
      ? body.content.filter((item) => item?.type === "text").map((item) => text(item.text)).join("\n")
      : "";
    const inputTokens = Number(body?.usage?.input_tokens || 0);
    const outputTokens = Number(body?.usage?.output_tokens || 0);
    return {
      text: output,
      wall_ms: Date.now() - startedAt,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costFor(inputTokens, outputTokens),
    };
  };
}

const attested = await runCodeAICompetitiveReferenceLiveBenchmark({
  suite,
  prompt_contract: promptContract,
  suite_sha256: sha256(suiteSource),
  prompt_contract_sha256: sha256(promptSource),
  provider,
  model,
  execute_provider: executeProvider,
});
await writeFile(OUTPUT_PATH, `${JSON.stringify(attested, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  success: attested?.summary?.complete_suite === true,
  contract: attested?.contract || null,
  attestation_contract: attested?.attestation?.contract || null,
  output_path: OUTPUT_PATH,
  provider,
  model,
  case_count: Number(attested?.summary?.completed_runs || 0),
  pass_rate: Number(attested?.summary?.pass_rate || 0),
  estimated_supplier_cost_usd: Number(attested?.economics?.estimated_supplier_cost_usd || 0),
  raw_model_output_persisted: false,
  raw_reasoning_persisted: false,
  normal_avantiqo_code_execution_uses_reference_provider: false,
  runtime_provider_effect: "NONE",
  production_deploy_performed: false,
}, null, 2));

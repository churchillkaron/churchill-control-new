import crypto from "node:crypto";
import fs from "node:fs/promises";

const SUITE_PATH = "benchmarks/business-partner/suite.v1.json";
const PROTOCOL_PATH = "benchmarks/business-partner/protocol.v1.json";
const EVIDENCE_PACKET_PATH = "benchmarks/business-partner/evidence-packet.v1.json";
const OUTPUT_PATH = process.env.AVANTIQO_BP_HEAD_TO_HEAD_OUTPUT || "artifacts/business-partner-reference-raw.json";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(name + "_REQUIRED");
  return value;
}
function optional(name, fallback = "") {
  return String(process.env[name] || fallback).trim();
}
function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}
function nowIso() {
  return new Date().toISOString();
}
function elapsedMs(start) {
  return Number(process.hrtime.bigint() - start) / 1e6;
}
function parseJsonMaybe(text) {
  const source = String(text || "").trim();
  try {
    return JSON.parse(source);
  } catch {}
  const match = source.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

async function postJson(url, { headers = {}, body }) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error("REFERENCE_PROVIDER_HTTP_" + response.status + ":" + text.slice(0, 500));
  }
  return JSON.parse(text);
}

function benchmarkPrompt(protocol, evidencePacket, testCase) {
  const schema = protocol.response_format?.fields || [];
  return [
    protocol.system_instruction,
    "",
    "Synthetic benchmark context and evidence packet:",
    JSON.stringify(evidencePacket),
    "",
    "Benchmark case:",
    testCase.prompt,
    "",
    "Return one JSON object with exactly these fields:",
    schema.join(", "),
  ].join("\n");
}

async function runOpenAI({ prompt, model }) {
  const data = await postJson("https://api.openai.com/v1/responses", {
    headers: { authorization: "Bearer " + required("OPENAI_API_KEY") },
    body: {
      model,
      input: prompt,
      temperature: 0,
    },
  });
  return String(data.output_text || data.output?.flatMap((item) => item.content || []).map((item) => item.text || "").join("\n") || "");
}

async function runClaude({ prompt, model }) {
  const data = await postJson("https://api.anthropic.com/v1/messages", {
    headers: {
      "x-api-key": required("ANTHROPIC_API_KEY"),
      "anthropic-version": "2023-06-01",
    },
    body: {
      model,
      max_tokens: 1200,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    },
  });
  return (data.content || []).map((item) => item.text || "").join("\n");
}

async function runGemini({ prompt, model }) {
  const key = required("GEMINI_API_KEY");
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(key);
  const data = await postJson(url, {
    body: {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
      },
    },
  });
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
}

const execute = optional("AVANTIQO_BENCHMARK_EXECUTE_EXTERNAL") === "1";
if (!execute) {
  throw new Error("EXPLICIT_EXTERNAL_REFERENCE_EXECUTION_REQUIRED");
}

const suite = JSON.parse(await fs.readFile(SUITE_PATH, "utf8"));
const protocol = JSON.parse(await fs.readFile(PROTOCOL_PATH, "utf8"));
const evidencePacket = JSON.parse(await fs.readFile(EVIDENCE_PACKET_PATH, "utf8"));
const evidencePacketHash = sha256(JSON.stringify(evidencePacket));

const providers = [
  {
    family: "chatgpt",
    model: required("BUSINESS_PARTNER_OPENAI_REFERENCE_MODEL"),
    run: runOpenAI,
  },
  {
    family: "claude",
    model: required("BUSINESS_PARTNER_CLAUDE_REFERENCE_MODEL"),
    run: runClaude,
  },
  {
    family: "gemini",
    model: required("BUSINESS_PARTNER_GEMINI_REFERENCE_MODEL"),
    run: runGemini,
  },
];

const output = {
  contract: "AVANTIQO_BUSINESS_PARTNER_REFERENCE_RAW_V1",
  generated_at: nowIso(),
  suite_contract: suite.contract,
  protocol_contract: protocol.contract,
  evidence_packet_contract: evidencePacket.contract,
  evidence_packet_sha256: evidencePacketHash,
  same_case_prompts: true,
  same_system_instruction: true,
  same_response_schema: true,
  external_reference_execution_performed: true,
  cases: [],
};

for (const testCase of suite.cases || []) {
  const prompt = benchmarkPrompt(protocol, evidencePacket, testCase);
  const promptHash = sha256(prompt);

  for (const provider of providers) {
    const started = process.hrtime.bigint();
    const raw = await provider.run({ prompt, model: provider.model });
    const latencyMs = Math.round(elapsedMs(started));
    const parsed = parseJsonMaybe(raw);

    output.cases.push({
      case_id: testCase.id,
      family: provider.family,
      model: provider.model,
      measured_at: nowIso(),
      latency_ms: latencyMs,
      prompt_sha256: promptHash,
      evidence_packet_sha256: evidencePacketHash,
      raw_output_sha256: sha256(raw),
      parsed_output_sha256: parsed ? sha256(JSON.stringify(parsed)) : null,
      parse_success: Boolean(parsed),
      raw_output: raw,
      parsed_output: parsed,
    });

    console.log(JSON.stringify({
      case_id: testCase.id,
      family: provider.family,
      model: provider.model,
      latency_ms: latencyMs,
      parse_success: Boolean(parsed),
    }));
  }
}

await fs.mkdir("artifacts", { recursive: true });
await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");
console.log("BUSINESS_PARTNER_REFERENCE_RAW_WRITTEN=" + OUTPUT_PATH);

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const API_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_CODE_ENGINE_V1";
function text(value) { return String(value ?? "").trim(); }
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function percentile(values, fraction) { const sorted = values.filter(Number.isFinite).sort((a,b)=>a-b); if (!sorted.length) return null; return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))]; }
async function runSync(endpointId, input, apiKey) {
  const started = performance.now();
  const response = await fetch(`${API_BASE}/${endpointId}/runsync`, { method:"POST", headers:{ Authorization:`Bearer ${apiKey}`, "Content-Type":"application/json", Accept:"application/json" }, body:JSON.stringify({ input }) });
  const body = await response.json().catch(() => ({}));
  const wallMs = Math.round(performance.now() - started);
  if (!response.ok) throw new Error(`RUNPOD_HTTP_${response.status}:${text(body?.error || body?.message)}`);
  if (text(body?.status).toUpperCase() !== "COMPLETED") throw new Error(`RUNPOD_NOT_COMPLETED:${text(body?.status) || "UNKNOWN"}`);
  return { body, wallMs };
}

const apiKey = required("RUNPOD_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_CODE_ENDPOINT_ID");
const foundationModel = text(process.env.AVANTIQO_CODE_FOUNDATION_MODEL) || "Qwen/Qwen3-Coder-30B-A3B-Instruct";
const runs = Math.max(1, Math.min(10, Number(process.env.AVANTIQO_CODE_BENCHMARK_RUNS || 3)));
const cases = [
  { capability:"ai.code.generate", instruction:"Return a JavaScript function named sumInvoiceLines that sums finite line.total values and ignores invalid entries. Return code only.", required:["sumInvoiceLines"] },
  { capability:"ai.code.debug", instruction:"Identify the bug and give the corrected one-line expression: const total = rows.reduce((sum,row) => sum + row.total, 0) when row.total may be a numeric string. Keep the answer concise.", required:["Number"] },
  { capability:"ai.code.review", instruction:"Review this expression for correctness and state the single highest-risk issue: user && user.role === 'admin' || user.owner_id === organizationId", required:["precedence","parentheses","authorization"] },
];
const observations = [];
for (let index=0; index<runs; index+=1) {
  const sample = cases[index % cases.length];
  const { body, wallMs } = await runSync(endpointId, {
    contract: CONTRACT,
    capability: sample.capability,
    foundation_model: foundationModel,
    organization_id:"benchmark-only",
    organization_service_id:"benchmark-only",
    usage_id:`benchmark-code-${index+1}`,
    instruction: sample.instruction,
    structured_specification:{ benchmark_case:index+1, response_style:"bounded" },
  }, apiKey);
  const output = body.output || {};
  const result = text(output.result);
  const semanticPass = sample.required.some((needle) => result.toLowerCase().includes(needle.toLowerCase()));
  observations.push({ run:index+1, capability:sample.capability, wall_ms:wallMs, worker_generation_seconds:Number(output.generation_seconds)||null, input_tokens:Number(output.usage?.input_tokens)||null, output_tokens:Number(output.usage?.output_tokens)||null, result_length:result.length, semantic_pass:semanticPass, passed:text(output.foundation_model)==="Qwen/Qwen3-Coder-30B-A3B-Instruct" && result.length>10 && semanticPass && output.raw_reasoning_persisted===false && !/<think>|<reasoning>/i.test(result) });
}
const wall = observations.map((item)=>item.wall_ms);
const report = {
  contract:"AVANTIQO_CODE_CERTIFICATION_BENCHMARK_V1",
  generated_at:new Date().toISOString(),
  activation_allowed:false,
  purpose:"MEASURE_ONLY_DO_NOT_ACTIVATE_PRICING",
  model:{ provider:"avantiqo-code", foundation_model:"Qwen/Qwen3-Coder-30B-A3B-Instruct", capabilities:["ai.code.generate","ai.code.debug","ai.code.review"] },
  summary:{ runs:observations.length, passed:observations.length>0 && observations.every((item)=>item.passed), p50_wall_ms:percentile(wall,0.5), p95_wall_ms:percentile(wall,0.95) },
  observations,
  certification_requirements:{ broader_capability_suite_required:true, measured_gpu_economics_required:true, production_pricing_status_required:"PRODUCTION_CERTIFIED", sandbox_execution_certified:false },
};
const outputPath = resolve(process.env.AVANTIQO_CODE_BENCHMARK_OUTPUT || "/tmp/avantiqo-code-certification-benchmark.json");
await writeFile(outputPath, `${JSON.stringify(report,null,2)}\n`, "utf8");
console.log(JSON.stringify({ success:true, output_path:outputPath, summary:report.summary, activation_allowed:false },null,2));

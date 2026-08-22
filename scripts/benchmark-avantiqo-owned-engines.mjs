import { access, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const OUTPUT = resolve(process.env.AVANTIQO_OWNED_BENCHMARK_OUTPUT || "/tmp/avantiqo-owned-engine-certification-suite.json");
function text(value) { return String(value ?? "").trim(); }
function configured(...names) { return names.every((name) => Boolean(text(process.env[name]))); }
async function exists(path) { try { await access(path, fsConstants.R_OK); return true; } catch { return false; } }
function runNode(script, env = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [script], { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("close", (code) => resolveRun({ code, stdout: stdout.slice(-12000), stderr: stderr.slice(-12000) }));
  });
}
async function readJson(path) { try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; } }

const engines = [
  { id:"intelligence", provider:"avantiqo-intelligence", models:["Qwen/Qwen3-30B-A3B-Thinking-2507"], capabilities:["ai.reasoning.execute","ai.text.generate"], endpoint_env:["RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID"], source_ready:true, benchmark_script:null, blocker:"DEDICATED_NON_QUEUE_CONTAMINATING_CERTIFICATION_PROBE_REQUIRED" },
  { id:"image", provider:"avantiqo-image", models:["Qwen/Qwen-Image"], capabilities:["ai.image.generate"], endpoint_env:["RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID","AVANTIQO_IMAGE_BENCHMARK_UPLOAD_URL","AVANTIQO_IMAGE_BENCHMARK_STORAGE_REFERENCE"], source_ready:true, benchmark_script:"scripts/benchmark-avantiqo-image.mjs", benchmark_output:"/tmp/avantiqo-image-certification-benchmark.json", output_env:"AVANTIQO_IMAGE_BENCHMARK_OUTPUT" },
  { id:"cinema", provider:"avantiqo-video", models:["Wan-AI/Wan2.2-T2V-A14B-Diffusers","Wan-AI/Wan2.2-I2V-A14B-Diffusers"], capabilities:["ai.video.generate","ai.video.image_to_video"], endpoint_env:["RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID","AVANTIQO_CINEMA_BENCHMARK_T2V_UPLOAD_URL","AVANTIQO_CINEMA_BENCHMARK_T2V_STORAGE_REFERENCE","AVANTIQO_CINEMA_BENCHMARK_I2V_UPLOAD_URL","AVANTIQO_CINEMA_BENCHMARK_I2V_STORAGE_REFERENCE","AVANTIQO_CINEMA_BENCHMARK_I2V_SOURCE_URL"], source_ready:true, benchmark_script:"scripts/benchmark-avantiqo-cinema.mjs", benchmark_output:"/tmp/avantiqo-cinema-certification-benchmark.json", output_env:"AVANTIQO_CINEMA_BENCHMARK_OUTPUT" },
  { id:"voice", provider:"avantiqo-voice", models:["openai/whisper-large-v3-turbo","resemble-ai/chatterbox:multilingual-v3"], capabilities:["ai.speech.to.text","ai.text.to.speech"], endpoint_env:["RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID","RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID","AVANTIQO_VOICE_STT_FOUNDATION_MODEL","AVANTIQO_VOICE_TTS_FOUNDATION_MODEL"], source_ready:true, benchmark_script:"scripts/benchmark-avantiqo-voice.mjs", benchmark_output:"/tmp/avantiqo-voice-certification-benchmark.json", output_env:"AVANTIQO_VOICE_BENCHMARK_OUTPUT" },
  { id:"music", provider:"avantiqo-audio", models:["ACE-Step/Ace-Step1.5"], capabilities:["ai.music.generate"], endpoint_env:["RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID","AVANTIQO_AUDIO_BENCHMARK_UPLOAD_URL","AVANTIQO_AUDIO_BENCHMARK_STORAGE_REFERENCE"], source_ready:true, benchmark_script:"scripts/benchmark-avantiqo-music.mjs", benchmark_output:"/tmp/avantiqo-music-certification-benchmark.json", output_env:"AVANTIQO_AUDIO_BENCHMARK_OUTPUT" },
  { id:"code", provider:"avantiqo-code", models:["Qwen/Qwen3-Coder-30B-A3B-Instruct"], capabilities:["ai.code.generate","ai.code.edit","ai.code.refactor","ai.code.review","ai.code.debug"], endpoint_env:["RUNPOD_AVANTIQO_CODE_ENDPOINT_ID"], source_ready:true, benchmark_script:"scripts/benchmark-avantiqo-code.mjs", benchmark_output:"/tmp/avantiqo-code-certification-benchmark.json", output_env:"AVANTIQO_CODE_BENCHMARK_OUTPUT" },
];

const selected = new Set(text(process.env.AVANTIQO_OWNED_BENCHMARK_ENGINES).split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));
const runAll = selected.size === 0;
const apiKeyConfigured = Boolean(text(process.env.RUNPOD_API_KEY));
const results = [];
for (const engine of engines) {
  const shouldRun = runAll || selected.has(engine.id);
  const endpointConfigured = configured(...engine.endpoint_env);
  const scriptPath = engine.benchmark_script ? resolve(ROOT, engine.benchmark_script) : null;
  const scriptExists = scriptPath ? await exists(scriptPath) : false;
  const result = { engine:engine.id, provider:engine.provider, models:engine.models, capabilities:engine.capabilities, source_ready:engine.source_ready, endpoint_configured:endpointConfigured, runpod_api_key_configured:apiKeyConfigured, benchmark_script:engine.benchmark_script, benchmark_script_present:scriptExists, benchmark_attempted:false, benchmark_passed:false, activation_allowed:false, production_pricing_status_required:"PRODUCTION_CERTIFIED", human_quality_review_required:["image","cinema","voice","music"].includes(engine.id), measured_gpu_economics_required:true, blockers:[] };
  if (!shouldRun) { result.status="NOT_SELECTED"; results.push(result); continue; }
  if (!apiKeyConfigured) result.blockers.push("RUNPOD_API_KEY_NOT_CONFIGURED");
  if (!endpointConfigured) result.blockers.push("ENGINE_ENDPOINT_OR_BENCHMARK_STORAGE_NOT_CONFIGURED");
  if (!engine.benchmark_script) result.blockers.push(engine.blocker || "BENCHMARK_SCRIPT_NOT_IMPLEMENTED");
  if (engine.benchmark_script && !scriptExists) result.blockers.push("BENCHMARK_SCRIPT_MISSING");
  if (result.blockers.length) { result.status="BLOCKED"; results.push(result); continue; }
  const outputPath = engine.benchmark_output;
  const env = engine.output_env ? { [engine.output_env]: outputPath } : {};
  result.benchmark_attempted = true;
  const execution = await runNode(scriptPath, env);
  result.exit_code = execution.code;
  result.stdout_tail = execution.stdout;
  result.stderr_tail = execution.stderr;
  result.evidence = await readJson(outputPath);
  result.benchmark_passed = execution.code === 0 && Boolean(result.evidence?.summary?.passed || result.evidence?.tts?.summary?.passed);
  result.status = result.benchmark_passed ? "MEASURED_PENDING_CERTIFICATION" : "BENCHMARK_FAILED";
  results.push(result);
}

const report = { contract:"AVANTIQO_OWNED_ENGINE_CERTIFICATION_SUITE_V1", generated_at:new Date().toISOString(), activation_allowed:false, pricing_activation_performed:false, provider_selection_changed:false, purpose:"READINESS_AND_MEASUREMENT_ONLY", engines:results, summary:{ engines:results.length, source_ready:results.filter((item)=>item.source_ready).length, benchmark_attempted:results.filter((item)=>item.benchmark_attempted).length, benchmark_passed:results.filter((item)=>item.benchmark_passed).length, blocked:results.filter((item)=>item.status==="BLOCKED").length, production_certified:0 }, certification_rule:{ benchmark_required:true, economics_required:true, model_license_required:true, human_quality_review_where_media:true, pricing_status_required:"PRODUCTION_CERTIFIED", automatic_activation_forbidden:true } };
await writeFile(OUTPUT, `${JSON.stringify(report,null,2)}\n`, "utf8");
console.log(JSON.stringify({ success:true, output_path:OUTPUT, summary:report.summary, activation_allowed:false },null,2));

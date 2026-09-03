import fs from "node:fs/promises";
import path from "node:path";
import * as modal from "modal";

const CONTRACT = "AVANTIQO_VIDEO_DEPLOYED_MODAL_SCHEDULING_DIAGNOSTIC_V2";
const APP = "avantiqo-video-owned";
const FUNCTION_NAMES = [
  "generate_native_job",
  "generate_native_controlled_master",
  "generate_native_master",
];

function text(value) { return String(value ?? "").trim(); }
function requireEnv(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function stat(stats, camel, snake) { return number(stats?.[camel] ?? stats?.[snake]); }
function normalizedStats(raw = {}) {
  return {
    backlog: stat(raw, "backlog", "backlog"),
    num_total_runners: stat(raw, "numTotalRunners", "num_total_runners"),
    num_running_inputs: stat(raw, "numRunningInputs", "num_running_inputs"),
    input_headroom: stat(raw, "inputHeadroom", "input_headroom"),
    raw,
  };
}
function logEntry(entry = {}) {
  return {
    timestamp: entry.timestamp instanceof Date ? entry.timestamp.toISOString() : text(entry.timestamp) || null,
    source: text(entry.source) || null,
    message: text(entry.message).slice(0, 4000),
    function_id: text(entry.functionId || entry.function_id) || null,
    container_id: text(entry.containerId || entry.container_id) || null,
  };
}
async function tailLogs(manager, entries = 100, source = undefined) {
  const items = [];
  try {
    const params = source ? { entries, source } : { entries };
    for await (const entry of manager.tail(params)) items.push(logEntry(entry));
  } catch (error) {
    items.push({ timestamp: null, source: "diagnostic", message: `LOG_FETCH_FAILED:${text(error?.name)}:${text(error?.message)}`, function_id: null, container_id: null });
  }
  return items;
}

function classify(stats, callState, callSystemLogs = []) {
  const transport = stats.generate_native_job;
  const controlled = stats.generate_native_controlled_master;
  const logText = callSystemLogs.map((entry) => entry.message).join("\n").toLowerCase();
  if (callState === "terminal_success") return "EXISTING_CALL_TERMINAL_SUCCESS";
  if (callState === "terminal_error") return "EXISTING_CALL_TERMINAL_ERROR";
  if (/image|container.*start|initializ|volume|mount|region|capacity|scheduler|provision/.test(logText)) return "TRANSPORT_STARTUP_OR_SCHEDULER_EVIDENCE_PRESENT";
  if (controlled?.num_running_inputs > 0) return "B200_GENERATION_RUNNING";
  if (controlled?.backlog > 0 && controlled?.num_total_runners === 0) return "B200_CAPACITY_OR_PLACEMENT_WAIT";
  if (transport?.num_running_inputs > 0 && controlled?.backlog === 0 && controlled?.num_running_inputs === 0) return "TRANSPORT_RUNNING_BEFORE_B200_DISPATCH";
  if (transport?.backlog > 0 && transport?.num_total_runners === 0) return "TRANSPORT_CONTAINER_UNSCHEDULED";
  if (transport?.backlog > 0) return "TRANSPORT_BACKLOG_WITH_RUNNERS";
  return "PENDING_WITHOUT_VISIBLE_DEPLOYED_QUEUE_ACTIVITY";
}

async function main() {
  const tokenId = text(process.env.MODAL_TOKEN_ID || process.env.AVANTIQO_MODAL_TOKEN_ID);
  const tokenSecret = text(process.env.MODAL_TOKEN_SECRET || process.env.AVANTIQO_MODAL_TOKEN_SECRET);
  if (!tokenId || !tokenSecret) throw new Error(`${CONTRACT}_MODAL_CREDENTIALS_REQUIRED`);
  const functionCallId = requireEnv("AVANTIQO_VIDEO_EXISTING_FUNCTION_CALL_ID");
  const client = new modal.ModalClient({ tokenId, tokenSecret });
  const lookupOptions = text(process.env.MODAL_ENVIRONMENT) ? { environment: text(process.env.MODAL_ENVIRONMENT) } : {};

  const stats = {};
  const functions = {};
  for (const name of FUNCTION_NAMES) {
    const fn = await client.functions.fromName(APP, name, lookupOptions);
    functions[name] = fn;
    stats[name] = normalizedStats(await fn.getCurrentStats());
  }

  const existing = await client.functionCalls.fromId(functionCallId);
  let callState = "pending";
  let terminalResult = null;
  let terminalError = null;
  try {
    terminalResult = await existing.get({ timeoutMs: 0 });
    callState = "terminal_success";
  } catch (error) {
    if (error instanceof modal.FunctionTimeoutError && /Timeout exceeded:\s*0ms/i.test(text(error?.message))) {
      callState = "pending";
    } else {
      callState = "terminal_error";
      terminalError = {
        name: text(error?.name) || "Error",
        message: text(error?.message) || String(error),
      };
    }
  }

  const callSystemLogs = await tailLogs(existing.logs, 200, "system");
  const callAllLogs = await tailLogs(existing.logs, 200);
  const transportSystemLogs = await tailLogs(functions.generate_native_job.logs, 200, "system");
  const transportAllLogs = await tailLogs(functions.generate_native_job.logs, 200);

  const report = {
    success: true,
    contract: CONTRACT,
    modal_app: APP,
    existing_function_call_id: functionCallId,
    call_state: callState,
    classification: classify(stats, callState, callSystemLogs),
    deployed_function_stats: stats,
    exact_call_system_logs: callSystemLogs,
    exact_call_logs: callAllLogs,
    transport_function_system_logs: transportSystemLogs,
    transport_function_logs: transportAllLogs,
    terminal_result: terminalResult,
    terminal_error: terminalError,
    generation_submission_performed: false,
    modal_spawn_count: 0,
    modal_remote_count: 0,
    gpu_inference_requested: false,
    production_deploy_performed: false,
    observed_at: new Date().toISOString(),
  };

  const outDir = path.resolve("local-audit-output/avantiqo-video-modal-v3-diagnostic");
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "deployed-modal-scheduling.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`${CONTRACT}=PASS`);
  console.log("AVANTIQO_VIDEO_DIAGNOSTIC_MODAL_SPAWN_COUNT=0");
  console.log("AVANTIQO_VIDEO_DIAGNOSTIC_GPU_INFERENCE_REQUESTED=false");
}

main().catch((error) => {
  console.error(`${CONTRACT}=FAIL`);
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

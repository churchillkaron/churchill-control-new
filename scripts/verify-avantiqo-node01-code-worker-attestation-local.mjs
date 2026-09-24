import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_NODE01_CODE_WORKER_ATTESTATION_V1";
const REQUIRED_WORKER_CONTRACT = "AVANTIQO_NODE01_WORKER_V6_MODEL_AWARE_CODE";
const NODE_ID = "avantiqo-node-01";
const WORKER_PATH = resolve("scripts/local-node/avantiqo-node01-worker.ps1");
const MAX_WAIT_MS = Math.max(10000, Number(process.env.AVANTIQO_NODE01_CODE_ATTESTATION_WAIT_MS || 60000));
const POLL_MS = 1500;

const text = (value, maximum = 1000) => String(value ?? "").trim().slice(0, maximum);
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
const source = await readFile(WORKER_PATH, "utf8");
const expectedSha = createHash("sha256").update(source, "utf8").digest("hex");

const { supabaseAdmin } = await import("../lib/shared/supabase/admin.js");
const deadline = Date.now() + MAX_WAIT_MS;
let last = null;
while (Date.now() < deadline) {
  const query = await supabaseAdmin
    .from("avantiqo_local_compute_nodes")
    .select("id,enabled,last_seen_at,metadata")
    .eq("id", NODE_ID)
    .maybeSingle();
  if (query.error) throw query.error;
  last = query.data || null;
  const metadata = last?.metadata && typeof last.metadata === "object" ? last.metadata : {};
  const laneAttestations = metadata?.lane_attestations && typeof metadata.lane_attestations === "object"
    ? metadata.lane_attestations
    : {};
  const codeAttestation = laneAttestations?.code && typeof laneAttestations.code === "object"
    ? laneAttestations.code
    : {};
  const heartbeatAt = Date.parse(last?.last_seen_at || "");
  const codeAttestationAt = Date.parse(codeAttestation?.observed_at || "");
  const fresh = Number.isFinite(heartbeatAt) && Date.now() - heartbeatAt <= 90000;
  const durableCodeFresh = Number.isFinite(codeAttestationAt) && Date.now() - codeAttestationAt <= 90000;
  const codeLaneHeartbeat = text(metadata.heartbeat_source_lane).toLowerCase() === "code";
  const contractMatch =
    text(codeAttestation.worker_contract || (codeLaneHeartbeat ? metadata.worker_contract : "")) === REQUIRED_WORKER_CONTRACT;
  const shaMatch =
    text(codeAttestation.worker_source_sha256 || (codeLaneHeartbeat ? metadata.worker_source_sha256 : "")).toLowerCase() === expectedSha;
  if (last?.enabled === true && fresh && (durableCodeFresh || codeLaneHeartbeat) && contractMatch && shaMatch) {
    console.log(JSON.stringify({
      success: true,
      contract: CONTRACT,
      node_id: NODE_ID,
      worker_contract: REQUIRED_WORKER_CONTRACT,
      worker_source_sha256: expectedSha,
      code_lane_heartbeat_verified: true,
      durable_lane_attestation_verified: durableCodeFresh,
      node_enabled: true,
      heartbeat_fresh: true,
      production_deploy_performed: false,
    }, null, 2));
    process.exit(0);
  }
  await sleep(POLL_MS);
}

const metadata = last?.metadata && typeof last.metadata === "object" ? last.metadata : {};
console.error(JSON.stringify({
  success: false,
  contract: CONTRACT,
  node_id: NODE_ID,
  expected_worker_contract: REQUIRED_WORKER_CONTRACT,
  observed_worker_contract: text(metadata.worker_contract) || null,
  expected_worker_source_sha256: expectedSha,
  observed_worker_source_sha256: text(metadata.worker_source_sha256) || null,
  observed_heartbeat_source_lane: text(metadata.heartbeat_source_lane) || null,
  last_seen_at: last?.last_seen_at || null,
  reason: "NODE01_CODE_WORKER_ATTESTATION_NOT_OBSERVED",
  production_deploy_performed: false,
}, null, 2));
process.exit(2);

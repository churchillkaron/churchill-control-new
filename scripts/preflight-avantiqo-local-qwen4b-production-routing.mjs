import { execFileSync } from "node:child_process";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();
const MODEL = "Qwen/Qwen3-4B-GGUF:Q4_K_M";
const REQUIRED = { "ai.text.generate": 1, "ai.reasoning.execute": 3 };
const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const origin = execFileSync("git", ["rev-parse", "origin/main"], { encoding: "utf8" }).trim();
if (head !== origin) throw new Error(`AVANTIQO_LOCAL_QWEN_MAIN_MISMATCH:${head}:${origin}`);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("AVANTIQO_LOCAL_QWEN_SUPABASE_ENV_REQUIRED");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const pricing = await db.from("provider_pricing")
  .select("id,capability,active,metadata")
  .eq("provider", "avantiqo-intelligence").eq("model", MODEL);
if (pricing.error) throw pricing.error;
const evidence = await db.from("platform_service_usage")
  .select("capability,status,execution_status,metadata,created_at")
  .eq("provider", "avantiqo-intelligence").eq("provider_model", MODEL)
  .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString());
if (evidence.error) throw evidence.error;
const counts = Object.fromEntries(Object.keys(REQUIRED).map((capability) => [capability, 0]));
for (const row of evidence.data || []) {
  if (!(row.capability in counts)) continue;
  if (String(row.status).toUpperCase() !== "SUCCESS" || String(row.execution_status).toUpperCase() !== "SUCCESS") continue;
  if (row.metadata?.benchmark_only !== true || String(row.metadata?.repository_head || "").toLowerCase() !== head.toLowerCase()) continue;
  counts[row.capability] += 1;
}
for (const [capability, required] of Object.entries(REQUIRED)) {
  if ((counts[capability] || 0) < required) throw new Error(`AVANTIQO_LOCAL_QWEN_CURRENT_HEAD_EVIDENCE_REQUIRED:${capability}:${counts[capability] || 0}:${required}`);
}
const deployed = String(process.env.AVANTIQO_DEPLOYED_PRODUCTION_SHA || "").trim().toLowerCase();
const deploymentMatches = deployed === head.toLowerCase();
const activate = process.argv.includes("--activate");
if (activate && !deploymentMatches) throw new Error(`AVANTIQO_LOCAL_QWEN_PRODUCTION_SHA_MISMATCH:${deployed || "MISSING"}:${head}`);
if (activate && String(process.env.AVANTIQO_LOCAL_QWEN_PRODUCTION_ROUTING_APPROVED || "").toUpperCase() !== "YES") throw new Error("AVANTIQO_LOCAL_QWEN_PRODUCTION_ROUTING_APPROVED=YES_REQUIRED");
if (activate) {
  for (const row of pricing.data || []) {
    const metadata = { ...(row.metadata || {}), pricing_status: "PRODUCTION_CERTIFIED", production_routing_allowed: true, production_certified: true, certification_repository_head: head };
    const update = await db.from("provider_pricing").update({ active: true, metadata }).eq("id", row.id).select("id,capability,active").single();
    if (update.error) throw update.error;
  }
}
console.log(JSON.stringify({ contract: "AVANTIQO_LOCAL_QWEN4B_PRODUCTION_ROUTING_PREFLIGHT_V1", head, deployed_production_sha: deployed || null, deployment_matches_certified_head: deploymentMatches, evidence_counts: counts, required_counts: REQUIRED, pricing_rows: pricing.data?.map((row) => ({ capability: row.capability, active: row.active })) || [], activation_requested: activate, activation_performed: activate && deploymentMatches, ready_for_activation_after_matching_deploy: !activate && Object.entries(REQUIRED).every(([k,v]) => counts[k] >= v), deep_lane_local_forbidden: true }, null, 2));

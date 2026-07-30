#!/usr/bin/env node

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function text(value) {
  return String(value ?? "").trim();
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

const organizationId = text(
  process.env.CREATIVE_ORGANIZATION_ID ||
  process.env.ORGANIZATION_ID,
);
const projectId = text(
  process.env.CREATIVE_PROJECT_ID ||
  process.env.CREATIVE_FULL_SONG_PROJECT_ID,
);

if (!organizationId) throw new Error("CREATIVE_ORGANIZATION_ID required");
if (!projectId) throw new Error("CREATIVE_PROJECT_ID required");

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");

console.log("============================================================");
console.log("RUNWAY RECOVERY PREFLIGHT");
console.log("============================================================");

const { data: pricingRows, error: pricingError } = await supabaseAdmin
  .from("provider_pricing")
  .select("*")
  .eq("provider", "runway")
  .eq("capability", "ai.video.generate")
  .order("created_at", { ascending: false });

if (pricingError) throw pricingError;

const validRows = (pricingRows || []).filter((row) =>
  text(row.model) &&
  text(row.currency) &&
  (
    positive(row.cost_per_unit) ||
    positive(row.supplier_cost) ||
    positive(row.customer_price)
  ),
);
const activeRows = validRows.filter((row) => row.active === true);

let pricing = activeRows[0] || null;
let activated = false;

if (!pricing) {
  if (validRows.length !== 1) {
    throw new Error(
      `RUNWAY_PRICING_CONFIGURATION_REQUIRED:VALID_ROWS=${validRows.length}:IDS=${validRows.map((row) => row.id).join(",")}`,
    );
  }

  pricing = validRows[0];
  const { error } = await supabaseAdmin
    .from("provider_pricing")
    .update({ active: true })
    .eq("id", pricing.id);
  if (error) throw error;
  activated = true;
}

console.log(`RUNWAY_PRICING_ID=${pricing.id}`);
console.log(`RUNWAY_PRICING_MODEL=${text(pricing.model)}`);
console.log(`RUNWAY_PRICING_CURRENCY=${text(pricing.currency)}`);
console.log(`RUNWAY_PRICING_ACTIVATED=${activated ? "YES" : "NO"}`);

const infrastructurePatterns = [
  "RUNWAY_ENDPOINT_REQUIRED",
  "RUNWAY_STATUS_ENDPOINT_REQUIRED",
  "No priced executable provider available for ai.video.generate",
  "Unknown provider: grok",
];

const { data: tasks, error: taskError } = await supabaseAdmin
  .from("production_tasks")
  .select("*")
  .eq("organization_id", organizationId)
  .eq("creative_project_id", projectId)
  .eq("status", "FAILED")
  .eq("capability", "ai.video.generate");

if (taskError) throw taskError;

const recoverable = (tasks || []).filter((task) =>
  infrastructurePatterns.some((pattern) => text(task.error).includes(pattern)) &&
  !task.metadata?.superseded_by_repair_task_id &&
  !task.metadata?.superseded_by_repair_review_task_id,
);

for (const task of recoverable) {
  const metadata = task.metadata && typeof task.metadata === "object"
    ? task.metadata
    : {};
  const input = task.input && typeof task.input === "object"
    ? task.input
    : {};
  const providerPolicy = input.provider_policy && typeof input.provider_policy === "object"
    ? input.provider_policy
    : {};

  const { error } = await supabaseAdmin
    .from("production_tasks")
    .update({
      status: "WAITING",
      provider_id: null,
      error: null,
      output: {},
      input: {
        ...input,
        provider_policy: {
          ...providerPolicy,
          allowed_providers: ["runway"],
          preferred_providers: ["runway"],
          blocked_providers: [
            ...new Set([
              ...(Array.isArray(providerPolicy.blocked_providers)
                ? providerPolicy.blocked_providers
                : []),
              "grok",
              "veo",
              "seedance",
            ]),
          ],
        },
      },
      timing: {
        ...(task.timing && typeof task.timing === "object" ? task.timing : {}),
        started_at: null,
        completed_at: null,
      },
      metadata: {
        ...metadata,
        infrastructure_retry: true,
        infrastructure_retry_reason: text(task.error),
        infrastructure_retry_at: new Date().toISOString(),
        infrastructure_retry_provider: "runway",
      },
    })
    .eq("id", task.id);

  if (error) throw error;
}

console.log(`INFRASTRUCTURE_FAILED_TASKS_REQUEUED=${recoverable.length}`);
console.log("COMPLETED_TASKS_REQUEUED=0");
console.log("RUNWAY_RECOVERY_PREFLIGHT=PASS");
console.log("============================================================");

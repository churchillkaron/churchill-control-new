#!/usr/bin/env node

import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const USAGE_ID = "d7d02e4e-506b-4d5e-9d6a-d5d2f51cfa93";
const PROVIDER = "avantiqo-voice";
const CAPABILITY = "ai.speech.to.text";
const PROVIDER_JOB_ID = "modal-voice-direct:transcribe:fc-01M1EJCHJ7T5XW0PP8GQA93FAW";
const CONTRACT = "AVANTIQO_VOICE_STALE_STT_FAILURE_SETTLEMENT_V1";

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const { settlePendingService } = await import("@/lib/platform/service-runtime/execution/ServiceExecutionRuntime");

const beforeResult = await supabaseAdmin
  .from("platform_service_usage")
  .select("id,organization_id,provider,capability,status,execution_status,provider_request_id,quantity,unit,currency,metadata,execution_started_at")
  .eq("id", USAGE_ID)
  .maybeSingle();
if (beforeResult.error) throw beforeResult.error;
const usage = beforeResult.data;
if (!usage) throw new Error(`${CONTRACT}_USAGE_NOT_FOUND`);
if (usage.provider !== PROVIDER) throw new Error(`${CONTRACT}_PROVIDER_MISMATCH`);
if (usage.capability !== CAPABILITY) throw new Error(`${CONTRACT}_CAPABILITY_MISMATCH`);
if (usage.provider_request_id !== PROVIDER_JOB_ID) throw new Error(`${CONTRACT}_PROVIDER_JOB_MISMATCH`);

if (usage.status === "SUCCESS") {
  throw new Error(`${CONTRACT}_REFUSE_SUCCESSFUL_USAGE_MUTATION`);
}

let settlement = null;
if (usage.status !== "FAILED") {
  settlement = await settlePendingService({
    organization_id: usage.organization_id,
    provider: PROVIDER,
    provider_job_id: PROVIDER_JOB_ID,
    usage_id: USAGE_ID,
    pricing: usage.metadata?.reservation_pricing || {},
    quantity: usage.quantity,
    unit: usage.unit,
    metadata: {
      cleanup_contract: CONTRACT,
      stale_modal_function_removed: true,
      replacement_job_submitted: false,
      paid_retry_performed: false,
      modal_cpu_gateway_used: false,
      direct_modal_function_transport_target: true,
    },
    provider_status_input: { capability: CAPABILITY },
    started_at: usage.execution_started_at || null,
  });
  if (settlement?.pending === true) throw new Error(`${CONTRACT}_OLD_CALL_UNEXPECTEDLY_PENDING`);
  if (settlement?.failed !== true) throw new Error(`${CONTRACT}_FAILED_SETTLEMENT_REQUIRED`);
  if (settlement?.settlement !== "RELEASED") throw new Error(`${CONTRACT}_RESERVATION_RELEASE_REQUIRED`);
}

const afterResult = await supabaseAdmin
  .from("platform_service_usage")
  .select("id,status,execution_status,charged_amount,supplier_cost,customer_price,error_message,metadata,execution_finished_at")
  .eq("id", USAGE_ID)
  .maybeSingle();
if (afterResult.error) throw afterResult.error;
const after = afterResult.data;
if (!after || after.status !== "FAILED") throw new Error(`${CONTRACT}_USAGE_NOT_FAILED_AFTER_SETTLEMENT`);
if (Number(after.charged_amount || 0) !== 0) throw new Error(`${CONTRACT}_FAILED_USAGE_MUST_NOT_BE_CHARGED`);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  usage_id: USAGE_ID,
  provider_job_id: PROVIDER_JOB_ID,
  status_before: usage.status,
  status_after: after.status,
  execution_status_after: after.execution_status,
  charged_amount_after: Number(after.charged_amount || 0),
  settlement: settlement?.settlement || "ALREADY_FAILED",
  replacement_job_submitted: false,
  paid_retry_performed: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  routing_activation_performed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);

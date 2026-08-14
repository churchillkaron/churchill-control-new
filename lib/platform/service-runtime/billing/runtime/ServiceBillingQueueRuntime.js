import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

import {
  BillingRuntime,
} from "./BillingRuntime";

const MAX_ATTEMPTS = 8;

function retryDelaySeconds(attempts) {
  return Math.min(3600, 30 * (2 ** Math.max(0, Math.min(attempts - 1, 7))));
}

async function organizationServiceBillingEnabled(usage = {}) {
  const organizationServiceId = usage.organization_service_id || null;
  if (!organizationServiceId) return true;

  const { data, error } = await supabaseAdmin
    .from("organization_services")
    .select("id,billing_enabled")
    .eq("id", organizationServiceId)
    .maybeSingle();

  if (error) throw error;
  return data?.billing_enabled !== false;
}

async function completeJob(job, billing = null, metadata = {}) {
  const { error } = await supabaseAdmin
    .from("service_billing_queue")
    .update({
      status: "completed",
      billing_invoice_id: billing?.invoice?.id || null,
      completed_at: new Date().toISOString(),
      locked_at: null,
      last_error: null,
      updated_at: new Date().toISOString(),
      ...metadata,
    })
    .eq("id", job.id)
    .eq("status", "processing");

  if (error) throw error;
}

async function failJob(job, error) {
  const attempts = Number(job.attempts || 0);
  const terminal = attempts >= MAX_ATTEMPTS;
  const delaySeconds = retryDelaySeconds(attempts);
  const availableAt = new Date(Date.now() + delaySeconds * 1000).toISOString();

  const { error: updateError } = await supabaseAdmin
    .from("service_billing_queue")
    .update({
      status: terminal ? "dead_letter" : "retry",
      available_at: terminal ? job.available_at : availableAt,
      locked_at: null,
      last_error: error?.message || String(error || "Service billing failed"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .eq("status", "processing");

  if (updateError) throw updateError;

  return terminal ? "dead_letter" : "retry";
}

async function claim(limit = 25) {
  const { data, error } = await supabaseAdmin.rpc(
    "claim_service_billing_jobs",
    {
      p_limit: Math.max(1, Math.min(Number(limit) || 25, 100)),
    },
  );

  if (error) throw error;
  return data || [];
}

async function processJob(job) {
  const { data: usage, error } = await supabaseAdmin
    .from("platform_service_usage")
    .select("*")
    .eq("id", job.usage_id)
    .maybeSingle();

  if (error) throw error;
  if (!usage) throw new Error("Service usage not found");
  if (usage.status !== "SUCCESS") {
    throw new Error(`Service usage is not billable:${usage.status}`);
  }

  if (usage.invoice_status === "INVOICED" && usage.invoice_id) {
    const billing = {
      invoice: { id: usage.invoice_id },
      usage,
      already_invoiced: true,
    };
    await completeJob(job, billing);
    return { status: "completed", billing, reused: true };
  }

  if (Number(usage.customer_price || 0) <= 0) {
    await completeJob(job, null);
    return { status: "completed", billing: null, skipped: "ZERO_PRICE" };
  }

  if (!(await organizationServiceBillingEnabled(usage))) {
    await completeJob(job, null);
    return {
      status: "completed",
      billing: null,
      skipped: "BILLING_DISABLED",
    };
  }

  const billing = await BillingRuntime.processUsage({
    usage_id: usage.id,
  });

  await completeJob(job, billing);
  return { status: "completed", billing, skipped: null };
}

async function process({ limit = 25 } = {}) {
  const jobs = await claim(limit);
  const results = [];

  for (const job of jobs) {
    try {
      const result = await processJob(job);
      results.push({
        job_id: job.id,
        usage_id: job.usage_id,
        success: true,
        status: result.status,
        skipped: result.skipped || null,
        invoice_id: result.billing?.invoice?.id || null,
      });
    } catch (error) {
      let status = "failed";
      try {
        status = await failJob(job, error);
      } catch (queueError) {
        console.error("SERVICE_BILLING_QUEUE_FAILURE_UPDATE_ERROR", queueError);
      }

      results.push({
        job_id: job.id,
        usage_id: job.usage_id,
        success: false,
        status,
        error: error?.message || String(error),
      });
    }
  }

  return {
    success: true,
    claimed: jobs.length,
    completed: results.filter((item) => item.success).length,
    retry: results.filter((item) => item.status === "retry").length,
    dead_letter: results.filter((item) => item.status === "dead_letter").length,
    results,
  };
}

export const ServiceBillingQueueRuntime = {
  claim,
  process,
};

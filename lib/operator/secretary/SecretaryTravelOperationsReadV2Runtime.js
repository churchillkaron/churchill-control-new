import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { readSecretaryTravelOperations } from "@/lib/operator/secretary/SecretaryTravelOperationsRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_TRAVEL_OPERATIONS_READ_V2";
const LEDGER_KEY = "travel_operations_v1";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function organizationId(context = {}) {
  const id = text(context.organizationId, 120);
  if (!id) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  return id;
}

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

export async function readSecretaryTravelOperationsV2({ context, payload = {} } = {}) {
  const base = await readSecretaryTravelOperations({ context, payload });
  const organization = organizationId(context);
  const jobId = text(payload.job_id || payload.jobId, 120);
  const job = await one(
    supabaseAdmin.from("secretary_jobs")
      .select("id,metadata")
      .eq("organization_id", organization)
      .eq("id", jobId)
      .maybeSingle(),
  );
  if (!job) throw new Error("SECRETARY_TRAVEL_OPERATIONS_JOB_NOT_FOUND");
  const ledger = object(object(job.metadata)[LEDGER_KEY]);
  const cancelled = list(ledger.confirmations)
    .filter((row) => row.status === "CANCELLED" || row.status === "VOIDED")
    .sort((a, b) => {
      const left = a.cancelled_at ? Date.parse(a.cancelled_at) : Number.MAX_SAFE_INTEGER;
      const right = b.cancelled_at ? Date.parse(b.cancelled_at) : Number.MAX_SAFE_INTEGER;
      return left - right;
    });
  return {
    ...base,
    contract: CONTRACT,
    travel_operations_contract: base.contract,
    cancelled_confirmations: cancelled,
    cancellation_history: list(ledger.history).filter((row) => row.event === "CONFIRMATION_CANCELLED" || row.event === "CONFIRMATION_VOIDED"),
    evidence_summary: {
      ...object(base.evidence_summary),
      cancelled_items: cancelled.filter((row) => row.status === "CANCELLED").length,
      voided_items: cancelled.filter((row) => row.status === "VOIDED").length,
    },
    cancellation_inferred: false,
    cancellation_intent_is_cancellation: false,
    cancellation_request_sent: false,
    cancellation_fee_commitment_created: false,
    refund_settlement_authority_created: false,
    rebooking_authority_created: false,
    booking_authority_created: false,
    payment_authority_created: false,
    binding_authority_created: false,
    external_authority_used: false,
  };
}

export default readSecretaryTravelOperationsV2;

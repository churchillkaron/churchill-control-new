import { createHash, randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stable(value[key])])
    );
  }
  return value;
}

export function onboardingPayloadHash(value) {
  return createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
}

export function validOnboardingRequestId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim()
  );
}

function migrationMissing(error) {
  return error?.code === "42P01";
}

export async function acquireOnboardingProvisionRequest({
  authUserId,
  requestId,
  payloadHash,
}) {
  const attemptId = randomUUID();
  const organizationId = randomUUID();
  const startedAt = new Date().toISOString();

  const inserted = await supabaseAdmin
    .from("onboarding_provision_requests")
    .insert({
      auth_user_id: authUserId,
      request_id: requestId,
      payload_hash: payloadHash,
      state: "PROCESSING",
      attempt_id: attemptId,
      organization_id: organizationId,
      started_at: startedAt,
      updated_at: startedAt,
    })
    .select("*")
    .maybeSingle();

  if (!inserted.error && inserted.data) {
    return { mode: "ACQUIRED", row: inserted.data };
  }
  if (migrationMissing(inserted.error)) {
    throw new Error("Onboarding idempotency migration is not installed");
  }
  if (inserted.error?.code !== "23505") throw inserted.error;

  const existing = await supabaseAdmin
    .from("onboarding_provision_requests")
    .select("*")
    .eq("auth_user_id", authUserId)
    .eq("request_id", requestId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) throw new Error("Onboarding request reservation disappeared");
  if (existing.data.payload_hash !== payloadHash) {
    const error = new Error("Onboarding request ID was already used with different setup data");
    error.status = 409;
    throw error;
  }

  if (existing.data.state === "SUCCEEDED") {
    return { mode: "REPLAY", row: existing.data };
  }

  const org = await supabaseAdmin
    .from("organizations")
    .select("id,organization_status,status")
    .eq("id", existing.data.organization_id)
    .maybeSingle();
  if (org.error) throw org.error;

  if (org.data?.organization_status === "ACTIVE") {
    return { mode: "RESUME_PROVISIONED", row: existing.data, organization: org.data };
  }

  if (existing.data.state === "FAILED" || org.data?.organization_status === "SETUP_FAILED") {
    const error = new Error(
      "This onboarding request previously failed. Review the error and submit again as a new onboarding attempt."
    );
    error.status = 409;
    error.retryWithNewOnboardingRequest = true;
    throw error;
  }

  const started = new Date(existing.data.started_at || 0).getTime();
  const stale = Number.isFinite(started) && started > 0 && started <= Date.now() - 15 * 60 * 1000;

  if (stale && !org.data) {
    const recoveredAttemptId = randomUUID();
    const recoveredAt = new Date().toISOString();
    const recovered = await supabaseAdmin
      .from("onboarding_provision_requests")
      .update({
        attempt_id: recoveredAttemptId,
        started_at: recoveredAt,
        updated_at: recoveredAt,
        error_message: null,
      })
      .eq("id", existing.data.id)
      .eq("state", "PROCESSING")
      .eq("attempt_id", existing.data.attempt_id)
      .select("*")
      .maybeSingle();
    if (recovered.error) throw recovered.error;
    if (recovered.data) return { mode: "ACQUIRED", row: recovered.data };
  }

  if (stale && org.data?.organization_status === "PROVISIONING") {
    const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const retired = await supabaseAdmin.rpc("retire_stale_onboarding_provision_request", {
      p_request_row_id: existing.data.id,
      p_attempt_id: existing.data.attempt_id,
      p_organization_id: existing.data.organization_id,
      p_stale_before: staleBefore,
    });
    if (retired.error) throw retired.error;
    const outcome = Array.isArray(retired.data) ? retired.data[0] || null : retired.data || null;

    if (outcome?.outcome === "RESUME_PROVISIONED") {
      const refreshed = await supabaseAdmin
        .from("onboarding_provision_requests")
        .select("*")
        .eq("id", existing.data.id)
        .maybeSingle();
      if (refreshed.error) throw refreshed.error;
      if (!refreshed.data) throw new Error("Recovered onboarding request disappeared");
      return {
        mode: "RESUME_PROVISIONED",
        row: refreshed.data,
        organization: {
          ...org.data,
          organization_status: "ACTIVE",
          status: "active",
        },
      };
    }

    if (outcome?.outcome === "RETIRED_FAILED") {
      const staleError = new Error(
        "This onboarding attempt was interrupted before setup completed. Submit again as a new onboarding attempt."
      );
      staleError.status = 409;
      staleError.retryWithNewOnboardingRequest = true;
      throw staleError;
    }

    if (outcome?.outcome && !["REQUEST_CHANGED","REQUEST_NOT_STALE","ORGANIZATION_STATE_CHANGED"].includes(outcome.outcome)) {
      throw new Error(`Unexpected stale onboarding recovery outcome: ${outcome.outcome}`);
    }
  }

  const error = new Error("This onboarding request is already being processed");
  error.status = 409;
  throw error;
}

export async function markOnboardingProvisioned({ row, organizationId }) {
  const at = new Date().toISOString();
  const result = await supabaseAdmin
    .from("onboarding_provision_requests")
    .update({
      state: "PROVISIONED",
      organization_id: organizationId,
      provisioned_at: at,
      updated_at: at,
    })
    .eq("id", row.id)
    .eq("attempt_id", row.attempt_id)
    .in("state", ["PROCESSING", "PROVISIONED"])
    .select("*")
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Onboarding request ownership changed before provision checkpoint");
  return result.data;
}

export async function completeOnboardingProvisionRequest({ row, responsePayload }) {
  const at = new Date().toISOString();
  const result = await supabaseAdmin
    .from("onboarding_provision_requests")
    .update({
      state: "SUCCEEDED",
      response_payload: responsePayload,
      error_message: null,
      completed_at: at,
      updated_at: at,
    })
    .eq("id", row.id)
    .eq("attempt_id", row.attempt_id)
    .in("state", ["PROCESSING", "PROVISIONED"])
    .select("*")
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Onboarding request ownership changed before completion");
  return result.data;
}

export async function failOnboardingProvisionRequest({ row, errorMessage }) {
  if (!row?.id || !row?.attempt_id) return;
  const at = new Date().toISOString();
  const result = await supabaseAdmin
    .from("onboarding_provision_requests")
    .update({
      state: "FAILED",
      error_message: String(errorMessage || "Onboarding failed").slice(0, 1000),
      failed_at: at,
      updated_at: at,
    })
    .eq("id", row.id)
    .eq("attempt_id", row.attempt_id)
    .eq("state", "PROCESSING");
  if (result.error && !migrationMissing(result.error)) throw result.error;
}

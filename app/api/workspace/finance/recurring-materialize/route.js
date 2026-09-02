export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { planRecurringAccountingCycles } from "@/lib/finance/practice/recurringCyclePlanner";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MANAGE_PERMISSIONS = ["finance.accounting.manage", "finance.close.execute", "finance.configuration.manage"];

function clean(value) {
  return String(value ?? "").trim();
}

function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json({ success: false, error: message, ...extra }, { status });
}

async function requireManage(access) {
  if (access.permissions?.includes("*") === true) return;
  let lastError = null;
  for (const permissionKey of MANAGE_PERMISSIONS) {
    try {
      await checkFinancePermission({
        organizationId: access.organizationId,
        userId: access.user?.id,
        permissionKey,
        fullAccess: false,
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Finance recurring-cycle materialization permission denied");
}

function publicCandidate(candidate) {
  return {
    idempotency_key: candidate?.idempotency_key || null,
    status: candidate?.status || null,
    client_name: candidate?.client_name || null,
    template_name: candidate?.template_name || null,
    service_key: candidate?.service_key || null,
    cadence: candidate?.cadence || null,
    due_at: candidate?.due_at || null,
    blockers: Array.isArray(candidate?.blockers) ? candidate.blockers : [],
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = clean(body.organizationId || body.organization_id);
    const idempotencyKey = clean(body.idempotencyKey || body.idempotency_key);

    if (!idempotencyKey) {
      return jsonError("idempotencyKey is required", 400, {
        code: "RECURRING_CANDIDATE_KEY_REQUIRED",
        materialized: false,
        idempotent: true,
      });
    }

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireManage(access);

    const plan = await planRecurringAccountingCycles({
      accountingFirmId: access.organizationId,
      horizonDays: 90,
    });
    const candidate = plan.candidates.find((row) => row.idempotency_key === idempotencyKey);

    if (!candidate) {
      return jsonError("Recurring accounting candidate is stale, outside the governed horizon, or unavailable", 409, {
        code: "RECURRING_CANDIDATE_STALE_OR_UNKNOWN",
        materialized: false,
        idempotent: true,
      });
    }

    if (candidate.status === "ALREADY_EXISTS") {
      return NextResponse.json({
        success: true,
        materialized: false,
        idempotent: true,
        result: { created: false, status: "ALREADY_EXISTS" },
        candidate: publicCandidate(candidate),
      });
    }

    if (candidate.status !== "READY_TO_CREATE") {
      return jsonError("Recurring accounting candidate is not currently safe to materialize", 409, {
        code: "RECURRING_CANDIDATE_NOT_READY",
        materialized: false,
        idempotent: true,
        candidate: publicCandidate(candidate),
      });
    }

    if (!candidate.engagement_id || !candidate.template_id || !candidate.entity_id || !candidate.period_id || !candidate.run_key || !candidate.start_at || !candidate.due_at) {
      return jsonError("Recurring accounting candidate is incomplete after server recomputation", 409, {
        code: "RECURRING_CANDIDATE_INCOMPLETE",
        materialized: false,
        idempotent: true,
        candidate: publicCandidate(candidate),
      });
    }

    const { data, error } = await supabaseAdmin.rpc("materialize_accounting_engagement_run", {
      p_accounting_firm_id: access.organizationId,
      p_engagement_id: candidate.engagement_id,
      p_template_id: candidate.template_id,
      p_entity_id: candidate.entity_id,
      p_period_id: candidate.period_id,
      p_run_key: candidate.run_key,
      p_start_at: candidate.start_at,
      p_due_at: candidate.due_at,
      p_created_by: access.user?.id || null,
    });

    if (error) throw error;

    const result = data && typeof data === "object" ? data : {};
    const alreadyExists = result.status === "ALREADY_EXISTS" || result.created === false;
    return NextResponse.json({
      success: true,
      materialized: !alreadyExists,
      idempotent: true,
      no_external_message: true,
      result,
      candidate: publicCandidate(candidate),
    }, { status: alreadyExists ? 200 : 201 });
  } catch (error) {
    const message = error?.message || "Unable to materialize recurring accounting cycle";
    if (/ENTITY_REQUIRED|ENTITY_SCOPE_MISMATCH|PERIOD_REQUIRED|PERIOD_SCOPE_MISMATCH|TEMPLATE_UNAVAILABLE|TEMPLATE_HAS_NO_ACTIVE_STEPS|ENGAGEMENT_UNAVAILABLE/.test(message)) {
      return jsonError(message, 409, { materialized: false, idempotent: true });
    }
    return jsonError(message, /permission denied/i.test(message) ? 403 : 500, { materialized: false, idempotent: true });
  }
}

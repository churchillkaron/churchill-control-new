export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

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

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = clean(body.organizationId || body.organization_id);
    const engagementId = clean(body.engagementId || body.engagement_id);
    const templateId = clean(body.templateId || body.template_id);
    const entityId = clean(body.entityId || body.entity_id);
    const periodId = clean(body.periodId || body.period_id);
    const runKey = clean(body.runKey || body.run_key);
    const startAt = clean(body.startAt || body.start_at);
    const dueAt = clean(body.dueAt || body.due_at);

    if (!engagementId || !templateId || !entityId || !periodId || !runKey || !startAt || !dueAt) {
      return jsonError("engagementId, templateId, entityId, periodId, runKey, startAt and dueAt are required");
    }

    const startDate = new Date(startAt);
    const dueDate = new Date(dueAt);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(dueDate.getTime()) || dueDate < startDate) {
      return jsonError("Invalid recurring-cycle date range");
    }

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireManage(access);

    const { data, error } = await supabaseAdmin.rpc("materialize_accounting_engagement_run", {
      p_accounting_firm_id: access.organizationId,
      p_engagement_id: engagementId,
      p_template_id: templateId,
      p_entity_id: entityId,
      p_period_id: periodId,
      p_run_key: runKey,
      p_start_at: startDate.toISOString(),
      p_due_at: dueDate.toISOString(),
      p_created_by: access.user?.id || null,
    });

    if (error) throw error;

    const result = data && typeof data === "object" ? data : {};
    const alreadyExists = result.status === "ALREADY_EXISTS" || result.created === false;
    return NextResponse.json({
      success: true,
      materialized: !alreadyExists,
      idempotent: true,
      result,
    }, { status: alreadyExists ? 200 : 201 });
  } catch (error) {
    const message = error?.message || "Unable to materialize recurring accounting cycle";
    if (/ENTITY_REQUIRED|ENTITY_SCOPE_MISMATCH|PERIOD_REQUIRED|PERIOD_SCOPE_MISMATCH|TEMPLATE_UNAVAILABLE|TEMPLATE_HAS_NO_ACTIVE_STEPS|ENGAGEMENT_UNAVAILABLE/.test(message)) {
      return jsonError(message, 409, { materialized: false, idempotent: true });
    }
    return jsonError(message, /permission denied/i.test(message) ? 403 : 500, { materialized: false, idempotent: true });
  }
}

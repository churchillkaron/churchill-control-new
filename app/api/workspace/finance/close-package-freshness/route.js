export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  buildFinanceClosePackageSnapshot,
  evaluateFinanceClosePackageFreshness,
} from "@/lib/finance/period-close/runtime/FinanceClosePackageFreshness";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function clean(value) {
  return String(value ?? "").trim();
}

function jsonError(message, status = 400, details = undefined) {
  return NextResponse.json(
    { success: false, error: message, ...(details ? { details } : {}) },
    { status },
  );
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = clean(searchParams.get("organizationId") || searchParams.get("organization_id"));
    const entityId = clean(searchParams.get("entityId") || searchParams.get("entity_id"));
    const periodId = clean(searchParams.get("periodId") || searchParams.get("period_id"));

    if (!organizationId || !entityId || !periodId) {
      return jsonError("organization_id, entity_id and period_id are required", 400);
    }

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.accounting.view",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const { data: closeRun, error: closeRunError } = await supabaseAdmin
      .from("finance_period_close_runs")
      .select("id,close_type,status,required_steps,result,closed_by,closed_at,created_at,updated_at")
      .eq("organization_id", access.organizationId)
      .eq("entity_id", entityId)
      .eq("period_id", periodId)
      .order("closed_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (closeRunError) throw closeRunError;

    const snapshot = await buildFinanceClosePackageSnapshot({
      organizationId: access.organizationId,
      entityId,
      periodId,
    });
    const freshness = evaluateFinanceClosePackageFreshness({ snapshot, closeRun: closeRun || null });

    return NextResponse.json({
      success: true,
      scope: snapshot.scope,
      close_run: closeRun
        ? {
            id: closeRun.id,
            close_type: closeRun.close_type,
            status: closeRun.status,
            closed_at: closeRun.closed_at,
          }
        : null,
      freshness,
      integrity: {
        complete: snapshot.population_complete === true,
        population: snapshot.population,
      },
    });
  } catch (error) {
    console.error("FINANCE_CLOSE_PACKAGE_FRESHNESS_FAILED", error);
    const message = error?.message || "Finance close-package freshness could not be proven";
    const status = /permission denied|authentication|membership/i.test(message) ? 403 : 503;
    return jsonError(message, status, {
      freshness: {
        state: "UNPROVEN",
        trusted: false,
        reason: "The accounting population could not be completely re-read, so Avantiqo will not present the close package as current.",
      },
    });
  }
}

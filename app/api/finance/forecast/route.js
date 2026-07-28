export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireAuth } from "@/lib/shared/auth";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import {
  buildRevenueForecastCommand,
} from "@/lib/finance/reporting/runtime/ReportingApplicationService";

function queryValue(searchParams, camel, snake) {
  return searchParams.get(camel) || searchParams.get(snake) || null;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId: queryValue(searchParams, "organizationId", "organization_id"),
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error, rows: [] },
        { status: access.status }
      );
    }

    const requestedEntityId = queryValue(searchParams, "entityId", "entity_id");
    if (!requestedEntityId) {
      throw new Error("entity_id required");
    }

    const entity = await resolveEntity({
      organizationId: access.organizationId,
      entityId: requestedEntityId,
    });
    if (!entity) {
      throw new Error("Legal entity not found in organisation");
    }

    let query = supabaseAdmin
      .from("accounting_forecasts")
      .select("*")
      .eq("organization_id", access.organizationId)
      .eq("entity_id", entity.id)
      .order("created_at", { ascending: false })
      .limit(250);

    const periodId = queryValue(searchParams, "periodId", "period_id");
    if (periodId) query = query.eq("period_id", periodId);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({
      success: true,
      organization_id: access.organizationId,
      entity_id: entity.id,
      period_id: periodId,
      rows: data || [],
      forecasts: data || [],
    });
  } catch (error) {
    const message = error.message || "Forecast load failed";
    return NextResponse.json(
      { success: false, error: message, rows: [] },
      { status: /required|not found/i.test(message) ? 400 : 500 }
    );
  }
}

export async function POST(request) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const result = await buildRevenueForecastCommand({
      organizationId: access.organizationId,
      entityId: body.entityId || body.entity_id,
      periodId: body.periodId || body.period_id || null,
      sourceStartDate: body.source_start_date || body.sourceStartDate || null,
      sourceEndDate: body.source_end_date || body.sourceEndDate || null,
      horizonDays: body.horizon_days || body.horizonDays || 30,
      growthRatePercent:
        body.growth_rate_percent ?? body.growthRatePercent ?? 0,
      currencyCode: body.currency_code || body.currencyCode || null,
      idempotencyKey:
        body.idempotency_key ||
        body.idempotencyKey ||
        request.headers.get("idempotency-key"),
      createdBy: user?.id || access.user?.id || null,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error.message || "Forecast generation failed";
    return NextResponse.json(
      { success: false, error: message },
      {
        status: /required|not found|must|cannot|configured|period|currency/i.test(message)
          ? 400
          : 500,
      }
    );
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ACTIVE_PERIOD_COOKIE = "avantiqo_active_period_id";

function text(value) {
  return String(value ?? "").trim();
}

function scopedPeriodQuery({ organizationId, entityId = null }) {
  let query = supabaseAdmin
    .from("accounting_periods")
    .select("*")
    .eq("organization_id", organizationId);

  if (entityId) {
    query = query.or(`entity_id.eq.${entityId},entity_id.is.null`);
  }

  return query.order("start_date", { ascending: false }).limit(240);
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(
      url.searchParams.get("organizationId") ||
        url.searchParams.get("organization_id"),
    );
    const entityId = text(
      url.searchParams.get("entityId") || url.searchParams.get("entity_id"),
    );

    const context = await resolveAuthenticatedStaffContext({
      request,
      organizationId: organizationId || null,
    });

    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error, code: context.code },
        { status: context.status || 403 },
      );
    }

    if (entityId) {
      const { data: entity, error: entityError } = await supabaseAdmin
        .from("legal_entities")
        .select("id")
        .eq("id", entityId)
        .eq("organization_id", context.organizationId)
        .eq("is_active", true)
        .maybeSingle();

      if (entityError) throw entityError;
      if (!entity) {
        return NextResponse.json(
          { success: false, error: "Legal entity is not active in this organization" },
          { status: 404 },
        );
      }
    }

    const { data, error } = await scopedPeriodQuery({
      organizationId: context.organizationId,
      entityId: entityId || null,
    });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      organization_id: context.organizationId,
      entity_id: entityId || null,
      periods: data || [],
    });
  } catch (error) {
    console.error("SESSION_PERIOD_LIST_ERROR", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load accounting periods" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const periodId = text(body?.periodId || body?.period_id);
    const organizationId = text(body?.organizationId || body?.organization_id);
    const entityId = text(body?.entityId || body?.entity_id);

    if (!periodId) {
      return NextResponse.json(
        { success: false, error: "periodId required" },
        { status: 400 },
      );
    }

    const context = await resolveAuthenticatedStaffContext({
      request,
      organizationId: organizationId || null,
    });

    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error, code: context.code },
        { status: context.status || 403 },
      );
    }

    const { data: period, error } = await supabaseAdmin
      .from("accounting_periods")
      .select("*")
      .eq("id", periodId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (error) throw error;

    if (!period) {
      return NextResponse.json(
        { success: false, error: "Accounting period is not available in this organization" },
        { status: 404 },
      );
    }

    if (entityId && period.entity_id && text(period.entity_id) !== entityId) {
      return NextResponse.json(
        { success: false, error: "Accounting period does not belong to the active legal entity" },
        { status: 409 },
      );
    }

    const response = NextResponse.json({
      success: true,
      organization_id: context.organizationId,
      entity_id: entityId || period.entity_id || null,
      period,
      period_id: period.id,
      active_period_id: period.id,
    });

    response.cookies.set(ACTIVE_PERIOD_COOKIE, period.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return response;
  } catch (error) {
    console.error("SESSION_PERIOD_SELECTION_ERROR", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to select accounting period" },
      { status: 500 },
    );
  }
}

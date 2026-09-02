export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { resolveBusinessContext } from "@/lib/business-context/resolveBusinessContext";
import { getAnalyticsMetric } from "@/lib/analytics/semantic/AnalyticsMetricCatalog";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function clean(value) {
  return String(value ?? "").trim();
}

async function resolveScope(request, payload = {}) {
  const url = new URL(request.url);
  const organizationId = clean(
    payload.organizationId ||
      payload.organization_id ||
      url.searchParams.get("organizationId") ||
      url.searchParams.get("organization_id"),
  );
  const entityId = clean(
    payload.entityId ||
      payload.entity_id ||
      url.searchParams.get("entityId") ||
      url.searchParams.get("entity_id"),
  );
  const periodId = clean(
    payload.periodId ||
      payload.period_id ||
      url.searchParams.get("periodId") ||
      url.searchParams.get("period_id"),
  );

  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) return { error: access };

  const context = await resolveBusinessContext({
    organizationId: access.organizationId,
    entityId: entityId || null,
    periodId: periodId || null,
    request,
    access,
  });
  if (!context.success) return { error: context };

  return {
    access,
    context,
    staffAccountId: access.access?.staffAccountId || access.staff?.id || null,
  };
}

export async function GET(request) {
  try {
    const scope = await resolveScope(request);
    if (scope.error) {
      return NextResponse.json(
        { success: false, error: scope.error.error },
        { status: scope.error.status || 403 },
      );
    }

    const { context, staffAccountId } = scope;
    const entityId = context.entityId || null;

    let viewsQuery = supabaseAdmin
      .from("analytics_saved_views")
      .select("id,entity_id,staff_account_id,name,view_type,definition,is_default,is_shared,created_at,updated_at")
      .eq("organization_id", context.organizationId)
      .or(`staff_account_id.eq.${staffAccountId},is_shared.eq.true`);
    viewsQuery = entityId
      ? viewsQuery.or(`entity_id.eq.${entityId},entity_id.is.null`)
      : viewsQuery.is("entity_id", null);

    let followsQuery = supabaseAdmin
      .from("analytics_metric_follows")
      .select("id,entity_id,metric_id,favorite,alerts_enabled,created_at,updated_at")
      .eq("organization_id", context.organizationId)
      .eq("staff_account_id", staffAccountId);
    followsQuery = entityId
      ? followsQuery.or(`entity_id.eq.${entityId},entity_id.is.null`)
      : followsQuery.is("entity_id", null);

    const [{ data: views, error: viewsError }, { data: follows, error: followsError }] =
      await Promise.all([
        viewsQuery.order("is_default", { ascending: false }).order("updated_at", { ascending: false }),
        followsQuery.order("favorite", { ascending: false }).order("updated_at", { ascending: false }),
      ]);

    if (viewsError) throw viewsError;
    if (followsError) throw followsError;

    return NextResponse.json({
      success: true,
      views: views || [],
      follows: follows || [],
    });
  } catch (error) {
    console.error("ANALYTICS_PREFERENCES_GET_FAILED", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load Analytics preferences" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const payload = await request.json().catch(() => ({}));
    const scope = await resolveScope(request, payload);
    if (scope.error) {
      return NextResponse.json(
        { success: false, error: scope.error.error },
        { status: scope.error.status || 403 },
      );
    }

    const { context, staffAccountId } = scope;
    const entityId = context.entityId || null;
    const action = clean(payload.action).toLowerCase();

    if (action === "follow_metric") {
      const metricId = clean(payload.metricId || payload.metric_id);
      if (!getAnalyticsMetric(metricId)) {
        return NextResponse.json(
          { success: false, error: "Unknown Analytics metric" },
          { status: 400 },
        );
      }

      let query = supabaseAdmin
        .from("analytics_metric_follows")
        .select("id")
        .eq("organization_id", context.organizationId)
        .eq("staff_account_id", staffAccountId)
        .eq("metric_id", metricId);
      query = entityId ? query.eq("entity_id", entityId) : query.is("entity_id", null);
      const { data: existing, error: existingError } = await query.maybeSingle();
      if (existingError) throw existingError;

      const values = {
        organization_id: context.organizationId,
        entity_id: entityId,
        staff_account_id: staffAccountId,
        metric_id: metricId,
        favorite: payload.favorite === true,
        alerts_enabled: payload.alertsEnabled !== false,
        updated_at: new Date().toISOString(),
      };

      const result = existing?.id
        ? await supabaseAdmin
            .from("analytics_metric_follows")
            .update(values)
            .eq("id", existing.id)
            .select("*")
            .single()
        : await supabaseAdmin
            .from("analytics_metric_follows")
            .insert(values)
            .select("*")
            .single();
      if (result.error) throw result.error;
      return NextResponse.json({ success: true, follow: result.data });
    }

    if (action === "unfollow_metric") {
      const metricId = clean(payload.metricId || payload.metric_id);
      let query = supabaseAdmin
        .from("analytics_metric_follows")
        .delete()
        .eq("organization_id", context.organizationId)
        .eq("staff_account_id", staffAccountId)
        .eq("metric_id", metricId);
      query = entityId ? query.eq("entity_id", entityId) : query.is("entity_id", null);
      const { error } = await query;
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (action === "save_view") {
      const name = clean(payload.name);
      const viewType = clean(payload.viewType || payload.view_type || "METRIC_BOARD").toUpperCase();
      if (!name) {
        return NextResponse.json(
          { success: false, error: "View name required" },
          { status: 400 },
        );
      }
      if (!["METRIC_BOARD", "REPORT", "EXPLORATION", "FORECAST"].includes(viewType)) {
        return NextResponse.json(
          { success: false, error: "Unsupported Analytics view type" },
          { status: 400 },
        );
      }

      if (payload.isDefault === true) {
        let reset = supabaseAdmin
          .from("analytics_saved_views")
          .update({ is_default: false, updated_at: new Date().toISOString() })
          .eq("organization_id", context.organizationId)
          .eq("staff_account_id", staffAccountId);
        reset = entityId ? reset.eq("entity_id", entityId) : reset.is("entity_id", null);
        const { error: resetError } = await reset;
        if (resetError) throw resetError;
      }

      const { data, error } = await supabaseAdmin
        .from("analytics_saved_views")
        .insert({
          organization_id: context.organizationId,
          entity_id: entityId,
          staff_account_id: staffAccountId,
          name,
          view_type: viewType,
          definition:
            payload.definition && typeof payload.definition === "object"
              ? payload.definition
              : {},
          is_default: payload.isDefault === true,
          is_shared: payload.isShared === true,
          created_by: staffAccountId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ success: true, view: data });
    }

    if (action === "delete_view") {
      const viewId = clean(payload.viewId || payload.view_id);
      if (!viewId) {
        return NextResponse.json(
          { success: false, error: "viewId required" },
          { status: 400 },
        );
      }
      const { error } = await supabaseAdmin
        .from("analytics_saved_views")
        .delete()
        .eq("id", viewId)
        .eq("organization_id", context.organizationId)
        .eq("staff_account_id", staffAccountId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { success: false, error: "Unsupported Analytics preference action" },
      { status: 400 },
    );
  } catch (error) {
    console.error("ANALYTICS_PREFERENCES_POST_FAILED", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Analytics preference action failed" },
      { status: 500 },
    );
  }
}

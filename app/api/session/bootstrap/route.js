export const dynamic = "force-dynamic";

import { createServerSupabase } from "@/lib/shared/supabase/server";

async function loadActiveEntity({ supabase, organizationId }) {
  if (!organizationId) return null;

  const { data } = await supabase
    .from("legal_entities")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("is_default_accounting_entity", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data || null;
}

async function loadActivePeriod({ supabase, organizationId, entityId }) {
  if (!organizationId || !entityId) return null;

  const { data } = await supabase
    .from("accounting_periods")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .in("status", ["OPEN", "open"])
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data || null;
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { user_id } = body;

    if (!user_id) {
      return Response.json(
        { success: false, error: "Missing user_id" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabase();

    const { data: staff, error } = await supabase
      .from("staff_accounts")
      .select("id, role, active_organization_id, name, email")
      .eq("auth_user_id", user_id)
      .maybeSingle();

    if (error) {
      return Response.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    if (!staff) {
      return Response.json(
        {
          success: false,
          reason: "STAFF_NOT_FOUND",
        },
        { status: 404 }
      );
    }

    const organizationId =
      staff.active_organization_id || null;

    if (!organizationId) {
      return Response.json(
        {
          success: false,
          reason: "ORGANIZATION_MISSING",
        },
        { status: 409 }
      );
    }

    const { data: organization, error: orgError } =
      await supabase
        .from("organizations")
        .select("*")
        .eq("id", organizationId)
        .maybeSingle();

    if (orgError || !organization) {
      return Response.json(
        {
          success: false,
          reason: "ORGANIZATION_NOT_FOUND",
          error: orgError?.message || null,
        },
        { status: 404 }
      );
    }

    const entity =
      await loadActiveEntity({
        supabase,
        organizationId,
      });

    const period =
      await loadActivePeriod({
        supabase,
        organizationId,
        entityId: entity?.id || null,
      });

    return Response.json({
      success: true,
      staff,
      organization,
      organization_id: organizationId,
      active_organization_id: organizationId,
      entity,
      entity_id: entity?.id || null,
      active_entity_id: entity?.id || null,
      period,
      period_id: period?.id || null,
      active_period_id: period?.id || null,
      country:
        organization.country ||
        entity?.country ||
        null,
      currency:
        organization.default_currency ||
        entity?.currency ||
        null,
      permissions: [],
      role: staff.role || "staff",
    });

  } catch (err) {
    return Response.json(
      {
        success: false,
        error:
          err.message ||
          "Server error",
      },
      {
        status: 500,
      }
    );
  }
}

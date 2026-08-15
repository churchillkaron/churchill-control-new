import { NextResponse } from "next/server";

import loadOperationalSettings from "@/lib/settings/loadOperationalSettings";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { resolvePayrollJurisdiction } from "@/lib/people/payroll";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MANAGE_ROLES = new Set([
  "OWNER",
  "SUPER_ADMIN",
  "MANAGER",
  "HR_ADMIN",
  "PAYROLL_ADMIN",
  "ACCOUNTING_ADMIN",
]);

function normalizeRole(value) {
  return String(value || "").trim().toUpperCase();
}

function operationalOnly(settings = {}) {
  const {
    country: _legacyCountry,
    currency: _legacyCurrency,
    ...operationalSettings
  } = settings || {};

  return operationalSettings;
}

export async function POST(request) {
  try {
    let body = {};

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const context = await resolveAuthenticatedStaffContext({
      request,
      organizationId:
        body?.organizationId || body?.organization_id || null,
    });

    if (!context.success) {
      return NextResponse.json(
        {
          success: false,
          error: context.error,
          code: context.code,
          availableOrganizationIds:
            context.availableOrganizationIds || [],
        },
        { status: context.status || 403 }
      );
    }

    const role = normalizeRole(context.role || context.staff?.role);

    if (!MANAGE_ROLES.has(role)) {
      return NextResponse.json(
        {
          success: false,
          error: "Payroll settings management permission required",
          code: "PAYROLL_SETTINGS_PERMISSION_REQUIRED",
        },
        { status: 403 }
      );
    }

    const [settings, entityResult] = await Promise.all([
      loadOperationalSettings({
        organizationId: context.organizationId,
        domain: "PAYROLL",
      }),
      supabaseAdmin
        .from("legal_entities")
        .select("id,legal_name,display_name,is_active,is_default_accounting_entity")
        .eq("organization_id", context.organizationId)
        .eq("is_active", true)
        .eq("is_default_accounting_entity", true)
        .limit(1)
        .maybeSingle(),
    ]);

    if (entityResult.error) throw entityResult.error;

    let jurisdiction = null;
    let legalEntity = null;

    if (entityResult.data?.id) {
      const resolved = await resolvePayrollJurisdiction({
        organizationId: context.organizationId,
        entityId: entityResult.data.id,
      });

      jurisdiction = {
        country: resolved.country,
        currency: resolved.currency,
        timezone: resolved.timezone,
      };
      legalEntity = {
        id: entityResult.data.id,
        name:
          entityResult.data.display_name ||
          entityResult.data.legal_name ||
          entityResult.data.id,
      };
    }

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      role,
      settings: operationalOnly(settings || {}),
      legalEntity,
      jurisdiction,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load payroll settings",
      },
      { status: 500 }
    );
  }
}

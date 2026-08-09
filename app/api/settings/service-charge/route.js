import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

async function resolveContext(request, body = {}) {
  return resolveAuthenticatedStaffContext({
    request,
    organizationId:
      body?.organizationId || body?.organization_id || null,
  });
}

function contextFailure(context) {
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

export async function POST(request) {
  try {
    let body = {};

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const context = await resolveContext(request, body);

    if (!context.success) {
      return contextFailure(context);
    }

    const { data, error } = await supabaseAdmin
      .from("organization_payout_policies")
      .select("*")
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      policy: data || null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load service charge policy",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const context = await resolveContext(request, body);

    if (!context.success) {
      return contextFailure(context);
    }

    const policy = body?.policy || {};
    const payload = {
      organization_id: context.organizationId,
      payout_model: policy.payout_model || "EQUAL",
      service_charge_percentage: Number(
        policy.service_charge_percentage || 0
      ),
      foh_percentage: Number(policy.foh_percentage || 0),
      bar_percentage: Number(policy.bar_percentage || 0),
      kitchen_percentage: Number(policy.kitchen_percentage || 0),
      performance_enabled: Boolean(policy.performance_enabled),
      void_penalty_enabled: Boolean(policy.void_penalty_enabled),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("organization_payout_policies")
      .upsert(payload, {
        onConflict: "organization_id",
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      policy: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to save service charge policy",
      },
      { status: 500 }
    );
  }
}

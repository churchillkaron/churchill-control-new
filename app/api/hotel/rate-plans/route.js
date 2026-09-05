import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

function clean(value) { return String(value ?? "").trim(); }
function errorResponse(error, status = 500) { return NextResponse.json({ success: false, error }, { status }); }

export async function GET(request) {
  try {
    const organizationId = clean(request.nextUrl.searchParams.get("organizationId") || request.nextUrl.searchParams.get("organization_id"));
    const propertyId = clean(request.nextUrl.searchParams.get("propertyId") || request.nextUrl.searchParams.get("property_id"));
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return errorResponse(access.error, access.status);
    if (!propertyId) return errorResponse("propertyId required", 400);
    const { data, error } = await supabaseAdmin.from("hotel_rate_plans").select("*").eq("organization_id", access.organizationId).eq("property_id", propertyId).order("active", { ascending: false }).order("name");
    if (error) throw error;
    return NextResponse.json({ success: true, ratePlans: data || [] });
  } catch (error) {
    console.error("HOTEL_RATE_PLAN_LIST_ERROR", error);
    return errorResponse(error?.message || "Unable to load rate plans");
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body.organizationId || body.organization_id);
    const propertyId = clean(body.propertyId || body.property_id);
    const name = clean(body.name);
    const code = clean(body.code || name).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return errorResponse(access.error, access.status);
    if (!propertyId || !name || !code) return errorResponse("propertyId and rate plan name required", 400);

    const { data: property, error: propertyError } = await supabaseAdmin.from("hotel_properties").select("id").eq("organization_id", access.organizationId).eq("id", propertyId).maybeSingle();
    if (propertyError) throw propertyError;
    if (!property) return errorResponse("Property not found", 404);

    const { data, error } = await supabaseAdmin.from("hotel_rate_plans").upsert({
      organization_id: access.organizationId,
      property_id: propertyId,
      code,
      name,
      currency_code: clean(body.currencyCode || body.currency_code || "THB").toUpperCase().slice(0, 3),
      meal_plan: clean(body.mealPlan || body.meal_plan) || null,
      refundable: body.refundable !== false,
      cancellation_policy: typeof body.cancellationPolicy === "object" && body.cancellationPolicy ? body.cancellationPolicy : {},
      active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "organization_id,property_id,code" }).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, ratePlan: data });
  } catch (error) {
    console.error("HOTEL_RATE_PLAN_SAVE_ERROR", error);
    return errorResponse(error?.message || "Unable to save rate plan", 400);
  }
}

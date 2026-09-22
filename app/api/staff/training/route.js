export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function relationMissing(error) {
  const code = String(error?.code || "").trim().toUpperCase();
  const message = String(error?.message || error || "");
  return code === "42P01" || code === "PGRST205" || /could not find the table|relation .* does not exist/i.test(message);
}

function unconfiguredPayload(staff) {
  return {
    success: true,
    configured: false,
    migration: "20260906182500_people_service_qualification_authority",
    staff: { id: staff?.id || null, name: staff?.name || null },
    qualifications: [],
    summary: { total: 0, verified: 0, expiring_or_expired: 0 },
  };
}

function expiryState(validUntil) {
  if (!validUntil) return { state: "NO_EXPIRY", days_remaining: null };
  const end = new Date(`${validUntil}T00:00:00.000Z`);
  if (Number.isNaN(end.getTime())) return { state: "UNKNOWN", days_remaining: null };
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const days = Math.ceil((end.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { state: "EXPIRED", days_remaining: days };
  if (days <= 30) return { state: "EXPIRING_SOON", days_remaining: days };
  return { state: "VALID", days_remaining: days };
}

export async function GET(request) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request });
    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error, code: context.code },
        { status: context.status || 403 },
      );
    }

    const { organizationId, staff } = context;
    const [catalogResult, holdingsResult] = await Promise.all([
      supabaseAdmin
        .from("people_qualification_catalog")
        .select("id,code,name,description,status")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .order("name", { ascending: true }),
      supabaseAdmin
        .from("staff_qualifications")
        .select("id,qualification_id,status,valid_from,valid_until,evidence_reference,verified_at")
        .eq("organization_id", organizationId)
        .eq("staff_id", staff.id)
        .order("valid_until", { ascending: true, nullsFirst: false }),
    ]);

    if (relationMissing(catalogResult.error) || relationMissing(holdingsResult.error)) {
      return NextResponse.json(unconfiguredPayload(staff));
    }
    if (catalogResult.error) throw catalogResult.error;
    if (holdingsResult.error) throw holdingsResult.error;

    const catalog = catalogResult.data || [];
    const byId = new Map(catalog.map((item) => [item.id, item]));
    const qualifications = (holdingsResult.data || []).map((holding) => {
      const definition = byId.get(holding.qualification_id) || null;
      return {
        id: holding.id,
        qualification_id: holding.qualification_id,
        code: definition?.code || null,
        name: definition?.name || definition?.code || "Qualification",
        description: definition?.description || null,
        status: holding.status || "unknown",
        verified: Boolean(holding.verified_at),
        valid_from: holding.valid_from || null,
        valid_until: holding.valid_until || null,
        evidence_reference: holding.evidence_reference || null,
        verified_at: holding.verified_at || null,
        expiry: expiryState(holding.valid_until),
      };
    });

    return NextResponse.json({
      success: true,
      configured: true,
      staff: { id: staff.id, name: staff.name || null },
      qualifications,
      summary: {
        total: qualifications.length,
        verified: qualifications.filter((item) => item.verified === true).length,
        expiring_or_expired: qualifications.filter((item) => ["EXPIRING_SOON", "EXPIRED"].includes(item.expiry.state)).length,
      },
    });
  } catch (error) {
    console.error("STAFF_TRAINING_GET_ERROR", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load staff qualifications" },
      { status: 500 },
    );
  }
}

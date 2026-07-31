export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");
    const access = await requireOrganizationAccess({ organizationId, request });

    if (!access.success) {
      return Response.json(
        { success: false, error: access.error },
        { status: access.status || 403 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("pos_shifts")
      .select("*")
      .eq("organization_id", access.organizationId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    return Response.json({
      success: true,
      actor: {
        user_id: access.user?.id || null,
        staff_id: access.access?.staffAccountId || access.staff?.id || null,
        staff_name:
          access.staff?.name ||
          access.staff?.display_name ||
          access.user?.email ||
          null,
      },
      shifts: data || [],
      activeShift:
        (data || []).find((shift) =>
          ["OPEN", "ACTIVE"].includes(String(shift.status || "").toUpperCase())
        ) || null,
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "Unable to load POS shifts" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organizationId || body.organization_id;
    const access = await requireOrganizationAccess({ organizationId, request });

    if (!access.success) {
      return Response.json(
        { success: false, error: access.error },
        { status: access.status || 403 }
      );
    }

    const action = String(body.action || "").toUpperCase();
    const staffId = access.access?.staffAccountId || access.staff?.id || null;
    const staffName =
      access.staff?.name ||
      access.staff?.display_name ||
      access.user?.email ||
      "Authenticated staff";
    const now = new Date().toISOString();

    if (action === "OPEN") {
      const existing = await supabaseAdmin
        .from("pos_shifts")
        .select("*")
        .eq("organization_id", access.organizationId)
        .in("status", ["OPEN", "ACTIVE"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing.error && existing.error.code !== "PGRST116") {
        throw existing.error;
      }

      if (existing.data) {
        return Response.json({ success: true, duplicate: true, shift: existing.data });
      }

      const { data, error } = await supabaseAdmin
        .from("pos_shifts")
        .insert({
          organization_id: access.organizationId,
          staff_id: staffId,
          staff_name: staffName,
          opening_cash: numeric(body.openingCash ?? body.opening_cash),
          status: "OPEN",
          opened_at: now,
          created_at: now,
          updated_at: now,
        })
        .select("*")
        .single();

      if (error) throw error;
      return Response.json({ success: true, shift: data });
    }

    if (action === "CLOSE") {
      const shiftId = body.shiftId || body.shift_id;
      if (!shiftId) {
        return Response.json(
          { success: false, error: "shiftId required" },
          { status: 400 }
        );
      }

      const { data, error } = await supabaseAdmin
        .from("pos_shifts")
        .update({
          closing_cash: numeric(body.closingCash ?? body.closing_cash),
          status: "CLOSED",
          closed_at: now,
          updated_at: now,
        })
        .eq("organization_id", access.organizationId)
        .eq("id", shiftId)
        .in("status", ["OPEN", "ACTIVE"])
        .select("*")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return Response.json(
          { success: false, error: "Active shift not found" },
          { status: 404 }
        );
      }

      return Response.json({ success: true, shift: data });
    }

    return Response.json(
      { success: false, error: "Unsupported shift action" },
      { status: 400 }
    );
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "POS shift action failed" },
      { status: 500 }
    );
  }
}

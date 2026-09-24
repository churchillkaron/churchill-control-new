import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";
const hash = (value) => createHash("sha256").update(String(value)).digest("hex");

export async function GET(_request, { params }) {
  try {
    const { token } = await params;
    const { data: invitation, error } = await supabaseAdmin
      .from("supplier_portal_invitations")
      .select("id,organization_id,supplier_profile_id,supplier_party_id,email,status,expires_at")
      .eq("token_hash", hash(token))
      .maybeSingle();
    if (error) throw error;
    if (!invitation) {
      return NextResponse.json({ success: false, error: "Invitation not found" }, { status: 404 });
    }

    const [{ data: organization, error: organizationError }, { data: party, error: partyError }] = await Promise.all([
      supabaseAdmin.from("organizations").select("id,name,legal_name").eq("id", invitation.organization_id).maybeSingle(),
      supabaseAdmin.from("parties").select("id,display_name,legal_name,email").eq("id", invitation.supplier_party_id).eq("organization_id", invitation.organization_id).maybeSingle(),
    ]);
    if (organizationError) throw organizationError;
    if (partyError) throw partyError;

    const now = new Date();
    const expired = new Date(invitation.expires_at).getTime() <= now.getTime();
    if (expired && invitation.status === "PENDING") {
      await supabaseAdmin
        .from("supplier_portal_invitations")
        .update({ status: "EXPIRED" })
        .eq("id", invitation.id)
        .eq("status", "PENDING")
        .lte("expires_at", now.toISOString());
    }

    return NextResponse.json({
      success: true,
      invitation: {
        status: expired ? "EXPIRED" : invitation.status,
        email: invitation.email,
        expiresAt: invitation.expires_at,
        organizationName: organization?.name || organization?.legal_name || "Customer organization",
        supplierName: party?.display_name || party?.legal_name || "Supplier",
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Unable to load supplier invitation" }, { status: 500 });
  }
}

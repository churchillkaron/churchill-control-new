export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { executeApproval } from "@/lib/shared/approvals/executeApproval";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { getStaffIdentity } from "@/lib/messages/getStaffIdentity";

// =========================
// PROCESS INVOICE APPROVAL
// =========================

export async function POST(req) {
  try {
    const body = await req.json();

    const { id, notes, organizationId } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Missing invoice id" },
        { status: 400 }
      );
    }

    // -----------------------------------
    // LOCKED RECORD PROTECTION
    // -----------------------------------
    const { data: existing, error: fetchError } =
      await supabaseAdmin
        .from("invoices")
        .select("status")
        .eq("id", id)
        .single();

    if (fetchError) throw fetchError;
    if (existing?.status === "locked") {
      return NextResponse.json(
        { success: false, error: "Locked accounting record" },
        { status: 403 }
      );
    }

    // -----------------------------------
    // TENANT + USER
    // -----------------------------------
    const access = await requireOrganizationAccess({ organizationId });
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const tenantId = access.tenantId;

    const staff = await getStaffIdentity();
    if (!staff) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // -----------------------------------
    // EXECUTE GOVERNED WORKFLOW
    // -----------------------------------
    const result = await executeApproval({
      workflowRequestId: body.workflowRequestId, // new signature
      actedBy: {
        id: staff.id,
        role: staff.role,
      },
      notes: notes || "Invoice approval",
    });

    return NextResponse.json({ success: true, result });
  } catch (err) {
    console.error("APPROVAL ERROR:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
      requiredPermission: "finance.configuration.manage",
    });

    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const id = body.id || body.template_id || body.row?.id;
    if (!id) throw new Error("Document template required");

    const { data: template, error: readError } = await supabaseAdmin
      .from("finance_document_templates")
      .select("*")
      .eq("organization_id", access.organizationId)
      .eq("id", id)
      .maybeSingle();

    if (readError) throw readError;
    if (!template) throw new Error("Document template not found");
    if (template.status === "ARCHIVED") throw new Error("Archived templates cannot be activated");

    const { error: deactivateError } = await supabaseAdmin
      .from("finance_document_templates")
      .update({ status: "DRAFT", updated_at: new Date().toISOString() })
      .eq("organization_id", access.organizationId)
      .eq("document_type", template.document_type)
      .eq("locale", template.locale)
      .eq("status", "ACTIVE")
      .neq("id", id);

    if (deactivateError) throw deactivateError;

    const { data: active, error: activateError } = await supabaseAdmin
      .from("finance_document_templates")
      .update({ status: "ACTIVE", updated_at: new Date().toISOString() })
      .eq("organization_id", access.organizationId)
      .eq("id", id)
      .select("*")
      .single();

    if (activateError) throw activateError;

    return NextResponse.json({ success: true, message: "Document template activated", template: active });
  } catch (error) {
    const message = error?.message || "Unable to activate document template";
    return NextResponse.json({ success: false, error: message }, { status: /required|not found|cannot/i.test(message) ? 400 : 500 });
  }
}

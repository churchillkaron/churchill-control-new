export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export async function POST(request, { params }) {
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

    const { data: template, error: readError } = await supabaseAdmin
      .from("finance_document_templates")
      .select("*")
      .eq("organization_id", access.organizationId)
      .eq("id", params.id)
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
      .neq("id", template.id);

    if (deactivateError) throw deactivateError;

    const { data: active, error: activateError } = await supabaseAdmin
      .from("finance_document_templates")
      .update({ status: "ACTIVE", updated_at: new Date().toISOString() })
      .eq("organization_id", access.organizationId)
      .eq("id", template.id)
      .select("*")
      .single();

    if (activateError) throw activateError;

    const { error: assetError } = await supabaseAdmin
      .from("creative_assets")
      .update({
        metadata: supabaseAdmin.rpc ? undefined : undefined,
      })
      .eq("organization_id", access.organizationId)
      .eq("asset_type", "DOCUMENT_DESIGN")
      .eq("file_url", template.template_source_url);

    if (assetError && String(assetError.code || "") !== "PGRST204") {
      console.warn("DOCUMENT TEMPLATE ASSET STATUS UPDATE FAILED", assetError);
    }

    return NextResponse.json({ success: true, message: "Document template activated", template: active });
  } catch (error) {
    const message = error?.message || "Unable to activate document template";
    return NextResponse.json({ success: false, error: message }, { status: /not found|cannot/i.test(message) ? 400 : 500 });
  }
}

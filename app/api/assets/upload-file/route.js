export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const supabase = createServerSupabase();
    const formData = await req.formData();

    const file = formData.get("file");
    const organizationId = formData.get("organizationId");

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request: req,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const resolvedOrganizationId = access.organizationId;
    const buffer = Buffer.from(await file.arrayBuffer());
    const safeName = String(file.name || "upload").replace(/[^a-zA-Z0-9._-]/g, "-");
    const filePath = `organization-documents/${resolvedOrganizationId}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("uploads")
      .upload(filePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { success: false, error: uploadError.message },
        { status: 500 }
      );
    }

    const { data: publicData } = supabase.storage
      .from("uploads")
      .getPublicUrl(filePath);

    const { data: document, error: documentError } = await supabaseAdmin
      .from("organization_documents")
      .insert({
        organization_id: resolvedOrganizationId,
        uploaded_by: access.userId || null,
        file_url: publicData.publicUrl,
        file_name: file.name || safeName,
        mime_type: file.type || null,
        approval_required: false,
        financial_impact: false,
        status: "uploaded",
      })
      .select("*")
      .single();

    if (documentError) {
      return NextResponse.json(
        { success: false, error: documentError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      organizationId: resolvedOrganizationId,
      url: publicData.publicUrl,
      document,
      documentId: document.id,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

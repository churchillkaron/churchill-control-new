export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { inspectWhatsAppConnection } from "@/lib/platform/service-runtime/providers/whatsapp/WhatsAppConnectionDiagnosticRuntime";

function text(value) {
  return String(value ?? "").trim();
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId =
      text(url.searchParams.get("organizationId")) ||
      text(url.searchParams.get("organization_id"));

    const access = await requireOrganizationAccess({ organizationId, request });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error || "Organization access denied" },
        { status: access.status || 403 },
      );
    }

    const validation = await inspectWhatsAppConnection({
      organization_id: access.organizationId,
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      validation,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "WhatsApp connection validation failed",
      },
      { status: 500 },
    );
  }
}

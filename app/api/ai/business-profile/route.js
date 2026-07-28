export const dynamic = "force-dynamic";

import {
  NextResponse,
} from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  getOrCreateBusinessProfile,
} from "@/lib/ai/profiles/getOrCreateBusinessProfile";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId =
      searchParams.get("organization_id") ||
      searchParams.get("organizationId");

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredAnyPermission: [
        "creative.*",
        "creative.asset.read",
        "marketing.*",
      ],
    });

    if (!access.success) {
      return NextResponse.json(access, { status: access.status });
    }

    const profile = await getOrCreateBusinessProfile({
      organizationId: access.organizationId,
    });

    return NextResponse.json({
      success: true,
      organization_id: access.organizationId,
      profile,
    });
  } catch (error) {
    console.error("BUSINESS PROFILE ERROR", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || String(error),
      },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getOrganizationWorkspace } from "@/lib/organizations/getOrganizationWorkspace";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const organizationId = searchParams.get("organizationId");
    const userEmail = searchParams.get("userEmail");

    if (!organizationId) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing organizationId",
        },
        { status: 400 }
      );
    }

    if (!userEmail) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing userEmail",
        },
        { status: 400 }
      );
    }

    const workspace = await getOrganizationWorkspace({
      userEmail,
      organizationId,
    });

    return NextResponse.json(workspace);

  } catch (error) {
    console.error("workspace api error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

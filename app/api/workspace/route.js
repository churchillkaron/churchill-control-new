export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getOrganizationWorkspace } from "@/lib/organizations/getOrganizationWorkspace";
import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const organizationId =
      searchParams.get("organizationId");

    if (!organizationId) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing organizationId",
        },
        {
          status: 400,
        }
      );
    }

    const user =
      await getServerCurrentUser();

    if (!user?.email) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    const workspace =
      await getOrganizationWorkspace({
        userEmail: user.email,
        organizationId,
      });

    return NextResponse.json(workspace);

  } catch (error) {

    console.error(
      "workspace api error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}

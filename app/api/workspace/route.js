import {
  NextResponse,
} from "next/server";

import {
  getServerCurrentUser,
} from "@/lib/auth/getServerCurrentUser";

import {
  getOrganizationWorkspace,
} from "@/lib/organizations/getOrganizationWorkspace";

export async function GET(request) {

  try {

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

    const {
      searchParams,
    } = new URL(
      request.url
    );

    const organizationId =
      searchParams.get(
        "organizationId"
      );

    const workspace =
      await getOrganizationWorkspace({
        userEmail:
          user.email,

        organizationId,
      });

    return NextResponse.json(
      workspace
    );

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

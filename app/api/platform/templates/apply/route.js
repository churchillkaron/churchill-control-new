import { NextResponse } from "next/server";

import {
  applyWorkspaceTemplate,
} from "@/lib/platform/templates/applyWorkspaceTemplate";

export async function POST(
  request
) {

  try {

    const body =
      await request.json();

    const result =
      await applyWorkspaceTemplate({

        organizationId:
          body.organizationId,

        templateId:
          body.templateId,

      });

    return NextResponse.json({

      success: true,

      installed:
        result.length,

      modules:
        result,

    });

  } catch (error) {

    console.error(error);

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

export const dynamic =
  "force-dynamic";

import {
  NextResponse,
}
from "next/server";

import {
  startVideoProject,
}
from "@/lib/video/projects/runtime/VideoProjectRuntime";

import {
  listProjects,
}
from "@/lib/video/projects/services/VideoProjectService";

export async function GET(
  request
) {

  const url =
    new URL(
      request.url
    );

  const organization_id =
    url.searchParams.get(
      "organization_id"
    );

  return NextResponse.json({

    success: true,

    data:
      await listProjects(
        organization_id
      ),

  });

}

export async function POST(
  request
) {

  try {

    const body =
      await request.json();

    const project =
      await startVideoProject(
        body
      );

    return NextResponse.json({

      success: true,

      data: project,

    });

  } catch (error) {

    console.error(
      error
    );

    return NextResponse.json({

      success: false,

      error:
        error.message,

    },{
      status:500
    });

  }

}

import { NextResponse } from "next/server";

import createDeploymentApproval from "@/lib/governance/createDeploymentApproval";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await createDeploymentApproval(
        body
      );

    return NextResponse.json(
      result
    );

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error:
          error.message,
      },
      {
        status: 500,
      }
    );
  }
}

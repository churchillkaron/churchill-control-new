import { NextResponse } from "next/server";

import checkDeploymentApproval from "@/lib/governance/checkDeploymentApproval";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await checkDeploymentApproval(
        body
      );

    return NextResponse.json(
      result
    );

  } catch (error) {

    return NextResponse.json(
      {
        approved: false,
        error:
          error.message,
      },
      {
        status: 500,
      }
    );
  }
}

import { NextResponse } from "next/server";

import runScheduler from "@/lib/distributed/scheduler/runScheduler";

import runWorker from "@/lib/distributed/workers/runWorker";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await runScheduler({

        tenant_id:
          body.tenant_id || "demo",
      });

    return NextResponse.json(
      result
    );

  } catch (error) {

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

export async function PUT(req) {

  try {

    const body =
      await req.json();

    const result =
      await runWorker({

        tenant_id:
          body.tenant_id || "demo",
      });

    return NextResponse.json(
      result
    );

  } catch (error) {

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

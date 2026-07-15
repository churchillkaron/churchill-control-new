export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";


import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

import { CreativeProviderExecutor } from "@/lib/creative/providers/runtime/CreativeProviderExecutor";

export async function POST() {
  try {


    const results = [];

    for (const job of jobs) {

      if (job.status !== "COMPLETED") continue;


      if (result) {
        results.push({
          job_id: job.id,
          asset_id: result.id,
        });
      }
    }

    return NextResponse.json({
      success: true,
      results,
    });

  } catch (error) {
    console.error(error);

    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}

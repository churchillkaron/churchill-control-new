export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";

import {
  CreativeAutonomousExecutionRuntime,
} from "@/lib/creative/worker/CreativeAutonomousExecutionRuntime";

function authorized(request) {
  const configuredSecret =
    process.env.CRON_SECRET ||
    process.env.AVANTIQO_INTERNAL_WORKER_SECRET;

  if (!configuredSecret) return false;

  const authorization = request.headers.get("authorization") || "";
  const workerSecret = request.headers.get("x-avantiqo-worker-secret") || "";

  return (
    authorization === `Bearer ${configuredSecret}` ||
    workerSecret === configuredSecret
  );
}

async function execute(request) {
  if (!authorized(request)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    let body = {};

    if (request.method === "POST") {
      body = await request.json().catch(() => ({}));
    }

    const result = await CreativeAutonomousExecutionRuntime.runFleet({
      project_limit: Number(body.project_limit || 20),
      max_dispatches_per_project: Number(
        body.max_dispatches_per_project || 20,
      ),
      lease_seconds: Number(body.lease_seconds || 180),
    });

    return NextResponse.json(result, {
      status: result.success ? 200 : 207,
    });
  } catch (error) {
    console.error("autonomous creative worker failed", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Autonomous creative worker failed",
      },
      { status: 500 },
    );
  }
}

export async function GET(request) {
  return execute(request);
}

export async function POST(request) {
  return execute(request);
}

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  CreativeJobRuntime,
} from "@/lib/creative/jobs/runtime/CreativeJobRuntime";

import {
  getCreativeProvider,
} from "@/lib/creative/providers/ProviderFactory";

export async function POST() {

  const jobs =
    await CreativeJobRuntime.poll(
      getCreativeProvider
    );

  return NextResponse.json({

    success: true,

    jobs,

  });

}

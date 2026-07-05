import { NextResponse } from "next/server";

import {
  CreativeConceptRuntime,
} from "@/lib/creative/concepts/runtime/CreativeConceptRuntime";

export async function GET(req){

  const { searchParams } =
    new URL(req.url);

  const organization_id =
    searchParams.get("organization_id");

  return NextResponse.json({

    concepts:
      await CreativeConceptRuntime.list(
        organization_id
      ),

  });

}

export async function POST(req){

  return NextResponse.json({

    concept:
      await CreativeConceptRuntime.create(
        await req.json()
      ),

  });

}

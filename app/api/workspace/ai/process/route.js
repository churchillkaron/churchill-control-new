import { NextResponse } from "next/server";
import { processAIEvents } from "@/lib/ai/processAIEvents";

export async function POST(req) {
  try {
    const { organizationId } = await req.json();

    if (!organizationId) {
      return NextResponse.json(
        { success: false, error: "Missing organizationId" },
        { status: 400 }
      );
    }

    const result = await processAIEvents({ organizationId });

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: 500 }
    );
  }
}

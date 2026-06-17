import { NextResponse } from "next/server";
import { provisionOrganization } from "@/lib/onboarding/provisionOrganization";
import { buildOnboardingCore } from "@/lib/onboarding/aiOnboardingCore";

export async function POST(request) {
  try {
    const body = await request.json();

    const payload = buildOnboardingCore({
      name: body.name,
      ownerEmail: body.ownerEmail,
    });

    const result = await provisionOrganization(payload);

    return NextResponse.json(result);

  } catch (error) {
    console.error("PROVISION ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

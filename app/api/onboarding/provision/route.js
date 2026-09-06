import { NextResponse } from "next/server";
import { provisionOrganization } from "@/lib/onboarding/provisionOrganization";
import { buildOnboardingCore } from "@/lib/onboarding/aiOnboardingCore";

function clean(value) {
  return String(value ?? "").trim();
}

function isThailand(country) {
  const normalized = clean(country).toLowerCase();
  return normalized === "thailand" || normalized === "th" || normalized === "tha";
}

export async function POST(request) {
  try {
    const body = await request.json();

    const name = clean(body.name);
    const ownerEmail = clean(body.ownerEmail).toLowerCase();
    const industry = clean(body.industry).toLowerCase();
    const country = clean(body.country);
    const ownerName = clean(body.ownerName);
    const ownerPhone = clean(body.ownerPhone);
    const thaiBusiness = isThailand(country);
    const currency = clean(body.currency || (thaiBusiness ? "THB" : "")).toUpperCase();
    const accountingStandard = clean(
      body.accountingStandard || (thaiBusiness ? "TFRS" : "IFRS")
    ).toUpperCase();

    if (!name || !industry || !country || !ownerName || !ownerEmail || !currency) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Organization name, industry, country, base currency, owner name and owner email are required",
        },
        { status: 400 }
      );
    }

    if (!/^[A-Z]{3}$/.test(currency)) {
      return NextResponse.json(
        {
          success: false,
          error: "Base currency must use a three-letter ISO currency code",
        },
        { status: 400 }
      );
    }

    const payload = buildOnboardingCore({
      name,
      ownerEmail,
      industry,
    });

    payload.organization = {
      ...payload.organization,
      name,
      legalName: name,
      industry,
      country,
    };

    payload.owner = {
      ...payload.owner,
      name: ownerName,
      email: ownerEmail,
      phone: ownerPhone || null,
    };

    payload.finance = {
      taxRegime: thaiBusiness ? "THAILAND" : "UNCONFIGURED",
      accountingStandard,
      accountingMode: "operational_entity",
      legalName: name,
      displayName: name,
      country,
      currency,
    };

    const result = await provisionOrganization(payload);

    if (!result?.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json({
      ...result,
      redirect: {
        redirectTo: `/workspace/${result.organization.id}`,
      },
    });
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

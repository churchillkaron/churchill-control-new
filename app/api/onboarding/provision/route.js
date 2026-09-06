import { NextResponse } from "next/server";
import { provisionOrganization } from "@/lib/onboarding/provisionOrganization";
import { buildOnboardingCore } from "@/lib/onboarding/aiOnboardingCore";
import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";

const ACTIVE_ORGANIZATION_COOKIE = "avantiqo_active_organization_id";
const LEGACY_ACTIVE_ORGANIZATION_COOKIE = "active_organization_id";

function clean(value) {
  return String(value ?? "").trim();
}

function isThailand(country) {
  const normalized = clean(country).toLowerCase();
  return normalized === "thailand" || normalized === "th" || normalized === "tha";
}

export async function POST(request) {
  try {
    const user = await getServerCurrentUser();

    if (!user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: "Authentication required",
          code: "AUTHENTICATION_REQUIRED",
        },
        { status: 401 }
      );
    }

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

    payload.requestedByAuthUserId = user.id;
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

    const response = NextResponse.json({
      ...result,
      redirect: {
        redirectTo: `/workspace/${result.organization.id}`,
      },
    });

    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    };

    response.cookies.set(
      ACTIVE_ORGANIZATION_COOKIE,
      result.organization.id,
      cookieOptions
    );
    response.cookies.set(
      LEGACY_ACTIVE_ORGANIZATION_COOKIE,
      result.organization.id,
      cookieOptions
    );

    return response;
  } catch (error) {
    console.error("PROVISION ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to create the organization",
      },
      { status: 500 }
    );
  }
}

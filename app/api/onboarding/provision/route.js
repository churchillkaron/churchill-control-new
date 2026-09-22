import { NextResponse } from "next/server";
import { provisionOrganization } from "@/lib/onboarding/provisionOrganization";
import { buildOnboardingCore } from "@/lib/onboarding/aiOnboardingCore";
import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";

const ACTIVE_ORGANIZATION_COOKIE = "avantiqo_active_organization_id";
const LEGACY_ACTIVE_ORGANIZATION_COOKIE = "active_organization_id";

function clean(value) {
  return String(value ?? "").trim();
}

function onboardingPlatformOrigin(request) {
  const url = request.nextUrl || new URL(request.url);
  const hostname = String(url.hostname || "").toLowerCase();
  const requestOrigin = String(url.origin || "").replace(/\/$/, "");

  if (
    hostname === "avantiqo.ai" ||
    hostname === "www.avantiqo.ai" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".vercel.app")
  ) {
    return requestOrigin;
  }

  return "https://avantiqo.ai";
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
    const requestedSignupIntent = body?.signupIntent === "accounting_firm" ? "accounting_firm" : "business";
    const selfSignup = user.user_metadata?.avantiqo_self_signup === true;
    const metadataSignupIntent = user.user_metadata?.avantiqo_signup_intent === "accounting_firm" ? "accounting_firm" : "business";
    if (selfSignup && requestedSignupIntent !== metadataSignupIntent) {
      return NextResponse.json(
        { success:false, error:"Onboarding intent does not match the authenticated signup identity" },
        { status:403 },
      );
    }
    if (selfSignup && metadataSignupIntent === "accounting_firm" && industry !== "accounting_firm") {
      return NextResponse.json(
        { success:false, error:"Accounting firm signup must use the governed Accounting Firm business type" },
        { status:403 },
      );
    }
    if (selfSignup && metadataSignupIntent === "business" && industry === "accounting_firm") {
      return NextResponse.json(
        { success:false, error:"Accounting Firm onboarding requires the accounting-firm signup path" },
        { status:403 },
      );
    }
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

    payload.paymentSetup =
      body?.paymentSetup && typeof body.paymentSetup === "object"
        ? body.paymentSetup
        : {};
    payload.appOrigin = onboardingPlatformOrigin(request);

    const result = await provisionOrganization(payload);

    if (!result?.success) {
      return NextResponse.json(result, { status: 400 });
    }

    const response = NextResponse.json({
      ...result,
      redirect: {
        redirectTo:
          result?.payments?.cardPayments?.onboardingUrl ||
          `/workspace/${result.organization.id}`,
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

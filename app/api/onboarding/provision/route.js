import { NextResponse } from "next/server";
import { provisionOrganization } from "@/lib/onboarding/provisionOrganization";
import { buildOnboardingCore } from "@/lib/onboarding/aiOnboardingCore";
import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveOnboardingJurisdictionPolicy } from "@/lib/onboarding/OnboardingJurisdictionPolicy";
import {
  acquireOnboardingProvisionRequest,
  completeOnboardingProvisionRequest,
  failOnboardingProvisionRequest,
  markOnboardingProvisioned,
  onboardingPayloadHash,
  validOnboardingRequestId,
} from "@/lib/onboarding/OnboardingProvisionRequestRuntime";

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

const ACCOUNTING_STANDARDS = new Set([
  "TFRS",
  "IFRS",
  "IFRS_FOR_SMES",
  "US_GAAP",
  "LOCAL_GAAP",
]);

function countryCode(value) {
  const raw = clean(value);
  if (!raw) return null;
  if (/^[A-Za-z]{2}$/.test(raw)) {
    const code = raw.toUpperCase();
    try {
      const display = new Intl.DisplayNames(["en"], { type: "region" });
      const label = clean(display.of(code));
      if (!label || label.toUpperCase() === code || label.toLowerCase() === "unknown region") return null;
    } catch {}
    return code;
  }

  const aliases = new Map([
    ["thailand", "TH"],
    ["tha", "TH"],
    ["united states", "US"],
    ["united states of america", "US"],
    ["usa", "US"],
    ["united kingdom", "GB"],
    ["uk", "GB"],
    ["great britain", "GB"],
    ["singapore", "SG"],
    ["sweden", "SE"],
    ["norway", "NO"],
    ["united arab emirates", "AE"],
    ["uae", "AE"],
  ]);
  const wanted = raw.toLowerCase();
  if (aliases.has(wanted)) return aliases.get(wanted);

  try {
    const displays = ["en", "th", "sv"].map((locale) => new Intl.DisplayNames([locale], { type: "region" }));
    for (let first = 65; first <= 90; first += 1) {
      for (let second = 65; second <= 90; second += 1) {
        const code = String.fromCharCode(first, second);
        if (displays.some((display) => clean(display.of(code)).toLowerCase() === wanted)) return code;
      }
    }
  } catch {}
  return null;
}

function currencyCode(value) {
  const code = clean(value).toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return null;
  try {
    if (typeof Intl.supportedValuesOf === "function" && !Intl.supportedValuesOf("currency").includes(code)) return null;
  } catch {}
  return code;
}

function isThailand(country) {
  return countryCode(country) === "TH";
}

function onboardingResponse(payload, organizationId) {
  const response = NextResponse.json(payload);
  if (!organizationId) return response;

  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  };
  response.cookies.set(ACTIVE_ORGANIZATION_COOKIE, organizationId, cookieOptions);
  response.cookies.set(LEGACY_ACTIVE_ORGANIZATION_COOKIE, organizationId, cookieOptions);
  return response;
}

export async function POST(request) {
  let onboardingReservation = null;
  let onboardingProvisioned = false;
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
    const onboardingSource = body?.onboardingSource === "supplier" ? "supplier" : "";
    const supplierAccountId = clean(body?.supplierAccountId);
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
    let supplierUpgradeAuthorized = false;
    let supplierAlreadyLinkedOrganizationId = null;
    if (onboardingSource === "supplier") {
      if (!supplierAccountId) {
        return NextResponse.json(
          { success:false, error:"Supplier account context is required for Supplier Business onboarding" },
          { status:400 },
        );
      }
      const { data: supplierMembership, error: supplierMembershipError } = await supabaseAdmin
        .from("supplier_portal_account_members")
        .select("id,role,status")
        .eq("supplier_account_id", supplierAccountId)
        .eq("auth_user_id", user.id)
        .eq("status", "ACTIVE")
        .maybeSingle();
      if (supplierMembershipError) throw supplierMembershipError;
      supplierUpgradeAuthorized = Boolean(
        supplierMembership &&
        ["OWNER","ADMIN"].includes(String(supplierMembership.role || "").trim().toUpperCase())
      );
      if (!supplierUpgradeAuthorized) {
        return NextResponse.json(
          { success:false, error:"Supplier owner or admin authority is required for Business upgrade" },
          { status:403 },
        );
      }

      const { data: supplierProfile, error: supplierProfileError } = await supabaseAdmin
        .from("supplier_portal_accounts")
        .select("id,business_organization_id")
        .eq("id", supplierAccountId)
        .maybeSingle();
      if (supplierProfileError) throw supplierProfileError;
      if (!supplierProfile) {
        return NextResponse.json(
          { success:false, error:"Supplier Network profile was not found" },
          { status:404 },
        );
      }
      supplierAlreadyLinkedOrganizationId = supplierProfile.business_organization_id || null;
    }

    const country = clean(body.country);
    const normalizedCountryCode = countryCode(country);
    const ownerName = clean(body.ownerName);
    const ownerPhone = clean(body.ownerPhone);
    const legalName = clean(body.legalName) || name;
    const companyRegistrationNumber = clean(body.companyRegistrationNumber);
    const taxRegistrationNumber = clean(body.taxRegistrationNumber);
    const thaiBusiness = normalizedCountryCode === "TH";
    const jurisdictionPolicy = resolveOnboardingJurisdictionPolicy(normalizedCountryCode);
    const currency = currencyCode(jurisdictionPolicy.currency || body.currency || "");
    const accountingStandard = clean(
      jurisdictionPolicy.accounting_standard || body.accountingStandard || "IFRS"
    ).toUpperCase();
    const vatRegistered = thaiBusiness ? body.vatRegistered === true : false;

    if (!name || !industry || !country || !ownerName || !ownerEmail) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Organization name, industry, country, owner name and owner email are required",
        },
        { status: 400 }
      );
    }

    if (!normalizedCountryCode) {
      return NextResponse.json(
        { success:false, error:"Country must be a recognized country name or two-letter ISO code" },
        { status:400 },
      );
    }

    if (!currency) {
      return NextResponse.json(
        { success:false, error:"Base currency must be a valid three-letter ISO currency code" },
        { status:400 },
      );
    }

    if (thaiBusiness && typeof body.vatRegistered !== "boolean") {
      return NextResponse.json(
        { success:false, error:"VAT registration must be answered Yes or No" },
        { status:400 },
      );
    }

    if (thaiBusiness && vatRegistered && !taxRegistrationNumber) {
      return NextResponse.json(
        { success:false, error:"VAT / tax registration number is required when VAT registered = Yes" },
        { status:400 },
      );
    }

    if (!ACCOUNTING_STANDARDS.has(accountingStandard)) {
      return NextResponse.json(
        { success:false, error:"Unsupported accounting standard" },
        { status:400 },
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
      return NextResponse.json(
        { success:false, error:"Owner email is invalid" },
        { status:400 },
      );
    }

    const authenticatedEmail = clean(user.email).toLowerCase();
    if (authenticatedEmail && ownerEmail !== authenticatedEmail) {
      return NextResponse.json(
        { success:false, error:"Owner email must match the authenticated Avantiqo account" },
        { status:403 },
      );
    }

    const onboardingRequestId = clean(body?.onboardingRequestId);
    if (!validOnboardingRequestId(onboardingRequestId)) {
      return NextResponse.json(
        { success:false, error:"A valid onboarding request ID is required" },
        { status:400 },
      );
    }

    const requestHash = onboardingPayloadHash({
      name,
      ownerEmail,
      ownerName,
      ownerPhone,
      industry,
      country: normalizedCountryCode,
      currency,
      accountingStandard,
      vatRegistered,
      legalName,
      companyRegistrationNumber: companyRegistrationNumber || null,
      taxRegistrationNumber: taxRegistrationNumber || null,
      signupIntent: requestedSignupIntent,
      onboardingSource,
      supplierAccountId: supplierAccountId || null,
      paymentSetup: body?.paymentSetup && typeof body.paymentSetup === "object" ? body.paymentSetup : {},
    });

    const requestState = await acquireOnboardingProvisionRequest({
      authUserId: user.id,
      requestId: onboardingRequestId,
      payloadHash: requestHash,
    });

    if (requestState.mode === "REPLAY") {
      const replay = requestState.row.response_payload;
      if (!replay?.success || !requestState.row.organization_id) {
        throw new Error("Completed onboarding request is missing its durable response");
      }
      return onboardingResponse(replay, requestState.row.organization_id);
    }

    onboardingReservation = requestState.row;
    if (
      onboardingSource === "supplier" &&
      supplierAlreadyLinkedOrganizationId &&
      String(supplierAlreadyLinkedOrganizationId) !== String(onboardingReservation.organization_id)
    ) {
      const conflict = new Error("Supplier Network profile is already linked to an Avantiqo Business");
      conflict.status = 409;
      throw conflict;
    }

    const payload = buildOnboardingCore({
      name,
      ownerEmail,
      industry,
    });

    payload.requestedByAuthUserId = user.id;
    payload.requestedOrganizationId = onboardingReservation.organization_id;
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
      taxRegime: jurisdictionPolicy.tax_regime,
      accountingStandard,
      accountingMode: "operational_entity",
      legalName,
      displayName: name,
      companyRegistrationNumber: companyRegistrationNumber || null,
      taxRegistrationNumber: taxRegistrationNumber || null,
      country,
      currency,
      timezone: jurisdictionPolicy.timezone || null,
      locale: jurisdictionPolicy.locale || null,
      vatRegistered,
      withholdingTaxEnabled: jurisdictionPolicy.withholding_tax_enabled === true,
      vatRate: jurisdictionPolicy.vat_rate ?? null,
      vatRateValidThrough: jurisdictionPolicy.vat_rate_valid_through || null,
      jurisdictionReviewRequired: jurisdictionPolicy.requires_review === true,
      fiscalYearStartMonth: jurisdictionPolicy.fiscal_year_start_month,
      fiscalYearStartDay: jurisdictionPolicy.fiscal_year_start_day,
      fiscalYearEndMonth: jurisdictionPolicy.fiscal_year_end_month,
      fiscalYearEndDay: jurisdictionPolicy.fiscal_year_end_day,
      jurisdictionAutomated: jurisdictionPolicy.automated === true,
    };

    payload.paymentSetup =
      body?.paymentSetup && typeof body.paymentSetup === "object"
        ? body.paymentSetup
        : {};
    payload.appOrigin = onboardingPlatformOrigin(request);

    let result = null;
    if (requestState.mode === "RESUME_PROVISIONED") {
      result = {
        success: true,
        organization: {
          id: onboardingReservation.organization_id,
        },
        resumed: true,
      };
      onboardingProvisioned = true;
    } else {
      result = await provisionOrganization(payload);

      if (!result?.success) {
        await failOnboardingProvisionRequest({
          row: onboardingReservation,
          errorMessage: result?.error || "Organization provisioning failed",
        });
        return NextResponse.json(
          { ...result, retryWithNewOnboardingRequest: true },
          { status: 400 },
        );
      }

      onboardingReservation = await markOnboardingProvisioned({
        row: onboardingReservation,
        organizationId: result.organization.id,
      });
      onboardingProvisioned = true;
    }

    let supplierLink = null;
    if (onboardingSource === "supplier" && supplierUpgradeAuthorized && supplierAccountId) {
      const { data: linkedSupplier, error: supplierLinkError } = await supabaseAdmin
        .from("supplier_portal_accounts")
        .update({
          business_organization_id: result.organization.id,
          business_linked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", supplierAccountId)
        .is("business_organization_id", null)
        .select("id,business_organization_id,business_linked_at")
        .maybeSingle();
      if (supplierLinkError) throw supplierLinkError;

      if (!linkedSupplier) {
        const { data: existingSupplierLink, error: existingSupplierLinkError } = await supabaseAdmin
          .from("supplier_portal_accounts")
          .select("id,business_organization_id,business_linked_at")
          .eq("id", supplierAccountId)
          .maybeSingle();
        if (existingSupplierLinkError) throw existingSupplierLinkError;
        if (!existingSupplierLink) {
          return NextResponse.json({ success:false, error:"Supplier Network profile was not found after Business provisioning" }, { status:409 });
        }
        if (
          existingSupplierLink.business_organization_id &&
          String(existingSupplierLink.business_organization_id) !== String(result.organization.id)
        ) {
          return NextResponse.json({ success:false, error:"Supplier Network profile is already linked to another Avantiqo Business" }, { status:409 });
        }
        supplierLink = existingSupplierLink;
      } else {
        supplierLink = linkedSupplier;
      }
    }

    const responsePayload = {
      ...result,
      supplierLink,
      redirect: {
        redirectTo:
          result?.payments?.cardPayments?.onboardingUrl ||
          (onboardingSource === "supplier"
            ? `/supplier-portal/settings?businessLinked=${encodeURIComponent(result.organization.id)}`
            : `/workspace/${result.organization.id}/administration/onboarding`),
      },
    };

    const durableReplayPayload = {
      success: true,
      replayed: true,
      organization: { id: result.organization.id },
      supplierLink: supplierLink
        ? {
            id: supplierLink.id || null,
            business_organization_id: supplierLink.business_organization_id || null,
            business_linked_at: supplierLink.business_linked_at || null,
          }
        : null,
      paymentSetupWarning: result?.paymentSetupWarning || null,
      paymentSetupContinuationRequired: Boolean(result?.payments?.cardPayments?.onboardingUrl),
      redirect: {
        redirectTo:
          onboardingSource === "supplier"
            ? `/supplier-portal/settings?businessLinked=${encodeURIComponent(result.organization.id)}`
            : `/workspace/${result.organization.id}/administration/onboarding`,
      },
    };

    onboardingReservation = await completeOnboardingProvisionRequest({
      row: onboardingReservation,
      responsePayload: durableReplayPayload,
    });

    return onboardingResponse(responsePayload, result.organization.id);
  } catch (error) {
    console.error("PROVISION ERROR", error);

    if (onboardingReservation && !onboardingProvisioned) {
      await failOnboardingProvisionRequest({
        row: onboardingReservation,
        errorMessage: error?.message || "Unable to create the organization",
      }).catch(() => {});
    }

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to create the organization",
        retryWithNewOnboardingRequest:
          error?.retryWithNewOnboardingRequest === true ||
          Boolean(onboardingReservation && !onboardingProvisioned),
      },
      { status: error?.status || 500 }
    );
  }
}

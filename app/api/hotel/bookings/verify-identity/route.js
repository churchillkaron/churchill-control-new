import { NextResponse } from "next/server";

import { broadcastHotelReadinessChanged } from "@/lib/hotel/server/broadcastHotelReadinessChanged";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

const clean = (value) => String(value ?? "").trim();
const fail = (error, status = 400) => NextResponse.json({ success: false, error }, { status });
const ALLOWED_METHODS = new Set([
  "IN_PERSON_DOCUMENT_REVIEW",
  "PASSPORT_REVIEW",
  "NATIONAL_ID_REVIEW",
]);

function governedIdentityError(error) {
  const message = clean(error?.message || error?.details || error?.hint);
  const known = [
    "HOTEL_IDENTITY_VERIFY_SCOPE_REQUIRED",
    "HOTEL_IDENTITY_VERIFY_STAFF_REQUIRED",
    "HOTEL_IDENTITY_VERIFY_METHOD_INVALID",
    "HOTEL_IDENTITY_VERIFY_BOOKING_NOT_FOUND",
    "HOTEL_IDENTITY_VERIFY_BOOKING_NOT_ACTIVE",
    "HOTEL_IDENTITY_VERIFY_GUEST_REQUIRED",
    "HOTEL_IDENTITY_VERIFY_GUEST_NOT_FOUND",
    "HOTEL_IDENTITY_VERIFY_GUEST_CHANGED",
  ];
  return known.find((code) => message.includes(code)) || null;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body.organizationId || body.organization_id);
    const bookingId = clean(body.bookingId || body.booking_id);
    const verificationMethod = clean(body.verificationMethod || body.verification_method || "IN_PERSON_DOCUMENT_REVIEW").toUpperCase();

    if (!organizationId) return fail("organizationId required");
    if (!bookingId) return fail("bookingId required");
    if (!ALLOWED_METHODS.has(verificationMethod)) return fail("Unsupported identity verification method");

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return fail(access.error, access.status);
    if (!access.access?.staffAccountId) return fail("Active staff identity is required to verify a guest", 403);

    const { data, error } = await supabaseAdmin.rpc("hotel_verify_guest_identity_guarded", {
      p_organization_id: access.organizationId,
      p_booking_id: bookingId,
      p_verified_by_staff_account_id: access.access.staffAccountId,
      p_verification_method: verificationMethod,
    });

    if (error) {
      const governed = governedIdentityError(error);
      if (governed === "HOTEL_IDENTITY_VERIFY_BOOKING_NOT_FOUND") return fail("Booking not found for this organization", 404);
      if (governed) return fail("Guest identity could not be verified because the stay or guest state changed. Refresh Front Desk and review the guest.", 409);
      throw error;
    }

    await broadcastHotelReadinessChanged({
      organizationId: access.organizationId,
      source: "front-desk-identity",
      action: "IDENTITY_VERIFIED",
    });

    return NextResponse.json({
      success: true,
      verification: {
        bookingId: data?.booking_id || bookingId,
        guestId: data?.guest_id || null,
        verifiedAt: data?.verified_at || null,
        evidenceId: data?.evidence_id || null,
        alreadyVerified: data?.already_verified === true,
      },
    });
  } catch (error) {
    console.error("HOTEL_GUEST_IDENTITY_VERIFY_ERROR", error);
    return fail(error?.message || "Unable to verify guest identity", 500);
  }
}

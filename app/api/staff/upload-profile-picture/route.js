export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { staffApiErrorResponse } from "@/lib/people/portal/StaffApiError";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { assertStaffUploadSignature } from "@/lib/people/security/StaffUploadSecurity";

const BUCKET = "staff-profile-pictures";
const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
const MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request });
    if (!context.success) {
      return NextResponse.json({ success: false, error: context.error, code: context.code }, { status: context.status || 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ success: false, error: "Image file required" }, { status: 400 });
    }

    const requestedStaffId = String(formData.get("staff_id") || "").trim();
    if (requestedStaffId && requestedStaffId !== context.staff.id) {
      return NextResponse.json({ success: false, error: "Staff profile scope mismatch" }, { status: 403 });
    }

    const contentType = String(file.type || "").trim().toLowerCase();
    if (!MIME_TYPES.has(contentType)) {
      return NextResponse.json({ success: false, error: "Profile image must be JPEG, PNG or WebP" }, { status: 400 });
    }
    if (Number(file.size || 0) <= 0 || Number(file.size || 0) > MAX_PROFILE_IMAGE_BYTES) {
      return NextResponse.json({ success: false, error: "Profile image must be 5 MB or smaller" }, { status: 400 });
    }
    await assertStaffUploadSignature(file, { allowedMimeTypes: MIME_TYPES });

    const storagePath = `${context.organizationId}/${context.staff.id}/profile`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const upload = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, buffer, {
      contentType,
      cacheControl: "3600",
      upsert: true,
    });
    if (upload.error) throw upload.error;

    const appUrl = `/api/staff/profile-picture/${context.staff.id}`;
    const updated = await supabaseAdmin.from("staff_accounts")
      .update({ profile_picture: appUrl })
      .eq("id", context.staff.id)
      .eq("active_organization_id", context.organizationId)
      .eq("active", true)
      .select("id,profile_picture")
      .maybeSingle();
    if (updated.error) throw updated.error;
    if (!updated.data) throw new Error("Active staff profile not found in organization scope");

    return NextResponse.json({ success: true, url: appUrl, private: true });
  } catch (error) {
    return staffApiErrorResponse(error, "Unable to update profile picture");
  }
}

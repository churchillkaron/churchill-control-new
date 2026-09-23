export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { staffApiErrorResponse } from "@/lib/people/portal/StaffApiError";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { assertStaffUploadSignature } from "@/lib/people/security/StaffUploadSecurity";

const BUCKET = "service-evidence";
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function safeFileName(value) {
  return String(value || "evidence")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 140) || "evidence";
}

function storageReference(path) {
  return `storage://${BUCKET}/${path}`;
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const context = await resolveAuthenticatedStaffContext({ request });

    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error, code: context.code },
        { status: context.status || 403 },
      );
    }

    const workOrderId = String(
      formData.get("workOrderId") || formData.get("work_order_id") || "",
    ).trim();
    const evidenceType = String(formData.get("evidenceType") || "evidence").trim();
    const fieldKey = String(formData.get("fieldKey") || "").trim() || null;
    const file = formData.get("file");

    if (!workOrderId) {
      return NextResponse.json({ success: false, error: "workOrderId required" }, { status: 400 });
    }
    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ success: false, error: "Evidence file required" }, { status: 400 });
    }

    const mimeType = String(file.type || "").trim().toLowerCase();
    if (!ALLOWED_TYPES.has(mimeType)) {
      return NextResponse.json({ success: false, error: "Evidence must be JPEG, PNG, WebP or PDF" }, { status: 415 });
    }
    if (Number(file.size || 0) <= 0) {
      return NextResponse.json({ success: false, error: "Evidence file is empty" }, { status: 400 });
    }
    if (Number(file.size || 0) > MAX_FILE_BYTES) {
      return NextResponse.json({ success: false, error: "Evidence file exceeds 15 MB" }, { status: 413 });
    }
    await assertStaffUploadSignature(file, { allowedMimeTypes: ALLOWED_TYPES });

    const assignment = await supabaseAdmin
      .from("operations_records")
      .select("id,entity_id")
      .eq("organization_id", context.organizationId)
      .eq("capability_id", "work-orders")
      .eq("id", workOrderId)
      .eq("assigned_to", context.staff.id)
      .maybeSingle();

    if (assignment.error) throw assignment.error;
    if (!assignment.data) {
      return NextResponse.json({ success: false, error: "This work order is not assigned to you." }, { status: 404 });
    }

    const fileName = safeFileName(file.name);
    const storagePath = [
      context.organizationId,
      "staff-work-orders",
      workOrderId,
      context.staff.id,
      `${Date.now()}-${crypto.randomUUID()}-${fileName}`,
    ].join("/");
    const buffer = Buffer.from(await file.arrayBuffer());

    const upload = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: mimeType,
        cacheControl: "3600",
        upsert: false,
        metadata: {
          organization_id: context.organizationId,
          entity_id: assignment.data.entity_id || null,
          work_order_id: workOrderId,
          staff_id: context.staff.id,
          evidence_type: evidenceType,
          field_key: fieldKey,
          original_name: file.name || fileName,
        },
      });

    if (upload.error) throw upload.error;

    return NextResponse.json({
      success: true,
      evidence: {
        reference: storageReference(storagePath),
        file_name: file.name || fileName,
        mime_type: mimeType,
        size_bytes: Number(file.size || buffer.length),
        evidence_type: evidenceType,
        field_key: fieldKey,
        uploaded_at: new Date().toISOString(),
        private: true,
      },
    });
  } catch (error) {
    console.error("STAFF_MY_DAY_EVIDENCE_UPLOAD_ERROR", error);
    return staffApiErrorResponse(error, "Evidence upload failed");
  }
}

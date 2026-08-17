export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { loadStaffWorkday } from "@/lib/people/workforce/shiftRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { appendExecutionEvidenceForStaff } from "@/lib/service-management/runtime/ServiceExecutionRuntime";

const BUCKET = "service-evidence";
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const MAX_SIZE = 20 * 1024 * 1024;

function errorResponse(error) {
  return NextResponse.json(
    { success: false, error: error?.message || "Unable to upload evidence." },
    { status: error?.status || 500 }
  );
}

function safePart(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export async function POST(request) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request });
    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error || "Staff access denied." },
        { status: context.status || 403 }
      );
    }

    const workday = await loadStaffWorkday({
      organizationId: context.organizationId,
      staffId: context.staff.id,
    });
    if (!workday.openShift) {
      return NextResponse.json(
        { success: false, error: "Start your shift before uploading service evidence." },
        { status: 409 }
      );
    }

    const form = await request.formData();
    const workOrderId = String(form.get("workOrderId") || form.get("work_order_id") || "").trim();
    const file = form.get("file");
    const requirementId = safePart(form.get("requirementId") || form.get("requirement_id"));
    const category = safePart(form.get("category") || "evidence");

    if (!workOrderId) {
      return NextResponse.json(
        { success: false, error: "workOrderId is required." },
        { status: 400 }
      );
    }
    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json(
        { success: false, error: "Evidence file is required." },
        { status: 400 }
      );
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json(
        { success: false, error: "Unsupported evidence file type." },
        { status: 415 }
      );
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: "Evidence file exceeds the 20 MB limit." },
        { status: 413 }
      );
    }

    const extension = safePart(file.name.split(".").pop() || "bin");
    const unique = `${Date.now()}-${crypto.randomUUID()}`;
    const path = [
      safePart(context.organizationId),
      safePart(workOrderId),
      `${unique}.${extension}`,
    ].join("/");
    const bytes = new Uint8Array(await file.arrayBuffer());

    const upload = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type,
      upsert: false,
    });
    if (upload.error) throw upload.error;

    const evidence = {
      id: crypto.randomUUID(),
      bucket: BUCKET,
      path,
      requirement_id: requirementId || null,
      category: category || "evidence",
      file_name: file.name,
      content_type: file.type,
      size_bytes: file.size,
      captured_at: new Date().toISOString(),
      uploaded_by_staff_id: context.staff.id,
    };

    try {
      const report = await appendExecutionEvidenceForStaff({
        organizationId: context.organizationId,
        staffId: context.staff.id,
        workOrderId,
        evidence,
      });

      const signed = await supabaseAdmin.storage
        .from(BUCKET)
        .createSignedUrl(path, 3600);

      return NextResponse.json({
        success: true,
        evidence,
        report,
        signedUrl: signed.data?.signedUrl || null,
      });
    } catch (error) {
      await supabaseAdmin.storage.from(BUCKET).remove([path]);
      throw error;
    }
  } catch (error) {
    console.error("STAFF_SERVICE_EVIDENCE_POST_ERROR", error);
    return errorResponse(error);
  }
}

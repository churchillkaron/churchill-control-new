export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import crypto from "node:crypto";
import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MAX_FILE_BYTES = 15 * 1024 * 1024;

function safeFileName(value) {
  return String(value || "evidence")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 140) || "evidence";
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
      return NextResponse.json(
        { success: false, error: "workOrderId required" },
        { status: 400 },
      );
    }
    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json(
        { success: false, error: "Evidence file required" },
        { status: 400 },
      );
    }
    if (Number(file.size || 0) <= 0) {
      return NextResponse.json(
        { success: false, error: "Evidence file is empty" },
        { status: 400 },
      );
    }
    if (Number(file.size || 0) > MAX_FILE_BYTES) {
      return NextResponse.json(
        { success: false, error: "Evidence file exceeds 15 MB" },
        { status: 413 },
      );
    }

    const assignment = await supabaseAdmin
      .from("operations_records")
      .select("id")
      .eq("organization_id", context.organizationId)
      .eq("capability_id", "work-orders")
      .eq("id", workOrderId)
      .eq("assigned_to", context.staff.id)
      .maybeSingle();

    if (assignment.error) throw assignment.error;
    if (!assignment.data) {
      return NextResponse.json(
        { success: false, error: "This work order is not assigned to you." },
        { status: 404 },
      );
    }

    const fileName = safeFileName(file.name);
    const storagePath = [
      "service-execution-evidence",
      context.organizationId,
      workOrderId,
      context.staff.id,
      `${Date.now()}-${crypto.randomUUID()}-${fileName}`,
    ].join("/");
    const buffer = Buffer.from(await file.arrayBuffer());

    const upload = await supabaseAdmin.storage
      .from("uploads")
      .upload(storagePath, buffer, {
        contentType: file.type || "application/octet-stream",
        cacheControl: "3600",
        upsert: false,
      });

    if (upload.error) throw upload.error;

    const { data: publicData } = supabaseAdmin.storage
      .from("uploads")
      .getPublicUrl(storagePath);
    const externalUrl = publicData?.publicUrl || null;
    if (!externalUrl) throw new Error("Evidence URL unavailable");

    return NextResponse.json({
      success: true,
      evidence: {
        storage_path: storagePath,
        external_url: externalUrl,
        file_name: file.name || fileName,
        mime_type: file.type || "application/octet-stream",
        size_bytes: Number(file.size || buffer.length),
        evidence_type: evidenceType,
        field_key: fieldKey,
        uploaded_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("STAFF_MY_DAY_EVIDENCE_UPLOAD_ERROR", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Evidence upload failed" },
      { status: error?.status || 500 },
    );
  }
}

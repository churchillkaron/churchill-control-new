export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import crypto from "node:crypto";
import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const BUCKET = "service-evidence";
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const PREVIEW_SECONDS = 15 * 60;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function storageReference(path) {
  return `storage://${BUCKET}/${path}`;
}

function pathFromReference(reference) {
  const value = String(reference || "").trim();
  const prefix = `storage://${BUCKET}/`;
  return value.startsWith(prefix) ? value.slice(prefix.length) : null;
}

async function signedPreview(path) {
  const result = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, PREVIEW_SECONDS);
  if (result.error) throw result.error;
  return result.data?.signedUrl || null;
}

function safeFileName(value) {
  return String(value || "evidence")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 140) || "evidence";
}

export async function GET(request) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request });
    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error, code: context.code },
        { status: context.status || 403 },
      );
    }

    const url = new URL(request.url);
    const workOrderId = String(url.searchParams.get("workOrderId") || "").trim();
    const reference = String(url.searchParams.get("reference") || "").trim();
    if (!workOrderId || !reference) {
      return NextResponse.json(
        { success: false, error: "workOrderId and reference are required" },
        { status: 400 },
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

    const path = pathFromReference(reference);
    const expectedPrefix = `${context.organizationId}/work-orders/${workOrderId}/${context.staff.id}/`;
    if (!path || !path.startsWith(expectedPrefix)) {
      return NextResponse.json(
        { success: false, error: "Evidence does not belong to this assigned work order." },
        { status: 403 },
      );
    }

    return NextResponse.json({
      success: true,
      reference,
      preview_url: await signedPreview(path),
      preview_expires_in: PREVIEW_SECONDS,
    });
  } catch (error) {
    console.error("STAFF_MY_DAY_EVIDENCE_PREVIEW_ERROR", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Evidence preview failed" },
      { status: error?.status || 500 },
    );
  }
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
    const mimeType = String(file.type || "").trim().toLowerCase();
    if (!ALLOWED_TYPES.has(mimeType)) {
      return NextResponse.json(
        { success: false, error: "Evidence must be a JPEG, PNG, WebP or PDF file" },
        { status: 415 },
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
      context.organizationId,
      "work-orders",
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
          work_order_id: workOrderId,
          staff_account_id: context.staff.id,
          evidence_type: evidenceType,
          field_key: fieldKey,
          original_name: file.name || fileName,
        },
      });

    if (upload.error) throw upload.error;

    const previewUrl = await signedPreview(storagePath);
    if (!previewUrl) throw new Error("Evidence preview unavailable");

    return NextResponse.json({
      success: true,
      evidence: {
        reference: storageReference(storagePath),
        bucket: BUCKET,
        storage_path: storagePath,
        preview_url: previewUrl,
        preview_expires_in: PREVIEW_SECONDS,
        external_url: previewUrl,
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

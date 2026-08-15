export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

function safeFileName(value) {
  return String(value || "file")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 140) || "file";
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const organizationId = String(
      formData.get("organizationId") || formData.get("organization_id") || "",
    ).trim();
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 },
      );
    }

    const file = formData.get("file");
    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json(
        { success: false, error: "File required" },
        { status: 400 },
      );
    }
    if (Number(file.size || 0) <= 0) {
      return NextResponse.json(
        { success: false, error: "File is empty" },
        { status: 400 },
      );
    }
    if (Number(file.size || 0) > MAX_FILE_BYTES) {
      return NextResponse.json(
        { success: false, error: "File exceeds the 25 MB communication limit" },
        { status: 413 },
      );
    }

    const fileName = safeFileName(file.name);
    const storagePath = [
      "communication-attachments",
      access.organizationId,
      access.staff?.id || "user",
      `${Date.now()}-${crypto.randomUUID()}-${fileName}`,
    ].join("/");
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabaseAdmin.storage
      .from("uploads")
      .upload(storagePath, buffer, {
        contentType: file.type || "application/octet-stream",
        cacheControl: "3600",
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data: publicData } = supabaseAdmin.storage
      .from("uploads")
      .getPublicUrl(storagePath);
    const externalUrl = publicData?.publicUrl || null;
    if (!externalUrl) throw new Error("Communication attachment URL unavailable");

    return NextResponse.json({
      success: true,
      attachment: {
        storage_path: storagePath,
        external_url: externalUrl,
        file_name: file.name || fileName,
        mime_type: file.type || "application/octet-stream",
        size_bytes: Number(file.size || buffer.length),
        metadata: {
          source: "AVANTIQO_COMMUNICATION_UPLOAD",
          uploaded_by_staff_id: access.staff?.id || null,
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Communication attachment upload failed" },
      { status: 500 },
    );
  }
}

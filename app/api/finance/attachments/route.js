export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const BUCKET = "uploads";
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function normalizeRecordType(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");

  if (["journal", "journals", "journal_entry", "journal_entries"].includes(normalized)) {
    return "journal_entry";
  }

  if (["general_ledger", "ledger", "ledger_entry", "ledger_entries"].includes(normalized)) {
    return "general_ledger";
  }

  throw new Error("Unsupported finance attachment record type");
}

function safeFileName(value) {
  return String(value || "attachment")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 180);
}

function originalFileName(storageName) {
  return String(storageName || "attachment")
    .replace(/^\d+-[0-9a-f-]{36}-/i, "");
}

function attachmentPrefix(organizationId, recordType, recordId) {
  return `finance-records/${organizationId}/${recordType}/${recordId}`;
}

async function requireRecord({ organizationId, entityId, recordType, recordId }) {
  const table = recordType === "journal_entry"
    ? "journal_entries"
    : "general_ledger";

  let query = supabaseAdmin
    .from(table)
    .select("id, organization_id, entity_id")
    .eq("organization_id", organizationId)
    .eq("id", recordId);

  if (entityId) {
    query = query.eq("entity_id", entityId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Finance record not found");

  return data;
}

async function auditAttachment({ organizationId, recordType, recordId, action, metadata, userId }) {
  try {
    await supabaseAdmin
      .from("audit_logs")
      .insert({
        organization_id: organizationId,
        action,
        entity_type: recordType,
        entity_id: recordId,
        actor_id: userId || null,
        metadata: metadata || {},
      });
  } catch (error) {
    console.warn("finance attachment audit failed", error?.message || error);
  }
}

async function resolveAccess(request, body = null) {
  const url = new URL(request.url);
  const requestedOrganizationId =
    body?.organizationId ||
    body?.organization_id ||
    url.searchParams.get("organizationId") ||
    url.searchParams.get("organization_id");

  const access = await requireOrganizationAccess({
    organizationId: requestedOrganizationId,
  });

  if (!access.success) {
    return {
      response: NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      ),
    };
  }

  return { access, url };
}

export async function GET(request) {
  try {
    const resolved = await resolveAccess(request);
    if (resolved.response) return resolved.response;

    const { access, url } = resolved;
    const recordType = normalizeRecordType(
      url.searchParams.get("recordType") ||
      url.searchParams.get("record_type")
    );
    const recordId =
      url.searchParams.get("recordId") ||
      url.searchParams.get("record_id");
    const entityId =
      url.searchParams.get("entityId") ||
      url.searchParams.get("entity_id") ||
      null;

    if (!recordId) {
      return NextResponse.json(
        { success: false, error: "recordId required" },
        { status: 400 }
      );
    }

    await requireRecord({
      organizationId: access.organizationId,
      entityId,
      recordType,
      recordId,
    });

    const prefix = attachmentPrefix(
      access.organizationId,
      recordType,
      recordId
    );

    const { data: objects, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .list(prefix, {
        limit: 100,
        sortBy: { column: "created_at", order: "desc" },
      });

    if (error) throw error;

    const attachments = await Promise.all(
      (objects || [])
        .filter(object => object?.name && object.name !== ".emptyFolderPlaceholder")
        .map(async object => {
          const storagePath = `${prefix}/${object.name}`;
          const { data: signedData, error: signedError } = await supabaseAdmin.storage
            .from(BUCKET)
            .createSignedUrl(storagePath, 60 * 60);

          return {
            id: storagePath,
            storage_path: storagePath,
            file_name: originalFileName(object.name),
            mime_type:
              object.metadata?.mimetype ||
              object.metadata?.contentType ||
              null,
            file_size: Number(object.metadata?.size || 0),
            created_at:
              object.created_at ||
              object.updated_at ||
              object.last_accessed_at ||
              null,
            url: signedError ? null : signedData?.signedUrl || null,
          };
        })
    );

    return NextResponse.json({
      success: true,
      recordType,
      recordId,
      attachments,
    });
  } catch (error) {
    const message = error.message || "Attachments could not be loaded";
    const status = /required|unsupported|not found/i.test(message) ? 400 : 500;

    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const body = {
      organizationId:
        formData.get("organizationId") ||
        formData.get("organization_id"),
    };

    const resolved = await resolveAccess(request, body);
    if (resolved.response) return resolved.response;

    const { access } = resolved;
    const file = formData.get("file");
    const recordType = normalizeRecordType(
      formData.get("recordType") ||
      formData.get("record_type")
    );
    const recordId =
      formData.get("recordId") ||
      formData.get("record_id");
    const entityId =
      formData.get("entityId") ||
      formData.get("entity_id") ||
      null;

    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json(
        { success: false, error: "file required" },
        { status: 400 }
      );
    }

    if (!recordId) {
      return NextResponse.json(
        { success: false, error: "recordId required" },
        { status: 400 }
      );
    }

    if (Number(file.size || 0) <= 0) {
      return NextResponse.json(
        { success: false, error: "Attachment is empty" },
        { status: 400 }
      );
    }

    if (Number(file.size || 0) > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "Attachment exceeds the 20 MB limit" },
        { status: 400 }
      );
    }

    const mimeType = file.type || "application/octet-stream";
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json(
        { success: false, error: "Unsupported attachment file type" },
        { status: 400 }
      );
    }

    await requireRecord({
      organizationId: access.organizationId,
      entityId,
      recordType,
      recordId,
    });

    const prefix = attachmentPrefix(
      access.organizationId,
      recordType,
      recordId
    );
    const fileName = safeFileName(file.name);
    const storageName = `${Date.now()}-${crypto.randomUUID()}-${fileName}`;
    const storagePath = `${prefix}/${storageName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false,
        metadata: {
          originalName: file.name,
          uploadedBy: access.user?.id || null,
        },
      });

    if (uploadError) throw uploadError;

    const { data: signedData, error: signedError } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 60 * 60);

    await auditAttachment({
      organizationId: access.organizationId,
      recordType,
      recordId,
      action: "ATTACHMENT_UPLOADED",
      userId: access.user?.id || null,
      metadata: {
        storage_path: storagePath,
        file_name: file.name,
        mime_type: mimeType,
        file_size: Number(file.size || 0),
      },
    });

    return NextResponse.json({
      success: true,
      attachment: {
        id: storagePath,
        storage_path: storagePath,
        file_name: file.name,
        mime_type: mimeType,
        file_size: Number(file.size || 0),
        created_at: new Date().toISOString(),
        url: signedError ? null : signedData?.signedUrl || null,
      },
    });
  } catch (error) {
    const message = error.message || "Attachment upload failed";
    const status = /required|unsupported|not found|empty|limit/i.test(message)
      ? 400
      : 500;

    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}

export async function DELETE(request) {
  try {
    const body = await request.json();
    const resolved = await resolveAccess(request, body);
    if (resolved.response) return resolved.response;

    const { access } = resolved;
    const recordType = normalizeRecordType(
      body.recordType ||
      body.record_type
    );
    const recordId = body.recordId || body.record_id;
    const entityId = body.entityId || body.entity_id || null;
    const storagePath = String(
      body.storagePath ||
      body.storage_path ||
      ""
    ).trim();

    if (!recordId || !storagePath) {
      return NextResponse.json(
        { success: false, error: "recordId and storagePath required" },
        { status: 400 }
      );
    }

    await requireRecord({
      organizationId: access.organizationId,
      entityId,
      recordType,
      recordId,
    });

    const prefix = `${attachmentPrefix(
      access.organizationId,
      recordType,
      recordId
    )}/`;

    if (!storagePath.startsWith(prefix)) {
      return NextResponse.json(
        { success: false, error: "Attachment does not belong to this record" },
        { status: 403 }
      );
    }

    const { error: deleteError } = await supabaseAdmin.storage
      .from(BUCKET)
      .remove([storagePath]);

    if (deleteError) throw deleteError;

    await auditAttachment({
      organizationId: access.organizationId,
      recordType,
      recordId,
      action: "ATTACHMENT_DELETED",
      userId: access.user?.id || null,
      metadata: {
        storage_path: storagePath,
      },
    });

    return NextResponse.json({
      success: true,
      deleted: storagePath,
    });
  } catch (error) {
    const message = error.message || "Attachment delete failed";
    const status = /required|unsupported|not found|belong/i.test(message)
      ? 400
      : 500;

    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}

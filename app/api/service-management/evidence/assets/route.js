export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { resolveServiceManagementContext } from "@/lib/service-management/api/resolveServiceManagementContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const BUCKET = "service-evidence";
const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const ASSET_KINDS = new Set([
  "before-photo",
  "after-photo",
  "customer-signature",
  "technician-signature",
  "protocol-evidence",
  "file",
]);

function text(value) {
  return String(value ?? "").trim();
}

function responseError(error, status = 500) {
  return Response.json(
    { success: false, error: error?.message || error || "Service evidence asset request failed." },
    { status: error?.status || status },
  );
}

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function safeSegment(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "asset";
}

function extensionFor(file) {
  const mime = text(file?.type).toLowerCase();
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "application/pdf") return "pdf";
  return "bin";
}

async function loadOccurrence({ organizationId, occurrenceId }) {
  const result = await supabaseAdmin
    .from("service_plan_occurrences")
    .select("id,organization_id,entity_id,work_order_id,status")
    .eq("organization_id", organizationId)
    .eq("id", occurrenceId)
    .maybeSingle();

  if (result.error) throw result.error;
  if (!result.data) fail("Service occurrence not found in this organization.", 404);
  return result.data;
}

function expectedPrefix({ organizationId, occurrenceId }) {
  return `${organizationId}/${occurrenceId}/`;
}

function storageReference(path) {
  return `storage://${BUCKET}/${path}`;
}

function pathFromReference(reference) {
  const prefix = `storage://${BUCKET}/`;
  const value = text(reference);
  if (!value.startsWith(prefix)) return null;
  return value.slice(prefix.length);
}

async function signedPreview(path) {
  const result = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 15 * 60);
  if (result.error) throw result.error;
  return result.data?.signedUrl || null;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const input = Object.fromEntries(url.searchParams.entries());
    const resolved = await resolveServiceManagementContext({ request, input });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);

    const occurrenceId = text(input.occurrenceId || input.occurrence_id);
    const reference = text(input.reference);
    if (!occurrenceId || !reference) return responseError("occurrence_id and reference are required.", 400);

    await loadOccurrence({ organizationId: resolved.context.organization_id, occurrenceId });
    const path = pathFromReference(reference);
    if (!path || !path.startsWith(expectedPrefix({ organizationId: resolved.context.organization_id, occurrenceId }))) {
      return responseError("Evidence asset does not belong to this service occurrence.", 403);
    }

    return Response.json({ success: true, reference, preview_url: await signedPreview(path), expires_in: 900 });
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request) {
  try {
    const form = await request.formData();
    const input = {
      organizationId: text(form.get("organizationId") || form.get("organization_id")),
      occurrenceId: text(form.get("occurrenceId") || form.get("occurrence_id")),
    };
    const resolved = await resolveServiceManagementContext({ request, input });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);

    const occurrenceId = input.occurrenceId;
    if (!occurrenceId) return responseError("occurrence_id is required.", 400);
    const occurrence = await loadOccurrence({ organizationId: resolved.context.organization_id, occurrenceId });

    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function") return responseError("A file is required.", 400);
    const mime = text(file.type).toLowerCase();
    if (!ALLOWED_TYPES.has(mime)) return responseError("Unsupported evidence file type.", 415);
    if (!Number.isFinite(Number(file.size)) || Number(file.size) <= 0) return responseError("Evidence file is empty.", 400);
    if (Number(file.size) > MAX_BYTES) return responseError("Evidence file exceeds the 20 MB limit.", 413);

    const kind = safeSegment(form.get("kind") || "file");
    if (!ASSET_KINDS.has(kind)) return responseError("Unsupported evidence asset kind.", 400);
    const fieldKey = safeSegment(form.get("fieldKey") || form.get("field_key") || "general");
    const objectId = crypto.randomUUID();
    const ext = extensionFor(file);
    const path = `${resolved.context.organization_id}/${occurrence.id}/${kind}/${fieldKey}/${Date.now()}-${objectId}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    const upload = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, {
      contentType: mime,
      cacheControl: "3600",
      upsert: false,
      metadata: {
        organization_id: resolved.context.organization_id,
        occurrence_id: occurrence.id,
        work_order_id: occurrence.work_order_id || null,
        evidence_kind: kind,
        field_key: fieldKey,
        actor_id: resolved.context.actor_id || null,
        original_name: text(file.name) || null,
      },
    });
    if (upload.error) throw upload.error;

    const reference = storageReference(path);
    return Response.json({
      success: true,
      asset: {
        reference,
        bucket: BUCKET,
        path,
        kind,
        field_key: fieldKey,
        mime_type: mime,
        size_bytes: Number(file.size),
        captured_at: new Date().toISOString(),
        preview_url: await signedPreview(path),
        preview_expires_in: 900,
      },
    });
  } catch (error) {
    return responseError(error);
  }
}

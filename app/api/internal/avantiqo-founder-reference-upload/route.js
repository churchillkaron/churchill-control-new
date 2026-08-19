export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const TOKEN = "avq-founder-reference-upload-20260819-v1";
const BUCKET = "creative-assets";

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function safeName(value) {
  return String(value || "founder-reference.png")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(0, 120);
}

export async function POST(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);

    const body = await request.json();
    const label = String(body?.label || "Avantiqo Founder Canonical Reference").slice(0, 160);
    const fileName = safeName(body?.file_name);
    const mimeType = String(body?.mime_type || "image/png").toLowerCase();
    const base64 = String(body?.base64 || "").trim();

    if (!base64) return json({ success: false, error: "base64 required" }, 400);
    if (!["image/png", "image/jpeg", "image/webp"].includes(mimeType)) {
      return json({ success: false, error: "unsupported mime type" }, 400);
    }

    const bytes = Buffer.from(base64, "base64");
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) {
      return json({ success: false, error: "invalid image size" }, 400);
    }

    const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
    const storagePath = `${ORGANIZATION_ID}/founder-canonical-v2/${crypto.randomUUID()}-${fileName}`;

    const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType: mimeType,
      upsert: false,
      cacheControl: "3600",
    });
    if (uploadError) throw uploadError;

    const storageUri = `storage://${BUCKET}/${storagePath}`;
    const { data: asset, error: assetError } = await supabaseAdmin
      .from("creative_assets")
      .insert({
        organization_id: ORGANIZATION_ID,
        asset_type: "image",
        source_type: "USER_APPROVED_IDENTITY_REFERENCE",
        name: label,
        file_url: storageUri,
        image_url: storageUri,
        thumbnail_url: storageUri,
        file_name: fileName,
        ai_suggested_type: "founder_identity_reference",
        analysis: {
          scene_type: "founder_identity_reference",
          rights: { status: "USER_SUPPLIED" },
          consent: { status: "USER_CONFIRMED_SELF" },
          identity_role: "CANONICAL_FOUNDER_REFERENCE",
        },
        metadata: {
          source: "CURRENT_CHAT_USER_APPROVED_FOUNDER_REFERENCES_20260819",
          canonical_founder_identity: true,
          approved_by_user: true,
          must_preserve_identity: true,
          storage_bucket: BUCKET,
          storage_path: storagePath,
          mime_type: mimeType,
          checksum_sha256: checksum,
        },
        tags: ["Avantiqo", "founder", "identity", "canonical", "investor-film"],
        score: 100,
        ai_generated: false,
        status: "active",
        approval_state: "approved",
      })
      .select("id,name,file_url,image_url,metadata")
      .single();
    if (assetError) throw assetError;

    return json({ success: true, asset, bytes: bytes.length, checksum_sha256: checksum });
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}

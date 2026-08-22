export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT_ID = "da38f668-11a1-4760-a8f2-6adc3effdab5";
const TOKEN = "churchill-stay-night-v5-review-20260822";
const BUCKET = "creative-assets";

function text(value) {
  return String(value ?? "").trim();
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function storagePathFromReference(value) {
  const reference = text(value);
  const prefix = `storage://${BUCKET}/`;
  if (reference.startsWith(prefix)) return reference.slice(prefix.length);
  const publicNeedle = `/storage/v1/object/public/${BUCKET}/`;
  const signedNeedle = `/storage/v1/object/sign/${BUCKET}/`;
  const publicIndex = reference.indexOf(publicNeedle);
  if (publicIndex >= 0) {
    return decodeURIComponent(reference.slice(publicIndex + publicNeedle.length).split("?")[0]);
  }
  const signedIndex = reference.indexOf(signedNeedle);
  if (signedIndex >= 0) {
    return decodeURIComponent(reference.slice(signedIndex + signedNeedle.length).split("?")[0]);
  }
  return null;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) {
      return json({ success: false }, 404);
    }

    const { data: project, error: projectError } = await supabaseAdmin
      .from("creative_projects")
      .select("metadata")
      .eq("id", PROJECT_ID)
      .eq("organization_id", ORGANIZATION_ID)
      .maybeSingle();

    if (projectError) throw projectError;
    if (!project) throw new Error("CHURCHILL_V5_REVIEW_PROJECT_REQUIRED");

    const reference = text(project.metadata?.churchill_v5_master?.output_reference);
    if (!reference) {
      return json({ success: false, error: "CHURCHILL_V5_MASTER_NOT_RENDERED" }, 409);
    }

    const storagePath = storagePathFromReference(reference);
    if (!storagePath) throw new Error("CHURCHILL_V5_MASTER_STORAGE_REFERENCE_INVALID");

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 21600);

    if (error) throw error;
    if (!data?.signedUrl) throw new Error("CHURCHILL_V5_MASTER_SIGNED_URL_REQUIRED");

    return Response.redirect(data.signedUrl, 307);
  } catch (error) {
    console.error("CHURCHILL_V5_REVIEW_STREAM_FAILED", {
      message: error?.message || String(error),
      details: error?.details || null,
    });
    return json(
      {
        success: false,
        error: error?.message || String(error),
        details: error?.details || null,
      },
      500,
    );
  }
}

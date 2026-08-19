export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "node:crypto";
import { uploadCreativeAsset } from "@/lib/creative/assets/storage/uploadCreativeAsset";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const ENTITY_ID = "073dc5f5-b6a8-4cae-8cda-fd7acb21ef50";
const TOKEN = "avq-founder-ref-20260819";
const SOURCE = "avantiqo_founder_keyframe_20260819_v1";
const NAME = "Avantiqo Founder Speaking Keyframe";

const IMAGE_BASE64 = "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";

function response(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return response({ success: false }, 404);

    const supabase = getServiceSupabase();
    const { data: existing } = await supabase
      .from("creative_assets")
      .select("id,file_url,storage_path,mime_type,name")
      .eq("organization_id", ORGANIZATION_ID)
      .eq("name", NAME)
      .contains("metadata", { source: SOURCE })
      .maybeSingle();

    if (existing?.id) {
      return response({ success: true, reused: true, asset: existing });
    }

    const bytes = Buffer.from(IMAGE_BASE64, "base64");
    const upload = await uploadCreativeAsset({
      file: {
        buffer: bytes,
        name: "avantiqo-founder-speaking-keyframe.jpg",
        type: "image/jpeg",
      },
      organizationId: ORGANIZATION_ID,
      uploadedBy: null,
    });

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const record = {
      id,
      organization_id: ORGANIZATION_ID,
      entity_id: ENTITY_ID,
      asset_type: "image",
      source_type: "AI_GENERATED_REFERENCE",
      name: NAME,
      title: NAME,
      description: "Approved founder talking keyframe for the Avantiqo investor film. Derived from user-supplied identity references and approved for internal film production.",
      file_url: upload.file_url,
      image_url: upload.file_url,
      file_name: upload.original_file_name,
      storage_path: upload.path,
      uri: upload.file_url,
      mime_type: upload.mime_type,
      analysis: {
        purpose: "FOUNDER_TALKING_KEYFRAME",
        framing: "16:9 medium founder address",
        identity_reference: true,
        mouth_visibility: "clear",
      },
      metadata: {
        source: SOURCE,
        approved_by_user: true,
        generated_from_user_identity_references: true,
        production_role: "INVESTOR_FILM_FOUNDER",
      },
      tags: ["avantiqo", "founder", "investor-film", "identity-reference", "talking-keyframe"],
      score: 100,
      ai_generated: true,
      provider: "openai-imagegen",
      status: "READY",
      approval_state: "APPROVED",
      revision: 1,
      created_at: now,
      updated_at: now,
    };

    const { data: created, error } = await supabase
      .from("creative_assets")
      .insert(record)
      .select("id,file_url,storage_path,mime_type,name")
      .single();
    if (error) throw error;

    return response({
      success: true,
      reused: false,
      asset: created,
      inspection_url: upload.inspection_url,
    });
  } catch (error) {
    return response({ success: false, error: error?.message || String(error) }, 500);
  }
}

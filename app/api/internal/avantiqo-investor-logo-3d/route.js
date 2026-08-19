export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import fs from "node:fs/promises";
import path from "node:path";

import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { createCreativeAssetFlow } from "@/lib/creative/assets/workflows/createCreativeAssetFlow";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const supabase = getServiceSupabase();

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const ENTITY_ID = "073dc5f5-b6a8-4cae-8cda-fd7acb21ef50";
const TOKEN = "avq-investor-logo-3d-20260819-v1";
const LOGO_NAME = "Avantiqo Canonical Investor Film Logo";
const PROVIDER = "google-veo";
const MODEL = "veo-3.1-generate-preview";
const DURATION_SECONDS = 8;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function existingLogo() {
  const { data, error } = await supabase
    .from("creative_assets")
    .select("id,name,file_url,image_url,metadata")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("name", LOGO_NAME)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function ensureLogoAsset() {
  const existing = await existingLogo();
  if (existing?.id) return existing;

  const sourcePath = path.join(process.cwd(), "public", "branding", "avantiqo-logo.png");
  const buffer = await fs.readFile(sourcePath);
  const created = await createCreativeAssetFlow({
    organizationId: ORGANIZATION_ID,
    file: {
      buffer,
      name: "avantiqo-logo.png",
      type: "image/png",
    },
    assetType: "logo",
    name: LOGO_NAME,
  });

  return created?.asset || null;
}

function logoFilmContract(assetId) {
  return {
    title: "Avantiqo Investor Film — Dimensional Logo Reveal",
    description:
      "Create an eight-second premium cinematic dimensional logo reveal using the supplied Avantiqo logo reference as the exact authoritative brand shape. The logo must become a real physical three-dimensional object with genuine thickness and extrusion, polished dark-metal and smoked-glass material depth, subtle warm champagne-gold edge reflections, realistic bevels, ray-traced-looking specular highlights, soft volumetric atmosphere and true perspective parallax. Begin almost completely dark. The object enters from depth at a restrained three-quarter angle, with the camera making a small elegant opposing move so the dimensional thickness is clearly visible. Let one controlled narrow light travel across the beveled surfaces and reveal the extrusion naturally. The object then turns smoothly toward camera and settles into a calm centered front-facing hero position without snapping, locking, bouncing, spinning or behaving like a UI element. Preserve the exact Avantiqo silhouette, spacing and lettering from the supplied reference. Do not redesign the wordmark. Do not invent letters, symbols, taglines or secondary marks. No sci-fi holograms, no neon, no particles exploding, no tunnel, no cheap lens flare, no gaming aesthetic. Luxury automotive and prestige film-title level restraint. Final second: stable elegant face-on Avantiqo logo floating in darkness with subtle physical depth still visible from edge lighting so the editor can transition cleanly to the exact canonical 2D brand plate if required.",
    intent: {
      story_purpose: "opening brand authority before founder story",
      emotional_tone: "premium, intelligent, confident, restrained, cinematic",
      brand_accuracy: "canonical Avantiqo reference is authoritative",
    },
    requirements: {
      visual_quality: "world-class photoreal cinematic 3D product-logo cinematography",
      dimensionality: "true physical extrusion, bevels, material depth, perspective and reflections",
      final_pose: "centered face-on natural settle with no mechanical lock",
      logo_fidelity: "do not change silhouette, lettering, proportions or spacing",
      negative_constraints: [
        "no flat card animation",
        "no fake offset shadow as depth",
        "no snap-to-center",
        "no UI lock animation",
        "no logo redesign",
        "no misspelled Avantiqo",
        "no added text",
        "no hologram",
        "no neon",
        "no explosive particles",
        "no fast spin",
        "no camera shake",
      ],
    },
    shot_bible: {
      precision_control: {
        reference_asset_ids: [assetId],
        multi_reference_control_required: true,
      },
      source: {
        reference_asset_ids: [assetId],
      },
      output: {
        duration_seconds: DURATION_SECONDS,
        aspect_ratio: "16:9",
        resolution: "1080p",
      },
    },
    output_spec: {
      duration_seconds: DURATION_SECONDS,
      aspect_ratio: "16:9",
      resolution: "1080p",
    },
    provider_parameters: {
      reference_asset_ids: [assetId],
      aspect_ratio: "16:9",
      resolution: "1080p",
    },
    primary_source_asset_id: assetId,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = url.searchParams.get("action") || "status";

    if (action === "status") {
      const logo = await existingLogo();
      return json({
        success: true,
        logo_asset_ready: Boolean(logo?.id),
        logo_asset_id: logo?.id || null,
        provider: PROVIDER,
        model: MODEL,
        duration_seconds: DURATION_SECONDS,
        mode: "GENERATED_TRUE_DIMENSIONAL_LOGO_MOTION",
        canonical_logo_final_plate_required: true,
      });
    }

    if (action === "prepare-logo") {
      const logo = await ensureLogoAsset();
      return json({ success: true, logo_asset: logo });
    }

    if (action === "start") {
      const logo = await ensureLogoAsset();
      if (!logo?.id) throw new Error("AVANTIQO_CANONICAL_LOGO_ASSET_REQUIRED");
      const contract = logoFilmContract(logo.id);

      const result = await executeService({
        organization_id: ORGANIZATION_ID,
        bill_to_organization_id: ORGANIZATION_ID,
        entity_id: ENTITY_ID,
        service_id: "ai.video.generate",
        provider_id: PROVIDER,
        provider_policy: {
          allowed_providers: [PROVIDER],
          preferred_providers: [PROVIDER],
        },
        input: {
          ...contract,
          quantity: DURATION_SECONDS,
          currency: "THB",
        },
        metadata: {
          module: "CREATIVE",
          operation: "AVANTIQO_INVESTOR_3D_LOGO_REVEAL_V1",
          brand: "Avantiqo",
          source: "avantiqo_investor_logo_3d_20260819_v1",
          canonical_logo_asset_id: logo.id,
          generated_logo_substitution_for_final_plate: false,
          final_exact_brand_plate_required: true,
        },
        category: "AI",
      });

      return json({
        success: true,
        stage: "generated-3d-logo-motion",
        logo_asset_id: logo.id,
        pending: result?.pending ?? null,
        provider: result?.provider || null,
        model: result?.model || null,
        provider_job_id: result?.provider_job_id || null,
        provider_status: result?.provider_status || null,
        usage_id: result?.usage?.id || null,
        credential_id: result?.credential_id || null,
        started_at: result?.started_at || null,
        pricing: result?.pricing || null,
        output: result?.output || null,
      });
    }

    if (action === "poll") {
      const providerJobId = url.searchParams.get("provider_job_id");
      const usageId = url.searchParams.get("usage_id");
      const credentialId = url.searchParams.get("credential_id") || null;
      const startedAt = url.searchParams.get("started_at") || null;
      if (!providerJobId || !usageId) return json({ success: false, error: "Missing poll parameters" }, 400);

      const result = await settlePendingService({
        organization_id: ORGANIZATION_ID,
        provider: PROVIDER,
        provider_job_id: providerJobId,
        usage_id: usageId,
        credential_id: credentialId,
        started_at: startedAt,
        metadata: {
          module: "CREATIVE",
          operation: "AVANTIQO_INVESTOR_3D_LOGO_REVEAL_V1_POLL",
          brand: "Avantiqo",
          source: "avantiqo_investor_logo_3d_20260819_v1",
        },
      });

      return json({ success: true, stage: "generated-3d-logo-motion", result });
    }

    if (action === "signed") {
      const storagePath = String(url.searchParams.get("path") || "").trim();
      if (!storagePath.startsWith(`${ORGANIZATION_ID}/`) || storagePath.includes("..")) {
        return json({ success: false, error: "Invalid creative asset path" }, 400);
      }
      const { data, error } = await supabase.storage.from("creative-assets").createSignedUrl(storagePath, 3600);
      if (error) throw error;
      return json({ success: true, signed_url: data?.signedUrl || null, path: storagePath });
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}

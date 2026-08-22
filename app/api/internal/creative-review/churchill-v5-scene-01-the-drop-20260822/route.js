export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT_ID = "da38f668-11a1-4760-a8f2-6adc3effdab5";
const SCENE_KEY = "scene_01_the_drop";

export async function GET() {
  try {
    const { data: project, error: projectError } = await supabaseAdmin
      .from("creative_projects")
      .select("metadata")
      .eq("id", PROJECT_ID)
      .eq("organization_id", ORGANIZATION_ID)
      .maybeSingle();

    if (projectError) throw projectError;

    const state = project?.metadata?.churchill_v5_scenes?.scenes?.[SCENE_KEY] || null;
    const ref = String(state?.output_reference || "").trim();

    if (state?.status !== "COMPLETED" || !ref.startsWith("storage://")) {
      return Response.json(
        { success: false, error: "CHURCHILL_WINE_DROP_NOT_READY" },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const storagePath = ref.slice("storage://".length);
    const parts = storagePath.split("/").filter(Boolean);
    const bucket = parts.shift();
    const path = parts.join("/");

    if (!bucket || !path) throw new Error("CHURCHILL_WINE_DROP_STORAGE_REFERENCE_INVALID");

    const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
    if (error) throw error;

    const bytes = await data.arrayBuffer();

    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": 'inline; filename="churchill-v5-scene-01-the-drop.mp4"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("CHURCHILL_WINE_DROP_REVIEW_FAILED", {
      message: error?.message || String(error),
      details: error?.details || null,
    });

    return Response.json(
      {
        success: false,
        error: error?.message || String(error),
      },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

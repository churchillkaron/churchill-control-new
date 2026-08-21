export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
  assertChurchillNightStoryIntegrity,
} from "@/lib/creative/concepts/ChurchillNightChangesStoryContract";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const COMMAND_IDENTITY = "CHURCHILL_THE_NIGHT_INSIDE_THE_NIGHT_90S_V3";
const TOKEN = "churchill-night-changes-v3-repair-review-20260821";
const BUCKET = "creative-assets";
const REPAIR_VERSION = "CHURCHILL_V3_REPAIR_R1_AUTHENTIC_GEOMETRY";
const SHOTS = new Set(["shuffleboard_motion", "shuffleboard_to_dart", "electric_dart_flight"]);

function text(value) {
  return String(value ?? "").trim();
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } });
}

function storagePath(reference) {
  const value = text(reference);
  const prefix = `storage://${BUCKET}/`;
  if (!value.startsWith(prefix)) throw new Error("CHURCHILL_V3_REPAIR_REVIEW_STORAGE_REFERENCE_REQUIRED");
  return value.slice(prefix.length);
}

async function project() {
  assertChurchillNightStoryIntegrity();
  const { data: mission, error: missionError } = await supabaseAdmin
    .from("creative_missions")
    .select("id")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("metadata->>command_identity", COMMAND_IDENTITY)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (missionError) throw missionError;
  if (!mission?.id) throw new Error("CHURCHILL_V3_REPAIR_REVIEW_MISSION_REQUIRED");
  const { data, error } = await supabaseAdmin
    .from("creative_projects")
    .select("id,metadata")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("creative_mission_id", mission.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("CHURCHILL_V3_REPAIR_REVIEW_PROJECT_REQUIRED");
  if (data.metadata?.canonical_story_version !== CHURCHILL_NIGHT_CHANGES_STORY_VERSION) {
    throw new Error("CHURCHILL_V3_REPAIR_REVIEW_STORY_VERSION_MISMATCH");
  }
  return data;
}

async function generation(shot) {
  if (!SHOTS.has(shot)) throw new Error("CHURCHILL_V3_REPAIR_REVIEW_SHOT_INVALID");
  const p = await project();
  const repairs = p.metadata?.churchill_v3_repairs || {};
  if (repairs.version !== REPAIR_VERSION) throw new Error("CHURCHILL_V3_REPAIR_REVIEW_VERSION_MISMATCH");
  const state = repairs.generations?.[shot] || null;
  if (state?.status !== "COMPLETED" || !state?.output_reference) {
    throw new Error(`CHURCHILL_V3_REPAIR_REVIEW_NOT_READY:${shot}`);
  }
  return { p, state };
}

async function signedUrl(reference) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePath(reference), 21600);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("CHURCHILL_V3_REPAIR_REVIEW_SIGNED_URL_MISSING");
  return data.signedUrl;
}

async function status(requestUrl) {
  const p = await project();
  const repairs = p.metadata?.churchill_v3_repairs || {};
  const generations = repairs.generations || {};
  const base = new URL(requestUrl);
  return {
    success: true,
    creative_project_id: p.id,
    repair_version: repairs.version || REPAIR_VERSION,
    approved_baseline_locked: repairs.approved_baseline_locked || { wine_universe: true, steam_into_bar: true },
    clips: Object.fromEntries([...SHOTS].map((shot) => [shot, {
      status: generations[shot]?.status || "NOT_STARTED",
      ready: generations[shot]?.status === "COMPLETED" && Boolean(generations[shot]?.output_reference),
      review_url: `${base.origin}${base.pathname}?token=${encodeURIComponent(TOKEN)}&action=clip&shot=${encodeURIComponent(shot)}`,
    }])),
    master_render_authorized: false,
    publication_authorized: false,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = text(url.searchParams.get("action") || "status").toLowerCase();
    if (action === "status") return json(await status(request.url));
    if (action === "clip") {
      const shot = text(url.searchParams.get("shot"));
      const { state } = await generation(shot);
      return Response.redirect(await signedUrl(state.output_reference), 307);
    }
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, error: error?.message || String(error), details: error?.details || null }, 500);
  }
}

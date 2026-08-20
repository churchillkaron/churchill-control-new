export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  signCreativeStorageReference,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT_ID = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const PROOF_ASSET_NODE_ID = "cd77a430-a746-4a3d-bb7f-f13f9a32c09b";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function hash(value) {
  return crypto.createHash("sha256").update(text(value)).digest("hex");
}

function safeEqual(left, right) {
  const a = Buffer.from(text(left));
  const b = Buffer.from(text(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function authorized(project, suppliedToken) {
  const operator = object(
    project?.metadata?.approved_direction_resume?.operator_execution,
  );
  if (!suppliedToken || !operator.token_sha256) return false;
  if (operator.consumed === true) return false;
  if (
    operator.expires_at &&
    Number.isFinite(Date.parse(operator.expires_at)) &&
    Date.parse(operator.expires_at) <= Date.now()
  ) {
    return false;
  }
  return safeEqual(hash(suppliedToken), operator.token_sha256);
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const token = text(url.searchParams.get("token"));

    const { data: project, error: projectError } = await supabaseAdmin
      .from("creative_projects")
      .select("id, organization_id, metadata")
      .eq("id", PROJECT_ID)
      .eq("organization_id", ORGANIZATION_ID)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project) throw new Error("CREATIVE_PROJECT_NOT_FOUND");
    if (!authorized(project, token)) {
      return Response.json({ success: false, error: "UNAUTHORIZED" }, { status: 403 });
    }

    const { data: asset, error: assetError } = await supabaseAdmin
      .from("creative_asset_nodes")
      .select("id, organization_id, creative_project_id, type, status, name, url, technical")
      .eq("id", PROOF_ASSET_NODE_ID)
      .eq("organization_id", ORGANIZATION_ID)
      .eq("creative_project_id", PROJECT_ID)
      .eq("type", "FINAL_RENDER")
      .maybeSingle();
    if (assetError) throw assetError;
    if (!asset?.url) throw new Error("INVESTOR_PROOF_RENDER_NOT_FOUND");

    const expiresIn = 21600;
    const signedUrl = await signCreativeStorageReference({
      organization_id: ORGANIZATION_ID,
      reference: asset.url,
      expires_in: expiresIn,
    });

    return Response.json({
      success: true,
      asset_node_id: asset.id,
      name: asset.name,
      status: asset.status,
      duration_seconds: Number(asset.technical?.duration_seconds || 0),
      signed_url: signedUrl,
      expires_in_seconds: expiresIn,
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: error?.message || String(error),
    }, { status: 500 });
  }
}

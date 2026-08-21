import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const PURPOSE = "AVANTIQO_INVESTOR_V9_RENDER";

function requestToken(request) {
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const queryToken = new URL(request.url).searchParams.get("token") || "";
  return bearer || queryToken;
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

async function validMetadataNonce(candidate) {
  if (!candidate) return false;

  const { data, error } = await supabaseAdmin
    .from("creative_projects")
    .select("metadata")
    .eq("id", PROJECT)
    .eq("organization_id", ORG)
    .maybeSingle();
  if (error || !data) return false;

  const auth = data.metadata?.investor_v9_render_auth || {};
  if (auth.purpose !== PURPOSE || auth.revoked === true) return false;
  const expiresAt = Date.parse(String(auth.expires_at || ""));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
  return safeEqual(hash(candidate), auth.token_sha256);
}

export async function authorizeInvestorV9Render(request) {
  const candidate = requestToken(request);
  if (!candidate) return false;

  const expected = process.env.AVANTIQO_INVESTOR_INTERNAL_TOKEN || "";
  if (expected && safeEqual(candidate, expected)) return true;

  return validMetadataNonce(candidate);
}

import { createHash, randomBytes } from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const AUTHORIZATION_TTL_MS = 10 * 60 * 1000;

function hashState(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function normalizeOrigin(value) {
  const url = new URL(String(value || ""));

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("OAuth return origin must use HTTP or HTTPS");
  }

  if (
    url.protocol === "http:" &&
    url.hostname !== "localhost" &&
    url.hostname !== "127.0.0.1"
  ) {
    throw new Error("OAuth return origin must use HTTPS");
  }

  return url.origin;
}

export async function createOAuthAuthorization({
  provider,
  purpose,
  organizationId,
  partyId = null,
  returnOrigin,
  metadata = {},
}) {
  if (!provider || !purpose || !organizationId) {
    throw new Error("OAuth authorization context is incomplete");
  }

  const state = randomBytes(32).toString("base64url");
  const now = Date.now();
  const expiresAt = new Date(now + AUTHORIZATION_TTL_MS).toISOString();

  const { error } = await supabaseAdmin
    .from("platform_oauth_authorizations")
    .insert({
      state_hash: hashState(state),
      provider: String(provider),
      purpose: String(purpose),
      organization_id: organizationId,
      party_id: partyId || null,
      return_origin: normalizeOrigin(returnOrigin),
      expires_at: expiresAt,
      metadata: metadata && typeof metadata === "object" ? metadata : {},
    });

  if (error) throw error;

  return {
    state,
    expiresAt,
  };
}

export async function consumeOAuthAuthorization({ state, provider }) {
  if (!state || !provider) {
    throw new Error("OAuth authorization state is missing");
  }

  const consumedAt = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("platform_oauth_authorizations")
    .update({ consumed_at: consumedAt })
    .eq("state_hash", hashState(state))
    .eq("provider", String(provider))
    .is("consumed_at", null)
    .gt("expires_at", consumedAt)
    .select(
      "id,provider,purpose,organization_id,party_id,return_origin,created_at,expires_at,consumed_at,metadata"
    )
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error("OAuth authorization state is invalid, expired, or already used");
  }

  return data;
}

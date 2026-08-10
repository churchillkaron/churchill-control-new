import { google } from "googleapis";

import {
  registerProviderCredentialResolver,
} from "@/lib/platform/service-runtime/providers/ProviderCredentialRuntime";
import {
  listActiveByProvider,
} from "@/lib/platform/service-runtime/credentials/repositories/CredentialRepository";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function parseTokens(secretReference) {
  try {
    const parsed = JSON.parse(secretReference || "{}");
    return object(parsed);
  } catch {
    throw new Error("GOOGLE_OAUTH_CREDENTIAL_INVALID");
  }
}

async function refreshedCredential(row, routingCredentialId = null) {
  const tokens = parseTokens(row.secret_reference);
  const clientId = text(process.env.GOOGLE_CLIENT_ID);
  const clientSecret = text(process.env.GOOGLE_CLIENT_SECRET);

  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_OAUTH_APPLICATION_CREDENTIALS_REQUIRED");
  }

  const oauth = new google.auth.OAuth2(clientId, clientSecret);
  let refreshed = {};

  oauth.on("tokens", (nextTokens) => {
    refreshed = {
      ...refreshed,
      ...nextTokens,
    };
  });
  oauth.setCredentials(tokens);

  const result = await oauth.getAccessToken();
  const accessToken =
    typeof result === "string" ? result : result?.token || null;

  if (!accessToken) {
    throw new Error("GOOGLE_ACCESS_TOKEN_UNAVAILABLE");
  }

  const currentTokens = {
    ...tokens,
    ...oauth.credentials,
    ...refreshed,
    access_token: accessToken,
  };

  const serialized = JSON.stringify(currentTokens);
  if (serialized !== row.secret_reference) {
    const { error } = await supabaseAdmin
      .from("provider_credentials")
      .update({
        secret_reference: serialized,
        updated_at: new Date().toISOString(),
        metadata: {
          ...(row.metadata || {}),
          scopes: currentTokens.scope || row.metadata?.scopes || null,
        },
      })
      .eq("id", row.id);

    if (error) throw new Error(error.message);
  }

  return {
    credential_id: routingCredentialId || row.id,
    source_credential_id: row.id,
    access_token: accessToken,
    refresh_token: currentTokens.refresh_token || null,
    scope: currentTokens.scope || row.metadata?.scopes || null,
    credential_purpose: row.metadata?.purpose || null,
    delegated: Boolean(routingCredentialId),
  };
}

async function delegatedSource(row, providerId) {
  const delegatedCredentialId = text(row?.metadata?.delegated_credential_id);
  if (!delegatedCredentialId) {
    throw new Error("GOOGLE_DELEGATED_CREDENTIAL_SOURCE_REQUIRED");
  }

  const { data, error } = await supabaseAdmin
    .from("provider_credentials")
    .select("*")
    .eq("id", delegatedCredentialId)
    .eq("provider_id", providerId)
    .eq("credential_type", "oauth_token")
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("GOOGLE_DELEGATED_CREDENTIAL_SOURCE_NOT_FOUND");

  return data;
}

function registerGoogleOAuthProvider(providerId) {
  registerProviderCredentialResolver(
    providerId,
    async ({ organization_id, credential_id = null }) => {
      const rows = await listActiveByProvider(providerId);

      const candidates = rows
        .filter((row) =>
          text(row.metadata?.organization_id) === text(organization_id)
        )
        .filter((row) =>
          !credential_id || text(row.id) === text(credential_id)
        )
        .filter((row) => {
          const type = text(row.credential_type).toLowerCase();
          return type === "oauth_token" || type === "delegated_oauth_token";
        });

      const selected = candidates[0] || null;
      if (!selected) return null;

      if (text(selected.credential_type).toLowerCase() === "delegated_oauth_token") {
        if (providerId !== "google_ads") {
          throw new Error("GOOGLE_DELEGATED_CREDENTIAL_PROVIDER_UNSUPPORTED");
        }
        const source = await delegatedSource(selected, providerId);
        return refreshedCredential(source, selected.id);
      }

      return refreshedCredential(selected);
    },
  );
}

registerGoogleOAuthProvider("google");
registerGoogleOAuthProvider("google_ads");

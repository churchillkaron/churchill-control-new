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

async function refreshedCredential(row) {
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
    credential_id: row.id,
    access_token: accessToken,
    refresh_token: currentTokens.refresh_token || null,
    scope: currentTokens.scope || row.metadata?.scopes || null,
    credential_purpose: row.metadata?.purpose || null,
  };
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
        .filter((row) =>
          text(row.credential_type).toLowerCase() === "oauth_token"
        );

      const selected = candidates[0] || null;
      if (!selected) return null;

      return refreshedCredential(selected);
    },
  );
}

registerGoogleOAuthProvider("google");
registerGoogleOAuthProvider("google_ads");

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { google } from "googleapis";
import { NextResponse } from "next/server";
import { consumeOAuthAuthorization } from "@/lib/platform/security/oauthAuthorizationState";
import { CredentialRuntime } from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { ChannelAssetRuntime } from "@/lib/platform/channels/runtime/ChannelAssetRuntime";

function callbackOrigin() {
  return new URL(process.env.GOOGLE_EMAIL_OAUTH_CALLBACK_ORIGIN || process.env.GOOGLE_OAUTH_CALLBACK_ORIGIN || "https://avantiqo.ai").origin;
}

function client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${callbackOrigin()}/api/email/google/auth/callback`,
  );
}

export async function GET(request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  let authorization = null;
  try {
    if (!state) throw new Error("Google mailbox connection validation failed or expired");
    authorization = await consumeOAuthAuthorization({ state, provider: "email_google" });
    const code = url.searchParams.get("code");
    if (url.searchParams.get("error")) throw new Error(`Google mailbox connection was not approved: ${url.searchParams.get("error")}`);
    if (!code) throw new Error("Google did not return an authorization code");

    const oauth = client();
    const { tokens } = await oauth.getToken(code);
    if (!tokens.access_token) throw new Error("Google did not return a mailbox access token");
    oauth.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oauth });
    const identityResult = await oauth2.userinfo.get();
    const email = String(identityResult?.data?.email || "").trim().toLowerCase();
    if (!email) throw new Error("Google mailbox identity could not be verified");

    const organizationId = authorization.organization_id;
    const credential = await CredentialRuntime.store({
      provider_id: "email_google",
      credential_type: "oauth_token",
      secret_reference: JSON.stringify(tokens),
      metadata: { organization_id: organizationId, purpose: "ORGANIZATION_GOOGLE_MAILBOX", email, enabled: true },
    });
    const connection = await ChannelConnectionRuntime.connect({
      organization_id: organizationId,
      provider: "email_google",
      channel_type: "email",
      credentials_reference: credential.id,
      metadata: { account_name: email, email, connected_at: new Date().toISOString(), connection_model: "ORGANIZATION_GOOGLE_OAUTH" },
    });
    await ChannelAssetRuntime.register({
      organization_id: organizationId,
      connection_id: connection.id,
      provider: "email_google",
      asset_type: "business_mailbox",
      external_id: email,
      name: email,
      metadata: { email, provider: "google" },
    });

    const destination = new URL(`/workspace/${encodeURIComponent(organizationId)}/administration/integrations`, authorization.return_origin || callbackOrigin());
    destination.searchParams.set("message", "Google mailbox connected.");
    return NextResponse.redirect(destination);
  } catch (error) {
    const organizationId = authorization?.organization_id || "unknown";
    const destination = new URL(`/workspace/${encodeURIComponent(organizationId)}/administration/integrations`, authorization?.return_origin || callbackOrigin());
    destination.searchParams.set("message", error?.message || "Google mailbox connection failed");
    return NextResponse.redirect(destination);
  }
}

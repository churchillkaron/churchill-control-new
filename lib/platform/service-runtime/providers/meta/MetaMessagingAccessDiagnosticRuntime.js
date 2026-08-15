// This runtime persists only sanitized Meta messaging readiness facts; credentials never leave the provider boundary.
function graphVersion() {
  const configured = String(
    process.env.META_GRAPH_API_VERSION || process.env.META_GRAPH_VERSION || "v24.0"
  ).trim();
  return configured.startsWith("v") ? configured : `v${configured}`;
}

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function rows(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values) {
  return [...new Set((values || []).map((value) => text(value)).filter(Boolean))].sort();
}

function safeError(error) {
  return {
    message: text(error?.message) || "Meta messaging access diagnostic failed",
    code: text(error?.code) || null,
    subcode: text(error?.subcode) || null,
  };
}

function appAccessToken() {
  const appId = text(process.env.META_APP_ID);
  const appSecret = text(process.env.META_APP_SECRET);
  if (!appId || !appSecret) {
    throw new Error("META_APP_CREDENTIALS_REQUIRED_FOR_MESSAGING_DIAGNOSTIC");
  }
  return `${appId}|${appSecret}`;
}

async function graphJson(url, accessToken) {
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.error) {
    const message =
      payload?.error?.error_user_msg ||
      payload?.error?.message ||
      `Meta diagnostic request failed (${response.status})`;
    const error = new Error(message);
    error.code = payload?.error?.code || response.status;
    error.subcode = payload?.error?.error_subcode || null;
    throw error;
  }

  return payload;
}

function safeEpochSeconds(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return new Date(numeric * 1000).toISOString();
}

export async function inspectMetaMessagingAccess({
  access_token,
  page_id,
  instagram_business_id = null,
}) {
  const accessToken = text(access_token);
  const pageId = text(page_id);
  const instagramBusinessId = text(instagram_business_id);
  const configuredAppId = text(process.env.META_APP_ID);

  if (!accessToken) throw new Error("META_PAGE_ACCESS_TOKEN_REQUIRED_FOR_MESSAGING_DIAGNOSTIC");
  if (!pageId) throw new Error("META_PAGE_ID_REQUIRED_FOR_MESSAGING_DIAGNOSTIC");

  const requiredInstagramScopes = [
    "instagram_basic",
    "instagram_manage_messages",
    "pages_manage_metadata",
  ];

  try {
    const debugUrl = new URL(
      `https://graph.facebook.com/${graphVersion()}/debug_token`
    );
    debugUrl.searchParams.set("input_token", accessToken);

    const debugPayload = await graphJson(debugUrl.toString(), appAccessToken());
    const tokenData = object(debugPayload?.data);
    const granularScopes = rows(tokenData.granular_scopes);
    const grantedScopes = uniqueStrings([
      ...rows(tokenData.scopes),
      ...granularScopes.map((entry) => object(entry).scope),
    ]);
    const missingInstagramScopes = requiredInstagramScopes.filter(
      (scope) => !grantedScopes.includes(scope),
    );

    const pageUrl = new URL(
      `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(pageId)}`
    );
    pageUrl.searchParams.set(
      "fields",
      "id,name,instagram_business_account{id,username}",
    );
    const pagePayload = await graphJson(pageUrl.toString(), accessToken);
    const linkedInstagram = object(pagePayload?.instagram_business_account);
    const returnedPageId = text(pagePayload?.id);
    const linkedInstagramId = text(linkedInstagram?.id);

    const pageMatches = returnedPageId === pageId;
    const instagramMatches = instagramBusinessId
      ? linkedInstagramId === instagramBusinessId
      : Boolean(linkedInstagramId);
    const tokenValid = tokenData?.is_valid === true;
    const appIdMatches = configuredAppId
      ? text(tokenData?.app_id) === configuredAppId
      : null;
    const requiredScopesGranted = missingInstagramScopes.length === 0;

    return {
      success: true,
      checked_at: new Date().toISOString(),
      token: {
        is_valid: tokenValid,
        type: text(tokenData?.type) || null,
        app_id_matches: appIdMatches,
        expires_at: safeEpochSeconds(tokenData?.expires_at),
        data_access_expires_at: safeEpochSeconds(tokenData?.data_access_expires_at),
        granted_scopes: grantedScopes,
        required_instagram_scopes: requiredInstagramScopes,
        missing_instagram_scopes: missingInstagramScopes,
        required_instagram_scopes_granted: requiredScopesGranted,
        required_scope_targets: granularScopes
          .map((entry) => object(entry))
          .filter((entry) => requiredInstagramScopes.includes(text(entry.scope)))
          .map((entry) => ({
            scope: text(entry.scope),
            target_ids: uniqueStrings(rows(entry.target_ids)),
          })),
      },
      page: {
        requested_page_id: pageId,
        returned_page_id: returnedPageId || null,
        page_matches: pageMatches,
        page_name: text(pagePayload?.name) || null,
        linked_instagram_business_id: linkedInstagramId || null,
        linked_instagram_username: text(linkedInstagram?.username) || null,
        instagram_business_id_matches: instagramMatches,
      },
      ready_for_instagram_messaging:
        tokenValid &&
        appIdMatches !== false &&
        pageMatches &&
        instagramMatches &&
        requiredScopesGranted,
    };
  } catch (error) {
    return {
      success: false,
      checked_at: new Date().toISOString(),
      error: safeError(error),
      ready_for_instagram_messaging: false,
    };
  }
}

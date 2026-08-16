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

function subscriptionFieldNames(value) {
  return uniqueStrings(
    rows(value).map((entry) =>
      typeof entry === "string" ? entry : object(entry).name,
    ),
  );
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

async function inspectPageSubscribedApp({ pageId, accessToken, configuredAppId }) {
  const requiredFields = ["messages", "messaging_postbacks"];

  try {
    const url = new URL(
      `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(pageId)}/subscribed_apps`,
    );
    url.searchParams.set("fields", "id,name,subscribed_fields");

    const payload = await graphJson(url.toString(), accessToken);
    const subscriptions = rows(payload?.data);
    const configuredApp = subscriptions.find(
      (entry) => text(object(entry).id) === configuredAppId,
    );
    const subscribedFields = configuredApp
      ? subscriptionFieldNames(object(configuredApp).subscribed_fields)
      : [];
    const missingRequiredFields = configuredApp
      ? requiredFields.filter((field) => !subscribedFields.includes(field))
      : requiredFields;

    return {
      success: true,
      configured_app_subscribed: Boolean(configuredApp),
      subscribed_fields: subscribedFields,
      required_fields: requiredFields,
      missing_required_fields: missingRequiredFields,
      healthy: Boolean(configuredApp) && missingRequiredFields.length === 0,
    };
  } catch (error) {
    return {
      success: false,
      configured_app_subscribed: null,
      subscribed_fields: [],
      required_fields: requiredFields,
      missing_required_fields: [],
      healthy: null,
      error: safeError(error),
    };
  }
}

async function inspectAppWebhookSubscriptions(configuredAppId) {
  const requiredInstagramFields = ["messages", "messaging_postbacks"];
  const requiredPageFields = [
    "messages",
    "messaging_postbacks",
    "message_deliveries",
    "message_reads",
  ];

  try {
    const url = new URL(
      `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(configuredAppId)}/subscriptions`,
    );
    const payload = await graphJson(url.toString(), appAccessToken());
    const subscriptions = rows(payload?.data);
    const instagramSubscription = subscriptions.find(
      (entry) => text(object(entry).object).toLowerCase() === "instagram",
    );
    const pageSubscription = subscriptions.find(
      (entry) => text(object(entry).object).toLowerCase() === "page",
    );
    const instagramFields = instagramSubscription
      ? subscriptionFieldNames(object(instagramSubscription).fields)
      : [];
    const pageFields = pageSubscription
      ? subscriptionFieldNames(object(pageSubscription).fields)
      : [];
    const missingInstagramFields = instagramSubscription
      ? requiredInstagramFields.filter((field) => !instagramFields.includes(field))
      : requiredInstagramFields;
    const missingPageFields = pageSubscription
      ? requiredPageFields.filter((field) => !pageFields.includes(field))
      : requiredPageFields;

    return {
      success: true,
      instagram: {
        subscribed: Boolean(instagramSubscription),
        fields: instagramFields,
        required_fields: requiredInstagramFields,
        missing_required_fields: missingInstagramFields,
        healthy:
          Boolean(instagramSubscription) && missingInstagramFields.length === 0,
      },
      page: {
        subscribed: Boolean(pageSubscription),
        fields: pageFields,
        required_fields: requiredPageFields,
        missing_required_fields: missingPageFields,
        healthy: Boolean(pageSubscription) && missingPageFields.length === 0,
      },
      healthy:
        Boolean(instagramSubscription) &&
        missingInstagramFields.length === 0 &&
        Boolean(pageSubscription) &&
        missingPageFields.length === 0,
    };
  } catch (error) {
    return {
      success: false,
      instagram: {
        subscribed: null,
        fields: [],
        required_fields: requiredInstagramFields,
        missing_required_fields: [],
        healthy: null,
      },
      page: {
        subscribed: null,
        fields: [],
        required_fields: requiredPageFields,
        missing_required_fields: [],
        healthy: null,
      },
      healthy: null,
      error: safeError(error),
    };
  }
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

    const [pageSubscribedApp, appWebhooks] = await Promise.all([
      inspectPageSubscribedApp({
        pageId,
        accessToken,
        configuredAppId,
      }),
      inspectAppWebhookSubscriptions(configuredAppId),
    ]);

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
      webhook_subscription: {
        page_subscribed_app: pageSubscribedApp,
        app_webhooks: appWebhooks,
        healthy:
          pageSubscribedApp.healthy === true && appWebhooks.healthy === true,
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

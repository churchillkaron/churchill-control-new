import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optional(name) {
  const value = text(process.env[name]);
  return value || null;
}

function bool(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function safeError(error) {
  return [
    text(error?.message),
    error?.code ? `code=${error.code}` : null,
    error?.details ? `details=${text(error.details)}` : null,
    error?.hint ? `hint=${text(error.hint)}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

async function checked(label, promise) {
  const result = await promise;
  if (result.error) throw new Error(`${label}: ${safeError(result.error)}`);
  return result;
}

async function graphGet(path, accessToken, params = {}) {
  const version = required("META_GRAPH_API_VERSION");
  const url = new URL(
    `https://graph.facebook.com/${version}/${String(path).replace(/^\//, "")}`,
  );

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.error) {
    const error = payload?.error || {};
    throw new Error(
      [
        error.error_user_msg || error.message || `HTTP ${response.status}`,
        error.code !== undefined ? `code=${error.code}` : null,
        error.error_subcode !== undefined
          ? `subcode=${error.error_subcode}`
          : null,
        error.type ? `type=${error.type}` : null,
      ]
        .filter(Boolean)
        .join(" | "),
    );
  }

  return payload;
}

function resolvePage(pages) {
  const configuredPageId = optional("ORGANIZATION_META_PAGE_ID");

  if (configuredPageId) {
    const selected = pages.find(
      (page) => String(page.id) === String(configuredPageId),
    );
    if (!selected) {
      throw new Error(
        `ORGANIZATION_META_PAGE_ID ${configuredPageId} is not accessible to the managed Meta token`,
      );
    }
    return { page: selected, selection: "EXPLICIT" };
  }

  if (!pages.length) {
    throw new Error(
      "The managed Meta token cannot access any assigned Facebook Page",
    );
  }

  if (pages.length > 1) {
    const choices = pages
      .map((page) => `${page.id}:${page.name || "Unnamed Page"}`)
      .join(", ");
    throw new Error(
      `The managed Meta token can access ${pages.length} Pages. Set ORGANIZATION_META_PAGE_ID explicitly. Accessible Pages: ${choices}`,
    );
  }

  return { page: pages[0], selection: "AUTOMATIC_SINGLE_ASSIGNED_PAGE" };
}

async function main() {
  const organizationId = required("ORGANIZATION_ID");
  const accessToken = required("AVANTIQO_META_ACCESS_TOKEN");
  const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const apply = bool(process.env.APPLY);

  console.log("MANAGED_META_CHANNEL_IDENTITY_BOOTSTRAP");
  console.log(`APPLY=${apply ? "YES" : "NO"}`);
  console.log("TOKEN_PRINTED=NO");
  console.log("TOKEN_STORED=NO");
  console.log("CAMPAIGN_CREATED=NO");
  console.log("WALLET_CHANGED=NO");

  const pagesPayload = await graphGet("me/accounts", accessToken, {
    fields: "id,name,instagram_business_account{id,username}",
    limit: 100,
  });
  const pages = Array.isArray(pagesPayload?.data) ? pagesPayload.data : [];
  const { page, selection } = resolvePage(pages);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    realtime: { transport: ws },
  });

  const [organizationResult, connectionsResult] = await Promise.all([
    checked(
      "Organization lookup failed",
      supabase
        .from("organizations")
        .select("*")
        .eq("id", organizationId)
        .maybeSingle(),
    ),
    checked(
      "Meta channel lookup failed",
      supabase
        .from("organization_channel_connections")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("provider", "meta")
        .order("created_at", { ascending: true }),
    ),
  ]);

  const organization = organizationResult.data;
  const connections = connectionsResult.data || [];

  if (!organization) throw new Error(`Organization ${organizationId} was not found`);
  if (connections.length > 1) {
    throw new Error(
      `Organization has ${connections.length} Meta channel connection rows. Resolve duplicates before applying identity bootstrap.`,
    );
  }

  const instagram = page.instagram_business_account || null;
  const existing = connections[0] || null;
  const existingMetadata = object(existing?.metadata);
  const metadata = {
    ...existingMetadata,
    page_id: page.id,
    facebook_page_id: page.id,
    page_name: page.name || null,
    instagram_business_id: instagram?.id || null,
    instagram_actor_id: instagram?.id || null,
    instagram_username: instagram?.username || null,
    available_pages: pages.map((item) => ({
      id: item.id,
      name: item.name || null,
      instagram_business_id: item.instagram_business_account?.id || null,
      instagram_username: item.instagram_business_account?.username || null,
    })),
    identity_connection_model: "MANAGED_ASSET_ASSIGNMENT",
    advertising_billing_model: "AVANTIQO_MANAGED",
    validated_at: new Date().toISOString(),
  };

  const preflight = {
    apply,
    organization_id: organizationId,
    organization_name:
      organization.name ||
      organization.legal_name ||
      organization.display_name ||
      organization.organization_name ||
      null,
    page_selection: selection,
    accessible_page_count: pages.length,
    selected_page_id: page.id,
    selected_page_name: page.name || null,
    instagram_business_id: instagram?.id || null,
    instagram_username: instagram?.username || null,
    existing_connection_id: existing?.id || null,
    existing_connection_status: existing?.status || null,
    token_stored: false,
    campaign_created: false,
    wallet_changed: false,
  };

  console.log("MANAGED_META_CHANNEL_PREFLIGHT");
  console.log(JSON.stringify(preflight, null, 2));

  if (!apply) {
    console.log("MANAGED_META_CHANNEL_BOOTSTRAP=READY_TO_APPLY");
    console.log("No database changes were made. Re-run with APPLY=true after reviewing the selected Page and Instagram identity.");
    return;
  }

  const now = new Date().toISOString();
  let connection;

  if (existing) {
    const updateResult = await checked(
      "Meta channel update failed",
      supabase
        .from("organization_channel_connections")
        .update({
          channel_type: "social",
          status: "ACTIVE",
          metadata,
          updated_at: now,
        })
        .eq("id", existing.id)
        .eq("organization_id", organizationId)
        .select("*")
        .single(),
    );
    connection = updateResult.data;
  } else {
    const insertResult = await checked(
      "Meta channel creation failed",
      supabase
        .from("organization_channel_connections")
        .insert({
          organization_id: organizationId,
          provider: "meta",
          channel_type: "social",
          credentials_reference: null,
          status: "ACTIVE",
          metadata,
          updated_at: now,
        })
        .select("*")
        .single(),
    );
    connection = insertResult.data;
  }

  await checked(
    "Facebook Page asset registration failed",
    supabase
      .from("organization_channel_assets")
      .upsert(
        {
          organization_id: organizationId,
          connection_id: connection.id,
          channel_provider: "meta",
          asset_type: "facebook_page",
          external_id: page.id,
          name: page.name || "Facebook Page",
          metadata: {
            instagram_business_id: instagram?.id || null,
            instagram_username: instagram?.username || null,
            identity_connection_model: "MANAGED_ASSET_ASSIGNMENT",
          },
        },
        { onConflict: "channel_provider,external_id" },
      )
      .select("*")
      .single(),
  );

  if (instagram?.id) {
    await checked(
      "Instagram asset registration failed",
      supabase
        .from("organization_channel_assets")
        .upsert(
          {
            organization_id: organizationId,
            connection_id: connection.id,
            channel_provider: "meta",
            asset_type: "instagram_business",
            external_id: instagram.id,
            name: instagram.username || `${page.name || "Facebook Page"} Instagram`,
            metadata: {
              facebook_page_id: page.id,
              identity_connection_model: "MANAGED_ASSET_ASSIGNMENT",
            },
          },
          { onConflict: "channel_provider,external_id" },
        )
        .select("*")
        .single(),
    );
  }

  console.log("MANAGED_META_CHANNEL_BOOTSTRAP=PASS");
  console.log(
    JSON.stringify(
      {
        organization_id: organizationId,
        connection_id: connection.id,
        connection_status: connection.status,
        page_id: page.id,
        page_name: page.name || null,
        instagram_business_id: instagram?.id || null,
        instagram_username: instagram?.username || null,
        token_stored: false,
        campaign_created: false,
        wallet_changed: false,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("MANAGED_META_CHANNEL_BOOTSTRAP=FAIL");
  console.error(`ERROR=${error?.message || String(error)}`);
  process.exit(1);
});

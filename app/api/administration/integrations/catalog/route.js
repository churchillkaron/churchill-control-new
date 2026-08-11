export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { listCustomerIntegrations } from "@/lib/platform/channels/CustomerIntegrationCatalog";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function clean(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function upper(value) {
  return String(value ?? "").trim().toUpperCase();
}

function safeAccountLabel(connection) {
  const metadata = connection?.metadata && typeof connection.metadata === "object"
    ? connection.metadata
    : {};

  return (
    clean(metadata.page_name) ||
    clean(metadata.instagram_username) ||
    clean(metadata.account_name) ||
    clean(metadata.account_title) ||
    clean(metadata.business_name) ||
    null
  );
}

function statusForIntegration(integration, connections, assets) {
  if (integration.availability !== "active") {
    return {
      state: "COMING_SOON",
      label: "Coming soon",
      detail: "This connection is not enabled yet.",
      account: null,
      action: null,
    };
  }

  const matchingConnections = connections.filter((row) =>
    integration.connectionProviders.includes(row.provider)
  );
  const activeConnection = matchingConnections.find(
    (row) => upper(row.status) === "ACTIVE"
  ) || null;

  const matchingAssets = assets.filter((row) => {
    if (integration.assetProviders?.length && !integration.assetProviders.includes(row.channel_provider)) {
      return false;
    }
    if (integration.assetTypes?.length && !integration.assetTypes.includes(row.asset_type)) {
      return false;
    }
    return true;
  });

  if (integration.id === "google-business" && activeConnection) {
    const discovery = upper(activeConnection.metadata?.location_discovery_status);
    if (discovery && discovery !== "READY") {
      return {
        state: "SETUP_IN_PROGRESS",
        label: "Connected",
        detail: "Avantiqo is completing the remaining Google setup. No reconnect is required.",
        account: safeAccountLabel(activeConnection),
        action: integration.detailAnchor ? "MANAGE" : null,
      };
    }
  }

  if (integration.id === "google-ads") {
    const advertisers = matchingAssets.filter(
      (asset) => asset?.metadata?.manager !== true
    );

    if (advertisers.length) {
      return {
        state: "CONNECTED",
        label: "Connected",
        detail: "Advertising account connected to this organization.",
        account: clean(advertisers[0]?.name) || null,
        action: "MANAGE",
      };
    }

    return {
      state: "ACTION_REQUIRED",
      label: "Not connected",
      detail: "Connect or activate Google Ads when this business is ready to advertise.",
      account: null,
      action: "MANAGE",
    };
  }

  if (activeConnection) {
    return {
      state: "CONNECTED",
      label: "Connected",
      detail: "This business connection is active.",
      account: safeAccountLabel(activeConnection),
      action: integration.detailAnchor ? "MANAGE" : null,
    };
  }

  return {
    state: "ACTION_REQUIRED",
    label: "Not connected",
    detail: "Connect this business service when the organization wants to use it.",
    account: null,
    action: integration.connectPath ? "CONNECT" : null,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(
      url.searchParams.get("organizationId") ||
      url.searchParams.get("organization_id")
    );

    if (!organizationId) {
      return NextResponse.json(
        { success: false, error: "organizationId required" },
        { status: 400 }
      );
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error || "Organization access denied" },
        { status: access.status || 403 }
      );
    }

    const [{ data: connections, error: connectionsError }, { data: assets, error: assetsError }] =
      await Promise.all([
        supabaseAdmin
          .from("organization_channel_connections")
          .select("id,organization_id,provider,channel_type,status,metadata,authorized_at,updated_at")
          .eq("organization_id", access.organizationId),
        supabaseAdmin
          .from("organization_channel_assets")
          .select("id,organization_id,channel_provider,asset_type,name,entity_id,metadata,updated_at")
          .eq("organization_id", access.organizationId),
      ]);

    if (connectionsError) throw connectionsError;
    if (assetsError) throw assetsError;

    const rows = listCustomerIntegrations().map((integration) => ({
      id: integration.id,
      name: integration.name,
      category: integration.category,
      description: integration.description,
      connectPath: integration.connectPath,
      detailAnchor: integration.detailAnchor,
      availability: integration.availability,
      ...statusForIntegration(integration, connections || [], assets || []),
    }));

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      rows,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Integration catalog lookup failed" },
      { status: 500 }
    );
  }
}

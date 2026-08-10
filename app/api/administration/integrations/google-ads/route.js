export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { ChannelAssetRuntime } from "@/lib/platform/channels/runtime/ChannelAssetRuntime";
import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { OrganizationServiceRuntime } from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";
import { WalletRepository } from "@/lib/platform/service-runtime/wallet/repositories/WalletRepository";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PROVIDER = "google_ads";
const ASSET_TYPE = "google_ads_customer";
const SERVICE_ID = "google-ads";
const CAPABILITY = "marketing.google.ads.manage";
const INTEGRATION_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGER",
]);

function text(value) {
  return String(value ?? "").trim();
}

function canManageIntegrations(context) {
  const roles = [
    context?.role,
    context?.access?.role,
    context?.membership?.role,
    context?.staff?.role,
  ]
    .map((value) => text(value).toUpperCase())
    .filter(Boolean);

  return roles.some((role) => INTEGRATION_ROLES.has(role));
}

async function resolveContext(request, body = {}) {
  const url = new URL(request.url);
  return requireOrganizationAccess({
    organizationId:
      body.organizationId ||
      body.organization_id ||
      url.searchParams.get("organizationId") ||
      url.searchParams.get("organization_id"),
    request,
  });
}

function forbidden() {
  return NextResponse.json(
    {
      success: false,
      error: "Owner, administrator, or manager access is required to manage Google Ads",
    },
    { status: 403 }
  );
}

async function snapshot(organizationId) {
  const [connectionResult, assetsResult, entitiesResult, service, wallet] =
    await Promise.all([
      supabaseAdmin
        .from("organization_channel_connections")
        .select("id,organization_id,provider,channel_type,status,metadata,authorized_by_party_id,authorized_at,created_at,updated_at")
        .eq("organization_id", organizationId)
        .eq("provider", PROVIDER)
        .maybeSingle(),
      supabaseAdmin
        .from("organization_channel_assets")
        .select("id,organization_id,connection_id,channel_provider,asset_type,external_id,name,entity_id,selected_by_party_id,selected_at,metadata,created_at,updated_at")
        .eq("organization_id", organizationId)
        .eq("channel_provider", PROVIDER)
        .eq("asset_type", ASSET_TYPE)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("legal_entities")
        .select("id,organization_id,code,legal_name,display_name,is_default_accounting_entity,is_active")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("is_default_accounting_entity", { ascending: false })
        .order("display_name", { ascending: true }),
      OrganizationServiceRuntime.get({
        organization_id: organizationId,
        service_id: SERVICE_ID,
      }).catch(() => null),
      WalletRepository.getByOrganization(organizationId).catch(() => null),
    ]);

  if (connectionResult.error) throw connectionResult.error;
  if (assetsResult.error) throw assetsResult.error;
  if (entitiesResult.error) throw entitiesResult.error;

  return {
    connection: connectionResult.data || null,
    accounts: assetsResult.data || [],
    entities: entitiesResult.data || [],
    service: service || null,
    wallet: wallet
      ? {
          status: wallet.status || null,
          currency: wallet.currency || null,
          available_balance: Number(wallet.available_balance || 0),
          reserved_balance: Number(wallet.reserved_balance || 0),
        }
      : null,
    platformReady: Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN),
  };
}

async function executionCurrency(organizationId) {
  const wallet = await WalletRepository.getByOrganization(organizationId);
  if (!wallet?.currency) {
    throw new Error("An active organization wallet with a currency is required before Google Ads execution");
  }
  return text(wallet.currency).toUpperCase();
}

async function executeGoogleAds({ organizationId, entityId = null, input }) {
  const currency = await executionCurrency(organizationId);
  return ServiceExecutionRuntime.execute({
    organization_id: organizationId,
    entity_id: entityId,
    service_id: SERVICE_ID,
    provider_id: PROVIDER,
    capability: CAPABILITY,
    input: {
      ...input,
      currency,
      quantity: 1,
    },
    category: "ADMINISTRATION",
    metadata: {
      module: "ADMINISTRATION_INTEGRATIONS",
      provider: PROVIDER,
    },
  });
}

async function discoverAccounts(organizationId, connection) {
  if (!connection || text(connection.status).toUpperCase() !== "ACTIVE") {
    throw new Error("Google Ads is not connected");
  }

  const service = await OrganizationServiceRuntime.get({
    organization_id: organizationId,
    service_id: SERVICE_ID,
  });
  if (!service || text(service.status).toUpperCase() !== "ACTIVE") {
    throw new Error("Google Ads service is not active for this organization");
  }

  const execution = await executeGoogleAds({
    organizationId,
    input: { action: "list_accessible_customers" },
  });
  const output = execution?.output?.output || {};
  const resourceNames = Array.isArray(output.resourceNames)
    ? output.resourceNames
    : Array.isArray(output.resource_names)
      ? output.resource_names
      : [];

  const accounts = [];
  for (const resourceName of resourceNames) {
    const customerId = text(resourceName).replace(/^customers\//, "").replace(/\D/g, "");
    if (!customerId) continue;

    let details = {};
    try {
      const detailExecution = await executeGoogleAds({
        organizationId,
        input: {
          action: "search",
          customer_id: customerId,
          query:
            "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager FROM customer LIMIT 1",
        },
      });
      const detailOutput = detailExecution?.output?.output || {};
      const row = Array.isArray(detailOutput.results) ? detailOutput.results[0] : null;
      details = row?.customer || {};
    } catch (error) {
      details = {
        discovery_error: text(error?.message || "Customer details unavailable"),
      };
    }

    const existing = await ChannelAssetRuntime.find({
      organization_id: organizationId,
      provider: PROVIDER,
      asset_type: ASSET_TYPE,
      external_id: customerId,
    });
    const isManager = details.manager === true;
    const entityId = isManager
      ? null
      : existing?.entity_id || existing?.metadata?.entity_id || null;

    const asset = await ChannelAssetRuntime.register({
      organization_id: organizationId,
      connection_id: connection.id,
      provider: PROVIDER,
      asset_type: ASSET_TYPE,
      external_id: customerId,
      name:
        details.descriptiveName ||
        details.descriptive_name ||
        existing?.name ||
        `Google Ads ${customerId}`,
      entity_id: entityId,
      selected_by_party_id: isManager ? null : existing?.selected_by_party_id || null,
      selected_at: isManager ? null : existing?.selected_at || null,
      metadata: {
        ...(existing?.metadata || {}),
        customer_id: customerId,
        currency_code: details.currencyCode || details.currency_code || null,
        time_zone: details.timeZone || details.time_zone || null,
        manager: isManager,
        account_role: isManager ? "MANAGER" : "ADVERTISER",
        entity_id: entityId,
        discovery_error: details.discovery_error || null,
      },
    });
    accounts.push(asset);
  }

  const now = new Date().toISOString();
  const updatedConnection = await ChannelConnectionRuntime.connect({
    organization_id: organizationId,
    provider: PROVIDER,
    channel_type: connection.channel_type || "advertising",
    credentials_reference: connection.credentials_reference,
    metadata: {
      ...(connection.metadata || {}),
      account_count: accounts.length,
      account_discovery_status: "READY",
      account_discovered_at: now,
      account_discovery_error: null,
    },
  });

  return { accounts, connection: updatedConnection };
}

export async function GET(request) {
  try {
    const context = await resolveContext(request);
    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error },
        { status: context.status || 403 }
      );
    }
    if (!canManageIntegrations(context)) return forbidden();

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      ...(await snapshot(context.organizationId)),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load Google Ads integration" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const context = await resolveContext(request, body);
    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error },
        { status: context.status || 403 }
      );
    }
    if (!canManageIntegrations(context)) return forbidden();

    const action = text(body.action).toLowerCase();

    if (action === "discover") {
      const connection = await ChannelConnectionRuntime.get({
        organization_id: context.organizationId,
        provider: PROVIDER,
      });
      await discoverAccounts(context.organizationId, connection);

      const current = await snapshot(context.organizationId);
      const advertiserAccounts = current.accounts.filter(
        (account) => account?.metadata?.manager !== true
      );
      if (
        advertiserAccounts.length === 1 &&
        current.entities.length === 1 &&
        !advertiserAccounts[0].entity_id
      ) {
        const now = new Date().toISOString();
        const partyId = context.staff?.party_id || null;
        const account = advertiserAccounts[0];
        const entity = current.entities[0];
        const { error } = await supabaseAdmin
          .from("organization_channel_assets")
          .update({
            entity_id: entity.id,
            selected_by_party_id: partyId,
            selected_at: now,
            metadata: { ...(account.metadata || {}), entity_id: entity.id },
            updated_at: now,
          })
          .eq("id", account.id)
          .eq("organization_id", context.organizationId);
        if (error) throw error;
      }

      return NextResponse.json({
        success: true,
        organizationId: context.organizationId,
        ...(await snapshot(context.organizationId)),
      });
    }

    if (action === "map-account") {
      const assetId = text(body.assetId || body.asset_id);
      const entityId = text(body.entityId || body.entity_id);
      if (!assetId || !entityId) {
        return NextResponse.json(
          { success: false, error: "assetId and entityId are required" },
          { status: 400 }
        );
      }

      const { data: entity, error: entityError } = await supabaseAdmin
        .from("legal_entities")
        .select("id")
        .eq("id", entityId)
        .eq("organization_id", context.organizationId)
        .eq("is_active", true)
        .maybeSingle();
      if (entityError) throw entityError;
      if (!entity) {
        return NextResponse.json(
          { success: false, error: "Entity is not available for this organization" },
          { status: 400 }
        );
      }

      const { data: asset, error: assetError } = await supabaseAdmin
        .from("organization_channel_assets")
        .select("*")
        .eq("id", assetId)
        .eq("organization_id", context.organizationId)
        .eq("channel_provider", PROVIDER)
        .eq("asset_type", ASSET_TYPE)
        .maybeSingle();
      if (assetError) throw assetError;
      if (!asset) {
        return NextResponse.json(
          { success: false, error: "Google Ads account was not found" },
          { status: 404 }
        );
      }
      if (asset?.metadata?.manager === true) {
        return NextResponse.json(
          {
            success: false,
            error: "Google Ads manager accounts control advertiser accounts and are not mapped to business entities",
          },
          { status: 400 }
        );
      }

      const now = new Date().toISOString();
      const partyId = context.staff?.party_id || null;
      const { error: updateError } = await supabaseAdmin
        .from("organization_channel_assets")
        .update({
          entity_id: entityId,
          selected_by_party_id: partyId,
          selected_at: now,
          metadata: { ...(asset.metadata || {}), entity_id: entityId },
          updated_at: now,
        })
        .eq("id", asset.id)
        .eq("organization_id", context.organizationId);
      if (updateError) throw updateError;

      return NextResponse.json({
        success: true,
        organizationId: context.organizationId,
        ...(await snapshot(context.organizationId)),
      });
    }

    if (action === "save-policy") {
      const existing = await OrganizationServiceRuntime.get({
        organization_id: context.organizationId,
        service_id: SERVICE_ID,
      });
      if (!existing) throw new Error("Google Ads service is not enabled");

      const configuration = {
        ...(existing.configuration || {}),
        default_destination_url: text(body.defaultDestinationUrl || body.default_destination_url) || null,
        default_goal: text(body.defaultGoal || body.default_goal).toUpperCase() || null,
        approval_threshold: Number(body.approvalThreshold ?? body.approval_threshold ?? 0),
        default_media_budget: Number(body.defaultMediaBudget ?? body.default_media_budget ?? 0),
        hard_media_budget_limit: Number(body.hardMediaBudgetLimit ?? body.hard_media_budget_limit ?? 0),
        auto_optimize: body.autoOptimize === true || body.auto_optimize === true,
      };

      await OrganizationServiceRuntime.save({
        ...existing,
        configuration,
      });

      return NextResponse.json({
        success: true,
        organizationId: context.organizationId,
        ...(await snapshot(context.organizationId)),
      });
    }

    return NextResponse.json(
      { success: false, error: "Unsupported integration action" },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Google Ads integration action failed" },
      { status: 500 }
    );
  }
}

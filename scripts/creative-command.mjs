#!/usr/bin/env node

import crypto from "node:crypto";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import nextEnv from "@next/env";
import WebSocket from "ws";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

if (!globalThis.WebSocket) globalThis.WebSocket = WebSocket;

const intent = process.argv.slice(2).join(" ").trim();
if (!intent) {
  console.error('Usage: npm run creative -- "Describe what Avantiqo should create"');
  process.exit(1);
}

const [
  { supabaseAdmin },
  { CreativeAssetAutoSelectionRuntime },
  { CreativeMissionRuntime },
  { CreativeProjectRuntime },
  CreativeAssetGraphRepository,
  { CreativeDirectorRuntime },
  { OrganizationServiceRuntime },
  { resolveProvider },
  { PricingRuntime },
  { resolveServiceCapabilities },
  { resolvePrimaryExecutionCapability },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/creative/assets/runtime/CreativeAssetAutoSelectionRuntime"),
  import("@/lib/creative/missions/runtime/CreativeMissionRuntime"),
  import("@/lib/creative/projects/runtime/CreativeProjectRuntime"),
  import("@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository"),
  import("@/lib/creative/director/runtime/CreativeDirectorRuntime"),
  import("@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime"),
  import("@/lib/platform/service-runtime/providers/ProviderResolver"),
  import("@/lib/platform/service-runtime/pricing/PricingRuntime"),
  import("@/lib/platform/service-runtime/services/resolver/ServiceCapabilityResolver"),
  import("@/lib/platform/service-runtime/services/resolver/CapabilityExecutionResolver"),
]);

const RESEARCH_SERVICE_ID = "ai.reasoning.execute";
const RESEARCH_APPROVAL_MINUTES = 30;
let paidResearchAuthorized = false;

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalized(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function significantTokens(value) {
  const ignored = new Set([
    "and", "bar", "co", "company", "ltd", "limited", "restaurant", "the",
  ]);
  return normalized(value)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !ignored.has(token));
}

function inferDuration(value) {
  const match = normalized(value).match(/\b(\d+(?:\.\d+)?)\s*(?:second|seconds|sec|secs|s)\b/);
  return match ? Number(match[1]) : 30;
}

function inferChannels(value) {
  const source = normalized(value);
  const channels = [];
  if (source.includes("facebook")) channels.push("facebook");
  if (source.includes("instagram")) channels.push("instagram");
  if (source.includes("tiktok") || source.includes("tik tok")) channels.push("tiktok");
  if (source.includes("youtube")) channels.push("youtube");
  if (source.includes("linkedin")) channels.push("linkedin");
  if (source.includes("website") || source.includes("web page") || source.includes("webpage")) channels.push("website");
  return [...new Set(channels)];
}

function inferProductionType(value) {
  const source = normalized(value);
  if (/\b(video|film|reel|trailer|commercial|motion)\b/.test(source)) return "VIDEO";
  if (/\b(poster|image|photo|banner|graphic|social post)\b/.test(source)) return "IMAGE";
  if (/\b(menu|brochure|document|report|presentation|deck)\b/.test(source)) return "DOCUMENT";
  if (/\b(website|webpage|web page|landing page)\b/.test(source)) return "WEBSITE";
  if (/\b(audio|music|song|podcast|voice)\b/.test(source)) return "AUDIO";
  return "CAMPAIGN";
}

function verticalRequested(value, channels) {
  const source = normalized(value);
  return source.includes("vertical") || source.includes("portrait") ||
    channels.some((channel) => ["facebook", "instagram", "tiktok"].includes(channel));
}

function commandIdentity(organizationId, value) {
  return crypto
    .createHash("sha256")
    .update(`${organizationId}\n${normalized(value)}`)
    .digest("hex");
}

function amountText(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return number.toFixed(6).replace(/\.?0+$/, "");
}

async function resolveOrganization() {
  const explicit = text(
    process.env.CREATIVE_ORGANIZATION_ID ||
    process.env.ACTIVE_ORGANIZATION_ID ||
    process.env.ORGANIZATION_ID,
  );
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("id,name")
    .limit(1000);
  if (error) throw error;

  const organizations = (data || []).filter((item) => item?.id && item?.name);
  if (explicit) {
    const match = organizations.find((item) => String(item.id) === explicit);
    if (!match) throw new Error(`CREATIVE_ORGANIZATION_NOT_FOUND:${explicit}`);
    return match;
  }

  const command = normalized(intent);
  const ranked = organizations
    .map((organization) => {
      const name = normalized(organization.name);
      const tokens = significantTokens(organization.name);
      let score = 0;
      if (name && command.includes(name)) score += 1000;
      for (const token of tokens) {
        if (new RegExp(`\\b${token}\\b`, "i").test(command)) score += 150;
      }
      return { organization, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  if (!ranked.length) {
    throw new Error(
      "CREATIVE_ORGANIZATION_NOT_RESOLVED: mention the company name in the command",
    );
  }
  if (ranked[1] && ranked[1].score === ranked[0].score) {
    throw new Error(
      `CREATIVE_ORGANIZATION_AMBIGUOUS:${ranked
        .filter((entry) => entry.score === ranked[0].score)
        .map((entry) => entry.organization.name)
        .join(",")}`,
    );
  }
  return ranked[0].organization;
}

function cleanSelection(selection = {}) {
  return {
    source: selection.source || null,
    scanned_asset_count: Number(selection.scanned_asset_count || 0),
    scanned_asset_node_count: Number(selection.scanned_asset_node_count || 0),
    visual_asset_count: Number(selection.visual_asset_count || 0),
    verified_visual_asset_count: Number(selection.verified_visual_asset_count || 0),
    candidate_count: Number(selection.candidate_count || 0),
    selected_asset_ids: selection.selected_asset_ids || [],
    selected_assets: selection.selected_assets || [],
  };
}

function approvalBoundary(error) {
  const message = text(error?.message || error).toUpperCase();
  return message.includes("PRODUCTION_DOSSIER") ||
    message.includes("APPROVAL_REQUIRED") ||
    message.includes("HUMAN_APPROVAL_REQUIRED");
}

function reusableMission(missions, identity) {
  const inactive = new Set(["completed", "archived", "cancelled", "canceled"]);
  return (missions || []).find((mission) => {
    if (inactive.has(text(mission.status).toLowerCase())) return false;
    const metadata = mission.metadata || {};
    return (
      text(metadata.command_identity) === identity ||
      (
        normalized(metadata.original_intent) === normalized(intent) &&
        [
          "natural_language_creative_command_cli",
          "natural_language_creative_intent",
          "natural_language_creative_command",
        ].includes(text(metadata.source))
      )
    );
  }) || null;
}

function reusableResearchApproval(project = {}, identity) {
  const approval = object(project.metadata?.paid_research_approval);
  const approvedAt = Date.parse(text(approval.approved_at));
  const expiresAt = Date.parse(text(approval.expires_at));
  const now = Date.now();
  return (
    approval.approved === true &&
    text(approval.provider) &&
    text(approval.pricing_id) &&
    Number(approval.maximum_customer_price) > 0 &&
    Number.isFinite(approvedAt) &&
    Number.isFinite(expiresAt) &&
    approvedAt <= now &&
    expiresAt > now &&
    text(approval.command_identity) === identity
  ) ? approval : null;
}

async function researchEstimate(organizationId) {
  const organizationService = await OrganizationServiceRuntime.get({
    organization_id: organizationId,
    service_id: RESEARCH_SERVICE_ID,
  });
  if (!organizationService) {
    throw new Error(`Service ${RESEARCH_SERVICE_ID} is not enabled for organization`);
  }

  const service = resolveServiceCapabilities(RESEARCH_SERVICE_ID);
  const capability = resolvePrimaryExecutionCapability(service?.capabilities || []);
  if (!capability) {
    throw new Error(`No execution capability found for ${RESEARCH_SERVICE_ID}`);
  }

  const selected = await resolveProvider({
    organization_id: organizationId,
    capability,
    preferredProvider: null,
    country: null,
    currency: null,
    policy: organizationService.provider_policy || {},
  });
  if (!selected?.pricing_id) {
    throw new Error("CREATIVE_RESEARCH_PRICING_ID_REQUIRED");
  }

  const pricing = await PricingRuntime.resolveById({
    pricing_id: selected.pricing_id,
    currency: selected.currency || null,
    usage: { quantity: 1 },
  });

  return {
    capability,
    provider: selected.provider,
    model: selected.model || null,
    pricing_id: selected.pricing_id,
    maximum_customer_price: pricing.customer_price,
    supplier_cost: pricing.supplier_cost,
    currency: pricing.currency,
    estimated_input_tokens: pricing.input_tokens,
    estimated_output_tokens: pricing.output_tokens,
    pricing_estimated: pricing.estimated === true,
  };
}

async function requestResearchApproval(estimate) {
  const price = amountText(estimate.maximum_customer_price);
  const currency = text(estimate.currency).toUpperCase();
  const phrase = `APPROVE RESEARCH ${price} ${currency}`;

  console.log("============================================================");
  console.log("AVANTIQO PAID RESEARCH APPROVAL");
  console.log("============================================================");
  console.log(`RESEARCH_PROVIDER=${estimate.provider}`);
  console.log(`RESEARCH_MODEL=${estimate.model || ""}`);
  console.log(`RESEARCH_PRICING_ID=${estimate.pricing_id}`);
  console.log(`RESEARCH_MAXIMUM_CUSTOMER_PRICE=${price}`);
  console.log(`RESEARCH_CURRENCY=${currency}`);
  console.log(`RESEARCH_ESTIMATED_INPUT_TOKENS=${estimate.estimated_input_tokens || 0}`);
  console.log(`RESEARCH_ESTIMATED_OUTPUT_TOKENS=${estimate.estimated_output_tokens || 0}`);
  console.log("MEDIA_GENERATION_AUTHORIZED=NO");
  console.log("PUBLICATION_AUTHORIZED=NO");
  console.log("============================================================");

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("CREATIVE_INTERACTIVE_RESEARCH_APPROVAL_REQUIRED");
  }

  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await terminal.question(`Type ${phrase} to continue, or press Enter to stop: `);
    return normalized(answer) === normalized(phrase);
  } finally {
    terminal.close();
  }
}

function stoppedBeforeResearch({ organization, mission, projectId, estimate }) {
  console.log("============================================================");
  console.log("AVANTIQO CREATIVE COMMAND PAUSED");
  console.log("============================================================");
  console.log(`ORGANIZATION_ID=${organization.id}`);
  console.log(`ORGANIZATION_NAME=${organization.name}`);
  console.log(`CREATIVE_MISSION_ID=${mission.id}`);
  console.log(`CREATIVE_PROJECT_ID=${projectId}`);
  console.log(`RESEARCH_PROVIDER=${estimate.provider}`);
  console.log(`RESEARCH_MODEL=${estimate.model || ""}`);
  console.log(`RESEARCH_MAXIMUM_CUSTOMER_PRICE=${amountText(estimate.maximum_customer_price)}`);
  console.log(`RESEARCH_CURRENCY=${estimate.currency}`);
  console.log("PAID_RESEARCH_AUTHORIZED=NO");
  console.log("PAID_MEDIA_EXECUTION_AUTHORIZED=NO");
  console.log("PUBLICATION_AUTHORIZED=NO");
  console.log("NEXT_ACTION=RERUN_THE_SAME_COMMAND_AND_APPROVE_RESEARCH");
  console.log("============================================================");
}

try {
  const organization = await resolveOrganization();
  const channels = inferChannels(intent);
  const productionType = inferProductionType(intent);
  const duration = inferDuration(intent);
  const vertical = verticalRequested(intent, channels);
  const identity = commandIdentity(organization.id, intent);

  const selection = await CreativeAssetAutoSelectionRuntime.resolve({
    organization_id: organization.id,
    organization,
    intent,
    maximum_assets: 6,
  });
  const assets = selection.assets || [];
  if (!assets.length) {
    throw new Error(
      `CREATIVE_VERIFIED_SOURCE_ASSETS_NOT_FOUND:` +
      `assets=${selection.scanned_asset_count || 0},` +
      `nodes=${selection.scanned_asset_node_count || 0},` +
      `verified_visuals=${selection.verified_visual_asset_count || 0},` +
      `candidates=${selection.candidate_count || 0}`,
    );
  }

  const selectedIds = assets.map((asset) => asset.id);
  const metadata = {
    source: "natural_language_creative_command_cli",
    command_identity: identity,
    original_intent: intent,
    production_type: productionType,
    target_duration: duration,
    target_languages: ["en"],
    default_export_profile_id:
      vertical ? "master-vertical-h264" : "master-landscape-h264",
    public_publish_authorized: false,
    publish_authorized: false,
    publication_requires_human_approval: true,
    production_dossier_approval_required: true,
    selected_asset_ids: selectedIds,
    asset_selection: cleanSelection(selection),
  };

  const missions = await CreativeMissionRuntime.list({
    organization_id: organization.id,
  });
  const existingMission = reusableMission(missions, identity);
  const mission = existingMission
    ? await CreativeMissionRuntime.update(existingMission.id, {
        title: intent.slice(0, 120),
        business_goal: intent,
        objective: intent,
        audience: existingMission.audience || {},
        channels,
        metadata: {
          ...(existingMission.metadata || {}),
          ...metadata,
          resumed_at: new Date().toISOString(),
        },
      })
    : await CreativeMissionRuntime.create({
        organization_id: organization.id,
        title: intent.slice(0, 120),
        business_goal: intent,
        objective: intent,
        audience: {},
        channels,
        metadata,
      });
  const executionMode = existingMission
    ? "RESUMED_EXISTING_MISSION"
    : "CREATED_NEW_MISSION";

  const started = await CreativeMissionRuntime.start(mission.id);
  const projectId = started.runtime_context?.creative_project_id;
  const briefId = started.runtime_context?.creative_brief_id;
  if (!projectId) throw new Error("CREATIVE_PROJECT_NOT_CREATED");

  const project = await CreativeProjectRuntime.get(projectId);
  const attached = await CreativeAssetGraphRepository.attachAssetsToProject({
    organization_id: organization.id,
    creative_project_id: projectId,
    creative_asset_ids: selectedIds,
  });
  if (attached.length < selectedIds.length) {
    throw new Error("CREATIVE_SELECTED_ASSET_NODE_ATTACHMENT_INCOMPLETE");
  }

  let updatedProject = await CreativeProjectRuntime.update(projectId, {
    metadata: {
      ...(project.metadata || {}),
      command_identity: identity,
      target_duration: duration,
      selected_asset_ids: selectedIds,
      selected_assets_locked_at: new Date().toISOString(),
      selected_assets_source: selection.source,
      asset_selection: cleanSelection(selection),
      public_publish_authorized: false,
      publish_authorized: false,
      publication_requires_human_approval: true,
      production_dossier_approval_required: true,
    },
  });

  let researchApproval = reusableResearchApproval(updatedProject, identity);
  let researchApprovalMode = "REUSED_EXISTING_APPROVAL";
  if (!researchApproval) {
    const estimate = await researchEstimate(organization.id);
    const approved = await requestResearchApproval(estimate);
    if (!approved) {
      stoppedBeforeResearch({
        organization,
        mission: started,
        projectId,
        estimate,
      });
      process.exit(0);
    }

    const approvedAt = new Date();
    researchApproval = {
      id: crypto.randomUUID(),
      approved: true,
      scope: "AUTONOMOUS_COMPANY_MARKET_RESEARCH",
      command_identity: identity,
      provider: estimate.provider,
      model: estimate.model,
      capability: estimate.capability,
      pricing_id: estimate.pricing_id,
      maximum_customer_price: estimate.maximum_customer_price,
      supplier_cost_estimate: estimate.supplier_cost,
      currency: estimate.currency,
      estimated_input_tokens: estimate.estimated_input_tokens,
      estimated_output_tokens: estimate.estimated_output_tokens,
      approved_at: approvedAt.toISOString(),
      expires_at: new Date(
        approvedAt.getTime() + RESEARCH_APPROVAL_MINUTES * 60 * 1000,
      ).toISOString(),
      media_generation_authorized: false,
      publication_authorized: false,
    };
    updatedProject = await CreativeProjectRuntime.update(projectId, {
      metadata: {
        ...(updatedProject.metadata || {}),
        paid_research_approval: researchApproval,
      },
    });
    researchApprovalMode = "APPROVED_INTERACTIVELY";
  }
  paidResearchAuthorized = true;

  let execution = null;
  let executionError = null;
  try {
    execution = await CreativeDirectorRuntime.execute({
      organization_id: organization.id,
      creative_mission_id: started.id,
      creative_project_id: projectId,
      creative_brief_id: briefId,
      mission: started,
      project: updatedProject,
      objective: intent,
      business_goal: intent,
      audience: {},
      assets,
      requestedOutputs: [...new Set([...channels, productionType])],
      organization,
      brand: {},
    });
  } catch (error) {
    if (!approvalBoundary(error)) throw error;
    executionError = text(error?.message || error);
  }

  const projectNodes = await CreativeAssetGraphRepository.listByProject({
    organization_id: organization.id,
    creative_project_id: projectId,
  });
  const dossier = projectNodes.find((node) => node.type === "PRODUCTION_DOSSIER") || null;
  const estimatedCost =
    dossier?.metadata?.estimated_production_cost ??
    dossier?.metadata?.estimated_cost ??
    dossier?.cost?.estimated ??
    null;
  const currency =
    dossier?.metadata?.currency ??
    dossier?.cost?.currency ??
    null;

  console.log("============================================================");
  console.log("AVANTIQO CREATIVE COMMAND");
  console.log("============================================================");
  console.log(`COMMAND=${intent}`);
  console.log(`COMMAND_IDENTITY=${identity}`);
  console.log(`COMMAND_EXECUTION_MODE=${executionMode}`);
  console.log(`ORGANIZATION_ID=${organization.id}`);
  console.log(`ORGANIZATION_NAME=${organization.name}`);
  console.log(`PRODUCTION_TYPE=${productionType}`);
  console.log(`TARGET_DURATION_SECONDS=${duration}`);
  console.log(`CHANNELS=${channels.join(",")}`);
  console.log(`EXPORT_PROFILE=${vertical ? "master-vertical-h264" : "master-landscape-h264"}`);
  console.log(`ASSET_SELECTION_SOURCE=${selection.source}`);
  console.log(`SCANNED_ASSET_COUNT=${selection.scanned_asset_count || 0}`);
  console.log(`SCANNED_ASSET_NODE_COUNT=${selection.scanned_asset_node_count || 0}`);
  console.log(`VERIFIED_VISUAL_ASSET_COUNT=${selection.verified_visual_asset_count || 0}`);
  console.log(`ORIGINAL_SOURCE_CANDIDATE_COUNT=${selection.candidate_count || 0}`);
  console.log(`SELECTED_ASSET_COUNT=${selectedIds.length}`);
  for (const selected of selection.selected_assets || []) {
    console.log(
      `SELECTED_ASSET=${selected.selected_role || "SOURCE"}|${selected.name || selected.file_name || selected.asset_id}|${selected.asset_id}`,
    );
  }
  console.log(`CREATIVE_MISSION_ID=${started.id}`);
  console.log(`CREATIVE_PROJECT_ID=${projectId}`);
  console.log(`CREATIVE_BRIEF_ID=${briefId || ""}`);
  console.log(`ATTACHED_ASSET_NODE_COUNT=${attached.length}`);
  console.log(`RESEARCH_APPROVAL_MODE=${researchApprovalMode}`);
  console.log(`RESEARCH_PROVIDER=${researchApproval.provider}`);
  console.log(`RESEARCH_MODEL=${researchApproval.model || ""}`);
  console.log(`RESEARCH_PRICING_ID=${researchApproval.pricing_id}`);
  console.log(`RESEARCH_MAXIMUM_CUSTOMER_PRICE=${amountText(researchApproval.maximum_customer_price)}`);
  console.log(`RESEARCH_CURRENCY=${researchApproval.currency}`);
  console.log(`PRODUCTION_DOSSIER_ID=${dossier?.id || ""}`);
  console.log(`ESTIMATED_PRODUCTION_COST=${estimatedCost ?? "PENDING"}`);
  console.log(`CURRENCY=${currency || "PENDING"}`);
  console.log(`PIPELINE_STATUS=${execution?.status || execution?.production?.status || "WAITING_FOR_PRODUCTION_APPROVAL"}`);
  console.log(`PIPELINE_BOUNDARY=${executionError || "PRODUCTION_DOSSIER_APPROVAL_REQUIRED"}`);
  console.log("PAID_RESEARCH_AUTHORIZED=YES");
  console.log("PAID_MEDIA_EXECUTION_AUTHORIZED=NO");
  console.log("PUBLICATION_AUTHORIZED=NO");
  console.log("NEXT_ACTION=REVIEW_AND_APPROVE_PRODUCTION_DOSSIER");
  console.log("============================================================");
} catch (error) {
  console.error("============================================================");
  console.error("AVANTIQO CREATIVE COMMAND FAILED");
  console.error("============================================================");
  console.error(`ERROR=${text(error?.message || error)}`);
  console.error(`PAID_RESEARCH_AUTHORIZED=${paidResearchAuthorized ? "YES" : "NO"}`);
  console.error("PAID_MEDIA_EXECUTION_AUTHORIZED=NO");
  console.error("PUBLICATION_AUTHORIZED=NO");
  console.error("============================================================");
  process.exit(1);
}
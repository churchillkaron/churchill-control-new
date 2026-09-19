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
  { CreativeHumanIntentUnderstandingRuntime },
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
  import("@/lib/creative/missions/runtime/CreativeHumanIntentUnderstandingRuntime"),
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
  if (!explicit) {
    throw new Error(
      "CREATIVE_BUSINESS_CONTEXT_REQUIRED: organization scope must come from Business Context, not language parsing",
    );
  }

  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("id,name")
    .eq("id", explicit)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error(`CREATIVE_ORGANIZATION_NOT_FOUND:${explicit}`);
  return data;
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
    return text(mission.metadata?.command_identity) === identity;
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
  if (!capability) throw new Error(`No execution capability found for ${RESEARCH_SERVICE_ID}`);

  const selected = await resolveProvider({
    organization_id: organizationId,
    capability,
    preferredProvider: null,
    country: null,
    currency: null,
    policy: organizationService.provider_policy || {},
  });
  if (!selected?.pricing_id) throw new Error("CREATIVE_RESEARCH_PRICING_ID_REQUIRED");

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
  console.log("MEDIA_GENERATION_AUTHORIZED=NO");
  console.log("PUBLICATION_AUTHORIZED=NO");
  console.log("============================================================");

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    const headlessPhrase = text(process.env.CREATIVE_RESEARCH_APPROVAL_PHRASE);
    if (!headlessPhrase) throw new Error("CREATIVE_INTERACTIVE_RESEARCH_APPROVAL_REQUIRED");
    if (normalized(headlessPhrase) !== normalized(phrase)) {
      throw new Error("CREATIVE_HEADLESS_RESEARCH_APPROVAL_MISMATCH");
    }
    return true;
  }

  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await terminal.question(`Type ${phrase} to continue, or press Enter to stop: `);
    return normalized(answer) === normalized(phrase);
  } finally {
    terminal.close();
  }
}

function semanticDuration(semantic) {
  return Number(
    semantic.chapter_duration_seconds || semantic.primary_duration_seconds || 30,
  );
}

function exportProfile(semantic) {
  if (semantic.orientation === "PORTRAIT") return "master-vertical-h264";
  if (semantic.orientation === "SQUARE") return "master-square-h264";
  return "master-landscape-h264";
}

function masterStoryMinutes(semantic) {
  const minimum = semantic.master_story_duration_minutes?.minimum || null;
  const maximum = semantic.master_story_duration_minutes?.maximum || null;
  if (!minimum && !maximum) return null;
  if (minimum && maximum) return `${minimum}-${maximum}`;
  return String(minimum || maximum);
}

try {
  const organization = await resolveOrganization();
  const semantic = await CreativeHumanIntentUnderstandingRuntime.understand({
    organization_id: organization.id,
    organization_name: organization.name,
    intent,
  });
  if (!semantic) throw new Error("CREATIVE_SEMANTIC_UNDERSTANDING_REQUIRED");
  if (semantic.clarification_required) {
    throw new Error(
      `CREATIVE_SEMANTIC_CLARIFICATION_REQUIRED:${semantic.clarification_question || "clarification required"}`,
    );
  }

  const channels = semantic.channels || [];
  const productionType = semantic.production_type || "CAMPAIGN";
  const duration = semanticDuration(semantic);
  const profile = exportProfile(semantic);
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
      `CREATIVE_VERIFIED_SOURCE_ASSETS_NOT_FOUND:assets=${selection.scanned_asset_count || 0},nodes=${selection.scanned_asset_node_count || 0},verified_visuals=${selection.verified_visual_asset_count || 0},candidates=${selection.candidate_count || 0}`,
    );
  }

  const selectedIds = assets.map((asset) => asset.id);
  const metadata = {
    source: "natural_language_creative_command_cli",
    command_identity: identity,
    original_intent: intent,
    semantic_creative_understanding: semantic,
    production_type: productionType,
    target_duration: duration,
    target_languages: ["en"],
    default_export_profile_id: profile,
    autonomous_story_required: semantic.story_autonomy === "STUDIO_LED",
    master_story_required: semantic.master_story_required === true,
    full_master_film_target_minutes: masterStoryMinutes(semantic),
    generate_only_chapter_1:
      semantic.generation_scope === "CHAPTER_ONLY" && Number(semantic.chapter_number || 1) === 1,
    generation_scope: semantic.generation_scope,
    chapter_number: semantic.chapter_number || null,
    public_publish_authorized: false,
    publish_authorized: false,
    publication_requires_human_approval: true,
    production_dossier_approval_required: true,
    selected_asset_ids: selectedIds,
    asset_selection: cleanSelection(selection),
  };

  const missions = await CreativeMissionRuntime.list({ organization_id: organization.id });
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

  const executionMode = existingMission ? "RESUMED_EXISTING_MISSION" : "CREATED_NEW_MISSION";
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
      ...metadata,
      organization_name: organization.name,
      selected_assets_locked_at: new Date().toISOString(),
      selected_assets_source: selection.source,
    },
  });

  let researchApproval = reusableResearchApproval(updatedProject, identity);
  let researchApprovalMode = "REUSED_EXISTING_APPROVAL";
  if (!researchApproval) {
    const estimate = await researchEstimate(organization.id);
    const approved = await requestResearchApproval(estimate);
    if (!approved) process.exit(0);

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
      objective: semantic.user_goal || intent,
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

  console.log("============================================================");
  console.log("AVANTIQO CREATIVE COMMAND");
  console.log("============================================================");
  console.log(`COMMAND=${intent}`);
  console.log(`COMMAND_IDENTITY=${identity}`);
  console.log(`COMMAND_EXECUTION_MODE=${executionMode}`);
  console.log(`ORGANIZATION_ID=${organization.id}`);
  console.log(`ORGANIZATION_NAME=${organization.name}`);
  console.log(`SEMANTIC_CONTRACT=${semantic.contract}`);
  console.log(`SEMANTIC_CONFIDENCE=${semantic.confidence}`);
  console.log(`PRODUCTION_TYPE=${productionType}`);
  console.log(`TARGET_DURATION_SECONDS=${duration}`);
  console.log(`CHANNELS=${channels.join(",")}`);
  console.log(`EXPORT_PROFILE=${profile}`);
  console.log(`MASTER_STORY_REQUIRED=${semantic.master_story_required ? "YES" : "NO"}`);
  console.log(`MASTER_STORY_MINUTES=${masterStoryMinutes(semantic) || ""}`);
  console.log(`GENERATION_SCOPE=${semantic.generation_scope}`);
  console.log(`STORY_AUTONOMY=${semantic.story_autonomy}`);
  console.log(`CREATIVE_MISSION_ID=${started.id}`);
  console.log(`CREATIVE_PROJECT_ID=${projectId}`);
  console.log(`CREATIVE_BRIEF_ID=${briefId || ""}`);
  console.log(`ATTACHED_ASSET_NODE_COUNT=${attached.length}`);
  console.log(`RESEARCH_APPROVAL_MODE=${researchApprovalMode}`);
  console.log(`RESEARCH_PROVIDER=${researchApproval.provider}`);
  console.log(`RESEARCH_MODEL=${researchApproval.model || ""}`);
  console.log(`RESEARCH_MAXIMUM_CUSTOMER_PRICE=${amountText(researchApproval.maximum_customer_price)}`);
  console.log(`RESEARCH_CURRENCY=${researchApproval.currency}`);
  console.log(`PRODUCTION_DOSSIER_ID=${dossier?.id || ""}`);
  console.log(`PIPELINE_STATUS=${execution?.status || execution?.production?.status || "WAITING_FOR_PRODUCTION_APPROVAL"}`);
  console.log(`PIPELINE_BOUNDARY=${executionError || "PRODUCTION_DOSSIER_APPROVAL_REQUIRED"}`);
  console.log("SEMANTIC_UNDERSTANDING_AUTHORIZATION_EFFECT=NONE");
  console.log("PAID_RESEARCH_AUTHORIZED=YES");
  console.log("PAID_MEDIA_EXECUTION_AUTHORIZED=NO");
  console.log("PUBLICATION_AUTHORIZED=NO");
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

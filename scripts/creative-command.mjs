#!/usr/bin/env node

import process from "node:process";
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
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/creative/assets/runtime/CreativeAssetAutoSelectionRuntime"),
  import("@/lib/creative/missions/runtime/CreativeMissionRuntime"),
  import("@/lib/creative/projects/runtime/CreativeProjectRuntime"),
  import("@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository"),
  import("@/lib/creative/director/runtime/CreativeDirectorRuntime"),
]);

function text(value) {
  return String(value ?? "").trim();
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

try {
  const organization = await resolveOrganization();
  const channels = inferChannels(intent);
  const productionType = inferProductionType(intent);
  const duration = inferDuration(intent);
  const vertical = verticalRequested(intent, channels);

  const selection = await CreativeAssetAutoSelectionRuntime.resolve({
    organization_id: organization.id,
    organization,
    intent,
    maximum_assets: 6,
  });
  const assets = selection.assets || [];
  if (!assets.length) {
    throw new Error("CREATIVE_VERIFIED_SOURCE_ASSETS_NOT_FOUND");
  }

  const selectedIds = assets.map((asset) => asset.id);
  const mission = await CreativeMissionRuntime.create({
    organization_id: organization.id,
    title: intent.slice(0, 120),
    business_goal: intent,
    objective: intent,
    audience: {},
    channels,
    metadata: {
      source: "natural_language_creative_command_cli",
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
    },
  });

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

  const updatedProject = await CreativeProjectRuntime.update(projectId, {
    metadata: {
      ...(project.metadata || {}),
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
  console.log(`ORGANIZATION_ID=${organization.id}`);
  console.log(`ORGANIZATION_NAME=${organization.name}`);
  console.log(`PRODUCTION_TYPE=${productionType}`);
  console.log(`TARGET_DURATION_SECONDS=${duration}`);
  console.log(`CHANNELS=${channels.join(",")}`);
  console.log(`EXPORT_PROFILE=${vertical ? "master-vertical-h264" : "master-landscape-h264"}`);
  console.log(`ASSET_SELECTION_SOURCE=${selection.source}`);
  console.log(`SELECTED_ASSET_COUNT=${selectedIds.length}`);
  for (const selected of selection.selected_assets || []) {
    console.log(
      `SELECTED_ASSET=${selected.selected_role || "SOURCE"}|${selected.name || selected.file_name || selected.asset_id}|${selected.asset_id}`,
    );
  }
  console.log(`CREATIVE_MISSION_ID=${started.id}`);
  console.log(`CREATIVE_PROJECT_ID=${projectId}`);
  console.log(`CREATIVE_BRIEF_ID=${briefId || ""}`);
  console.log(`PRODUCTION_DOSSIER_ID=${dossier?.id || ""}`);
  console.log(`ESTIMATED_PRODUCTION_COST=${estimatedCost ?? "PENDING"}`);
  console.log(`CURRENCY=${currency || "PENDING"}`);
  console.log(`PIPELINE_STATUS=${execution?.status || execution?.production?.status || "WAITING_FOR_PRODUCTION_APPROVAL"}`);
  console.log(`PIPELINE_BOUNDARY=${executionError || "PRODUCTION_DOSSIER_APPROVAL_REQUIRED"}`);
  console.log("PAID_EXECUTION_AUTHORIZED=NO");
  console.log("PUBLICATION_AUTHORIZED=NO");
  console.log("NEXT_ACTION=REVIEW_AND_APPROVE_PRODUCTION_DOSSIER");
  console.log("============================================================");
} catch (error) {
  console.error("============================================================");
  console.error("AVANTIQO CREATIVE COMMAND FAILED");
  console.error("============================================================");
  console.error(`ERROR=${text(error?.message || error)}`);
  console.error("PAID_EXECUTION_AUTHORIZED=NO");
  console.error("PUBLICATION_AUTHORIZED=NO");
  console.error("============================================================");
  process.exit(1);
}

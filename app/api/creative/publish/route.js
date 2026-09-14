export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { CREATIVE_ASSET_NODE_TYPES } from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import {
  currentCreativePrimaryMaster,
  newestCreativeNode,
} from "@/lib/creative/release/runtime/CreativeMasterVersionRuntime";
import { CreativePublishCommandRuntime } from "@/lib/creative/release/runtime/CreativePublishCommandRuntime";
import { buildCreativeChannelExecutionBrief } from "@/lib/creative/publishing/runtime/CreativeChannelExecutionBriefRuntime";

const text = (value) => String(value ?? "").trim();
const normalized = (value) => text(value).toLowerCase().replaceAll("_", "-");
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

function targetId(target = {}) {
  return text(target.id || target.key || target.channel || target.provider);
}

function targetChannel(target = {}) {
  return normalized(target.channel || target.id || target.key || target.provider);
}

function capabilityFor(target = {}) {
  const explicit = text(target.capability);
  if (explicit) return explicit;
  const channel = targetChannel(target);
  if (channel === "facebook") return "marketing.facebook.publish";
  if (channel === "instagram") return "marketing.instagram.publish";
  if (channel === "google-business") return "marketing.google.business.publish";
  return null;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id || body.organizationId);
    const projectId = text(body.creative_project_id || body.creativeProjectId);
    if (!organizationId || !projectId) {
      return Response.json({ success: false, error: "organization_id and creative_project_id required" }, { status: 400 });
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredPermission: "creative.release.publish",
    });
    if (!access.success) return Response.json(access, { status: access.status });

    const [project, nodes] = await Promise.all([
      CreativeProjectRepository.getById(projectId),
      AssetGraphRepository.listByProject({ organization_id: organizationId, creative_project_id: projectId }),
    ]);
    if (!project || text(project.organization_id) !== organizationId) {
      return Response.json({ success: false, error: "Creative project not found" }, { status: 404 });
    }

    const master = currentCreativePrimaryMaster(nodes);
    if (!master?.id) {
      return Response.json({ success: false, error: "CURRENT_RELEASE_MASTER_REQUIRED" }, { status: 409 });
    }
    const readiness = newestCreativeNode(nodes, (node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.RELEASE_READINESS_REPORT &&
      node.metadata?.passed === true &&
      node.metadata?.final_render_asset_node_id === master.id,
    );
    if (!readiness) {
      return Response.json({ success: false, error: "CURRENT_PASSED_RELEASE_READINESS_REQUIRED" }, { status: 409 });
    }

    const targets = Array.isArray(project.metadata?.publish_targets)
      ? project.metadata.publish_targets.filter((target) => target?.enabled !== false && target?.status !== "DISABLED")
      : [];
    const requestedTargetId = text(body.publish_target_id || body.publishTargetId);
    const requestedChannel = normalized(body.channel || (Array.isArray(body.channels) ? body.channels[0] : ""));
    const matches = targets.filter((target) =>
      requestedTargetId ? targetId(target) === requestedTargetId : (!requestedChannel || targetChannel(target) === requestedChannel),
    );
    if (matches.length !== 1) {
      return Response.json({
        success: false,
        error: matches.length ? "PUBLISH_TARGET_AMBIGUOUS" : "CONFIGURED_PUBLISH_TARGET_REQUIRED",
        available_targets: targets.map((target) => ({ id: targetId(target), channel: targetChannel(target) })),
      }, { status: 409 });
    }

    const target = matches[0];
    const capability = capabilityFor(target);
    if (!capability) {
      return Response.json({ success: false, error: "PUBLISH_TARGET_CAPABILITY_REQUIRED" }, { status: 409 });
    }
    const suppliedBrief = object(body.execution_brief);
    const content = {
      ...object(suppliedBrief.content),
      ...object(body.content),
    };
    if (body.caption !== undefined) content.caption = body.caption;
    if (body.message !== undefined) content.message = body.message;

    const executionBrief = buildCreativeChannelExecutionBrief({
      ...suppliedBrief,
      intent: text(body.intent || suppliedBrief.intent) || "publish",
      channel: targetChannel(target),
      capability,
      provider_id: text(target.provider_id || target.provider || target.connector || suppliedBrief.provider_id),
      organization_id: organizationId,
      entity_id: text(body.entity_id || suppliedBrief.entity_id) || null,
      creative_project_id: projectId,
      campaign: { ...object(suppliedBrief.campaign), ...object(body.campaign) },
      audience: { ...object(suppliedBrief.audience), ...object(body.audience) },
      budget: { ...object(suppliedBrief.budget), ...object(body.budget) },
      schedule: { ...object(suppliedBrief.schedule), ...object(body.schedule) },
      placement: { ...object(suppliedBrief.placement), ...object(body.placement) },
      call_to_action: { ...object(suppliedBrief.call_to_action), ...object(body.call_to_action) },
      tracking: { ...object(suppliedBrief.tracking), ...object(body.tracking) },
      content,
      channel_settings: { ...object(suppliedBrief.channel_settings), ...object(body.channel_settings) },
      business_asset: { ...object(suppliedBrief.business_asset), ...object(body.business_asset), publish_target_id: targetId(target) },
      evidence: { ...object(suppliedBrief.evidence), ...object(body.evidence) },
      conversation_context: { ...object(suppliedBrief.conversation_context), ...object(body.conversation_context) },
      requested_by: { user_id: access.userId, staff_account_id: access.staff?.id },
    });

    const result = await CreativePublishCommandRuntime.create({
      organization_id: organizationId,
      release_readiness_report_id: readiness.id,
      publish_target_id: targetId(target),
      requested_by: {
        user_id: access.userId,
        staff_account_id: access.staff?.id,
      },
      execution_brief: executionBrief,
    });

    return Response.json({
      success: true,
      publication_executed: false,
      release_readiness_report_id: readiness.id,
      publish_target_id: targetId(target),
      execution_brief_contract: executionBrief.contract,
      ...result,
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "Creative publish command failed" },
      { status: 500 },
    );
  }
}

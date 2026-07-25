import crypto from "node:crypto";

import {
  CreativeEdlRenderRuntime,
} from "@/lib/creative/post-production/runtime/CreativeEdlRenderRuntime";
import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function identity(plan, attempt) {
  return crypto.createHash("sha256").update(JSON.stringify({
    plan_id: plan.id,
    repair_identity: plan.metadata?.repair_identity || null,
    attempt,
  })).digest("hex");
}

export const CreativeRenderRepairExecutionRuntime = {
  async execute({
    organization_id,
    repair_plan_asset_node_id,
    policy = {},
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!repair_plan_asset_node_id) throw new Error("repair_plan_asset_node_id required");

    const plan = await AssetGraphRepository.getById(repair_plan_asset_node_id);
    if (
      !plan ||
      plan.organization_id !== organization_id ||
      plan.type !== CREATIVE_ASSET_NODE_TYPES.REPAIR_PLAN
    ) {
      throw new Error("Repair plan asset not found");
    }

    const automaticAllowed =
      policy.allow_automatic_repair === true ||
      policy.allowAutomaticRepair === true;
    const approved = plan.review?.approved === true;
    if (!approved && !automaticAllowed) {
      throw new Error("REPAIR_PLAN_APPROVAL_REQUIRED");
    }
    if (plan.metadata?.fully_automatic !== true) {
      throw new Error("REPAIR_PLAN_NOT_FULLY_AUTOMATIC");
    }

    const projectNodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id: plan.creative_project_id,
    });
    const priorAttempts = projectNodes.filter((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.REPAIR_PLAN &&
      node.metadata?.repair_execution_of === plan.id,
    );
    const maxAttempts = finite(
      policy.max_repair_attempts ??
      policy.maxRepairAttempts,
    );
    if (maxAttempts === null || maxAttempts < 1) {
      throw new Error("MAX_REPAIR_ATTEMPTS_REQUIRED");
    }
    if (priorAttempts.length >= maxAttempts) {
      throw new Error("MAX_REPAIR_ATTEMPTS_EXCEEDED");
    }

    const attempt = priorAttempts.length + 1;
    const executionIdentity = identity(plan, attempt);
    const existing = projectNodes.find((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.REPAIR_PLAN &&
      node.metadata?.repair_execution_identity === executionIdentity,
    );
    if (existing) return { execution: existing, reused: true };

    const result = await CreativeEdlRenderRuntime.render({
      organization_id,
      timeline_asset_node_id: plan.metadata?.timeline_asset_node_id,
      export_profile: plan.metadata?.export_profile || {},
      tracks: plan.metadata?.tracks || {},
      policy,
      force: true,
    });

    const execution = createCreativeAssetNode({
      organization_id,
      creative_project_id: plan.creative_project_id,
      parent_asset_node_id: plan.id,
      type: CREATIVE_ASSET_NODE_TYPES.REPAIR_PLAN,
      status: result.technical_qc?.passed
        ? CREATIVE_ASSET_NODE_STATUS.REVIEW
        : CREATIVE_ASSET_NODE_STATUS.REJECTED,
      name: `${plan.name || "Repair plan"} attempt ${attempt}`,
      description: "Bounded deterministic render repair execution.",
      lineage: {
        source: "render_repair_execution",
        capability: "creative.render.repair.execute",
        generation_version: attempt,
      },
      intelligence: {
        safety_status: "UNKNOWN",
        tags: ["render-repair-execution"],
      },
      reuse: { reusable: false, approved_for_reuse: false },
      review: {
        ai_reviewed: true,
        human_reviewed: false,
        approved: false,
      },
      metadata: {
        repair_execution_identity: executionIdentity,
        repair_execution_of: plan.id,
        attempt,
        max_attempts: maxAttempts,
        source_failed_render_asset_node_id:
          plan.metadata?.failed_render_asset_node_id || null,
        result_render_asset_node_id: result.render?.id || null,
        technical_qc: result.technical_qc || null,
        completed_at: new Date().toISOString(),
      },
    });

    return {
      execution: await AssetGraphRepository.create(execution),
      render: result.render,
      reused: false,
    };
  },
};

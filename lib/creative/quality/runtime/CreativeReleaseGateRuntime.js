import crypto from "node:crypto";

import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import * as CreativeProjectRepository
from "@/lib/creative/projects/repositories/CreativeProjectRepository";

function list(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

function includesAll(actual, required) {
  const values = new Set(list(actual).map(normalized));
  return list(required).map(normalized).every((item) => values.has(item));
}

function dateValid(value, at) {
  if (!value) return true;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp >= at.getTime();
}

function identity(timeline, policy, assets) {
  return crypto.createHash("sha256").update(JSON.stringify({
    timeline_id: timeline.id,
    timeline_identity: timeline.metadata?.timeline_identity || null,
    policy,
    assets: assets.map((asset) => ({
      id: asset.id,
      checksum: asset.technical?.checksum || null,
      rights: asset.metadata?.rights || asset.metadata?.licence || null,
      consent: asset.metadata?.consent || null,
      identity: asset.metadata?.identity_evidence || null,
    })),
  })).digest("hex");
}

function assetCheck(asset, policy, now) {
  const rights = asset.metadata?.rights || asset.metadata?.licence || {};
  const consent = asset.metadata?.consent || {};
  const identityEvidence = asset.metadata?.identity_evidence || {};
  const failures = [];

  if (policy.require_rights_evidence === true) {
    if (rights.status !== "CLEARED") failures.push("RIGHTS_NOT_CLEARED");
    if (!rights.evidence_id && !rights.document_id) failures.push("RIGHTS_EVIDENCE_MISSING");
  }

  if (policy.allowed_usage?.length && !includesAll(rights.usage, policy.allowed_usage)) {
    failures.push("USAGE_NOT_COVERED");
  }
  if (policy.channels?.length && !includesAll(rights.channels, policy.channels)) {
    failures.push("CHANNEL_NOT_COVERED");
  }
  if (policy.territories?.length && !includesAll(rights.territories, policy.territories)) {
    failures.push("TERRITORY_NOT_COVERED");
  }
  if (!dateValid(rights.valid_until, now)) failures.push("RIGHTS_EXPIRED");

  if (policy.require_consent === true) {
    if (consent.status !== "GRANTED") failures.push("CONSENT_NOT_GRANTED");
    if (!consent.evidence_id && !consent.document_id) failures.push("CONSENT_EVIDENCE_MISSING");
    if (!dateValid(consent.valid_until, now)) failures.push("CONSENT_EXPIRED");
  }

  const requiredIdentities = list(policy.required_identity_ids).map(normalized);
  if (requiredIdentities.length) {
    const verified = list(identityEvidence.verified_identity_ids).map(normalized);
    if (!requiredIdentities.every((id) => verified.includes(id))) {
      failures.push("REQUIRED_IDENTITY_NOT_VERIFIED");
    }
    if (identityEvidence.status !== "VERIFIED") {
      failures.push("IDENTITY_EVIDENCE_NOT_VERIFIED");
    }
  }

  return {
    asset_node_id: asset.id,
    asset_type: asset.type,
    passed: failures.length === 0,
    failures,
    evidence: {
      rights_evidence_id: rights.evidence_id || rights.document_id || null,
      consent_evidence_id: consent.evidence_id || consent.document_id || null,
      identity_evidence_id: identityEvidence.evidence_id || null,
      verified_identity_ids: list(identityEvidence.verified_identity_ids),
    },
  };
}

export const CreativeReleaseGateRuntime = {
  async evaluate({
    organization_id,
    timeline_asset_node_id,
    policy: suppliedPolicy = {},
    force = false,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!timeline_asset_node_id) throw new Error("timeline_asset_node_id required");

    const timeline = await AssetGraphRepository.getById(timeline_asset_node_id);
    if (
      !timeline ||
      timeline.organization_id !== organization_id ||
      timeline.type !== CREATIVE_ASSET_NODE_TYPES.TIMELINE
    ) {
      throw new Error("Timeline asset node not found");
    }

    const project = await CreativeProjectRepository.getById(timeline.creative_project_id);
    if (!project || project.organization_id !== organization_id) {
      throw new Error("Creative project not found");
    }

    const configured =
      project.metadata?.release_gate ||
      project.metadata?.rights_policy ||
      {};
    const allowManualPolicy = configured.allow_manual_policy === true;
    if (Object.keys(suppliedPolicy || {}).length && !allowManualPolicy) {
      throw new Error("MANUAL_RELEASE_POLICY_NOT_ALLOWED");
    }
    const policy = Object.keys(suppliedPolicy || {}).length
      ? suppliedPolicy
      : configured;

    const nodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id: timeline.creative_project_id,
    });
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const edits = timeline.metadata?.edit_decision_list || [];
    const sourceIds = new Set();
    edits.forEach((edit) => {
      if (edit.source_asset_node_id) sourceIds.add(edit.source_asset_node_id);
      if (edit.source_clip_node_id) sourceIds.add(edit.source_clip_node_id);
    });
    list(timeline.metadata?.tracks?.asset_node_ids).forEach((id) => sourceIds.add(id));

    const assets = [...sourceIds]
      .map((id) => byId.get(id))
      .filter(Boolean);
    if (!assets.length) throw new Error("RELEASE_GATE_ASSETS_REQUIRED");

    const gateIdentity = identity(timeline, policy, assets);
    const existing = !force
      ? nodes.find((node) =>
          node.type === CREATIVE_ASSET_NODE_TYPES.RELEASE_GATE_REPORT &&
          node.metadata?.release_gate_identity === gateIdentity,
        )
      : null;
    if (existing) return { report: existing, reused: true };

    const now = new Date();
    const checks = assets.map((asset) => assetCheck(asset, policy, now));
    const missingReferences = [...sourceIds].filter((id) => !byId.has(id));
    const failures = checks.flatMap((check) =>
      check.failures.map((failure) => ({
        asset_node_id: check.asset_node_id,
        failure,
      })),
    );
    missingReferences.forEach((id) => failures.push({
      asset_node_id: id,
      failure: "ASSET_REFERENCE_NOT_FOUND",
    }));
    const passed = failures.length === 0;

    const node = createCreativeAssetNode({
      organization_id,
      creative_project_id: timeline.creative_project_id,
      parent_asset_node_id: timeline.id,
      type: CREATIVE_ASSET_NODE_TYPES.RELEASE_GATE_REPORT,
      status: passed
        ? CREATIVE_ASSET_NODE_STATUS.REVIEW
        : CREATIVE_ASSET_NODE_STATUS.REJECTED,
      name: `${timeline.name || "Timeline"} release gate`,
      description: "Rights, consent, licence and identity evidence gate.",
      lineage: {
        source: "release_gate_evaluation",
        capability: "creative.release_gate.evaluate",
        generation_version: 1,
      },
      intelligence: {
        safety_status: passed ? "UNKNOWN" : "BLOCKED",
        tags: ["release-gate"],
      },
      reuse: { reusable: false, approved_for_reuse: false },
      review: {
        ai_reviewed: true,
        human_reviewed: false,
        approved: false,
        notes: passed
          ? "Evidence checks passed; human release approval still required."
          : "Release blocked by missing, expired or contradictory evidence.",
      },
      metadata: {
        release_gate_identity: gateIdentity,
        timeline_asset_node_id: timeline.id,
        policy,
        passed,
        checks,
        failures,
        missing_asset_references: missingReferences,
        evaluated_at: now.toISOString(),
      },
    });

    return {
      report: await AssetGraphRepository.create(node),
      reused: false,
    };
  },
};

import crypto from "node:crypto";

import {
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import * as CreativeProjectRepository
from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import {
  CreativeOutcomeObservationRepository,
} from "../repositories/CreativeOutcomeObservationRepository";
import {
  normalizeCreativeOutcomeMetrics,
  summarizeCreativeOutcomeMetrics,
} from "./CreativeOutcomeMetrics";

export const CREATIVE_OUTCOME_LEARNING_CONTRACT =
  "CREATIVE_OUTCOME_LEARNING_V1";
export const CREATIVE_OUTCOME_OBSERVATION_CONTRACT =
  "CREATIVE_OUTCOME_OBSERVATION_V1";

const SAFE_CONTEXT_FIELDS = Object.freeze([
  "campaign_type",
  "objective_family",
  "workflow_kind",
  "deliverable_type",
  "format",
  "duration_bucket",
  "concept_id",
  "variant_id",
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value, maximum = 240) {
  const result = String(value ?? "").trim();
  return result ? result.slice(0, maximum) : null;
}

function safeContext(value = {}) {
  const source = object(value);
  return Object.fromEntries(
    SAFE_CONTEXT_FIELDS
      .map((key) => [key, text(source[key], 180)])
      .filter(([, entry]) => entry),
  );
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function observationIdentity(value = {}) {
  return crypto
    .createHash("sha256")
    .update(stable(value))
    .digest("hex");
}

async function requiredNode(id, organizationId, type, errorCode) {
  const node = id ? await AssetGraphRepository.getById(id) : null;
  if (
    !node ||
    node.organization_id !== organizationId ||
    node.type !== type
  ) {
    throw new Error(errorCode);
  }
  return node;
}

async function verifiedPublicationChain({
  organization_id,
  publish_execution_asset_node_id,
}) {
  const execution = await requiredNode(
    publish_execution_asset_node_id,
    organization_id,
    CREATIVE_ASSET_NODE_TYPES.PUBLISH_EXECUTION,
    "CREATIVE_OUTCOME_COMPLETED_PUBLISH_EXECUTION_REQUIRED",
  );

  if (
    execution.status !== CREATIVE_ASSET_NODE_STATUS.APPROVED ||
    execution.metadata?.execution_status !== "COMPLETED" ||
    !(
      execution.metadata?.external_publication_id ||
      execution.metadata?.external_publication_url
    )
  ) {
    throw new Error("CREATIVE_OUTCOME_EXTERNAL_PUBLICATION_EVIDENCE_REQUIRED");
  }

  const commandId =
    execution.metadata?.publish_command_asset_node_id ||
    execution.parent_asset_node_id;
  const command = await requiredNode(
    commandId,
    organization_id,
    CREATIVE_ASSET_NODE_TYPES.PUBLISH_COMMAND,
    "CREATIVE_OUTCOME_PUBLISH_COMMAND_REQUIRED",
  );

  if (
    command.metadata?.execution_status !== "COMPLETED" ||
    !command.metadata?.publish_approval_record_id
  ) {
    throw new Error("CREATIVE_OUTCOME_APPROVED_PUBLISH_CHAIN_REQUIRED");
  }

  const readiness = await requiredNode(
    command.metadata?.release_readiness_report_id,
    organization_id,
    CREATIVE_ASSET_NODE_TYPES.RELEASE_READINESS_REPORT,
    "CREATIVE_OUTCOME_RELEASE_READINESS_REQUIRED",
  );
  if (readiness.metadata?.passed !== true) {
    throw new Error("CREATIVE_OUTCOME_PASSED_RELEASE_READINESS_REQUIRED");
  }

  const finalRender = await requiredNode(
    command.metadata?.final_render_asset_node_id,
    organization_id,
    CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER,
    "CREATIVE_OUTCOME_FINAL_RENDER_REQUIRED",
  );

  const project = await CreativeProjectRepository.getById(
    execution.creative_project_id || command.creative_project_id,
  );
  if (!project || project.organization_id !== organization_id) {
    throw new Error("CREATIVE_OUTCOME_PROJECT_REQUIRED");
  }

  return { execution, command, readiness, finalRender, project };
}

function qualityEvidence(chain = {}) {
  const readiness = chain.readiness || {};
  const finalRender = chain.finalRender || {};
  return {
    release_readiness_passed: readiness.metadata?.passed === true,
    release_readiness_contract:
      readiness.metadata?.contract || readiness.lineage?.capability || null,
    publish_human_approval_record_id:
      chain.command?.metadata?.publish_approval_record_id || null,
    final_render_quality_score:
      finalRender.intelligence?.quality_score ??
      finalRender.metadata?.quality_score ??
      null,
    world_class_quality_floor_immutable: true,
  };
}

function byChannel(observations = []) {
  const groups = new Map();
  for (const observation of observations) {
    const channel = text(observation.channel, 80) || "unknown";
    if (!groups.has(channel)) groups.set(channel, []);
    groups.get(channel).push(observation);
  }
  return Object.fromEntries(
    [...groups.entries()].map(([channel, items]) => [channel, {
      sample_count: items.length,
      latest_observed_at: items[0]?.observed_at || null,
      metrics: summarizeCreativeOutcomeMetrics(items),
    }]),
  );
}

function learningSummary(observations = []) {
  const eligible = observations.filter(
    (item) => item.eligible_for_direction === true,
  );
  return {
    contract: CREATIVE_OUTCOME_LEARNING_CONTRACT,
    evidence_status:
      eligible.length > 0 ? "EVIDENCE_AVAILABLE" : "AWAITING_PUBLISHED_OUTCOMES",
    observation_count: observations.length,
    direction_eligible_count: eligible.length,
    latest_observed_at: eligible[0]?.observed_at || null,
    metrics: summarizeCreativeOutcomeMetrics(eligible),
    channels: byChannel(eligible),
    future_direction: {
      evidence_role: "INFORM_CREATIVE_JUDGMENT_NOT_REPLACE_IT",
      quality_floor_immutable: true,
      quality_policy_override_allowed: false,
      rights_gate_override_allowed: false,
      publish_approval_override_allowed: false,
      provider_routing_override_allowed: false,
      imitation_of_prior_work_allowed: false,
      insufficient_evidence_requires_fresh_judgment: eligible.length < 3,
    },
    provider_execution: false,
  };
}

export const CreativeOutcomeLearningRuntime = Object.freeze({
  async recordObservation({
    organization_id,
    publish_execution_asset_node_id,
    metrics = {},
    observed_at = null,
    measurement_window = "LATEST_SNAPSHOT",
    source_event_id = null,
    creative_context = {},
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!publish_execution_asset_node_id) {
      throw new Error("publish_execution_asset_node_id required");
    }

    const normalized = normalizeCreativeOutcomeMetrics(metrics);
    if (!Object.keys(normalized).length) {
      throw new Error("CREATIVE_OUTCOME_NUMERIC_METRICS_REQUIRED");
    }

    const chain = await verifiedPublicationChain({
      organization_id,
      publish_execution_asset_node_id,
    });
    const timestamp = new Date(observed_at || Date.now()).toISOString();
    const channel = text(
      chain.command.metadata?.publish_target?.channel ||
      chain.command.metadata?.publish_target_id ||
      chain.execution.metadata?.provider_id,
      80,
    );
    if (!channel) throw new Error("CREATIVE_OUTCOME_CHANNEL_REQUIRED");

    const identityInput = {
      organization_id,
      publish_execution_asset_node_id,
      external_publication_id:
        chain.execution.metadata?.external_publication_id || null,
      external_publication_url:
        chain.execution.metadata?.external_publication_url || null,
      source_event_id: text(source_event_id),
      measurement_window: text(measurement_window, 80),
      observed_at: timestamp,
      normalized_metrics: normalized,
    };

    const observation = {
      organization_id,
      entity_id: chain.project.entity_id || null,
      brand_id: chain.project.brand_id || null,
      creative_mission_id: chain.project.creative_mission_id || null,
      creative_project_id: chain.project.id,
      campaign_id: chain.project.campaign_id || chain.execution.campaign_id || null,
      publish_execution_asset_node_id: chain.execution.id,
      publish_command_asset_node_id: chain.command.id,
      release_readiness_asset_node_id: chain.readiness.id,
      final_render_asset_node_id: chain.finalRender.id,
      channel,
      source_provider: chain.execution.metadata?.provider_id || null,
      external_publication_id:
        chain.execution.metadata?.external_publication_id || null,
      external_publication_url:
        chain.execution.metadata?.external_publication_url || null,
      source_event_id: text(source_event_id),
      measurement_window: text(measurement_window, 80) || "LATEST_SNAPSHOT",
      metrics: normalized,
      normalized_metrics: normalized,
      creative_context: safeContext(creative_context),
      quality_evidence: qualityEvidence(chain),
      provenance: {
        contract: CREATIVE_OUTCOME_OBSERVATION_CONTRACT,
        verified_publication: true,
        canonical_release_graph_verified: true,
        evidence_only: true,
        provider_prompts_persisted: false,
        external_text_excluded_from_learning: true,
        world_class_quality_floor_immutable: true,
      },
      eligible_for_direction: true,
      evidence_tier: "VERIFIED_PUBLICATION",
      idempotency_key: observationIdentity(identityInput),
      observed_at: timestamp,
    };

    return CreativeOutcomeObservationRepository.createOrGet(observation);
  },

  async resolve({
    organization_id,
    creative_project_id = null,
    brand_id = null,
    campaign_id = null,
    limit = 100,
  } = {}) {
    const observations = await CreativeOutcomeObservationRepository.list({
      organization_id,
      creative_project_id,
      brand_id,
      campaign_id,
      limit,
    });
    const summary = learningSummary(observations);
    return {
      current: summary,
      summary,
      items: observations,
      commands: ["recordObservation", "resolve"],
      status: summary.evidence_status,
      read_only_learning: true,
      provider_execution: false,
    };
  },
});

import crypto from "node:crypto";

import "@/lib/platform/service-runtime/providers/meta/ManagedMetaCredentialRegistration";
import "@/lib/platform/service-runtime/providers/google/GoogleCredentialRegistration.js";
import "@/lib/platform/service-runtime/providers/linkedin/LinkedInCredentialRegistration.js";

import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  resolveProviderCredential,
} from "@/lib/platform/service-runtime/providers/ProviderCredentialRuntime";

const CONTRACT = "CREATIVE_PUBLICATION_LIFECYCLE_V1";
const RETRYABLE_HTTP = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function text(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return text(value).toLowerCase().replaceAll("_", "-");
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function newest(nodes, predicate) {
  return [...nodes]
    .filter(predicate)
    .sort((left, right) =>
      Date.parse(right.updated_at || right.created_at || 0) -
      Date.parse(left.updated_at || left.created_at || 0),
    )[0] || null;
}

function safeUrl(value) {
  const candidate = text(value);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function targetChannel(command = {}) {
  return normalized(
    command.metadata?.certified_derivative_channel ||
    command.metadata?.publish_target?.channel ||
    command.metadata?.publish_target_id,
  );
}

function lifecycleProvider(command = {}, execution = {}) {
  const channel = targetChannel(command);
  if (["facebook", "instagram"].includes(channel)) return "meta";
  if (["google-business", "googlebusiness"].includes(channel)) return "google";
  if (channel === "linkedin") return "linkedin";

  const provider = normalized(
    execution.metadata?.provider_id ||
    command.metadata?.publish_target?.provider_id ||
    command.metadata?.publish_target?.provider ||
    command.metadata?.publish_target?.connector,
  );
  if (["meta", "facebook", "instagram"].includes(provider)) return "meta";
  if (["google", "google-business", "googlebusiness"].includes(provider)) return "google";
  if (provider === "linkedin") return "linkedin";
  return null;
}

function currentTruth(currentLive) {
  if (currentLive === true) return "LIVE_NOW";
  if (currentLive === false) return "NO_LONGER_LIVE";
  return "UNVERIFIABLE";
}

function lifecycleObservation({
  provider,
  channel,
  externalId,
  currentLive = null,
  remoteState = "UNVERIFIABLE",
  remoteUrl = null,
  remoteCreatedAt = null,
  remoteUpdatedAt = null,
  remoteSnapshot = {},
  httpStatus = null,
  retryable = false,
  definitiveMissing = false,
  reason = null,
} = {}) {
  return {
    provider,
    channel,
    external_publication_id: externalId,
    current_live: currentLive,
    current_truth: currentTruth(currentLive),
    remote_state: remoteState,
    remote_url: safeUrl(remoteUrl),
    remote_created_at: remoteCreatedAt,
    remote_updated_at: remoteUpdatedAt,
    remote_snapshot: remoteSnapshot,
    http_status: httpStatus,
    retryable,
    definitive_missing: definitiveMissing,
    reason,
  };
}

async function jsonRequest(url, { accessToken, headers = {} } = {}) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...headers,
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

function accessOrTransientObservation({ provider, channel, externalId, result }) {
  const status = Number(result?.status || 0) || null;
  const message = text(
    result?.payload?.error?.message ||
    result?.payload?.message ||
    (status ? `Remote read-back failed (${status})` : "Remote read-back failed"),
  );
  const accessDenied = status === 401 || status === 403;
  const notFound = status === 404;
  const retryable = RETRYABLE_HTTP.has(status);
  return lifecycleObservation({
    provider,
    channel,
    externalId,
    currentLive: null,
    remoteState: accessDenied
      ? "ACCESS_DENIED"
      : notFound
        ? "NOT_FOUND_OR_INACCESSIBLE"
        : retryable
          ? "TEMPORARILY_UNVERIFIABLE"
          : "REMOTE_READBACK_FAILED",
    remoteSnapshot: {
      status,
      error_code: result?.payload?.error?.code || null,
      error_subcode: result?.payload?.error?.error_subcode || null,
    },
    httpStatus: status,
    retryable: retryable || notFound,
    reason: message || null,
  });
}

function metaGraphVersion() {
  const configured = text(
    process.env.META_GRAPH_API_VERSION ||
    process.env.META_GRAPH_VERSION ||
    "v24.0",
  );
  return configured.startsWith("v") ? configured : `v${configured}`;
}

async function observeMeta({ channel, externalId, credential }) {
  const accessToken = credential?.access_token;
  if (!accessToken) throw new Error("META_PUBLICATION_LIFECYCLE_CREDENTIAL_REQUIRED");
  const fields = channel === "instagram"
    ? "id,permalink,timestamp,media_type,media_product_type,username,caption"
    : "id,permalink_url,created_time,is_published,message";
  const url = new URL(
    `https://graph.facebook.com/${metaGraphVersion()}/${encodeURIComponent(externalId)}`,
  );
  url.searchParams.set("fields", fields);
  const result = await jsonRequest(url, { accessToken });
  if (!result.ok) {
    return accessOrTransientObservation({ provider: "meta", channel, externalId, result });
  }

  const payload = result.payload || {};
  const returnedId = text(payload.id);
  if (returnedId !== externalId) {
    throw new Error("REMOTE_PUBLICATION_IDENTITY_MISMATCH");
  }

  if (channel === "instagram") {
    const live = Boolean(payload.timestamp && payload.permalink);
    return lifecycleObservation({
      provider: "meta",
      channel,
      externalId: returnedId,
      currentLive: live ? true : null,
      remoteState: live ? "PUBLISHED" : "REMOTE_OBSERVED",
      remoteUrl: payload.permalink,
      remoteCreatedAt: payload.timestamp || null,
      remoteSnapshot: {
        id: returnedId,
        permalink: payload.permalink || null,
        timestamp: payload.timestamp || null,
        media_type: payload.media_type || null,
        media_product_type: payload.media_product_type || null,
        username: payload.username || null,
        caption_digest: payload.caption ? digest(text(payload.caption)) : null,
      },
      httpStatus: result.status,
    });
  }

  const live = payload.is_published === true
    ? true
    : payload.is_published === false
      ? false
      : null;
  return lifecycleObservation({
    provider: "meta",
    channel,
    externalId: returnedId,
    currentLive: live,
    remoteState: live === true
      ? "PUBLISHED"
      : live === false
        ? "NOT_PUBLISHED"
        : "REMOTE_OBSERVED",
    remoteUrl: payload.permalink_url,
    remoteCreatedAt: payload.created_time || null,
    remoteSnapshot: {
      id: returnedId,
      permalink_url: payload.permalink_url || null,
      created_time: payload.created_time || null,
      is_published: payload.is_published ?? null,
      message_digest: payload.message ? digest(text(payload.message)) : null,
    },
    httpStatus: result.status,
  });
}

function linkedInVersion() {
  return text(process.env.LINKEDIN_API_VERSION) || "202607";
}

async function observeLinkedIn({ externalId, credential, command }) {
  const accessToken = credential?.access_token;
  if (!accessToken) throw new Error("LINKEDIN_PUBLICATION_LIFECYCLE_CREDENTIAL_REQUIRED");
  const url = `https://api.linkedin.com/rest/posts/${encodeURIComponent(externalId)}?viewContext=AUTHOR`;
  const result = await jsonRequest(url, {
    accessToken,
    headers: {
      "Linkedin-Version": linkedInVersion(),
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });
  if (!result.ok) {
    return accessOrTransientObservation({
      provider: "linkedin",
      channel: "linkedin",
      externalId,
      result,
    });
  }

  const payload = result.payload || {};
  const returnedId = text(payload.id);
  if (returnedId !== externalId) {
    throw new Error("REMOTE_PUBLICATION_IDENTITY_MISMATCH");
  }
  const expectedAuthor = text(command.metadata?.publish_target?.author_urn);
  if (expectedAuthor && text(payload.author) !== expectedAuthor) {
    throw new Error("REMOTE_PUBLICATION_AUTHOR_MISMATCH");
  }

  const state = text(payload.lifecycleState).toUpperCase() || "REMOTE_OBSERVED";
  const live = ["PUBLISHED", "PUBLISHED_EDITED"].includes(state)
    ? true
    : [
        "ARCHIVED",
        "DELETED",
        "DRAFT",
        "PROCESSING",
        "PROCESSING_FAILED",
        "PUBLISHED_FAILED",
        "PUBLISH_REQUESTED",
      ].includes(state)
      ? false
      : null;
  const urlId = encodeURIComponent(returnedId);
  return lifecycleObservation({
    provider: "linkedin",
    channel: "linkedin",
    externalId: returnedId,
    currentLive: live,
    remoteState: state,
    remoteUrl: live === true
      ? `https://www.linkedin.com/feed/update/${urlId}/`
      : null,
    remoteCreatedAt: payload.createdAt || payload.publishedAt || null,
    remoteUpdatedAt: payload.lastModifiedAt || null,
    remoteSnapshot: {
      id: returnedId,
      author: payload.author || null,
      lifecycle_state: payload.lifecycleState || null,
      visibility: payload.visibility || null,
      feed_distribution: payload.distribution?.feedDistribution || null,
      created_at: payload.createdAt || null,
      published_at: payload.publishedAt || null,
      last_modified_at: payload.lastModifiedAt || null,
      commentary_digest: payload.commentary ? digest(text(payload.commentary)) : null,
    },
    httpStatus: result.status,
    definitiveMissing: state === "DELETED",
  });
}

async function observeGoogle({ externalId, credential, command }) {
  const accessToken = credential?.access_token;
  if (!accessToken) throw new Error("GOOGLE_PUBLICATION_LIFECYCLE_CREDENTIAL_REQUIRED");
  const resource = externalId.replace(/^\/+/, "");
  if (!/^accounts\/[^/]+\/locations\/[^/]+\/(localPosts|media)\/[^/]+$/.test(resource)) {
    throw new Error("GOOGLE_PUBLICATION_RESOURCE_ID_INVALID");
  }
  const channel = targetChannel(command);
  const result = await jsonRequest(
    `https://mybusiness.googleapis.com/v4/${resource}`,
    { accessToken },
  );
  if (!result.ok) {
    if (result.status === 404) {
      return lifecycleObservation({
        provider: "google",
        channel,
        externalId: resource,
        currentLive: false,
        remoteState: "NOT_FOUND",
        remoteSnapshot: { status: 404 },
        httpStatus: 404,
        definitiveMissing: true,
        reason: "Google reports that the exact publication resource no longer exists.",
      });
    }
    return accessOrTransientObservation({
      provider: "google",
      channel,
      externalId: resource,
      result,
    });
  }

  const payload = result.payload || {};
  const returnedId = text(payload.name).replace(/^\/+/, "");
  if (returnedId !== resource) {
    throw new Error("REMOTE_PUBLICATION_IDENTITY_MISMATCH");
  }
  const isPost = resource.includes("/localPosts/");
  const state = text(payload.state).toUpperCase();
  const live = isPost
    ? ["LIVE", "RECURRING"].includes(state)
      ? true
      : ["REJECTED", "PROCESSING", "SCHEDULED"].includes(state)
        ? false
        : null
    : Boolean(payload.googleUrl || payload.sourceUrl)
      ? true
      : null;
  return lifecycleObservation({
    provider: "google",
    channel,
    externalId: returnedId,
    currentLive: live,
    remoteState: isPost ? (state || "REMOTE_OBSERVED") : (live ? "PUBLISHED" : "REMOTE_OBSERVED"),
    remoteUrl: payload.searchUrl || payload.googleUrl,
    remoteCreatedAt: payload.createTime || null,
    remoteUpdatedAt: payload.updateTime || null,
    remoteSnapshot: {
      name: returnedId,
      state: payload.state || null,
      search_url: payload.searchUrl || null,
      google_url: payload.googleUrl || null,
      create_time: payload.createTime || null,
      update_time: payload.updateTime || null,
      summary_digest: payload.summary ? digest(text(payload.summary)) : null,
    },
    httpStatus: result.status,
    definitiveMissing: state === "REJECTED",
  });
}

async function remoteObservation({ provider, command, execution, credential }) {
  const externalId = text(
    execution.metadata?.external_publication_id ||
    command.metadata?.external_publication_id,
  );
  if (!externalId) throw new Error("REMOTE_PUBLICATION_ID_REQUIRED");
  const channel = targetChannel(command);

  if (provider === "meta") {
    if (!["facebook", "instagram"].includes(channel)) {
      throw new Error("META_PUBLICATION_CHANNEL_UNSUPPORTED");
    }
    return observeMeta({ channel, externalId, credential });
  }
  if (provider === "google") {
    return observeGoogle({ externalId, credential, command });
  }
  if (provider === "linkedin") {
    return observeLinkedIn({ externalId, credential, command });
  }
  throw new Error("PUBLICATION_LIFECYCLE_PROVIDER_UNSUPPORTED");
}

function lifecycleEvidenceIdentity({ command, execution, observation, observedAt }) {
  return digest({
    contract: CONTRACT,
    publish_command_asset_node_id: command.id,
    publish_command_identity: command.metadata?.publish_command_identity || null,
    publish_execution_asset_node_id: execution.id,
    publish_execution_identity: execution.metadata?.publish_execution_identity || null,
    external_publication_id: observation.external_publication_id,
    provider: observation.provider,
    channel: observation.channel,
    current_truth: observation.current_truth,
    remote_state: observation.remote_state,
    remote_snapshot_digest: digest(observation.remote_snapshot || {}),
    observed_at: observedAt,
  });
}

function publicationEvidence(nodes, commandId, executionId) {
  return newest(nodes, (node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.PUBLICATION_EVIDENCE &&
    node.metadata?.publish_command_asset_node_id === commandId &&
    (!executionId || node.parent_asset_node_id === executionId) &&
    node.metadata?.remote_verified === true &&
    node.metadata?.published === true,
  );
}

function lifecycleEvidence(nodes, commandId, executionId) {
  return newest(nodes, (node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.PUBLICATION_EVIDENCE &&
    node.metadata?.contract === CONTRACT &&
    node.metadata?.observation_kind === "POST_PUBLICATION_LIFECYCLE" &&
    node.metadata?.publish_command_asset_node_id === commandId &&
    (!executionId || node.parent_asset_node_id === executionId),
  );
}

function currentExecution(nodes, command) {
  const exact = command.metadata?.publish_execution_asset_node_id
    ? nodes.find((node) =>
        node.id === command.metadata.publish_execution_asset_node_id &&
        node.type === CREATIVE_ASSET_NODE_TYPES.PUBLISH_EXECUTION,
      )
    : null;
  return exact || newest(nodes, (node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.PUBLISH_EXECUTION &&
    node.metadata?.publish_command_asset_node_id === command.id,
  );
}

async function loadContext({ organization_id, publish_command_asset_node_id }) {
  if (!organization_id) throw new Error("organization_id required");
  if (!publish_command_asset_node_id) {
    throw new Error("publish_command_asset_node_id required");
  }
  const command = await AssetGraphRepository.getById(publish_command_asset_node_id);
  if (
    !command ||
    text(command.organization_id) !== text(organization_id) ||
    command.type !== CREATIVE_ASSET_NODE_TYPES.PUBLISH_COMMAND
  ) {
    throw new Error("PUBLISH_COMMAND_REQUIRED");
  }
  const nodes = await AssetGraphRepository.listByProject({
    organization_id,
    creative_project_id: command.creative_project_id,
  });
  const execution = currentExecution(nodes, command);
  if (!execution) throw new Error("PUBLISH_EXECUTION_REQUIRED");
  const historical = publicationEvidence(nodes, command.id, execution.id);
  if (!historical) throw new Error("VERIFIED_PUBLICATION_HISTORY_REQUIRED");
  const provider = lifecycleProvider(command, execution);
  if (!provider) throw new Error("PUBLICATION_LIFECYCLE_PROVIDER_UNSUPPORTED");
  return { command, execution, nodes, historical, provider };
}

function lifecyclePatch(existing = {}, observation, evidenceId, observedAt) {
  return {
    ...(existing || {}),
    publication_lifecycle_contract: CONTRACT,
    publication_lifecycle_status: observation.current_truth,
    publication_current_live: observation.current_live,
    publication_remote_state: observation.remote_state,
    publication_lifecycle_evidence_asset_node_id: evidenceId,
    publication_lifecycle_retryable: observation.retryable === true,
    publication_lifecycle_reason: observation.reason || null,
    last_lifecycle_checked_at: observedAt,
    ...(observation.current_live === true
      ? { last_confirmed_live_at: observedAt }
      : {}),
    ...(observation.current_live === false && !existing?.first_not_live_observed_at
      ? { first_not_live_observed_at: observedAt }
      : {}),
  };
}

export const CreativePublicationLifecycleRuntime = Object.freeze({
  contract: CONTRACT,

  async inspect({ organization_id, publish_command_asset_node_id } = {}) {
    const context = await loadContext({ organization_id, publish_command_asset_node_id });
    const latest = lifecycleEvidence(
      context.nodes,
      context.command.id,
      context.execution.id,
    );
    return {
      contract: CONTRACT,
      command_id: context.command.id,
      execution_id: context.execution.id,
      historical_publication_evidence_id: context.historical.id,
      was_published: true,
      provider: context.provider,
      latest_lifecycle_evidence: latest,
      current_live: latest?.metadata?.current_live ?? null,
      current_truth: latest?.metadata?.current_truth || "NOT_RECHECKED",
      remote_state: latest?.metadata?.remote_state || null,
      last_checked_at: latest?.metadata?.observed_at || null,
      can_revalidate: true,
    };
  },

  async revalidate({
    organization_id,
    publish_command_asset_node_id,
    checked_by,
  } = {}) {
    if (!checked_by?.user_id || !checked_by?.staff_account_id) {
      throw new Error("AUTHENTICATED_PUBLICATION_LIFECYCLE_CHECKER_REQUIRED");
    }
    const context = await loadContext({ organization_id, publish_command_asset_node_id });
    const credential = await resolveProviderCredential({
      organization_id,
      provider: context.provider,
      credential_id: context.execution.metadata?.credential_id || null,
    });
    if (!credential) throw new Error("PUBLICATION_LIFECYCLE_CREDENTIAL_REQUIRED");

    const observation = await remoteObservation({
      provider: context.provider,
      command: context.command,
      execution: context.execution,
      credential,
    });
    const observedAt = new Date().toISOString();
    const evidenceIdentity = lifecycleEvidenceIdentity({
      command: context.command,
      execution: context.execution,
      observation,
      observedAt,
    });
    const evidenceNode = createCreativeAssetNode({
      organization_id,
      creative_project_id: context.command.creative_project_id,
      parent_asset_node_id: context.execution.id,
      type: CREATIVE_ASSET_NODE_TYPES.PUBLICATION_EVIDENCE,
      status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
      name: `${context.command.name || "Publication"} lifecycle observation`,
      description: observation.current_live === true
        ? "Post-publication read-back confirms that the exact remote object is still live."
        : observation.current_live === false
          ? "Post-publication read-back confirms that the exact remote object is no longer live. Historical publication proof remains immutable."
          : "Post-publication read-back could not establish the current remote state. Historical publication proof remains immutable.",
      lineage: {
        source: "post_publication_lifecycle",
        provider_id: observation.provider,
        capability: "creative.release.publish.lifecycle",
        generation_version: 1,
      },
      intelligence: {
        safety_status: observation.current_live === true
          ? "VERIFIED"
          : observation.current_live === false
            ? "REVIEW_REQUIRED"
            : "UNKNOWN",
        tags: ["publication", "post-publication", "lifecycle", "immutable-evidence"],
      },
      reuse: { reusable: false, approved_for_reuse: false },
      review: {
        ai_reviewed: false,
        human_reviewed: true,
        approved: false,
        approved_by: null,
        notes: "Lifecycle observation only. This record does not approve, revoke, or rewrite the original publication evidence.",
      },
      metadata: {
        contract: CONTRACT,
        observation_kind: "POST_PUBLICATION_LIFECYCLE",
        publication_lifecycle_evidence_identity: evidenceIdentity,
        historical_publication_evidence_asset_node_id: context.historical.id,
        historical_published: true,
        publish_command_asset_node_id: context.command.id,
        publish_command_identity: context.command.metadata?.publish_command_identity || null,
        publish_execution_asset_node_id: context.execution.id,
        publish_execution_identity: context.execution.metadata?.publish_execution_identity || null,
        release_readiness_report_id: context.command.metadata?.release_readiness_report_id || null,
        release_package_id: context.command.metadata?.release_package_id || null,
        release_master_asset_node_id: context.command.metadata?.release_master_asset_node_id || null,
        release_master_checksum: context.command.metadata?.release_master_checksum || null,
        derivative_render_asset_node_id: context.command.metadata?.final_render_asset_node_id || null,
        derivative_checksum: context.command.metadata?.certified_derivative_checksum || null,
        publish_target_id: context.command.metadata?.publish_target_id || null,
        provider: observation.provider,
        channel: observation.channel,
        external_publication_id: observation.external_publication_id,
        current_live: observation.current_live,
        current_truth: observation.current_truth,
        remote_state: observation.remote_state,
        remote_url: observation.remote_url,
        remote_created_at: observation.remote_created_at,
        remote_updated_at: observation.remote_updated_at,
        remote_snapshot: observation.remote_snapshot,
        remote_snapshot_digest: digest(observation.remote_snapshot || {}),
        http_status: observation.http_status,
        retryable: observation.retryable === true,
        definitive_missing: observation.definitive_missing === true,
        reason: observation.reason || null,
        observed_at: observedAt,
        checked_by_user_id: checked_by.user_id,
        checked_by_staff_account_id: checked_by.staff_account_id,
        not_release_approval: true,
      },
      created_by: checked_by.user_id,
    });
    const stored = await AssetGraphRepository.create(evidenceNode);

    await AssetGraphRepository.update(context.execution.id, {
      metadata: lifecyclePatch(
        context.execution.metadata,
        observation,
        stored.id,
        observedAt,
      ),
    });
    await AssetGraphRepository.update(context.command.id, {
      metadata: lifecyclePatch(
        context.command.metadata,
        observation,
        stored.id,
        observedAt,
      ),
    });

    return {
      contract: CONTRACT,
      evidence: stored,
      was_published: true,
      current_live: observation.current_live,
      current_truth: observation.current_truth,
      remote_state: observation.remote_state,
      retryable: observation.retryable === true,
      definitive_missing: observation.definitive_missing === true,
    };
  },
});

export const CREATIVE_PUBLICATION_LIFECYCLE_CONTRACT = CONTRACT;

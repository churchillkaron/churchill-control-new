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
import {
  currentCreativePrimaryMaster,
} from "@/lib/creative/release/runtime/CreativeMasterVersionRuntime";
import {
  CreativeApprovalRuntime,
} from "@/lib/creative/release/runtime/CreativeApprovalRuntime";

const CONTRACT = "CREATIVE_PUBLICATION_VERIFICATION_V1";
const RETRYABLE_HTTP = new Set([404, 408, 409, 425, 429, 500, 502, 503, 504]);

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

function verifierProvider(command = {}, execution = {}) {
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
  if (!response.ok) {
    const error = new Error(
      payload?.error?.message ||
      payload?.message ||
      `REMOTE_PUBLICATION_READBACK_FAILED:${response.status}`,
    );
    error.status = response.status;
    error.retryable = RETRYABLE_HTTP.has(response.status);
    error.details = payload;
    throw error;
  }
  return payload;
}

function metaGraphVersion() {
  const configured = text(
    process.env.META_GRAPH_API_VERSION ||
    process.env.META_GRAPH_VERSION ||
    "v24.0",
  );
  return configured.startsWith("v") ? configured : `v${configured}`;
}

async function verifyMeta({ channel, externalId, credential }) {
  const accessToken = credential?.access_token;
  if (!accessToken) throw new Error("META_PUBLICATION_VERIFICATION_CREDENTIAL_REQUIRED");
  const fields = channel === "instagram"
    ? "id,permalink,timestamp,media_type,media_product_type,username"
    : "id,permalink_url,created_time,is_published";
  const url = new URL(
    `https://graph.facebook.com/${metaGraphVersion()}/${encodeURIComponent(externalId)}`,
  );
  url.searchParams.set("fields", fields);
  const payload = await jsonRequest(url, { accessToken });
  const returnedId = text(payload?.id);
  if (returnedId !== externalId) {
    throw new Error("REMOTE_PUBLICATION_IDENTITY_MISMATCH");
  }

  const published = channel === "instagram"
    ? Boolean(payload?.timestamp && payload?.permalink)
    : payload?.is_published === true;
  const state = published
    ? "PUBLISHED"
    : payload?.is_published === false
      ? "NOT_PUBLISHED"
      : "REMOTE_OBSERVED";

  return {
    provider: "meta",
    channel,
    external_publication_id: returnedId,
    remote_state: state,
    published,
    remote_url: safeUrl(payload?.permalink || payload?.permalink_url),
    remote_created_at: payload?.timestamp || payload?.created_time || null,
    remote_snapshot: {
      id: returnedId,
      permalink: payload?.permalink || payload?.permalink_url || null,
      timestamp: payload?.timestamp || payload?.created_time || null,
      is_published: payload?.is_published ?? null,
      media_type: payload?.media_type || null,
      media_product_type: payload?.media_product_type || null,
    },
  };
}

function linkedInVersion() {
  return text(process.env.LINKEDIN_API_VERSION) || "202607";
}

async function verifyLinkedIn({ externalId, credential, command }) {
  const accessToken = credential?.access_token;
  if (!accessToken) throw new Error("LINKEDIN_PUBLICATION_VERIFICATION_CREDENTIAL_REQUIRED");
  const url = `https://api.linkedin.com/rest/posts/${encodeURIComponent(externalId)}`;
  const payload = await jsonRequest(url, {
    accessToken,
    headers: {
      "Linkedin-Version": linkedInVersion(),
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });
  const returnedId = text(payload?.id);
  if (returnedId !== externalId) {
    throw new Error("REMOTE_PUBLICATION_IDENTITY_MISMATCH");
  }
  const expectedAuthor = text(command.metadata?.publish_target?.author_urn);
  if (expectedAuthor && text(payload?.author) !== expectedAuthor) {
    throw new Error("REMOTE_PUBLICATION_AUTHOR_MISMATCH");
  }
  const state = text(payload?.lifecycleState).toUpperCase() || "REMOTE_OBSERVED";
  const published = state === "PUBLISHED";
  return {
    provider: "linkedin",
    channel: "linkedin",
    external_publication_id: returnedId,
    remote_state: state,
    published,
    remote_url: null,
    remote_created_at: payload?.createdAt || null,
    remote_snapshot: {
      id: returnedId,
      author: payload?.author || null,
      lifecycle_state: payload?.lifecycleState || null,
      visibility: payload?.visibility || null,
      created_at: payload?.createdAt || null,
    },
  };
}

async function verifyGoogle({ externalId, credential, command }) {
  const accessToken = credential?.access_token;
  if (!accessToken) throw new Error("GOOGLE_PUBLICATION_VERIFICATION_CREDENTIAL_REQUIRED");
  const resource = externalId.replace(/^\/+/, "");
  if (!/^accounts\/[^/]+\/locations\/[^/]+\/(localPosts|media)\/[^/]+$/.test(resource)) {
    throw new Error("GOOGLE_PUBLICATION_RESOURCE_ID_INVALID");
  }
  const url = `https://mybusiness.googleapis.com/v4/${resource}`;
  const payload = await jsonRequest(url, { accessToken });
  const returnedId = text(payload?.name).replace(/^\/+/, "");
  if (returnedId !== resource) {
    throw new Error("REMOTE_PUBLICATION_IDENTITY_MISMATCH");
  }

  const isPost = resource.includes("/localPosts/");
  const remoteState = text(payload?.state).toUpperCase();
  const published = isPost
    ? remoteState === "LIVE"
    : Boolean(payload?.googleUrl || payload?.sourceUrl);
  const state = published
    ? "PUBLISHED"
    : remoteState || "REMOTE_OBSERVED";
  return {
    provider: "google",
    channel: targetChannel(command),
    external_publication_id: returnedId,
    remote_state: state,
    published,
    remote_url: safeUrl(payload?.searchUrl || payload?.googleUrl),
    remote_created_at: payload?.createTime || null,
    remote_snapshot: {
      name: returnedId,
      state: payload?.state || null,
      search_url: payload?.searchUrl || null,
      google_url: payload?.googleUrl || null,
      create_time: payload?.createTime || null,
      update_time: payload?.updateTime || null,
    },
  };
}

async function remoteReadback({ provider, command, execution, credential }) {
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
    return verifyMeta({ channel, externalId, credential });
  }
  if (provider === "google") {
    return verifyGoogle({ externalId, credential, command });
  }
  if (provider === "linkedin") {
    return verifyLinkedIn({ externalId, credential, command });
  }
  throw new Error("PUBLICATION_REMOTE_VERIFICATION_UNSUPPORTED");
}

function publicationEvidenceIdentity({ command, execution, observation }) {
  return digest({
    contract: CONTRACT,
    publish_command_asset_node_id: command.id,
    publish_command_identity: command.metadata?.publish_command_identity || null,
    publish_execution_asset_node_id: execution.id,
    publish_execution_identity: execution.metadata?.publish_execution_identity || null,
    provider: observation.provider,
    channel: observation.channel,
    external_publication_id: observation.external_publication_id,
    remote_state: observation.remote_state,
    remote_url: observation.remote_url,
    remote_snapshot_digest: digest(observation.remote_snapshot || {}),
  });
}

async function currentExecution(nodes, command) {
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

async function assertCurrentAuthorization({ organization_id, command, nodes }) {
  const currentMaster = currentCreativePrimaryMaster(nodes);
  if (!currentMaster?.id || !currentMaster.technical?.checksum) {
    throw new Error("CURRENT_RELEASE_MASTER_REQUIRED");
  }
  if (
    command.metadata?.release_master_asset_node_id !== currentMaster.id ||
    command.metadata?.release_master_checksum !== currentMaster.technical.checksum
  ) {
    throw new Error("STALE_PUBLISH_COMMAND_MASTER_VERSION");
  }

  const readiness = nodes.find((node) =>
    node.id === command.metadata?.release_readiness_report_id &&
    node.type === CREATIVE_ASSET_NODE_TYPES.RELEASE_READINESS_REPORT &&
    node.metadata?.passed === true &&
    node.metadata?.final_render_asset_node_id === currentMaster.id,
  );
  if (!readiness) throw new Error("STALE_PUBLISH_COMMAND_RELEASE_READINESS");
  if (
    readiness.metadata?.release_readiness_identity !==
    command.metadata?.release_readiness_identity
  ) {
    throw new Error("STALE_PUBLISH_COMMAND_RELEASE_READINESS");
  }

  const approval = await CreativeApprovalRuntime.findCurrentApproval({
    organization_id,
    subject_asset_node_id: readiness.id,
    scope: "PUBLISH_RELEASE",
  });
  if (!approval || approval.id !== command.metadata?.publish_approval_record_id) {
    throw new Error("STALE_PUBLISH_COMMAND_APPROVAL");
  }
}

export const CreativePublicationVerificationRuntime = Object.freeze({
  contract: CONTRACT,

  async inspect({ organization_id, publish_command_asset_node_id } = {}) {
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
    const execution = await currentExecution(nodes, command);
    const evidence = execution
      ? newest(nodes, (node) =>
          node.type === CREATIVE_ASSET_NODE_TYPES.PUBLICATION_EVIDENCE &&
          node.parent_asset_node_id === execution.id &&
          node.metadata?.publish_command_asset_node_id === command.id,
        )
      : null;
    const verifiedEvidence = execution
      ? newest(nodes, (node) =>
          node.type === CREATIVE_ASSET_NODE_TYPES.PUBLICATION_EVIDENCE &&
          node.parent_asset_node_id === execution.id &&
          node.metadata?.publish_command_asset_node_id === command.id &&
          node.metadata?.remote_verified === true &&
          node.metadata?.published === true,
        )
      : null;
    const provider = execution ? verifierProvider(command, execution) : null;
    return {
      contract: CONTRACT,
      command_id: command.id,
      execution_id: execution?.id || null,
      execution_status: execution?.metadata?.execution_status || command.metadata?.execution_status || null,
      external_publication_id:
        execution?.metadata?.external_publication_id ||
        command.metadata?.external_publication_id ||
        null,
      provider,
      can_verify: Boolean(
        execution &&
        provider &&
        text(execution.metadata?.external_publication_id || command.metadata?.external_publication_id) &&
        !verifiedEvidence,
      ),
      latest_evidence: evidence,
      verified_evidence: verifiedEvidence,
      published: Boolean(verifiedEvidence),
    };
  },

  async verify({
    organization_id,
    publish_command_asset_node_id,
    verified_by,
  } = {}) {
    if (!verified_by?.user_id || !verified_by?.staff_account_id) {
      throw new Error("AUTHENTICATED_PUBLICATION_VERIFIER_REQUIRED");
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
    await assertCurrentAuthorization({ organization_id, command, nodes });

    const execution = await currentExecution(nodes, command);
    if (!execution) throw new Error("PUBLISH_EXECUTION_REQUIRED");
    if (["FAILED", "DISPATCHING", "PENDING_PROVIDER"].includes(
      text(execution.metadata?.execution_status).toUpperCase(),
    )) {
      throw new Error("REMOTE_PUBLICATION_ACKNOWLEDGEMENT_REQUIRED");
    }
    const externalId = text(
      execution.metadata?.external_publication_id ||
      command.metadata?.external_publication_id,
    );
    if (!externalId) throw new Error("REMOTE_PUBLICATION_ID_REQUIRED");

    const alreadyVerified = newest(nodes, (node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.PUBLICATION_EVIDENCE &&
      node.parent_asset_node_id === execution.id &&
      node.metadata?.publish_command_asset_node_id === command.id &&
      node.metadata?.external_publication_id === externalId &&
      node.metadata?.remote_verified === true &&
      node.metadata?.published === true,
    );
    if (alreadyVerified) {
      return {
        contract: CONTRACT,
        evidence: alreadyVerified,
        reused: true,
        published: true,
      };
    }

    const provider = verifierProvider(command, execution);
    if (!provider) throw new Error("PUBLICATION_REMOTE_VERIFICATION_UNSUPPORTED");
    const credential = await resolveProviderCredential({
      organization_id,
      provider,
      credential_id: execution.metadata?.credential_id || null,
    });
    if (!credential) throw new Error("PUBLICATION_REMOTE_VERIFICATION_CREDENTIAL_REQUIRED");

    let observation;
    try {
      observation = await remoteReadback({
        provider,
        command,
        execution,
        credential,
      });
    } catch (error) {
      if (error?.retryable === true) {
        return {
          contract: CONTRACT,
          evidence: null,
          reused: false,
          published: false,
          retryable: true,
          blocker: "REMOTE_PUBLICATION_NOT_OBSERVED_YET",
          error: error.message,
        };
      }
      throw error;
    }

    const observedAt = new Date().toISOString();
    const evidenceIdentity = publicationEvidenceIdentity({
      command,
      execution,
      observation,
    });
    const evidenceNode = createCreativeAssetNode({
      organization_id,
      creative_project_id: command.creative_project_id,
      parent_asset_node_id: execution.id,
      type: CREATIVE_ASSET_NODE_TYPES.PUBLICATION_EVIDENCE,
      status: observation.published
        ? CREATIVE_ASSET_NODE_STATUS.APPROVED
        : CREATIVE_ASSET_NODE_STATUS.REVIEW,
      name: `${command.name || "Publication"} remote verification`,
      description: observation.published
        ? "Immutable read-back evidence proves the exact remote publication exists in a published state."
        : "Remote object was observed, but the provider has not proven a final published state yet.",
      lineage: {
        source: "remote_publication_verification",
        provider_id: observation.provider,
        capability: "creative.release.publish.verify",
        generation_version: 1,
      },
      intelligence: {
        safety_status: observation.published ? "VERIFIED" : "REVIEW_REQUIRED",
        tags: ["publication", "remote-readback", "immutable-evidence"],
      },
      reuse: { reusable: false, approved_for_reuse: false },
      review: {
        ai_reviewed: false,
        human_reviewed: true,
        approved: observation.published,
        approved_by: verified_by.staff_account_id,
        notes: observation.published
          ? "Exact provider object was read back and verified published."
          : "Provider object exists but is not yet in a final published state.",
      },
      metadata: {
        contract: CONTRACT,
        publication_evidence_identity: evidenceIdentity,
        publish_command_asset_node_id: command.id,
        publish_command_identity: command.metadata?.publish_command_identity || null,
        publish_execution_asset_node_id: execution.id,
        publish_execution_identity: execution.metadata?.publish_execution_identity || null,
        release_readiness_report_id: command.metadata?.release_readiness_report_id || null,
        release_readiness_identity: command.metadata?.release_readiness_identity || null,
        release_package_id: command.metadata?.release_package_id || null,
        release_package_identity: command.metadata?.release_package_identity || null,
        release_master_asset_node_id: command.metadata?.release_master_asset_node_id || null,
        release_master_checksum: command.metadata?.release_master_checksum || null,
        derivative_render_asset_node_id: command.metadata?.final_render_asset_node_id || null,
        derivative_checksum: command.metadata?.certified_derivative_checksum || null,
        publish_target_id: command.metadata?.publish_target_id || null,
        provider: observation.provider,
        channel: observation.channel,
        external_publication_id: observation.external_publication_id,
        remote_state: observation.remote_state,
        remote_url: observation.remote_url,
        remote_created_at: observation.remote_created_at,
        remote_snapshot: observation.remote_snapshot,
        remote_snapshot_digest: digest(observation.remote_snapshot || {}),
        remote_verified: observation.published,
        published: observation.published,
        observed_at: observedAt,
        verified_by_user_id: verified_by.user_id,
        verified_by_staff_account_id: verified_by.staff_account_id,
      },
      created_by: verified_by.user_id,
    });
    const claimed = await AssetGraphRepository.createOrFindByMetadataIdentity({
      node: evidenceNode,
      metadata_key: "publication_evidence_identity",
      metadata_value: evidenceIdentity,
    });
    const storedEvidence = claimed.node;

    if (observation.published) {
      await AssetGraphRepository.update(execution.id, {
        status: CREATIVE_ASSET_NODE_STATUS.APPROVED,
        description: "Remote publication verified by exact provider read-back.",
        metadata: {
          ...(execution.metadata || {}),
          execution_status: "PUBLISHED",
          publication_evidence_asset_node_id: storedEvidence.id,
          remote_verified: true,
          remote_verified_at: observedAt,
          remote_state: observation.remote_state,
          external_publication_url: observation.remote_url,
        },
      });
      await AssetGraphRepository.update(command.id, {
        status: CREATIVE_ASSET_NODE_STATUS.APPROVED,
        metadata: {
          ...(command.metadata || {}),
          execution_status: "PUBLISHED",
          publication_evidence_asset_node_id: storedEvidence.id,
          remote_verified: true,
          remote_verified_at: observedAt,
          remote_state: observation.remote_state,
          external_publication_url: observation.remote_url,
          publication_error: null,
        },
      });
    } else {
      await AssetGraphRepository.update(execution.id, {
        status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
        metadata: {
          ...(execution.metadata || {}),
          execution_status: "REMOTE_VERIFICATION_REQUIRED",
          publication_evidence_asset_node_id: storedEvidence.id,
          remote_verified: false,
          remote_state: observation.remote_state,
          last_verified_at: observedAt,
        },
      });
      await AssetGraphRepository.update(command.id, {
        metadata: {
          ...(command.metadata || {}),
          execution_status: "REMOTE_VERIFICATION_REQUIRED",
          publication_evidence_asset_node_id: storedEvidence.id,
          remote_verified: false,
          remote_state: observation.remote_state,
        },
      });
    }

    return {
      contract: CONTRACT,
      evidence: storedEvidence,
      reused: !claimed.created,
      published: observation.published,
      retryable: !observation.published,
      blocker: observation.published ? null : "REMOTE_PUBLICATION_NOT_FINAL",
    };
  },
});

export const CREATIVE_PUBLICATION_VERIFICATION_CONTRACT = CONTRACT;

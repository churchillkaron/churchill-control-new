import {
  ProductionTaskRuntime,
} from "../../../../operations/tasks/runtime/ProductionTaskRuntime.js";
import {
  CreativeAssetsRuntime,
} from "../../runtime/CreativeAssetsRuntime.js";
import * as AssetGraphRepository
from "../../graph/repositories/CreativeAssetGraphRepository.js";
import {
  CreativeShotAssetScopeRuntime,
} from "./CreativeShotAssetScopeRuntime.js";
import {
  CreativeProductionTaskMaterializationRuntime,
} from "../../../execution/runtime/CreativeProductionTaskMaterializationRuntime.js";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.strict-shot-asset-isolation-gate.v1",
);
const SOURCE_REPAIR_CONTRACT =
  "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_SOURCE_V1";
const REVIEW_REPAIR_CONTRACT =
  "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_REVIEW_V1";
const MATERIALIZATION_DESCRIPTOR_KEY = "task_materialization_contract";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function mediaUrl(asset = {}) {
  return text(
    asset.url ||
    asset.file_url ||
    asset.fileUrl ||
    asset.image_url ||
    asset.imageUrl ||
    asset.video_url ||
    asset.videoUrl ||
    asset.audio_url ||
    asset.audioUrl ||
    asset.thumbnail_url,
  ) || null;
}

function outputValue(output = {}) {
  return output?.output?.output || output?.output || output || {};
}

function collectOutputUrls(value, output = new Set(), seen = new Set()) {
  if (value === null || value === undefined) return output;
  if (typeof value === "string") {
    if (/^(storage|https?):\/\//i.test(value)) output.add(value);
    return output;
  }
  if (typeof value !== "object" || seen.has(value)) return output;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectOutputUrls(item, output, seen);
    return output;
  }
  for (const [key, child] of Object.entries(value)) {
    if (/prompt|description|error|message|instructions/i.test(key)) continue;
    collectOutputUrls(child, output, seen);
  }
  return output;
}

function mediaBearingKey(key = "") {
  return /(?:^|_)(?:image|images|video|videos|audio|media|source|sources|reference|references|file|files|asset|assets|url|uri)(?:_|$)/i.test(key) ||
    /^(image|video|audio|media|source|reference|file|url|identity_source|prompt_image)$/i.test(key);
}

function collectInputMedia(
  value,
  output = [],
  key = "",
  path = "input",
  seen = new Set(),
) {
  if (value === null || value === undefined) return output;
  if (typeof value === "string") {
    if (mediaBearingKey(key) && /^(storage|https?):\/\//i.test(value)) {
      output.push({ path, url: value });
    }
    return output;
  }
  if (typeof value !== "object" || seen.has(value)) return output;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectInputMedia(item, output, key, `${path}[${index}]`, seen));
    return output;
  }
  for (const [childKey, child] of Object.entries(value)) {
    if (childKey === MATERIALIZATION_DESCRIPTOR_KEY) continue;
    if (/provider_prompt|prompt|description|instructions|negative/i.test(childKey)) {
      continue;
    }
    collectInputMedia(child, output, childKey, `${path}.${childKey}`, seen);
  }
  return output;
}

function scopedAssetIdentifier(value) {
  const id = text(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : null;
}

function collectInputIds(
  value,
  output,
  key = "",
  path = "input",
  seen = new Set(),
) {
  if (value === null || value === undefined) return output;
  const creativeKey = CreativeShotAssetScopeRuntime.creativeAssetKey(key);
  const assetNodeKey = CreativeShotAssetScopeRuntime.assetNodeKey(key);
  const productionNodeKey = CreativeShotAssetScopeRuntime.productionNodeKey(key);

  if (typeof value === "string") {
    const scopedId = scopedAssetIdentifier(value);
    if (creativeKey && scopedId) output.creative.push({ path, id: scopedId });
    if (assetNodeKey && scopedId) output.assetNodes.push({ path, id: scopedId });
    if (productionNodeKey) output.productionNodes.push({ path, id: text(value) });
    return output;
  }
  if (typeof value !== "object" || seen.has(value)) return output;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const rawId = text(item?.asset_id || item?.assetId || item?.id || item);
      const scopedId = scopedAssetIdentifier(rawId);
      if (creativeKey && scopedId) {
        output.creative.push({ path: `${path}[${index}]`, id: scopedId });
      }
      if (assetNodeKey && scopedId) {
        output.assetNodes.push({ path: `${path}[${index}]`, id: scopedId });
      }
      if (productionNodeKey && rawId) {
        output.productionNodes.push({ path: `${path}[${index}]`, id: rawId });
      }
      if (!creativeKey && !assetNodeKey && !productionNodeKey) {
        collectInputIds(item, output, key, `${path}[${index}]`, seen);
      }
    });
    return output;
  }
  for (const [childKey, child] of Object.entries(value)) {
    if (childKey === MATERIALIZATION_DESCRIPTOR_KEY || childKey === "asset_scope") continue;
    if (/provider_prompt|prompt|description|instructions/i.test(childKey)) {
      continue;
    }
    collectInputIds(child, output, childKey, `${path}.${childKey}`, seen);
  }
  return output;
}

function repairKind(task = {}) {
  const contract = text(task.metadata?.repair_payload_contract);
  if (contract === SOURCE_REPAIR_CONTRACT) return "SOURCE";
  if (contract === REVIEW_REPAIR_CONTRACT) return "REVIEW";
  return null;
}

function verifiedMaterializationContract(task = {}) {
  const contract = object(
    task.input?.requirements?.task_materialization_contract,
  );
  if (!Object.keys(contract).length) {
    if (repairKind(task)) {
      throw new Error("PAIR_REPAIR_MATERIALIZATION_CONTRACT_REQUIRED");
    }
    return null;
  }
  if (!CreativeProductionTaskMaterializationRuntime.verify(contract)) {
    throw new Error("PRODUCTION_TASK_MATERIALIZATION_CONTRACT_INVALID");
  }
  const executionNodeId = text(task.metadata?.execution_node_id);
  if (!executionNodeId || text(contract.node_id) !== executionNodeId) {
    throw new Error(
      `PRODUCTION_TASK_MATERIALIZATION_NODE_MISMATCH:${executionNodeId}:${
        contract.node_id || ""
      }`,
    );
  }
  return contract;
}

function repairOriginalTaskId(task = {}) {
  const kind = repairKind(task);
  if (kind === "SOURCE") return text(task.metadata?.repair_of_task_id);
  if (kind === "REVIEW") {
    return text(task.metadata?.repair_review_of_task_id);
  }
  return "";
}

function repairAliasEvidence(task = {}, taskMap = new Map()) {
  const kind = repairKind(task);
  if (!kind) return null;

  const issues = [];
  const originalTaskId = repairOriginalTaskId(task);
  const original = originalTaskId ? taskMap.get(originalTaskId) : null;
  const replacementNodeId = text(task.metadata?.execution_node_id);
  const originalNodeId = text(original?.metadata?.execution_node_id);

  if (!original) issues.push("ORIGINAL_TASK_MISSING");
  if (!replacementNodeId || !originalNodeId) {
    issues.push("EXECUTION_NODE_ID_MISSING");
  }
  if (replacementNodeId && replacementNodeId === originalNodeId) {
    issues.push("REPLACEMENT_NODE_NOT_DISTINCT");
  }
  if (
    task.metadata?.pair_aware_repair !== true ||
    task.metadata?.generated_media_perceptual_pair_repair !== true
  ) {
    issues.push("PAIR_REPAIR_FLAGS_MISSING");
  }

  if (original) {
    for (const key of [
      "organization_id",
      "creative_project_id",
      "production_graph_id",
    ]) {
      if (text(task[key]) !== text(original[key])) {
        issues.push(`REPAIR_SCOPE_MISMATCH:${key}`);
      }
    }
    if (text(original.status) !== "FAILED") {
      issues.push("ORIGINAL_TASK_NOT_FAILED");
    }
    const originalRepairKind = repairKind(original);
    const originalRepairIdentity = text(original.metadata?.repair_identity);
    const replacementRepairIdentity = text(task.metadata?.repair_identity);
    if (
      originalRepairIdentity &&
      replacementRepairIdentity !== originalRepairIdentity &&
      !originalRepairKind
    ) {
      issues.push("REPAIR_IDENTITY_MISMATCH");
    }
    const originalAttempt = Number(original.metadata?.repair_attempt || 0);
    const replacementAttempt = Number(task.metadata?.repair_attempt || 0);
    if (replacementAttempt !== originalAttempt + 1) {
      issues.push("REPAIR_ATTEMPT_MISMATCH");
    }

    if (kind === "SOURCE") {
      if (
        text(original.metadata?.superseded_by_repair_task_id) !== text(task.id)
      ) {
        issues.push("SOURCE_SUPERSESSION_BACK_REFERENCE_INVALID");
      }
      if (text(task.metadata?.repair_of_task_id) !== text(original.id)) {
        issues.push("SOURCE_ORIGINAL_REFERENCE_INVALID");
      }
    }

    if (kind === "REVIEW") {
      if (
        text(original.metadata?.superseded_by_repair_review_task_id) !==
        text(task.id)
      ) {
        issues.push("REVIEW_SUPERSESSION_BACK_REFERENCE_INVALID");
      }
      if (
        text(task.metadata?.repair_review_of_task_id) !== text(original.id)
      ) {
        issues.push("REVIEW_ORIGINAL_REFERENCE_INVALID");
      }
      const repairedSourceTaskId = text(
        task.metadata?.repaired_source_task_id,
      );
      const repairedSource = repairedSourceTaskId
        ? taskMap.get(repairedSourceTaskId)
        : null;
      if (
        !repairedSource ||
        repairKind(repairedSource) !== "SOURCE" ||
        list(task.depends_on).length !== 1 ||
        text(task.depends_on[0]) !== repairedSourceTaskId ||
        text(repairedSource.metadata?.repair_quality_task_id) !==
          text(original.id)
      ) {
        issues.push("REVIEW_REPAIRED_SOURCE_PAIR_INVALID");
      }
    }
  }

  return {
    task_id: task.id,
    kind,
    original_task_id: originalTaskId || null,
    replacement_node_id: replacementNodeId || null,
    original_node_id: originalNodeId || null,
    issues,
    valid: issues.length === 0,
  };
}

async function graphRepairAliasEvidence(task = {}) {
  const tasks = await ProductionTaskRuntime.list({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
    production_graph_id: task.production_graph_id,
  });
  const graphTasks = tasks.filter(
    (candidate) =>
      String(candidate.production_graph_id) === String(task.production_graph_id),
  );
  const taskMap = new Map(
    graphTasks.map((candidate) => [String(candidate.id), candidate]),
  );
  const evidence = graphTasks
    .map((candidate) => repairAliasEvidence(candidate, taskMap))
    .filter(Boolean);
  const invalid = evidence.filter((item) => !item.valid);
  if (invalid.length) {
    throw new Error(
      `SHOT_ASSET_SCOPE_REPAIR_ALIAS_INVALID:${invalid
        .map((item) => `${item.task_id}:${item.issues.join("+")}`)
        .join(",")}`,
    );
  }

  const aliases = new Map();
  for (const item of evidence) {
    if (aliases.has(item.replacement_node_id)) {
      throw new Error(
        `SHOT_ASSET_SCOPE_REPAIR_ALIAS_DUPLICATE:${item.replacement_node_id}`,
      );
    }
    aliases.set(item.replacement_node_id, item.original_node_id);
  }

  return {
    aliases,
    evidence,
  };
}

function authorizedProductionNode(nodeId, allowedNodeIds, aliases) {
  const value = text(nodeId);
  if (!value) return false;
  if (allowedNodeIds.has(value)) return true;
  const originalNodeId = aliases.get(value);
  return Boolean(originalNodeId && allowedNodeIds.has(originalNodeId));
}

function repairAliasFor(nodeId, aliases) {
  const value = text(nodeId);
  const originalNodeId = aliases.get(value);
  return originalNodeId
    ? {
        replacement_node_id: value,
        original_node_id: originalNodeId,
      }
    : null;
}

async function projectScopedCreativeAssets(task) {
  const assets = await CreativeAssetsRuntime.list({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
    limit: 1000,
  });
  const byId = new Map();
  for (const asset of list(assets)) {
    const id = text(asset.id || asset.asset_id);
    if (!id) continue;
    if (String(asset.organization_id) !== String(task.organization_id)) {
      throw new Error(
        `SHOT_ASSET_SCOPE_CREATIVE_ASSET_ORGANIZATION_MISMATCH:${id}`,
      );
    }
    byId.set(id, asset);
  }
  return byId;
}

async function creativeAssetUrls(task, ids) {
  const urls = new Set();
  const allowed = await projectScopedCreativeAssets(task);
  for (const id of ids) {
    const asset = allowed.get(id);
    if (!asset) {
      throw new Error(
        `SHOT_ASSET_SCOPE_CREATIVE_ASSET_NOT_SELECTED_FOR_PROJECT:${id}`,
      );
    }
    const url = mediaUrl(asset);
    if (!url) {
      throw new Error(`SHOT_ASSET_SCOPE_CREATIVE_ASSET_MEDIA_REQUIRED:${id}`);
    }
    urls.add(url);
  }
  return urls;
}

async function assetNodeUrls(task, ids) {
  const urls = new Set();
  for (const id of ids) {
    const node = await AssetGraphRepository.getById(id);
    if (!node || String(node.organization_id) !== String(task.organization_id)) {
      throw new Error(`SHOT_ASSET_SCOPE_ASSET_NODE_NOT_FOUND:${id}`);
    }
    if (
      node.creative_project_id &&
      String(node.creative_project_id) !== String(task.creative_project_id)
    ) {
      throw new Error(`SHOT_ASSET_SCOPE_ASSET_NODE_PROJECT_MISMATCH:${id}`);
    }
    const url = mediaUrl(node);
    if (url) urls.add(url);
  }
  return urls;
}

async function dependencyEvidence(task, allowedNodeIds, aliases) {
  const urls = new Set();
  const taskIds = new Set();
  const assetNodeIds = new Set();
  const repairAliases = [];
  for (const dependencyTaskId of list(task.depends_on)) {
    const dependency = await ProductionTaskRuntime.get(dependencyTaskId);
    if (!dependency) {
      throw new Error(
        `SHOT_ASSET_SCOPE_DEPENDENCY_TASK_NOT_FOUND:${dependencyTaskId}`,
      );
    }
    const executionNodeId = text(dependency.metadata?.execution_node_id);
    if (
      !executionNodeId ||
      !authorizedProductionNode(executionNodeId, allowedNodeIds, aliases)
    ) {
      throw new Error(
        `SHOT_ASSET_SCOPE_DEPENDENCY_NODE_NOT_AUTHORIZED:${
          executionNodeId || dependencyTaskId
        }`,
      );
    }
    const alias = repairAliasFor(executionNodeId, aliases);
    if (alias) repairAliases.push(alias);
    taskIds.add(dependency.id);
    const dependencyAssetNodeId = scopedAssetIdentifier(dependency.output?.asset_node_id);
    if (dependencyAssetNodeId) assetNodeIds.add(dependencyAssetNodeId);
    for (const url of collectOutputUrls(outputValue(dependency.output))) {
      urls.add(url);
    }
  }
  return { urls, taskIds, assetNodeIds, repairAliases };
}

function canonicalMediaIdentity(value) {
  const source = text(value);
  if (!source) return null;
  if (/^storage:\/\//i.test(source)) {
    return source.replace(/^storage:\/\//i, "").split("?")[0];
  }
  if (/^https:\/\//i.test(source)) {
    try {
      const parsed = new URL(source);
      const match = parsed.pathname.match(/^\/storage\/v1\/(?:object|render\/image)\/(?:sign|public|authenticated)\/([^/]+)\/(.+)$/);
      if (match) return `${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}`;
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return source;
    }
  }
  return source;
}

function assertSubset(entries, allowed, errorCode) {
  const unauthorized = entries.filter((entry) => !allowed.has(entry.id));
  if (unauthorized.length) {
    throw new Error(
      `${errorCode}:${unauthorized
        .map((entry) => `${entry.path}=${entry.id}`)
        .join(",")}`,
    );
  }
}

function assertProductionSubset(entries, allowed, aliases, errorCode) {
  const unauthorized = entries.filter(
    (entry) => !authorizedProductionNode(entry.id, allowed, aliases),
  );
  if (unauthorized.length) {
    throw new Error(
      `${errorCode}:${unauthorized
        .map((entry) => `${entry.path}=${entry.id}`)
        .join(",")}`,
    );
  }
}

async function evidence(task = {}) {
  const materializationContract = verifiedMaterializationContract(task);
  const scope = object(task.input?.requirements?.asset_scope);
  if (!CreativeShotAssetScopeRuntime.verify(scope)) {
    throw new Error("STRICT_SHOT_ASSET_SCOPE_REQUIRED");
  }

  const executionNodeId = text(task.metadata?.execution_node_id);
  if (!executionNodeId || text(scope.node_id) !== executionNodeId) {
    throw new Error("STRICT_SHOT_ASSET_SCOPE_NODE_MISMATCH");
  }

  const persistedScopeHash = text(task.metadata?.asset_scope_hash);
  if (!persistedScopeHash) {
    task = await ProductionTaskRuntime.update(task.id, {
      metadata: {
        ...object(task.metadata),
        asset_scope_contract: scope.contract,
        asset_scope_hash: scope.scope_hash,
        scoped_creative_asset_ids: list(scope.creative_asset_ids),
        scoped_asset_node_ids: list(scope.asset_node_ids),
        scoped_dependency_node_ids: list(scope.dependency_node_ids),
        scoped_authorized_production_node_ids:
          list(scope.authorized_production_node_ids),
        signed_scope_metadata_backfilled: true,
        signed_scope_metadata_backfilled_at: new Date().toISOString(),
      },
    });
  } else if (persistedScopeHash !== text(scope.scope_hash)) {
    throw new Error("STRICT_SHOT_ASSET_SCOPE_HASH_MISMATCH");
  }

  const creativeIds = new Set(
    list(scope.creative_asset_ids).map(scopedAssetIdentifier).filter(Boolean),
  );
  const assetNodeIds = new Set(
    list(scope.asset_node_ids).map(scopedAssetIdentifier).filter(Boolean),
  );
  const productionNodeIds = new Set(
    list(scope.authorized_production_node_ids).map(text),
  );
  const allowedUrls = new Set(list(scope.allowed_media_references).map(text));
  const repair = await graphRepairAliasEvidence(task);

  for (const url of await creativeAssetUrls(task, creativeIds)) {
    allowedUrls.add(url);
  }
  for (const url of await assetNodeUrls(task, assetNodeIds)) {
    allowedUrls.add(url);
  }
  const dependencies = await dependencyEvidence(
    task,
    productionNodeIds,
    repair.aliases,
  );
  for (const url of dependencies.urls) allowedUrls.add(url);
  for (const id of dependencies.assetNodeIds) assetNodeIds.add(id);

  const ids = collectInputIds(task.input, {
    creative: [],
    assetNodes: [],
    productionNodes: [],
  });
  assertSubset(ids.creative, creativeIds, "UNSCOPED_CREATIVE_ASSET_BLOCKED");
  assertSubset(ids.assetNodes, assetNodeIds, "UNSCOPED_ASSET_NODE_BLOCKED");
  assertProductionSubset(
    ids.productionNodes,
    productionNodeIds,
    repair.aliases,
    "UNSCOPED_PRODUCTION_NODE_BLOCKED",
  );

  const media = collectInputMedia(task.input);
  const allowedMediaIdentities = new Set(
    [...allowedUrls].map(canonicalMediaIdentity).filter(Boolean),
  );
  const unauthorizedMedia = media.filter((entry) => {
    if (allowedUrls.has(entry.url)) return false;
    const identity = canonicalMediaIdentity(entry.url);
    return !identity || !allowedMediaIdentities.has(identity);
  });
  if (unauthorizedMedia.length) {
    throw new Error(
      `UNSCOPED_PROVIDER_MEDIA_BLOCKED:${unauthorizedMedia
        .map((entry) => `${entry.path}=${entry.url}`)
        .join(",")}`,
    );
  }

  const inputAliases = ids.productionNodes
    .map((entry) => repairAliasFor(entry.id, repair.aliases))
    .filter(Boolean);
  const verifiedRepairAliases = [
    ...inputAliases,
    ...dependencies.repairAliases,
  ].filter(
    (alias, index, values) =>
      values.findIndex(
        (candidate) =>
          candidate.replacement_node_id === alias.replacement_node_id &&
          candidate.original_node_id === alias.original_node_id,
      ) === index,
  );

  return {
    scope,
    materializationContract,
    materializationContractVerified: Boolean(materializationContract),
    creativeIds,
    assetNodeIds,
    productionNodeIds,
    allowedUrls,
    dependencies,
    ids,
    media,
    repairAliasEvidence: repair.evidence,
    verifiedRepairAliases,
  };
}

async function enforce(task = {}) {
  const verification = await evidence(task);
  const {
    scope,
    materializationContract,
    materializationContractVerified,
    creativeIds,
    assetNodeIds,
    productionNodeIds,
    allowedUrls,
    dependencies,
    repairAliasEvidence,
    verifiedRepairAliases,
  } = verification;

  const updated = await ProductionTaskRuntime.update(task.id, {
    input: {
      ...object(task.input),
      asset_scope: {
        contract: scope.contract,
        scope_hash: scope.scope_hash,
        creative_asset_ids: [...creativeIds],
        asset_node_ids: [...assetNodeIds],
        dependency_node_ids: [...productionNodeIds],
        repair_node_aliases: verifiedRepairAliases,
        allowed_media_count: allowedUrls.size,
      },
      provider_policy: {
        ...object(task.input?.provider_policy),
        asset_access_mode: "LEAST_PRIVILEGE",
        allow_project_asset_pool: false,
        allow_organization_asset_pool: false,
        allow_implicit_media_discovery: false,
        asset_scope_hash: scope.scope_hash,
      },
    },
    metadata: {
      ...object(task.metadata),
      strict_shot_asset_scope_verified: true,
      verified_asset_scope_hash: scope.scope_hash,
      verified_creative_asset_ids: [...creativeIds],
      verified_asset_node_ids: [...assetNodeIds],
      verified_dependency_task_ids: [...dependencies.taskIds],
      verified_allowed_media_count: allowedUrls.size,
      verified_repair_production_node_aliases: verifiedRepairAliases,
      verified_repair_alias_evidence_count: repairAliasEvidence.length,
      verified_task_materialization_contract:
        materializationContractVerified,
      verified_task_materialization_contract_hash:
        materializationContract?.contract_hash || null,
      materialization_descriptor_excluded_from_live_input_scan:
        materializationContractVerified,
      project_asset_pool_exposed: false,
      organization_asset_pool_exposed: false,
      provider_input_mode: "LEAST_PRIVILEGE",
      project_asset_selection_verified: true,
    },
  });
  return updated;
}

if (!ProductionTaskRuntime[INSTALL_FLAG]) {
  const dispatchWithoutIsolation = ProductionTaskRuntime.dispatch.bind(
    ProductionTaskRuntime,
  );
  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });
  ProductionTaskRuntime.dispatch = async function dispatchWithStrictShotAssetIsolation(id) {
    const task = await ProductionTaskRuntime.get(id);
    if (!task) throw new Error("Production task not found");
    const verified = await enforce(task);
    return dispatchWithoutIsolation(verified.id);
  };
}

export const CreativeShotAssetIsolationExecutionGate = {
  installed: true,
  evidence,
  enforce,
  verifiedMaterializationContract,
  repairAliasEvidence,
  graphRepairAliasEvidence,
  projectScopedCreativeAssets,
};

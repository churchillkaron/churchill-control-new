import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  CreativeShotAssetScopeRuntime,
} from "@/lib/creative/assets/isolation/runtime/CreativeShotAssetScopeRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.strict-shot-asset-isolation-gate.v2",
);

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

function collectInputMedia(value, output = [], key = "", path = "input", seen = new Set()) {
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
    if (/provider_prompt|prompt|description|instructions|negative/i.test(childKey)) continue;
    collectInputMedia(child, output, childKey, `${path}.${childKey}`, seen);
  }
  return output;
}

function collectInputIds(value, output, key = "", path = "input", seen = new Set()) {
  if (value === null || value === undefined) return output;
  const creativeKey = CreativeShotAssetScopeRuntime.creativeAssetKey(key);
  const assetNodeKey = CreativeShotAssetScopeRuntime.assetNodeKey(key);
  const productionNodeKey = CreativeShotAssetScopeRuntime.productionNodeKey(key);

  if (typeof value === "string") {
    if (creativeKey) output.creative.push({ path, id: text(value) });
    if (assetNodeKey) output.assetNodes.push({ path, id: text(value) });
    if (productionNodeKey) output.productionNodes.push({ path, id: text(value) });
    return output;
  }
  if (typeof value !== "object" || seen.has(value)) return output;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const id = text(item?.asset_id || item?.assetId || item?.id || item);
      if (creativeKey && id) output.creative.push({ path: `${path}[${index}]`, id });
      if (assetNodeKey && id) output.assetNodes.push({ path: `${path}[${index}]`, id });
      if (productionNodeKey && id) output.productionNodes.push({ path: `${path}[${index}]`, id });
      if (!creativeKey && !assetNodeKey && !productionNodeKey) {
        collectInputIds(item, output, key, `${path}[${index}]`, seen);
      }
    });
    return output;
  }
  for (const [childKey, child] of Object.entries(value)) {
    if (/provider_prompt|prompt|description|instructions/i.test(childKey)) continue;
    collectInputIds(child, output, childKey, `${path}.${childKey}`, seen);
  }
  return output;
}

async function projectReferenceExists(task, creativeAssetId) {
  const nodes = await AssetGraphRepository.listByProject({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
  });
  return nodes.some((node) =>
    text(node.creative_asset_id) === text(creativeAssetId) &&
    node.metadata?.project_asset_reference === true &&
    node.metadata?.selected_for_project === true &&
    text(node.status).toUpperCase() !== "ARCHIVED"
  );
}

async function creativeAssetUrls(task, ids) {
  const urls = new Set();
  for (const id of ids) {
    const asset = await CreativeAssetsRuntime.get(id);
    if (!asset || String(asset.organization_id) !== String(task.organization_id)) {
      throw new Error(`SHOT_ASSET_SCOPE_CREATIVE_ASSET_NOT_FOUND:${id}`);
    }
    const projectId = asset.creative_project_id || asset.project_id || null;
    if (
      projectId &&
      String(projectId) !== String(task.creative_project_id) &&
      !(await projectReferenceExists(task, id))
    ) {
      throw new Error(`SHOT_ASSET_SCOPE_CREATIVE_ASSET_PROJECT_MISMATCH:${id}`);
    }
    const url = mediaUrl(asset);
    if (url) urls.add(url);
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

async function dependencyEvidence(task, allowedNodeIds) {
  const urls = new Set();
  const taskIds = new Set();
  for (const dependencyTaskId of list(task.depends_on)) {
    const dependency = await ProductionTaskRuntime.get(dependencyTaskId);
    if (!dependency) throw new Error(`SHOT_ASSET_SCOPE_DEPENDENCY_TASK_NOT_FOUND:${dependencyTaskId}`);
    const executionNodeId = text(dependency.metadata?.execution_node_id);
    if (!executionNodeId || !allowedNodeIds.has(executionNodeId)) {
      throw new Error(`SHOT_ASSET_SCOPE_DEPENDENCY_NODE_NOT_AUTHORIZED:${executionNodeId || dependencyTaskId}`);
    }
    taskIds.add(dependency.id);
    for (const url of collectOutputUrls(outputValue(dependency.output))) urls.add(url);
  }
  return { urls, taskIds };
}

function assertSubset(entries, allowed, errorCode) {
  const unauthorized = entries.filter((entry) => !allowed.has(entry.id));
  if (unauthorized.length) {
    throw new Error(
      `${errorCode}:${unauthorized.map((entry) => `${entry.path}=${entry.id}`).join(",")}`,
    );
  }
}

async function enforce(task = {}) {
  const scope = object(task.input?.requirements?.asset_scope);
  if (!CreativeShotAssetScopeRuntime.verify(scope)) {
    throw new Error("STRICT_SHOT_ASSET_SCOPE_REQUIRED");
  }
  if (text(task.metadata?.asset_scope_hash) !== text(scope.scope_hash)) {
    throw new Error("STRICT_SHOT_ASSET_SCOPE_HASH_MISMATCH");
  }

  const creativeIds = new Set(list(scope.creative_asset_ids).map(text));
  const assetNodeIds = new Set(list(scope.asset_node_ids).map(text));
  const productionNodeIds = new Set(
    list(scope.authorized_production_node_ids).map(text),
  );
  const allowedUrls = new Set(list(scope.allowed_media_references).map(text));

  for (const url of await creativeAssetUrls(task, creativeIds)) allowedUrls.add(url);
  for (const url of await assetNodeUrls(task, assetNodeIds)) allowedUrls.add(url);
  const dependencies = await dependencyEvidence(task, productionNodeIds);
  for (const url of dependencies.urls) allowedUrls.add(url);

  const ids = collectInputIds(task.input, {
    creative: [],
    assetNodes: [],
    productionNodes: [],
  });
  assertSubset(ids.creative, creativeIds, "UNSCOPED_CREATIVE_ASSET_BLOCKED");
  assertSubset(ids.assetNodes, assetNodeIds, "UNSCOPED_ASSET_NODE_BLOCKED");
  assertSubset(
    ids.productionNodes,
    productionNodeIds,
    "UNSCOPED_PRODUCTION_NODE_BLOCKED",
  );

  const media = collectInputMedia(task.input);
  const unauthorizedMedia = media.filter((entry) => !allowedUrls.has(entry.url));
  if (unauthorizedMedia.length) {
    throw new Error(
      `UNSCOPED_PROVIDER_MEDIA_BLOCKED:${unauthorizedMedia.map((entry) => `${entry.path}=${entry.url}`).join(",")}`,
    );
  }

  const updated = await ProductionTaskRuntime.update(task.id, {
    input: {
      ...object(task.input),
      asset_scope: {
        contract: scope.contract,
        scope_hash: scope.scope_hash,
        creative_asset_ids: [...creativeIds],
        asset_node_ids: [...assetNodeIds],
        dependency_node_ids: [...productionNodeIds],
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
      project_asset_pool_exposed: false,
      organization_asset_pool_exposed: false,
      provider_input_mode: "LEAST_PRIVILEGE",
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
  enforce,
};

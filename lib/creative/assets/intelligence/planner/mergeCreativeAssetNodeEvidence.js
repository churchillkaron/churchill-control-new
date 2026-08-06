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

function uniqueStrings(values = []) {
  return [...new Set(
    values
      .flat(Infinity)
      .map((value) => text(value))
      .filter(Boolean),
  )];
}

function uniqueObjects(values = []) {
  const result = [];
  const seen = new Set();

  for (const value of values.flat(Infinity)) {
    if (!value) continue;
    const key = typeof value === "object"
      ? JSON.stringify(value)
      : text(value).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }

  return result;
}

function meaningful(value) {
  const source = text(value)
    .replace(/\.(jpg|jpeg|png|webp|heic|avif|mp4|mov|m4v|webm|mkv)$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();

  if (source.length < 3) return "";
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(source)) return "";
  if (/^(img|dsc|photo|video|file|asset|image|clip)[ -]?\d+$/i.test(source)) return "";
  if (/^\d+$/.test(source)) return "";
  return source;
}

function nodeSourceAnalysis(node = {}) {
  return object(
    node.intelligence?.source_asset_analysis ||
    node.metadata?.source_asset_analysis ||
    node.metadata?.source_asset_metadata?.analysis,
  );
}

function nodeIntelligence(node = {}) {
  const sourceAnalysis = nodeSourceAnalysis(node);
  return {
    ...object(sourceAnalysis.intelligence),
    ...object(node.intelligence),
  };
}

function observations(node = {}, type) {
  const sourceAnalysis = nodeSourceAnalysis(node);
  const intelligence = nodeIntelligence(node);
  const names = type === "people"
    ? ["detected_people", "people", "persons", "subjects"]
    : type === "products"
      ? ["detected_products", "products", "objects"]
      : ["detected_locations", "locations", "venues"];

  return uniqueObjects(names.flatMap((name) => [
    sourceAnalysis[name],
    intelligence[name],
  ]));
}

function nodeSemanticEvidence(node = {}) {
  const sourceAnalysis = nodeSourceAnalysis(node);
  const intelligence = nodeIntelligence(node);
  const people = observations(node, "people");
  const products = observations(node, "products");
  const locations = observations(node, "locations");
  const descriptions = uniqueStrings([
    meaningful(node.description),
    meaningful(sourceAnalysis.description),
    meaningful(sourceAnalysis.summary),
    meaningful(sourceAnalysis.caption),
    meaningful(sourceAnalysis.scene_description),
    meaningful(intelligence.description),
    meaningful(intelligence.summary),
    meaningful(intelligence.caption),
    meaningful(intelligence.scene_description),
    meaningful(intelligence.content_description),
  ]);
  const tags = uniqueStrings([
    sourceAnalysis.tags,
    intelligence.tags,
    intelligence.labels,
    intelligence.categories,
  ]);

  return {
    description: descriptions[0] || "",
    summary: descriptions[1] || descriptions[0] || "",
    descriptions,
    tags,
    people,
    products,
    locations,
    source_analysis: sourceAnalysis,
    intelligence,
    present: Boolean(
      descriptions.length ||
      tags.length ||
      people.length ||
      products.length ||
      locations.length,
    ),
  };
}

function sourceNode(node = {}) {
  return (
    node.metadata?.project_asset_reference === true ||
    node.metadata?.canonical_source_node === true ||
    text(node.lineage?.source) === "project_asset_reference" ||
    text(node.lineage?.source) === "creative_asset_record"
  );
}

function nodeScore(node = {}) {
  const evidence = nodeSemanticEvidence(node);
  const status = text(node.status).toUpperCase();
  return (
    (sourceNode(node) ? 200 : -200) +
    (node.metadata?.project_asset_reference === true ? 80 : 0) +
    (node.review?.approved === true ? 60 : 0) +
    (status === "APPROVED" ? 40 : 0) +
    (status === "IMPORTED" ? 20 : 0) +
    (evidence.present ? 100 : 0) +
    (node.parent_asset_node_id ? 10 : 0) +
    (["ARCHIVED", "REJECTED", "FAILED", "DELETED"].includes(status) ? -1000 : 0)
  );
}

function bestNode(nodes = []) {
  return list(nodes)
    .filter(sourceNode)
    .filter((node) => nodeScore(node) > 0)
    .sort((left, right) => nodeScore(right) - nodeScore(left))[0] || null;
}

function mergeAnalysis(asset = {}, node = {}) {
  const current = object(asset.analysis);
  const currentIntelligence = object(current.intelligence);
  const evidence = nodeSemanticEvidence(node);
  const sourceAnalysis = evidence.source_analysis;
  const recoveredFields = [];

  const description = text(current.description) || evidence.description;
  if (!text(current.description) && description) recoveredFields.push("description");

  const summary = text(current.summary) || evidence.summary;
  if (!text(current.summary) && summary) recoveredFields.push("summary");

  const tags = uniqueStrings([
    current.tags,
    asset.tags,
    evidence.tags,
  ]);
  if (tags.length > list(current.tags).length) recoveredFields.push("tags");

  const detectedPeople = uniqueObjects([
    current.detected_people,
    current.people,
    currentIntelligence.detected_people,
    evidence.people,
  ]);
  if (detectedPeople.length > list(current.detected_people).length) {
    recoveredFields.push("detected_people");
  }

  const detectedProducts = uniqueObjects([
    current.detected_products,
    current.products,
    current.objects,
    currentIntelligence.detected_products,
    evidence.products,
  ]);
  if (detectedProducts.length > list(current.detected_products).length) {
    recoveredFields.push("detected_products");
  }

  const detectedLocations = uniqueObjects([
    current.detected_locations,
    current.locations,
    currentIntelligence.detected_locations,
    evidence.locations,
  ]);
  if (detectedLocations.length > list(current.detected_locations).length) {
    recoveredFields.push("detected_locations");
  }

  const faces = uniqueObjects([
    current.faces,
    current.face_annotations,
    current.faceAnnotations,
    current.vision?.faces,
    currentIntelligence.faces,
    sourceAnalysis.faces,
    sourceAnalysis.face_annotations,
    sourceAnalysis.faceAnnotations,
    sourceAnalysis.vision?.faces,
    evidence.intelligence.faces,
    evidence.intelligence.face_annotations,
  ]);
  if (faces.length > list(current.faces).length) recoveredFields.push("faces");

  return {
    analysis: {
      ...sourceAnalysis,
      ...current,
      status:
        current.status ||
        sourceAnalysis.status ||
        (evidence.present ? "ANALYSED" : undefined),
      description: description || undefined,
      summary: summary || undefined,
      tags,
      detected_people: detectedPeople,
      detected_products: detectedProducts,
      detected_locations: detectedLocations,
      faces,
      vision: {
        ...object(sourceAnalysis.vision),
        ...object(current.vision),
        faces: list(current.vision?.faces).length
          ? current.vision.faces
          : faces,
      },
      intelligence: {
        ...object(sourceAnalysis.intelligence),
        ...evidence.intelligence,
        ...currentIntelligence,
        detected_people: detectedPeople,
        detected_products: detectedProducts,
        detected_locations: detectedLocations,
        tags: uniqueStrings([
          sourceAnalysis.intelligence?.tags,
          evidence.intelligence.tags,
          currentIntelligence.tags,
          tags,
        ]),
      },
    },
    recovered_fields: uniqueStrings(recoveredFields),
    evidence_present: evidence.present,
  };
}

export function mergeCreativeAssetNodeEvidence({
  assets = [],
  nodes = [],
  creative_project_id,
} = {}) {
  const projectId = text(creative_project_id);
  if (!projectId) throw new Error("CREATIVE_ASSET_NODE_EVIDENCE_PROJECT_REQUIRED");

  const nodesByAsset = new Map();
  for (const node of list(nodes)) {
    if (text(node.creative_project_id) !== projectId) continue;
    const assetId = text(
      node.creative_asset_id ||
      node.metadata?.source_creative_asset_id,
    );
    if (!assetId) continue;
    if (!nodesByAsset.has(assetId)) nodesByAsset.set(assetId, []);
    nodesByAsset.get(assetId).push(node);
  }

  return list(assets).map((asset) => {
    const assetId = text(asset.id || asset.asset_id);
    const node = bestNode(nodesByAsset.get(assetId));
    if (!node) return asset;

    const merged = mergeAnalysis(asset, node);
    if (!merged.evidence_present) return asset;

    return {
      ...asset,
      analysis: merged.analysis,
      analysis_status:
        asset.analysis_status ||
        merged.analysis.status ||
        "ANALYSED",
      metadata: {
        ...object(asset.metadata),
        project_asset_node_evidence: {
          contract: "PROJECT_ASSET_NODE_EVIDENCE_V1",
          recovered: true,
          creative_project_id: projectId,
          asset_node_id: node.id,
          source_asset_node_id:
            node.metadata?.source_asset_node_id ||
            node.parent_asset_node_id ||
            null,
          recovered_fields: merged.recovered_fields,
          read_only_projection: true,
        },
      },
    };
  });
}

export const CreativeAssetNodeEvidencePlanner = Object.freeze({
  merge: mergeCreativeAssetNodeEvidence,
});

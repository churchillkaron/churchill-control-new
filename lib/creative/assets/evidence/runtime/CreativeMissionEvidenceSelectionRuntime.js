const MAXIMUM_SELECTED_ASSETS = 16;

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "against",
  "also",
  "because",
  "before",
  "being",
  "between",
  "build",
  "complete",
  "create",
  "creative",
  "from",
  "have",
  "into",
  "make",
  "only",
  "original",
  "package",
  "premium",
  "production",
  "project",
  "release",
  "selected",
  "should",
  "supplied",
  "their",
  "there",
  "these",
  "this",
  "through",
  "using",
  "with",
  "without",
]);

const ROLE_PATTERNS = Object.freeze({
  LOCATION: /\b(location|place|site|space|entrance|exterior|interior|architecture|structure|facade|doorway|room|street|environment|scene plate|source plate)\b/i,
  IDENTITY: /\b(identity|person|portrait|individual|group|team|subject|talent|cast|character|people|human)\b/i,
  WARDROBE: /\b(wardrobe|uniform|clothing|costume|outfit|apparel|garment|styling)\b/i,
  PRODUCT: /\b(product|object|item|packaging|prop|equipment|material|device|artifact)\b/i,
  BRAND: /\b(brand|logo|wordmark|emblem|signage|sign|label|mark|identity system)\b/i,
  TEXT: /\b(text|copy|title|caption|label|typography|wording|written content)\b/i,
  STYLE: /\b(style|mood|lighting|colour|color|composition|visual language|aesthetic|treatment)\b/i,
});

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function words(value) {
  return unique(
    text(value)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)),
  );
}

function objectText(value) {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") {
    return text(value);
  }
  try {
    return text(JSON.stringify(value));
  } catch {
    return "";
  }
}

function assetId(asset = {}) {
  return text(
    asset.id ||
    asset.asset_id ||
    asset.creative_asset_id ||
    asset.source_asset_id ||
    asset.reference_asset_id,
  );
}

function assetUrl(asset = {}) {
  return text(
    asset.image_url ||
    asset.file_url ||
    asset.url ||
    asset.thumbnail_url,
  );
}

function assetSearchText(asset = {}) {
  return [
    asset.name,
    asset.title,
    asset.file_name,
    asset.filename,
    asset.description,
    asset.caption,
    ...list(asset.tags),
    ...list(asset.labels),
    ...list(asset.reference_roles),
    ...list(asset.evidence_roles),
    asset.analysis?.subject,
    asset.analysis?.summary,
    asset.analysis?.description,
    asset.analysis?.classification,
    ...list(asset.analysis?.objects),
    ...list(asset.analysis?.tags),
    asset.metadata?.name,
    asset.metadata?.title,
    asset.metadata?.description,
    ...list(asset.metadata?.tags),
    ...list(asset.metadata?.reference_roles),
    ...list(asset.metadata?.evidence_roles),
  ].map(objectText).filter(Boolean).join(" ");
}

function inferRoles(value) {
  const source = text(value);
  return Object.entries(ROLE_PATTERNS)
    .filter(([, pattern]) => pattern.test(source))
    .map(([role]) => role);
}

function missionContext({ request, blueprint, business_truth }) {
  const organization = business_truth?.organization || {};
  const locations = list(business_truth?.locations);
  const identityPhrases = unique([
    organization.name,
    organization.legal_name,
    organization.trading_name,
    ...locations.map((location) => location.name),
  ]).map((value) => value.toLowerCase());
  const identityTokens = new Set(identityPhrases.flatMap(words));
  const source = [
    request,
    blueprint?.title,
    blueprint?.objective,
    blueprint?.business_goal,
    blueprint?.creative_thesis,
    blueprint?.story_thesis,
    organization.name,
    organization.legal_name,
    organization.trading_name,
    organization.description,
    organization.industry,
    organization.address,
    organization.city,
    ...locations.flatMap((location) => [
      location.name,
      location.type,
      location.description,
      location.address,
      location.city,
    ]),
    ...list(blueprint?.deliverables).flatMap((deliverable) => [
      deliverable.title,
      deliverable.description,
      deliverable.medium,
      deliverable.specifications,
      deliverable.success_criteria,
    ]),
  ].map(objectText).filter(Boolean).join(" ");

  return {
    source,
    tokens: new Set(words(source)),
    requested_roles: inferRoles(source),
    identity_phrases: identityPhrases.filter((value) => value.length >= 3),
    identity_tokens: identityTokens,
  };
}

function approval(asset = {}, explicit = false) {
  if (explicit) return true;
  if (asset.approved_reference === true) return true;
  if (asset.approved === true) return true;
  if (asset.review?.approved === true) return true;
  if (asset.metadata?.approved_reference === true) return true;
  if (asset.metadata?.approved_for_reuse === true) return true;
  return ["APPROVED", "ACTIVE", "READY"].includes(
    text(asset.status).toUpperCase(),
  );
}

function scoreCandidate(asset, context, explicit = false) {
  const searchable = assetSearchText(asset);
  const lower = searchable.toLowerCase();
  const candidateTokens = new Set(words(searchable));
  const roles = unique([
    ...list(asset.reference_roles),
    ...list(asset.evidence_roles),
    ...inferRoles(searchable),
  ]).map((role) => role.toUpperCase());
  const overlap = [...candidateTokens].filter((token) => context.tokens.has(token));
  const identityTokenOverlap = [...candidateTokens].filter((token) =>
    context.identity_tokens.has(token),
  );
  const identityPhraseMatch = context.identity_phrases.some((phrase) =>
    lower.includes(phrase),
  );
  const roleOverlap = roles.filter((role) =>
    context.requested_roles.includes(role),
  );
  const approved = approval(asset, explicit);
  const quality = Number(
    asset.analysis?.quality_score ||
    asset.quality_score ||
    asset.score ||
    0,
  );
  const relevant = Boolean(
    explicit ||
    identityPhraseMatch ||
    identityTokenOverlap.length >= 2 ||
    overlap.length >= 3 ||
    (overlap.length >= 2 && roleOverlap.length >= 1) ||
    (asset.favorite === true && overlap.length >= 1 && roleOverlap.length >= 1),
  );
  const score =
    (explicit ? 1000 : 0) +
    (identityPhraseMatch ? 80 : 0) +
    identityTokenOverlap.length * 16 +
    overlap.length * 5 +
    roleOverlap.length * 12 +
    (approved ? 8 : 0) +
    (asset.favorite === true ? 6 : 0) +
    Math.min(5, Math.max(0, quality) / 20);

  return {
    asset,
    id: assetId(asset),
    url: assetUrl(asset),
    explicit,
    approved,
    relevant,
    score,
    roles,
    overlap,
    identity_token_overlap: identityTokenOverlap,
    identity_phrase_match: identityPhraseMatch,
    role_overlap: roleOverlap,
  };
}

function mergeCandidates(supplied_assets, uploaded_assets) {
  const values = [
    ...list(supplied_assets).map((asset) => ({ asset, explicit: true })),
    ...list(uploaded_assets).map((asset) => ({ asset, explicit: false })),
  ];
  const uniqueAssets = new Map();

  for (const entry of values) {
    const id = assetId(entry.asset);
    const url = assetUrl(entry.asset);
    const key = id || url;
    if (!key) continue;

    const existing = uniqueAssets.get(key);
    if (!existing || entry.explicit) {
      uniqueAssets.set(key, entry);
    }
  }

  return [...uniqueAssets.values()];
}

function diversify(scored, maximum) {
  const selected = [];
  const seen = new Set();
  const perRole = new Map();

  function add(candidate) {
    const key = candidate.id || candidate.url;
    if (!key || seen.has(key) || selected.length >= maximum) return;
    seen.add(key);
    selected.push(candidate);
    for (const role of candidate.roles) {
      perRole.set(role, Number(perRole.get(role) || 0) + 1);
    }
  }

  scored.filter((candidate) => candidate.explicit).forEach(add);

  for (const role of Object.keys(ROLE_PATTERNS)) {
    scored
      .filter((candidate) =>
        candidate.roles.includes(role) &&
        Number(perRole.get(role) || 0) < 3,
      )
      .slice(0, 3)
      .forEach(add);
  }

  scored.forEach(add);
  return selected;
}

export const CreativeMissionEvidenceSelectionRuntime = {
  select({
    request = "",
    blueprint = {},
    business_truth = {},
    supplied_assets = [],
    maximum = MAXIMUM_SELECTED_ASSETS,
  } = {}) {
    const context = missionContext({ request, blueprint, business_truth });
    const merged = mergeCandidates(
      supplied_assets,
      business_truth?.assets?.uploaded_references,
    );
    const scored = merged
      .map(({ asset, explicit }) => scoreCandidate(asset, context, explicit))
      .filter((candidate) =>
        candidate.url &&
        candidate.relevant &&
        (candidate.explicit || candidate.approved),
      )
      .sort((left, right) =>
        right.score - left.score ||
        Number(right.asset.favorite === true) - Number(left.asset.favorite === true) ||
        String(right.asset.created_at || "").localeCompare(
          String(left.asset.created_at || ""),
        ),
      );
    const selected = diversify(
      scored,
      Math.max(1, Math.min(32, Number(maximum || MAXIMUM_SELECTED_ASSETS))),
    );

    return {
      version: "CREATIVE_MISSION_EVIDENCE_SELECTION_V4",
      assets: selected.map((candidate) => ({
        ...candidate.asset,
        id: candidate.id || candidate.asset.id || null,
        url: candidate.url,
        reference_roles: candidate.roles,
        evidence_roles: candidate.roles,
        approved_reference: candidate.approved,
        selection: {
          version: "CREATIVE_MISSION_EVIDENCE_SELECTION_V4",
          explicit: candidate.explicit,
          score: Number(candidate.score.toFixed(3)),
          matched_terms: candidate.overlap,
          identity_terms: candidate.identity_token_overlap,
          identity_phrase_match: candidate.identity_phrase_match,
          matched_roles: candidate.role_overlap,
          inferred_roles: candidate.roles,
        },
      })),
      diagnostics: {
        candidate_count: merged.length,
        relevant_approved_count: scored.length,
        selected_count: selected.length,
        requested_roles: context.requested_roles,
        selected_asset_ids: selected.map((candidate) => candidate.id).filter(Boolean),
        rejected_irrelevant_count: merged.length - scored.length,
        arbitrary_fallback_allowed: false,
        industry_specific_runtime_constants: false,
      },
    };
  },
};

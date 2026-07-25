const MAXIMUM_SELECTED_ASSETS = 16;

// CREATIVE_SOURCE_ONLY_MISSION_EVIDENCE_V9

const STOP_WORDS = new Set([
  "about",
  "and",
  "are",
  "for",
  "the",
  "was",
  "were",
  "will",
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
  LOCATION: /\b(location|place|site|space|venue|premises|building|storefront|entrance|exterior|interior|architecture|structure|facade|doorway|room|street|environment|scene plate|source plate)\b/i,
  IDENTITY: /\b(identity|person|portrait|individual|group|team|staff|employee|personnel|workforce|subject|talent|cast|character|people|human|face|headshot)\b/i,
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
    asset.type,
    asset.asset_type,
    asset.ai_suggested_type,
    asset.source_kind,
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
    asset.analysis?.identity,
    asset.analysis?.wardrobe,
    asset.analysis?.text,
    ...list(asset.analysis?.people),
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

function missionContext({
  request,
  blueprint,
  business_truth,
  required_roles = [],
}) {
  const organization = business_truth?.organization || {};
  const locations = list(business_truth?.locations);
  const identityPhrases = unique([
    organization.name,
    organization.legal_name,
    organization.trading_name,
    ...locations.map((location) => location.name),
  ]).map((value) => value.toLowerCase());
  const identityTokens = new Set(identityPhrases.flatMap(words));
  const requiredRoles = unique(list(required_roles))
    .map((role) => role.toUpperCase())
    .filter((role) => Object.hasOwn(ROLE_PATTERNS, role));
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
    required_roles: requiredRoles,
    requested_roles: unique([
      ...requiredRoles,
      ...inferRoles(source),
    ]),
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
  return text(asset.status).toUpperCase() === "APPROVED";
}

// CREATIVE_STRONG_RELEVANCE_MISSION_AUTHORIZATION_V6
function organizationOwnedUpload(asset = {}) {
  const sourceKind = text(asset.source_kind).toUpperCase();
  const sourceScope = text(asset.source_scope).toUpperCase();
  const metadata = asset.metadata || {};
  const sourceUpload = Boolean(
    asset.original_upload === true ||
    sourceKind === "USER_UPLOAD" ||
    sourceScope === "ORGANIZATION_UPLOAD"
  );
  const derived = Boolean(
    asset.ai_generated === true ||
    sourceKind === "GENERATED_OUTPUT" ||
    sourceScope === "CREATIVE_OUTPUT" ||
    asset.provider ||
    asset.engine ||
    metadata.production_task_id ||
    metadata.source_task_id
  );

  return Boolean(
    asset.organization_owned === true &&
    sourceUpload &&
    !derived &&
    asset.archived !== true
  );
}

function isVisualReference(asset = {}) {
  const category = text(
    asset.type ||
    asset.asset_type ||
    asset.ai_suggested_type,
  ).toLowerCase();
  return Boolean(assetUrl(asset)) &&
    !/\b(audio|voice|music|sfx|caption|copy|text|document)\b/.test(category);
}

function candidateRoles(asset = {}, searchable = "") {
  const roles = unique([
    ...list(asset.reference_roles),
    ...list(asset.evidence_roles),
    ...list(asset.metadata?.reference_roles),
    ...list(asset.metadata?.evidence_roles),
    ...inferRoles([
      asset.type,
      asset.asset_type,
      asset.ai_suggested_type,
      searchable,
    ].map(objectText).join(" ")),
  ]).map((role) => role.toUpperCase());

  if (isVisualReference(asset) && roles.includes("IDENTITY")) {
    roles.push("WARDROBE");
  }

  return unique(roles);
}

function scoreCandidate(asset, context, explicit = false) {
  const searchable = assetSearchText(asset);
  const lower = searchable.toLowerCase();
  const candidateTokens = new Set(words(searchable));
  const roles = candidateRoles(asset, searchable);
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
  const strongRelevance = Boolean(
    roleOverlap.length >= 1 &&
    (
      identityPhraseMatch ||
      identityTokenOverlap.length >= 1 ||
      overlap.length >= 1 ||
      roles.length >= 1
    )
  );
  const missionAuthorized = Boolean(
    !explicit &&
    !approved &&
    organizationOwnedUpload(asset) &&
    strongRelevance
  );
  const quality = Number(
    asset.analysis?.quality_score ||
    asset.quality_score ||
    asset.score ||
    0,
  );
  const relevant = Boolean(
    explicit ||
    missionAuthorized ||
    (
      approved &&
      (
        roleOverlap.length >= 1 ||
        identityPhraseMatch ||
        identityTokenOverlap.length >= 1 ||
        overlap.length >= 2
      )
    )
  );
  const score =
    (explicit ? 1000 : 0) +
    (identityPhraseMatch ? 80 : 0) +
    identityTokenOverlap.length * 16 +
    overlap.length * 5 +
    roleOverlap.length * 12 +
    (approved ? 24 : 0) +
    (missionAuthorized ? 36 : 0) +
    (asset.favorite === true ? 6 : 0) +
    Math.min(5, Math.max(0, quality) / 20);

  return {
    asset,
    id: assetId(asset),
    url: assetUrl(asset),
    explicit,
    approved,
    mission_authorized: missionAuthorized,
    approval_basis: explicit
      ? "EXPLICIT_REQUEST_ASSET"
      : approved
        ? "APPROVED_REFERENCE"
        : missionAuthorized
          ? "MISSION_ROLE_MATCHED_ORGANIZATION_UPLOAD"
          : null,
    relevant,
    score,
    roles,
    overlap,
    identity_token_overlap: identityTokenOverlap,
    identity_phrase_match: identityPhraseMatch,
    role_overlap: roleOverlap,
    source_kind: text(asset.source_kind).toUpperCase() || null,
    original_upload: asset.original_upload === true,
    ai_generated: asset.ai_generated === true,
  };
}

function mergeCandidates(
  supplied_assets,
  uploaded_assets,
  approved_reusable_assets,
) {
  const values = [
    ...list(supplied_assets).map((asset) => ({ asset, explicit: true })),
    ...list(uploaded_assets).map((asset) => ({ asset, explicit: false })),
    ...list(approved_reusable_assets).map((asset) => ({
      asset: {
        ...asset,
        approved_reference: asset.approved_for_reuse === true,
      },
      explicit: false,
    })),
  ];
  const uniqueAssets = new Map();

  for (const entry of values) {
    const id = assetId(entry.asset);
    const url = assetUrl(entry.asset);
    const key = url || id;
    if (!key) continue;

    const existing = uniqueAssets.get(key);
    if (!existing || entry.explicit) {
      uniqueAssets.set(key, entry);
    }
  }

  return [...uniqueAssets.values()];
}

function diversify(scored, maximum, preferredRoles = []) {
  const selected = [];
  const seen = new Set();
  const perRole = new Map();

  function add(candidate) {
    const key = candidate.url || candidate.id;
    if (!key || seen.has(key) || selected.length >= maximum) return;
    seen.add(key);
    selected.push(candidate);
    for (const role of candidate.roles) {
      perRole.set(role, Number(perRole.get(role) || 0) + 1);
    }
  }

  scored.filter((candidate) => candidate.explicit).forEach(add);

  const roleOrder = unique([
    ...preferredRoles,
    ...Object.keys(ROLE_PATTERNS),
  ]);

  for (const role of roleOrder) {
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
    required_roles = [],
    maximum = MAXIMUM_SELECTED_ASSETS,
  } = {}) {
    const context = missionContext({
      request,
      blueprint,
      business_truth,
      required_roles,
    });
    const merged = mergeCandidates(
      supplied_assets,
      business_truth?.assets?.uploaded_references,
      business_truth?.assets?.approved_reusable,
    );
    const allScored = merged
      .map(({ asset, explicit }) => scoreCandidate(asset, context, explicit));
    const scored = allScored
      .filter((candidate) =>
        candidate.url &&
        candidate.relevant &&
        (
          candidate.explicit ||
          candidate.approved ||
          candidate.mission_authorized
        ),
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
      context.required_roles,
    );

    return {
      version: "CREATIVE_MISSION_EVIDENCE_SELECTION_V9",
      assets: selected.map((candidate) => ({
        ...candidate.asset,
        id: candidate.id || candidate.asset.id || null,
        url: candidate.url,
        reference_roles: candidate.roles,
        evidence_roles: candidate.roles,
        approved_reference: candidate.approved,
        mission_authorized: candidate.mission_authorized,
        approval_basis: candidate.approval_basis,
        selection: {
          version: "CREATIVE_MISSION_EVIDENCE_SELECTION_V9",
          explicit: candidate.explicit,
          approved_reference: candidate.approved,
          mission_authorized: candidate.mission_authorized,
          approval_basis: candidate.approval_basis,
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
        explicitly_selected_count: selected.filter((candidate) =>
          candidate.explicit
        ).length,
        approved_reference_count: selected.filter((candidate) =>
          candidate.approved
        ).length,
        mission_authorized_upload_count: selected.filter((candidate) =>
          candidate.mission_authorized
        ).length,
        required_roles: context.required_roles,
        requested_roles: context.requested_roles,
        excluded_generated_output_count: allScored.filter((candidate) =>
          candidate.source_kind === "GENERATED_OUTPUT" &&
          !candidate.explicit &&
          !candidate.approved
        ).length,
        // CREATIVE_PRE_SPEND_EVIDENCE_DIAGNOSTICS_V7
        selected_assets: selected.map((candidate) => ({
          id: candidate.id || null,
          name: text(
            candidate.asset.name ||
            candidate.asset.title ||
            candidate.asset.file_name ||
            candidate.asset.filename,
          ) || null,
          approval_basis: candidate.approval_basis,
          score: Number(candidate.score.toFixed(3)),
          inferred_roles: candidate.roles,
          matched_roles: candidate.role_overlap,
          matched_terms: candidate.overlap,
          identity_terms: candidate.identity_token_overlap,
          identity_phrase_match: candidate.identity_phrase_match,
          source_kind: candidate.source_kind,
          original_upload: candidate.original_upload,
          ai_generated: candidate.ai_generated,
        })),
        selected_asset_ids: selected.map((candidate) => candidate.id).filter(Boolean),
        rejected_irrelevant_count: merged.length - scored.length,
        arbitrary_fallback_allowed: false,
        industry_specific_runtime_constants: false,
      },
    };
  },
};

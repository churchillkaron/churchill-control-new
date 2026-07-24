const CONTRACT_VERSION = "CREATIVE_EVIDENCE_ROLE_CONTRACT_V1";

export const CREATIVE_EVIDENCE_ROLES = Object.freeze({
  LOCATION: "LOCATION",
  BRAND: "BRAND",
  IDENTITY: "IDENTITY",
  WARDROBE: "WARDROBE",
  PRODUCT: "PRODUCT",
  STYLE: "STYLE",
  TEXT: "TEXT",
});

const ROLE_ORDER = [
  CREATIVE_EVIDENCE_ROLES.LOCATION,
  CREATIVE_EVIDENCE_ROLES.IDENTITY,
  CREATIVE_EVIDENCE_ROLES.WARDROBE,
  CREATIVE_EVIDENCE_ROLES.PRODUCT,
  CREATIVE_EVIDENCE_ROLES.BRAND,
  CREATIVE_EVIDENCE_ROLES.TEXT,
  CREATIVE_EVIDENCE_ROLES.STYLE,
];

const ROLE_PATTERNS = {
  LOCATION: [
    /\bLOCATION\b/,
    /\bENVIRONMENT\b/,
    /\bENTRANCE\b/,
    /\bEXTERIOR\b/,
    /\bINTERIOR\b/,
    /\bARCHITECTURE\b/,
    /\bBUILDING\b/,
    /\bFACADE\b/,
    /\bDOORWAY\b/,
    /\bSOURCE[ _-]?PLATE\b/,
    /\bSCENE[ _-]?PLATE\b/,
    /\bVENUE\b/,
  ],
  BRAND: [
    /\bBRAND\b/,
    /\bLOGO\b/,
    /\bWORDMARK\b/,
    /\bEMBLEM\b/,
    /\bBRAND[ _-]?MARK\b/,
    /\bSIGNAGE\b/,
  ],
  IDENTITY: [
    /\bIDENTITY\b/,
    /\bPERSON\b/,
    /\bPORTRAIT\b/,
    /\bCAST\b/,
    /\bCHARACTER\b/,
    /\bTALENT\b/,
    /\bEMPLOYEE\b/,
    /\bTEAM\b/,
    /\bSTAFF\b/,
    /\bSUBJECT\b/,
  ],
  WARDROBE: [
    /\bWARDROBE\b/,
    /\bCLOTHING\b/,
    /\bCOSTUME\b/,
    /\bOUTFIT\b/,
    /\bUNIFORM\b/,
    /\bAPPAREL\b/,
    /\bSTYLING\b/,
  ],
  PRODUCT: [
    /\bPRODUCT\b/,
    /\bPACKAGING\b/,
    /\bOBJECT\b/,
    /\bITEM\b/,
    /\bPROP\b/,
    /\bEQUIPMENT\b/,
  ],
  STYLE: [
    /\bSTYLE\b/,
    /\bMOOD\b/,
    /\bLIGHTING\b/,
    /\bCOLOR\b/,
    /\bCOLOUR\b/,
    /\bCOMPOSITION\b/,
    /\bCINEMATOGRAPHY\b/,
    /\bAESTHETIC\b/,
    /\bTREATMENT\b/,
  ],
  TEXT: [
    /\bTEXT\b/,
    /\bTYPOGRAPHY\b/,
    /\bCOPY\b/,
    /\bLABEL\b/,
    /\bTITLE\b/,
    /\bCAPTION\b/,
    /\bMENU\b/,
  ],
};

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value || "").trim();
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

export function creativeEvidenceAssetId(asset = {}) {
  return text(
    asset.id ||
    asset.asset_id ||
    asset.reference_asset_id,
  );
}

export function creativeEvidenceAssetUrl(asset = {}) {
  return (
    asset.image_url ||
    asset.file_url ||
    asset.url ||
    asset.thumbnail_url ||
    null
  );
}

function flattenToken(value) {
  if (typeof value === "string" || typeof value === "number") {
    return text(value);
  }

  if (!value || typeof value !== "object") return "";

  return text(
    value.role ||
    value.type ||
    value.name ||
    value.title ||
    value.description ||
    value.label,
  );
}

export function creativeEvidenceTokens(asset = {}) {
  return unique([
    ...list(asset.reference_roles).map(flattenToken),
    ...list(asset.reference_role).map(flattenToken),
    ...list(asset.roles).map(flattenToken),
    ...list(asset.role).map(flattenToken),
    ...list(asset.tags).map(flattenToken),
    ...list(asset.labels).map(flattenToken),
    ...list(asset.metadata?.reference_roles).map(flattenToken),
    ...list(asset.metadata?.reference_role).map(flattenToken),
    ...list(asset.metadata?.roles).map(flattenToken),
    ...list(asset.metadata?.role).map(flattenToken),
    ...list(asset.metadata?.tags).map(flattenToken),
    ...list(asset.metadata?.labels).map(flattenToken),
    ...list(asset.analysis?.reference_roles).map(flattenToken),
    ...list(asset.analysis?.reference_role).map(flattenToken),
    ...list(asset.analysis?.roles).map(flattenToken),
    ...list(asset.analysis?.role).map(flattenToken),
    ...list(asset.analysis?.tags).map(flattenToken),
    asset.ai_suggested_type,
    asset.asset_type,
    asset.type,
    asset.name,
    asset.title,
    asset.file_name,
    asset.filename,
    asset.description,
    asset.caption,
    asset.metadata?.name,
    asset.metadata?.title,
    asset.metadata?.file_name,
    asset.metadata?.description,
    asset.metadata?.caption,
    asset.analysis?.summary,
    asset.analysis?.description,
    asset.analysis?.classification,
    asset.analysis?.subject,
  ]).map((value) => value.toUpperCase());
}

export function normalizeCreativeEvidenceRole(value) {
  const normalized = text(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!normalized) return null;

  if (/LOCATION|ENVIRONMENT|ENTRANCE|EXTERIOR|INTERIOR|ARCHITECTURE|SOURCE_PLATE|SCENE_PLATE|VENUE/.test(normalized)) {
    return CREATIVE_EVIDENCE_ROLES.LOCATION;
  }
  if (/BRAND|LOGO|WORDMARK|EMBLEM|SIGNAGE/.test(normalized)) {
    return CREATIVE_EVIDENCE_ROLES.BRAND;
  }
  if (/IDENTITY|PERSON|PORTRAIT|CAST|CHARACTER|TALENT|EMPLOYEE|TEAM|STAFF|SUBJECT/.test(normalized)) {
    return CREATIVE_EVIDENCE_ROLES.IDENTITY;
  }
  if (/WARDROBE|CLOTHING|COSTUME|OUTFIT|UNIFORM|APPAREL|STYLING/.test(normalized)) {
    return CREATIVE_EVIDENCE_ROLES.WARDROBE;
  }
  if (/PRODUCT|PACKAGING|OBJECT|ITEM|PROP|EQUIPMENT/.test(normalized)) {
    return CREATIVE_EVIDENCE_ROLES.PRODUCT;
  }
  if (/TEXT|TYPOGRAPHY|COPY|LABEL|TITLE|CAPTION|MENU/.test(normalized)) {
    return CREATIVE_EVIDENCE_ROLES.TEXT;
  }
  if (/STYLE|MOOD|LIGHTING|COLOR|COLOUR|COMPOSITION|CINEMATOGRAPHY|AESTHETIC|TREATMENT/.test(normalized)) {
    return CREATIVE_EVIDENCE_ROLES.STYLE;
  }

  return null;
}

export function classifyCreativeEvidenceRoles(asset = {}) {
  const explicit = unique([
    ...list(asset.evidence_roles),
    ...list(asset.evidence_role),
    ...list(asset.metadata?.evidence_roles),
    ...list(asset.metadata?.evidence_role),
    ...list(asset.analysis?.evidence_roles),
    ...list(asset.analysis?.evidence_role),
  ])
    .map(normalizeCreativeEvidenceRole)
    .filter(Boolean);

  if (explicit.length) return unique(explicit);

  const tokens = creativeEvidenceTokens(asset);
  const roles = [];

  for (const role of ROLE_ORDER) {
    const patterns = ROLE_PATTERNS[role] || [];
    if (tokens.some((token) => patterns.some((pattern) => pattern.test(token)))) {
      roles.push(role);
    }
  }

  return unique(roles);
}

export function isCreativeEvidenceApproved(asset = {}) {
  const values = [
    asset.approved_reference,
    asset.approved,
    asset.status,
    asset.reuse_status,
    asset.metadata?.approved_reference,
    asset.metadata?.approved,
    asset.metadata?.status,
    asset.metadata?.reuse_status,
    asset.analysis?.approved_reference,
    asset.analysis?.approved,
  ];

  if (values.some((value) => value === false)) return false;

  return values.some((value) => (
    value === true ||
    ["APPROVED", "ACTIVE", "READY"].includes(
      String(value || "").toUpperCase(),
    )
  ));
}

function referenceIds(value) {
  return unique(list(value).map((entry) => (
    typeof entry === "string" || typeof entry === "number"
      ? entry
      : entry?.id ||
        entry?.asset_id ||
        entry?.reference_asset_id
  )));
}

function truthyObject(value) {
  if (!value) return false;
  if (typeof value === "string") return Boolean(text(value));
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(value);
}

function containsReferenceLanguage(value) {
  const source = typeof value === "string"
    ? value
    : JSON.stringify(value || {});

  return /EXACT|REFERENCE|PRESERVE|MATCH|IDENTITY|SOURCE[ _-]?PLATE|NEVER[ _-]?CHANGE/i.test(source);
}

function actorIdentityReferences(actor = {}) {
  return referenceIds(
    actor.identity_reference_asset_ids ||
    actor.reference_asset_ids ||
    actor.identity_reference_asset_id ||
    actor.reference_asset_id,
  );
}

function wardrobeReferences(actor = {}) {
  const wardrobe = object(
    actor.wardrobe ||
    actor.costume ||
    actor.clothing ||
    actor.outfit ||
    actor.styling,
  );

  return referenceIds(
    wardrobe.reference_asset_ids ||
    wardrobe.asset_ids ||
    wardrobe.reference_asset_id ||
    actor.wardrobe_reference_asset_ids ||
    actor.wardrobe_reference_asset_id,
  );
}

function productReferences(product = {}) {
  return referenceIds(
    product.reference_asset_ids ||
    product.asset_ids ||
    product.reference_asset_id ||
    product.asset_id,
  );
}

function explicitRequiredRoles(scene = {}, shot = {}) {
  return unique([
    ...list(shot.evidence_requirements?.required_roles),
    ...list(shot.required_evidence_roles),
    ...list(shot.reference_pack?.required_roles),
    ...list(shot.reference_pack?.evidence_roles),
    ...list(scene.evidence_requirements?.required_roles),
    ...list(scene.required_evidence_roles),
    ...list(scene.reference_pack?.required_roles),
  ])
    .map(normalizeCreativeEvidenceRole)
    .filter(Boolean);
}

export function deriveCreativeEvidenceRequirements({
  scene = {},
  shot = {},
  authorized_assets = [],
} = {}) {
  const requirements = new Map();

  function requireRole(role, reason, options = {}) {
    const normalized = normalizeCreativeEvidenceRole(role);
    if (!normalized) return;

    const existing = requirements.get(normalized) || {
      role: normalized,
      required: true,
      minimum_assets: 1,
      exact_fidelity_required: false,
      authoritative_source_required: false,
      reasons: [],
      explicit_asset_ids: [],
    };

    existing.minimum_assets = Math.max(
      Number(existing.minimum_assets || 1),
      Number(options.minimum_assets || 1),
    );
    existing.exact_fidelity_required = Boolean(
      existing.exact_fidelity_required ||
      options.exact_fidelity_required,
    );
    existing.authoritative_source_required = Boolean(
      existing.authoritative_source_required ||
      options.authoritative_source_required,
    );
    existing.reasons = unique([
      ...existing.reasons,
      reason,
    ]);
    existing.explicit_asset_ids = unique([
      ...existing.explicit_asset_ids,
      ...referenceIds(options.explicit_asset_ids),
    ]);
    requirements.set(normalized, existing);
  }

  for (const role of explicitRequiredRoles(scene, shot)) {
    requireRole(role, "EXPLICIT_REQUIRED_EVIDENCE_ROLE", {
      exact_fidelity_required: role !== CREATIVE_EVIDENCE_ROLES.STYLE,
    });
  }

  const locationReferenceIds = referenceIds([
    shot.location_reference_asset_ids,
    shot.location_reference_asset_id,
    shot.source_plate_asset_id,
    shot.composition_plan?.source_plate_asset_id,
    shot.reference_pack?.location_asset_ids,
    scene.location_reference_asset_ids,
    scene.location_reference_asset_id,
    scene.source_plate_asset_id,
  ]);
  const locationSpec = shot.location || scene.location;
  if (
    locationReferenceIds.length ||
    shot.location_exact === true ||
    scene.location_exact === true ||
    shot.reference_pack?.exact_location_required === true ||
    shot.composition_plan?.source_plate_asset_id ||
    (truthyObject(locationSpec) && containsReferenceLanguage(locationSpec))
  ) {
    requireRole(CREATIVE_EVIDENCE_ROLES.LOCATION, "LOCATION_FIDELITY_DECLARED", {
      exact_fidelity_required: true,
      authoritative_source_required: true,
      explicit_asset_ids: locationReferenceIds,
    });
  }

  const brandReferenceIds = referenceIds([
    shot.brand_reference_asset_ids,
    shot.brand_reference_asset_id,
    shot.reference_pack?.brand_asset_ids,
    scene.brand_reference_asset_ids,
    scene.brand_reference_asset_id,
  ]);
  if (
    brandReferenceIds.length ||
    shot.brand_exact === true ||
    scene.brand_exact === true ||
    shot.reference_pack?.exact_brand_required === true ||
    shot.composition_plan?.exact_brand_overlay_required === true ||
    list(shot.brand_rules).length ||
    list(scene.brand_rules).length
  ) {
    requireRole(CREATIVE_EVIDENCE_ROLES.BRAND, "BRAND_FIDELITY_DECLARED", {
      exact_fidelity_required: true,
      explicit_asset_ids: brandReferenceIds,
    });
  }

  const actors = [
    ...list(scene.actors),
    ...list(shot.actors),
    ...list(scene.casting?.actors),
    ...list(shot.casting?.actors),
  ];
  const identityReferenceIds = unique(
    actors.flatMap(actorIdentityReferences),
  );
  const identityRequired = actors.some((actor) => (
    String(
      actor.identity_mode ||
      actor.identityMode ||
      "",
    ).toUpperCase() === "REFERENCE_IDENTITY"
  ));

  if (identityRequired || identityReferenceIds.length) {
    requireRole(CREATIVE_EVIDENCE_ROLES.IDENTITY, "REFERENCE_IDENTITY_DECLARED", {
      exact_fidelity_required: true,
      explicit_asset_ids: identityReferenceIds,
    });
  }

  const wardrobeReferenceIds = unique(
    actors.flatMap(wardrobeReferences),
  );
  const wardrobeDeclared = actors.some((actor) => {
    const wardrobe =
      actor.wardrobe ||
      actor.costume ||
      actor.clothing ||
      actor.outfit ||
      actor.styling ||
      actor.uniform;

    return Boolean(
      wardrobeReferenceIds.length ||
      actor.wardrobe_exact === true ||
      (truthyObject(wardrobe) && containsReferenceLanguage(wardrobe)),
    );
  }) || shot.wardrobe_exact === true || scene.wardrobe_exact === true;

  if (wardrobeDeclared || wardrobeReferenceIds.length) {
    requireRole(CREATIVE_EVIDENCE_ROLES.WARDROBE, "WARDROBE_FIDELITY_DECLARED", {
      exact_fidelity_required: true,
      explicit_asset_ids: wardrobeReferenceIds,
    });
  }

  const products = [
    ...list(scene.products),
    ...list(shot.products),
  ];
  const productReferenceIds = unique(
    products.flatMap(productReferences),
  );
  const productExact = products.some((product) => (
    product.exact === true ||
    product.reference_required === true ||
    containsReferenceLanguage(product)
  ));

  if (
    productReferenceIds.length ||
    productExact ||
    shot.product_exact === true ||
    scene.product_exact === true
  ) {
    requireRole(CREATIVE_EVIDENCE_ROLES.PRODUCT, "PRODUCT_FIDELITY_DECLARED", {
      exact_fidelity_required: true,
      explicit_asset_ids: productReferenceIds,
    });
  }

  const textReferenceIds = referenceIds([
    shot.text_reference_asset_ids,
    shot.text_reference_asset_id,
    shot.typography_reference_asset_ids,
    shot.typography_reference_asset_id,
  ]);
  if (
    textReferenceIds.length ||
    shot.exact_text_required === true ||
    shot.typography_exact === true ||
    shot.generated_text_allowed === false && truthyObject(shot.visible_text)
  ) {
    requireRole(CREATIVE_EVIDENCE_ROLES.TEXT, "EXACT_VISIBLE_TEXT_DECLARED", {
      exact_fidelity_required: true,
      explicit_asset_ids: textReferenceIds,
    });
  }

  const styleReferenceIds = referenceIds([
    shot.style_reference_asset_ids,
    shot.style_reference_asset_id,
    scene.style_reference_asset_ids,
    scene.style_reference_asset_id,
  ]);
  if (
    styleReferenceIds.length ||
    shot.style_exact === true ||
    scene.style_exact === true
  ) {
    requireRole(CREATIVE_EVIDENCE_ROLES.STYLE, "STYLE_FIDELITY_DECLARED", {
      exact_fidelity_required: false,
      explicit_asset_ids: styleReferenceIds,
    });
  }

  for (const asset of list(authorized_assets)) {
    const assetId = creativeEvidenceAssetId(asset);
    const roles = classifyCreativeEvidenceRoles(asset);

    for (const role of roles) {
      requireRole(role, "AUTHORIZED_REFERENCE_ROLE", {
        exact_fidelity_required:
          role !== CREATIVE_EVIDENCE_ROLES.STYLE,
        authoritative_source_required:
          role === CREATIVE_EVIDENCE_ROLES.LOCATION,
        explicit_asset_ids: assetId ? [assetId] : [],
      });
    }
  }

  return [...requirements.values()].sort(
    (left, right) =>
      ROLE_ORDER.indexOf(left.role) -
      ROLE_ORDER.indexOf(right.role),
  );
}

export function buildCreativeEvidenceRoleManifest({
  scene = {},
  shot = {},
  assets = [],
  authorized_asset_ids = [],
} = {}) {
  const authorizedIds = new Set(referenceIds(authorized_asset_ids));
  const authorizedAssets = list(assets).filter((asset) =>
    authorizedIds.has(creativeEvidenceAssetId(asset)),
  );
  const requirements = deriveCreativeEvidenceRequirements({
    scene,
    shot,
    authorized_assets: authorizedAssets,
  });
  const bindings = [];
  const blockers = [];

  for (const requirement of requirements) {
    const candidates = list(assets)
      .filter((asset) =>
        classifyCreativeEvidenceRoles(asset).includes(requirement.role),
      )
      .sort((left, right) => {
        const leftId = creativeEvidenceAssetId(left);
        const rightId = creativeEvidenceAssetId(right);
        const leftExplicit = requirement.explicit_asset_ids.includes(leftId) ? 1 : 0;
        const rightExplicit = requirement.explicit_asset_ids.includes(rightId) ? 1 : 0;
        const leftAuthorized = authorizedIds.has(leftId) ? 1 : 0;
        const rightAuthorized = authorizedIds.has(rightId) ? 1 : 0;
        const leftApproved = isCreativeEvidenceApproved(left) ? 1 : 0;
        const rightApproved = isCreativeEvidenceApproved(right) ? 1 : 0;

        return (
          rightExplicit - leftExplicit ||
          rightAuthorized - leftAuthorized ||
          rightApproved - leftApproved ||
          leftId.localeCompare(rightId)
        );
      });
    const selected = candidates.filter((asset) => {
      const id = creativeEvidenceAssetId(asset);
      return (
        requirement.explicit_asset_ids.includes(id) ||
        authorizedIds.has(id) ||
        isCreativeEvidenceApproved(asset)
      );
    });
    const selectedAssets = selected.length
      ? selected.slice(0, Math.max(requirement.minimum_assets, 3))
      : candidates.slice(0, Math.max(requirement.minimum_assets, 3));
    const selectedIds = selectedAssets
      .map(creativeEvidenceAssetId)
      .filter(Boolean);
    const approvedSelectedIds = selectedAssets
      .filter(isCreativeEvidenceApproved)
      .map(creativeEvidenceAssetId)
      .filter(Boolean);
    const explicitMissing = requirement.explicit_asset_ids.filter(
      (id) => !selectedIds.includes(id),
    );
    const complete =
      selectedIds.length >= requirement.minimum_assets &&
      explicitMissing.length === 0 &&
      (
        !requirement.exact_fidelity_required ||
        approvedSelectedIds.length >= requirement.minimum_assets ||
        requirement.explicit_asset_ids.every((id) => selectedIds.includes(id))
      );

    if (!complete) {
      blockers.push(`REQUIRED_EVIDENCE_ROLE_${requirement.role}_INCOMPLETE`);
    }

    bindings.push({
      role: requirement.role,
      required: true,
      complete,
      minimum_assets: requirement.minimum_assets,
      exact_fidelity_required: requirement.exact_fidelity_required,
      authoritative_source_required: requirement.authoritative_source_required,
      reasons: requirement.reasons,
      explicit_asset_ids: requirement.explicit_asset_ids,
      selected_asset_ids: selectedIds,
      approved_selected_asset_ids: approvedSelectedIds,
      missing_explicit_asset_ids: explicitMissing,
      candidate_asset_ids: candidates
        .map(creativeEvidenceAssetId)
        .filter(Boolean),
    });
  }

  const authoritativeLocation = bindings.find(
    (binding) =>
      binding.role === CREATIVE_EVIDENCE_ROLES.LOCATION &&
      binding.authoritative_source_required,
  );

  return {
    version: CONTRACT_VERSION,
    complete: blockers.length === 0,
    spend_authorized: blockers.length === 0,
    blockers: unique(blockers),
    required_roles: requirements.map((requirement) => requirement.role),
    bindings,
    authoritative_source_asset_id:
      authoritativeLocation?.explicit_asset_ids?.[0] ||
      authoritativeLocation?.approved_selected_asset_ids?.[0] ||
      authoritativeLocation?.selected_asset_ids?.[0] ||
      null,
    authorized_reference_asset_ids: [...authorizedIds],
    all_selected_asset_ids: unique(
      bindings.flatMap((binding) => binding.selected_asset_ids),
    ),
  };
}

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

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function unique(values = []) {
  return [...new Set(list(values).flat(Infinity).map((value) => text(
    value?.asset_id || value?.assetId || value?.id || value,
  )).filter(Boolean))];
}

function assetId(asset = {}) {
  return text(asset.id || asset.asset_id);
}

function assetKind(asset = {}) {
  const mime = text(
    asset.mime_type ||
    asset.technical?.mime_type ||
    asset.metadata?.mime_type ||
    asset.analysis?.technical?.mime_type,
  ).toLowerCase();
  const type = text(asset.asset_type || asset.type).toLowerCase();
  const source = text(asset.url || asset.file_url || asset.image_url).toLowerCase();

  if (mime.startsWith("audio/") || /audio|music|voice|sfx/.test(type) || /\.(mp3|wav|m4a|aac|flac|ogg|opus)(\?|$)/.test(source)) {
    return "AUDIO";
  }
  if (mime.startsWith("video/") || type.includes("video") || /\.(mp4|mov|m4v|webm|mkv)(\?|$)/.test(source)) {
    return "VIDEO";
  }
  if (mime.startsWith("image/") || type.includes("image") || /\.(jpg|jpeg|png|webp|heic|avif)(\?|$)/.test(source)) {
    return "IMAGE";
  }
  if (/pdf|document|presentation|spreadsheet/.test(`${mime} ${type}`)) return "DOCUMENT";
  return "OTHER";
}

function evidenceText(asset = {}) {
  const analysis = object(asset.analysis);
  const identity = object(analysis.identity);
  return [
    asset.name,
    asset.title,
    asset.file_name,
    asset.description,
    analysis.description,
    analysis.summary,
    identity.name,
    identity.label,
    ...list(asset.tags),
    ...list(analysis.tags),
  ].map(text).filter(Boolean).join(" ").toLowerCase();
}

function faceObservations(asset = {}) {
  const analysis = object(asset.analysis);
  const vision = object(analysis.vision);
  return list(
    analysis.faces ||
    analysis.face_annotations ||
    analysis.faceAnnotations ||
    vision.faces ||
    asset.metadata?.faces,
  );
}

function personObservations(asset = {}) {
  const analysis = object(asset.analysis);
  return list(
    analysis.detected_people ||
    analysis.people ||
    analysis.persons ||
    analysis.subjects ||
    asset.metadata?.people,
  );
}

function productObservations(asset = {}) {
  const analysis = object(asset.analysis);
  return list(
    analysis.detected_products ||
    analysis.products ||
    analysis.product_entities ||
    analysis.product_references ||
    asset.metadata?.products,
  );
}

function brandMarkObservations(asset = {}) {
  const analysis = object(asset.analysis);
  return list(
    analysis.logos ||
    analysis.brand_marks ||
    analysis.brandMarks ||
    analysis.identity?.brand_marks ||
    asset.metadata?.brand_marks,
  );
}

function locationObservations(asset = {}) {
  const analysis = object(asset.analysis);
  return list(
    analysis.locations ||
    analysis.environments ||
    analysis.location_anchors ||
    analysis.locationAnchors ||
    analysis.scene_locations ||
    asset.metadata?.locations,
  );
}

function styleObservations(asset = {}) {
  const analysis = object(asset.analysis);
  return list([
    analysis.style,
    analysis.styles,
    analysis.palette,
    analysis.typography,
    analysis.materials,
    analysis.visual_language,
    analysis.visualLanguage,
    asset.metadata?.style,
  ].flat(Infinity));
}

const CANONICAL_ROLES = new Set([
  "PERSON_IDENTITY_REFERENCE",
  "PRODUCT_IDENTITY_REFERENCE",
  "BRAND_MARK_REFERENCE",
  "LOCATION_REFERENCE",
  "STYLE_REFERENCE",
  "AUDIO_SOURCE",
  "VIDEO_SOURCE",
  "DOCUMENT_SOURCE",
  "UNCLASSIFIED_REFERENCE",
]);

function normalizeDeclaredRole(value) {
  const normalized = text(
    value?.role ||
    value?.type ||
    value?.name ||
    value,
  ).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return CANONICAL_ROLES.has(normalized) ? normalized : null;
}

function declaredRoles(asset = {}) {
  return unique([
    asset.roles,
    asset.reference_roles,
    asset.referenceRoles,
    asset.role,
    asset.asset_role,
    asset.assetRole,
    asset.metadata?.roles,
    asset.metadata?.reference_roles,
    asset.metadata?.referenceRoles,
    asset.analysis?.roles,
    asset.analysis?.semantic_roles,
    asset.analysis?.semanticRoles,
    asset.analysis?.reference_roles,
    asset.analysis?.referenceRoles,
  ].flat(Infinity).map(normalizeDeclaredRole).filter(Boolean));
}

function explicitIdentityGroups(project = {}, brief = {}) {
  return list(
    brief.identity_groups ||
    brief.metadata?.identity_groups ||
    project.metadata?.identity_groups,
  ).map((group, index) => ({
    id: text(group?.id || group?.identity_id || `identity-group-${index + 1}`),
    name: text(group?.name || group?.label || group?.subject || ""),
    asset_ids: unique(group?.asset_ids || group?.reference_asset_ids || group?.assets),
    primary: group?.primary === true,
  })).filter((group) => group.asset_ids.length);
}

function explicitGroupForAsset(asset, groups = []) {
  const id = assetId(asset);
  return groups.find((group) => group.asset_ids.includes(id)) || null;
}

function identityKey(asset = {}, groups = []) {
  const explicit = explicitGroupForAsset(asset, groups);
  if (explicit) return `explicit:${explicit.id}`;

  const analysis = object(asset.analysis);
  const identity = object(analysis.identity);
  const person = personObservations(asset)[0] || {};
  const key = text(
    identity.id ||
    identity.identity_id ||
    identity.name ||
    analysis.identity_id ||
    analysis.person_id ||
    analysis.face_cluster_id ||
    person.id ||
    person.person_id ||
    person.name ||
    asset.metadata?.identity_id ||
    asset.metadata?.person_id ||
    asset.metadata?.subject_id,
  ).toLowerCase();

  return key ? `resolved:${key}` : `unresolved:${assetId(asset)}`;
}

function angleFromPose(face = {}) {
  const yaw = finite(
    face.panAngle ??
    face.pan_angle ??
    face.yaw ??
    face.yaw_angle,
  );
  const pitch = finite(
    face.tiltAngle ??
    face.tilt_angle ??
    face.pitch ??
    face.pitch_angle,
  );
  const roll = finite(
    face.rollAngle ??
    face.roll_angle ??
    face.roll,
  );

  let angle = "UNCLASSIFIED";
  if (yaw !== null) {
    if (yaw <= -55) angle = "LEFT_PROFILE";
    else if (yaw <= -18) angle = "LEFT_THREE_QUARTER";
    else if (yaw >= 55) angle = "RIGHT_PROFILE";
    else if (yaw >= 18) angle = "RIGHT_THREE_QUARTER";
    else angle = "FRONT";
  }

  return {
    angle,
    yaw_degrees: yaw,
    pitch_degrees: pitch,
    roll_degrees: roll,
    detection_confidence: finite(
      face.detectionConfidence ??
      face.detection_confidence ??
      face.confidence,
    ),
    landmarking_confidence: finite(
      face.landmarkingConfidence ??
      face.landmarking_confidence,
    ),
  };
}

function textAngleTags(asset = {}) {
  const source = evidenceText(asset);
  const tags = [];
  if (/\b(front|frontal|straight on|head on)\b/.test(source)) tags.push("FRONT");
  if (/\b(left profile|left side|profile left)\b/.test(source)) tags.push("LEFT_PROFILE");
  if (/\b(right profile|right side|profile right)\b/.test(source)) tags.push("RIGHT_PROFILE");
  if (/\b(left three quarter|left 3\/4|three-quarter left)\b/.test(source)) tags.push("LEFT_THREE_QUARTER");
  if (/\b(right three quarter|right 3\/4|three-quarter right)\b/.test(source)) tags.push("RIGHT_THREE_QUARTER");
  if (/\b(full body|full-length|standing|head to toe)\b/.test(source)) tags.push("FULL_BODY");
  if (/\b(close-up|close up|headshot|portrait|face detail)\b/.test(source)) tags.push("FACE_DETAIL");
  return tags;
}

function bodyCoverage(asset = {}) {
  const source = evidenceText(asset);
  const people = personObservations(asset);
  const explicit = people.map((person) => text(
    person.coverage ||
    person.body_coverage ||
    person.framing,
  ).toUpperCase()).filter(Boolean);
  if (explicit.some((value) => /FULL|HEAD_TO_TOE|WHOLE/.test(value))) return "FULL_BODY";
  if (explicit.some((value) => /THREE_QUARTER|KNEE/.test(value))) return "THREE_QUARTER_BODY";
  if (explicit.some((value) => /HALF|WAIST/.test(value))) return "HALF_BODY";
  if (/\b(full body|full-length|head to toe|standing)\b/.test(source)) return "FULL_BODY";
  if (/\b(half body|waist up|medium shot)\b/.test(source)) return "HALF_BODY";
  if (/\b(close-up|headshot|portrait)\b/.test(source)) return "FACE_ONLY";
  return "UNCLASSIFIED";
}

function qualityEvidence(asset = {}) {
  const analysis = object(asset.analysis);
  const technical = object(analysis.technical || asset.technical);
  const faces = faceObservations(asset);
  const detection = faces
    .map((face) => angleFromPose(face).detection_confidence)
    .filter((value) => value !== null);
  const sharpness = finite(
    analysis.sharpness_score ||
    analysis.quality?.sharpness ||
    technical.sharpness_score,
  );
  const blur = finite(
    analysis.blur_score ||
    analysis.quality?.blur ||
    technical.blur_score,
  );
  const width = finite(technical.width);
  const height = finite(technical.height);
  const pixels = width !== null && height !== null ? width * height : null;
  const occluded = analysis.occluded === true ||
    analysis.face_occluded === true ||
    /\b(face hidden|obscured|occluded)\b/.test(evidenceText(asset));
  const filtered = analysis.beauty_filter_detected === true ||
    analysis.heavy_filter_detected === true ||
    /\b(heavy filter|beauty filter|face filter)\b/.test(evidenceText(asset));

  let score = 50;
  if (detection.length) score += Math.round(
    detection.reduce((sum, value) => sum + value, 0) / detection.length * 25,
  );
  if (sharpness !== null) score += Math.round(Math.max(-15, Math.min(15, sharpness * 15)));
  if (blur !== null) score -= Math.round(Math.max(0, Math.min(20, blur * 20)));
  if (pixels !== null && pixels >= 2_000_000) score += 10;
  if (pixels !== null && pixels < 300_000) score -= 15;
  if (occluded) score -= 25;
  if (filtered) score -= 20;

  return {
    score: Math.max(0, Math.min(100, score)),
    face_count: faces.length,
    person_count: personObservations(asset).length,
    sharpness_score: sharpness,
    blur_score: blur,
    width,
    height,
    occluded,
    heavy_filter_detected: filtered,
  };
}

function personAsset(asset = {}) {
  if (!["IMAGE", "VIDEO"].includes(assetKind(asset))) return false;
  return Boolean(
    faceObservations(asset).length ||
    personObservations(asset).length ||
    text(object(asset.analysis?.identity).id) ||
    declaredRoles(asset).includes("PERSON_IDENTITY_REFERENCE")
  );
}

function assetRoles(asset = {}) {
  const kind = assetKind(asset);
  const roles = declaredRoles(asset).filter((role) =>
    role !== "UNCLASSIFIED_REFERENCE");

  if (personAsset(asset)) roles.push("PERSON_IDENTITY_REFERENCE");
  if (productObservations(asset).length) {
    roles.push("PRODUCT_IDENTITY_REFERENCE");
  }
  if (brandMarkObservations(asset).length) {
    roles.push("BRAND_MARK_REFERENCE");
  }
  if (locationObservations(asset).length) {
    roles.push("LOCATION_REFERENCE");
  }
  if (styleObservations(asset).length) {
    roles.push("STYLE_REFERENCE");
  }
  if (kind === "AUDIO") roles.push("AUDIO_SOURCE");
  if (kind === "VIDEO") roles.push("VIDEO_SOURCE");
  if (kind === "DOCUMENT") roles.push("DOCUMENT_SOURCE");
  if (!roles.length) roles.push("UNCLASSIFIED_REFERENCE");

  return unique(roles);
}

function buildPersonProfiles(assets = [], project = {}, brief = {}) {
  const groups = explicitIdentityGroups(project, brief);
  const grouped = new Map();

  for (const asset of list(assets).filter(personAsset)) {
    const key = identityKey(asset, groups);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(asset);
  }

  return [...grouped.entries()].map(([key, group], index) => {
    const explicit = groups.find((candidate) => key === `explicit:${candidate.id}`) || null;
    const references = group.map((asset) => {
      const poses = faceObservations(asset).map(angleFromPose);
      const textAngles = textAngleTags(asset);
      const angles = unique([
        poses.map((pose) => pose.angle),
        textAngles,
        bodyCoverage(asset),
      ]).filter((value) => value !== "UNCLASSIFIED");
      const quality = qualityEvidence(asset);
      return {
        asset_id: assetId(asset),
        roles: assetRoles(asset),
        angles: angles.length ? angles : ["UNCLASSIFIED"],
        pose_evidence: poses,
        body_coverage: bodyCoverage(asset),
        quality,
        source_role: "IDENTITY_ONLY_BY_DEFAULT",
        background_policy: "EXCLUDE_UNLESS_EXPLICITLY_ASSIGNED",
      };
    }).sort((left, right) => right.quality.score - left.quality.score);

    const angleCoverage = unique(references.flatMap((reference) => reference.angles));
    const highQuality = references.filter((reference) => reference.quality.score >= 60);
    const resolved = !key.startsWith("unresolved:");
    const confidence = Math.max(0, Math.min(100,
      20 +
      Math.min(35, references.length * 7) +
      Math.min(25, angleCoverage.length * 5) +
      Math.round((highQuality.length / Math.max(1, references.length)) * 20),
    ));

    return {
      id: explicit?.id || `person-profile-${index + 1}`,
      subject_type: "PERSON",
      identity_key: key,
      display_name: explicit?.name || text(
        group[0]?.analysis?.identity?.name ||
        personObservations(group[0])[0]?.name ||
        group[0]?.metadata?.subject_name,
      ) || null,
      resolved,
      primary: explicit?.primary === true,
      reference_asset_ids: references.map((reference) => reference.asset_id),
      face_reference_ids: references.filter((reference) =>
        reference.angles.some((angle) => [
          "FRONT",
          "LEFT_PROFILE",
          "RIGHT_PROFILE",
          "LEFT_THREE_QUARTER",
          "RIGHT_THREE_QUARTER",
          "FACE_DETAIL",
        ].includes(angle)),
      ).map((reference) => reference.asset_id),
      body_reference_ids: references.filter((reference) =>
        ["FULL_BODY", "THREE_QUARTER_BODY", "HALF_BODY"]
          .includes(reference.body_coverage),
      ).map((reference) => reference.asset_id),
      angle_coverage: angleCoverage,
      references,
      background_reference_policy: "EXCLUDE",
      identity_lock_required: true,
      identity_verification_required: true,
      confidence,
      limitations: [
        !resolved ? "IDENTITY_GROUP_UNRESOLVED" : null,
        !angleCoverage.includes("FRONT") ? "FRONT_REFERENCE_MISSING" : null,
        !angleCoverage.some((angle) => angle.includes("PROFILE")) ? "PROFILE_REFERENCE_MISSING" : null,
        !references.some((reference) => reference.body_coverage === "FULL_BODY") ? "FULL_BODY_REFERENCE_MISSING" : null,
      ].filter(Boolean),
    };
  }).sort((left, right) =>
    Number(right.primary) - Number(left.primary) ||
    right.confidence - left.confidence,
  );
}

function namedProfiles(assets = [], role, subjectType) {
  return list(assets)
    .filter((asset) => assetRoles(asset).includes(role))
    .map((asset, index) => ({
      id: `${subjectType.toLowerCase()}-profile-${index + 1}`,
      subject_type: subjectType,
      display_name: asset.name || asset.title || asset.file_name || null,
      reference_asset_ids: [assetId(asset)],
      quality: qualityEvidence(asset),
      background_reference_policy:
        subjectType === "LOCATION" ? "PRESERVE_WHEN_ASSIGNED" : "EXCLUDE_UNLESS_ASSIGNED",
      verification_required: true,
    }));
}

function requestedPrimarySubject(project = {}, brief = {}) {
  return text(
    brief.primary_subject_profile_id ||
    brief.metadata?.primary_subject_profile_id ||
    project.metadata?.primary_subject_profile_id ||
    brief.primary_subject ||
    project.metadata?.primary_subject,
  ).toLowerCase();
}

export const CreativeUniversalAssetIntelligenceRuntime = {
  analyze({ project = {}, brief = {}, assets = [] } = {}) {
    const normalizedAssets = list(assets).filter((asset) => assetId(asset));
    const personProfiles = buildPersonProfiles(normalizedAssets, project, brief);
    const productProfiles = namedProfiles(
      normalizedAssets,
      "PRODUCT_IDENTITY_REFERENCE",
      "PRODUCT",
    );
    const brandProfiles = namedProfiles(
      normalizedAssets,
      "BRAND_MARK_REFERENCE",
      "BRAND_MARK",
    );
    const locationProfiles = namedProfiles(
      normalizedAssets,
      "LOCATION_REFERENCE",
      "LOCATION",
    );
    const requested = requestedPrimarySubject(project, brief);
    const selectedPrimary = personProfiles.find((profile) =>
      profile.id.toLowerCase() === requested ||
      text(profile.display_name).toLowerCase() === requested ||
      profile.identity_key.toLowerCase().includes(requested),
    ) || personProfiles.find((profile) => profile.primary) ||
      (personProfiles.length === 1 ? personProfiles[0] : null);

    const assetManifest = normalizedAssets.map((asset) => ({
      asset_id: assetId(asset),
      kind: assetKind(asset),
      roles: assetRoles(asset),
      role_assignment_mode: declaredRoles(asset).length
        ? "EXPLICIT_AND_STRUCTURED_EVIDENCE"
        : "STRUCTURED_EVIDENCE_ONLY",
      quality: qualityEvidence(asset),
      analysis_status:
        asset.analysis_status ||
        asset.analysis?.status ||
        (Object.keys(object(asset.analysis)).length ? "ANALYSED" : "UNVERIFIED"),
      default_background_policy: personAsset(asset)
        ? "EXCLUDE_UNLESS_EXPLICITLY_ASSIGNED"
        : "USE_ONLY_FOR_ASSIGNED_ROLE",
    }));

    const blockingIssues = [];
    if (requested && !selectedPrimary) blockingIssues.push("REQUESTED_PRIMARY_SUBJECT_NOT_RESOLVED");
    if (selectedPrimary && !selectedPrimary.resolved && personProfiles.length > 1) {
      blockingIssues.push("PRIMARY_SUBJECT_IDENTITY_AMBIGUOUS");
    }

    return {
      contract: "UNIVERSAL_ASSET_INTELLIGENCE_V3",
      role_assignment_contract: "STRUCTURED_EVIDENCE_AND_EXPLICIT_ASSIGNMENT_V1",
      asset_manifest: assetManifest,
      person_profiles: personProfiles,
      product_profiles: productProfiles,
      brand_mark_profiles: brandProfiles,
      location_profiles: locationProfiles,
      primary_subject_profile_id: selectedPrimary?.id || null,
      primary_subject_confidence: selectedPrimary?.confidence || null,
      rules: {
        people_assets_are_identity_only_by_default: true,
        uploaded_backgrounds_are_not_story_locations_by_default: true,
        do_not_merge_unresolved_people: true,
        use_multi_angle_references_collectively: true,
        preserve_exact_face_and_body_across_new_environments: true,
        products_and_brand_marks_require_identity_fidelity: true,
        locations_are_preserved_only_when_explicitly_assigned: true,
        free_text_business_category_routing_prohibited: true,
        unresolved_assets_remain_unclassified: true,
      },
      blocking_issues: blockingIssues,
      passed: blockingIssues.length === 0,
    };
  },
};

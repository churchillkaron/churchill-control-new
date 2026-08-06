import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  signCreativeStorageReference,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";

const FLAG = Symbol.for(
  "avantiqo.creative.generated-media-perceptual-gate.v1",
);

const SCORE_FIELDS = Object.freeze({
  overall_score: "overall",
  story_score: "story",
  environment_score: "environment",
  camera_score: "camera",
  anatomy_score: "anatomy",
  identity_score: "identity",
  product_fidelity_score: "product_fidelity",
  music_energy_score: "music_energy",
  performance_score: "performance",
  continuity_score: "continuity",
  physics_score: "physics",
  artifact_score: "artifact",
});

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
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && !value.trim())
  ) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(object(value), key);
}

function outputValue(output = {}) {
  return output?.output?.output || output?.output || output || {};
}

function outputUrl(output = {}) {
  const value = outputValue(output);
  return value.image_url ||
    value.imageUrl ||
    value.video_url ||
    value.videoUrl ||
    value.file_url ||
    value.fileUrl ||
    value.url ||
    value.result?.url ||
    (typeof value.result === "string" ? value.result : null) ||
    value.images?.[0]?.url ||
    value.files?.[0]?.url ||
    null;
}

function normalizeReviewEvidence(value = {}) {
  const root = object(value);
  const nestedScores = object(root.scores);
  const normalized = { ...root };
  const missingFields = [];
  const invalidFields = [];
  const outOfRangeFields = [];
  const conflictingFields = [];
  const fieldSources = {};

  for (const [canonicalKey, aliasKey] of Object.entries(SCORE_FIELDS)) {
    const candidates = [
      ["scores", canonicalKey, nestedScores],
      ["scores", aliasKey, nestedScores],
      ["root", canonicalKey, root],
      ["root", aliasKey, root],
    ]
      .filter(([, key, source]) => hasOwn(source, key))
      .map(([location, key, source]) => ({
        path: `${location}.${key}`,
        raw: source[key],
        numeric: finite(source[key]),
      }));

    fieldSources[canonicalKey] = candidates.map((candidate) => candidate.path);

    if (candidates.length === 0) {
      missingFields.push(canonicalKey);
      continue;
    }

    if (candidates.some((candidate) => candidate.numeric === null)) {
      invalidFields.push(canonicalKey);
      continue;
    }

    if (
      candidates.some(
        (candidate) => candidate.numeric < 0 || candidate.numeric > 100,
      )
    ) {
      outOfRangeFields.push(canonicalKey);
      continue;
    }

    const uniqueValues = [...new Set(
      candidates.map((candidate) => candidate.numeric),
    )];
    if (uniqueValues.length !== 1) {
      conflictingFields.push(canonicalKey);
      continue;
    }

    normalized[canonicalKey] = uniqueValues[0];
  }

  const complete =
    missingFields.length === 0 &&
    invalidFields.length === 0 &&
    outOfRangeFields.length === 0 &&
    conflictingFields.length === 0;

  normalized.score_contract = {
    contract: "GENERATED_MEDIA_PERCEPTUAL_SCORE_CONTRACT_V2",
    complete,
    canonical_field_count: Object.keys(SCORE_FIELDS).length,
    normalized_field_count: Object.keys(SCORE_FIELDS).filter(
      (key) => finite(normalized[key]) !== null,
    ).length,
    source_shape:
      Object.keys(nestedScores).length > 0 ? "NESTED_SCORES" : "FLAT_ROOT",
    missing_fields: missingFields,
    invalid_fields: invalidFields,
    out_of_range_fields: outOfRangeFields,
    conflicting_fields: conflictingFields,
    field_sources: fieldSources,
  };

  return normalized;
}

function resultEvidence(task = {}) {
  const value = outputValue(task.output);
  const root = object(value);
  const candidate = root.result || root.review || root.validation || root;
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    return normalizeReviewEvidence({
      ...root,
      ...object(candidate),
    });
  }
  const source = text(candidate);
  if (!source) return normalizeReviewEvidence({});
  const first = source.indexOf("{");
  const last = source.lastIndexOf("}");
  if (first < 0 || last <= first) return normalizeReviewEvidence({});
  try {
    const parsed = JSON.parse(source.slice(first, last + 1));
    return normalizeReviewEvidence({
      ...root,
      ...object(parsed),
      ...object(parsed.result || parsed),
    });
  } catch {
    return normalizeReviewEvidence({});
  }
}

async function dependencyTasks(task = {}) {
  const dependencies = [];
  for (const id of list(task.depends_on)) {
    const dependency = await ProductionTaskRuntime.get(id);
    if (dependency) dependencies.push(dependency);
  }
  return dependencies;
}

async function signedUrl(task, value) {
  if (!value) return null;
  try {
    return await signCreativeStorageReference({
      organization_id: task.organization_id,
      reference: value,
    });
  } catch {
    return value;
  }
}

function expectation(task = {}) {
  return object(
    task.input?.requirements?.expected_contract ||
    task.metadata?.requirements?.expected_contract,
  );
}

function thresholds(task = {}) {
  return {
    ...object(expectation(task).thresholds),
    ...object(task.input?.requirements?.thresholds),
    ...object(task.metadata?.thresholds),
  };
}

function referenceValues(task = {}, source = {}) {
  const expected = expectation(task);
  const values = [];
  const add = (value, role) => {
    if (!value) return;
    if (typeof value === "string") values.push({ url: value, role });
    else if (value.url) values.push({ ...value, role: value.role || role });
    else if (value.asset_id || value.id) values.push({ ...value, role: value.role || role });
  };

  add(
    expected.identity_requirements?.identity_atlas_url ||
    expected.identity_requirements?.identityAtlasUrl ||
    source.input?.identity_atlas_url ||
    source.input?.generation?.identity_lock?.identity_atlas_url,
    "IDENTITY_ATLAS",
  );
  add(
    source.input?.generation?.identity_lock?.approved_keyframe_url ||
    source.input?.identity_lock?.approved_keyframe_url,
    "APPROVED_IDENTITY_KEYFRAME",
  );
  for (const value of list(
    expected.identity_requirements?.reference_images ||
    source.input?.reference_images,
  )) add(value, "IDENTITY_REFERENCE");
  for (const value of list(expected.reference_asset_ids)) add({ asset_id: value }, "REFERENCE_ASSET");
  for (const value of list(expected.product_requirements?.reference_images)) add(value, "PRODUCT_REFERENCE");

  const seen = new Set();
  return values.filter((value) => {
    const key = text(value.url || value.asset_id || value.id);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function reviewPrompt(task = {}, source = {}) {
  const expected = expectation(task);
  const minimum = thresholds(task);
  return `
You are Avantiqo's accountable generated-media perceptual quality director.
Inspect the actual generated ${text(expected.media_kind || task.metadata?.media_kind).toLowerCase()} against the immutable approved shot contract and all supplied reference evidence.
Return strict JSON only. Use exactly the property names shown. Never remove or rename the _score suffix.

{
  "passed": true,
  "scores": {
    "overall_score": 0,
    "story_score": 0,
    "environment_score": 0,
    "camera_score": 0,
    "anatomy_score": 0,
    "identity_score": 0,
    "product_fidelity_score": 0,
    "music_energy_score": 0,
    "performance_score": 0,
    "continuity_score": 0,
    "physics_score": 0,
    "artifact_score": 0
  },
  "person_count_correct": true,
  "identity_preserved": true,
  "product_preserved": true,
  "requested_environment_correct": true,
  "requested_camera_correct": true,
  "story_contribution_present": true,
  "music_energy_translated": true,
  "anatomy_valid": true,
  "physics_valid": true,
  "continuity_valid": true,
  "synthetic_artifacts_absent": true,
  "source_background_not_copied": true,
  "unexpected_text_or_watermark_absent": true,
  "failures": [],
  "evidence": [],
  "affected_timestamps": [],
  "repair_instructions": []
}

FAIL-CLOSED RULES
- Never invent evidence. A missing, unreadable, inaccessible or insufficient source must fail.
- Return every score as a finite number from 0 to 100. Missing, null, textual, out-of-range or renamed score fields are invalid.
- The output must execute the exact story purpose, action, environment, camera, lighting and production design, not merely look attractive.
- Reject filler, static posing, disconnected montage, repeated visual ideas and shots that add no new story or musical state.
- Reject malformed hands, fingers, teeth, eyes, limbs, body geometry, impossible reflections, floating objects, unstable backgrounds, object morphing, camera teleportation, temporal warping, rubber motion, frozen faces, synthetic skin and generative shimmer.
- When identity is required, compare exact facial geometry, eye spacing, nose, lips, jawline, skin tone, age, hairline, body type and proportions against all identity evidence. Reject lookalikes, averaged faces, beauty-filter drift, duplicates and identity changes across frames.
- When product fidelity is required, reject changed shape, proportions, materials, colour, label, logo, packaging, components or count.
- Uploaded identity backgrounds are excluded and must not be copied into the story unless explicitly requested.
- For video, inspect opening, progression and closing states and reject failed continuity, physics, performance, camera path or environment stability.
- For music-led media, visible energy, performance, camera, lighting and environmental state must match the supplied measured section rather than generic tempo assumptions.
- Reject generated typography, logos, legal copy or watermarks unless the approved contract explicitly requires them inside pixels.

MINIMUM SCORES
${JSON.stringify(minimum)}

IMMUTABLE EXPECTED CONTRACT
${JSON.stringify(expected)}

SOURCE GENERATION TASK
${JSON.stringify({
    id: source.id,
    type: source.type,
    capability: source.capability,
    intent: source.input?.intent,
    requirements: source.input?.requirements,
    generation: source.input?.generation,
    metadata: source.metadata,
  })}
`;
}

async function bindReview(task = {}) {
  const dependencies = await dependencyTasks(task);
  const sourceNodeId = text(
    task.metadata?.source_generation_node_id ||
    task.input?.requirements?.source_generation_node_id ||
    task.input?.provider_parameters?.source_generation_node_id,
  );
  const source = dependencies.find((item) =>
    text(item.metadata?.execution_node_id) === sourceNodeId ||
    text(item.metadata?.source_generation_node_id) === sourceNodeId,
  ) || dependencies.find((item) => item.status === "COMPLETED");
  if (!source || source.status !== "COMPLETED") {
    throw new Error("GENERATED_MEDIA_SOURCE_TASK_NOT_COMPLETED");
  }
  const sourceUrl = outputUrl(source.output);
  if (!sourceUrl) throw new Error("GENERATED_MEDIA_SOURCE_URL_REQUIRED");
  const reviewUrl = await signedUrl(task, sourceUrl);
  if (!reviewUrl) throw new Error("GENERATED_MEDIA_REVIEW_URL_REQUIRED");

  const references = [];
  for (const value of referenceValues(task, source)) {
    if (value.url) {
      references.push({
        ...value,
        url: await signedUrl(task, value.url),
      });
    } else {
      references.push(value);
    }
  }

  const assets = [
    {
      url: reviewUrl,
      role: "GENERATED_MEDIA_UNDER_REVIEW",
    },
    ...references,
  ];

  return ProductionTaskRuntime.update(task.id, {
    input: {
      ...object(task.input),
      image: reviewUrl,
      media: reviewUrl,
      source: reviewUrl,
      video: task.metadata?.media_kind === "VIDEO" ? reviewUrl : undefined,
      assets,
      reference_images: references.filter((item) => item.url),
      prompt: reviewPrompt(task, source),
      provider_prompt: reviewPrompt(task, source),
      provider_parameters: {
        ...object(task.input?.provider_parameters),
        response_format: { type: "json_object" },
        generated_media_url: reviewUrl,
        source_generation_task_id: source.id,
        source_generation_node_id: sourceNodeId,
        references,
        thresholds: thresholds(task),
      },
    },
    metadata: {
      ...object(task.metadata),
      source_generation_task_id: source.id,
      generated_media_url_bound: true,
      reference_count: references.length,
    },
  });
}

function minimumPass(value, minimum) {
  const score = finite(value);
  const threshold = finite(minimum);
  if (threshold === null || threshold <= 0) return true;
  return score !== null && score >= threshold;
}

function detailEvidenceDecision({
  evidence,
  key,
  required = true,
  conclusive = false,
  scoreBacked = false,
}) {
  if (!required) {
    return {
      passed: true,
      source: "NOT_REQUIRED",
      present: hasOwn(evidence, key),
      explicit_value:
        typeof evidence[key] === "boolean" ? evidence[key] : null,
    };
  }

  if (hasOwn(evidence, key)) {
    if (evidence[key] === true) {
      return {
        passed: true,
        source: "EXPLICIT_TRUE",
        present: true,
        explicit_value: true,
      };
    }
    return {
      passed: false,
      source:
        evidence[key] === false
          ? "EXPLICIT_FALSE"
          : "INVALID_EXPLICIT_VALUE",
      present: true,
      explicit_value:
        typeof evidence[key] === "boolean" ? evidence[key] : null,
    };
  }

  if (conclusive && scoreBacked) {
    return {
      passed: true,
      source: "SCORE_BACKED_CONCLUSIVE_PROVIDER_VERDICT",
      present: false,
      explicit_value: null,
    };
  }

  return {
    passed: false,
    source: "MISSING_WITHOUT_CONCLUSIVE_SUPPORT",
    present: false,
    explicit_value: null,
  };
}

function validation(task = {}) {
  const evidence = resultEvidence(task);
  const minimum = thresholds(task);
  const expected = expectation(task);
  const scoreContract = object(evidence.score_contract);
  const analyzedImageCount = finite(evidence.analyzed_image_count);
  const videoExpected = text(
    expected.media_kind || task.metadata?.media_kind,
  ).toUpperCase() === "VIDEO";
  const checks = {
    score_contract: scoreContract.complete === true,
    frame_evidence: videoExpected
      ? analyzedImageCount !== null && analyzedImageCount >= 7
      : true,
    overall: minimumPass(evidence.overall_score, minimum.minimum_overall_score),
    story: minimumPass(evidence.story_score, minimum.minimum_story_score),
    environment: minimumPass(evidence.environment_score, minimum.minimum_environment_score),
    camera: minimumPass(evidence.camera_score, minimum.minimum_camera_score),
    anatomy: minimumPass(evidence.anatomy_score, minimum.minimum_anatomy_score),
    identity: minimumPass(evidence.identity_score, minimum.minimum_identity_score),
    product: minimumPass(evidence.product_fidelity_score, minimum.minimum_product_fidelity_score),
    music: minimumPass(evidence.music_energy_score, minimum.minimum_music_energy_score),
    performance: minimumPass(evidence.performance_score, minimum.minimum_performance_score),
    continuity: minimumPass(evidence.continuity_score, minimum.minimum_continuity_score),
    physics: minimumPass(evidence.physics_score, minimum.minimum_physics_score),
    artifacts: minimumPass(evidence.artifact_score, minimum.minimum_artifact_score),
  };
  const failures = list(evidence.failures);
  const repairs = list(evidence.repair_instructions);
  const allChecksPassed = Object.values(checks).every(Boolean);
  const conclusiveProviderVerdict =
    evidence.passed === true &&
    allChecksPassed &&
    failures.length === 0 &&
    repairs.length === 0;
  const evidenceDecisions = {
    requested_environment_correct: detailEvidenceDecision({
      evidence,
      key: "requested_environment_correct",
      conclusive: conclusiveProviderVerdict,
      scoreBacked: checks.environment === true,
    }),
    requested_camera_correct: detailEvidenceDecision({
      evidence,
      key: "requested_camera_correct",
      conclusive: conclusiveProviderVerdict,
      scoreBacked: checks.camera === true,
    }),
    story_contribution_present: detailEvidenceDecision({
      evidence,
      key: "story_contribution_present",
      conclusive: conclusiveProviderVerdict,
      scoreBacked: checks.story === true,
    }),
    anatomy_valid: detailEvidenceDecision({
      evidence,
      key: "anatomy_valid",
      conclusive: conclusiveProviderVerdict,
      scoreBacked: checks.anatomy === true,
    }),
    physics_valid: detailEvidenceDecision({
      evidence,
      key: "physics_valid",
      conclusive: conclusiveProviderVerdict,
      scoreBacked: checks.physics === true,
    }),
    continuity_valid: detailEvidenceDecision({
      evidence,
      key: "continuity_valid",
      conclusive: conclusiveProviderVerdict,
      scoreBacked: checks.continuity === true,
    }),
    synthetic_artifacts_absent: detailEvidenceDecision({
      evidence,
      key: "synthetic_artifacts_absent",
      conclusive: conclusiveProviderVerdict,
      scoreBacked: checks.artifacts === true,
    }),
    source_background_not_copied: detailEvidenceDecision({
      evidence,
      key: "source_background_not_copied",
      conclusive: conclusiveProviderVerdict,
      scoreBacked: checks.artifacts === true,
    }),
    unexpected_text_or_watermark_absent: detailEvidenceDecision({
      evidence,
      key: "unexpected_text_or_watermark_absent",
      conclusive: conclusiveProviderVerdict,
      scoreBacked: checks.artifacts === true,
    }),
    person_count_correct: detailEvidenceDecision({
      evidence,
      key: "person_count_correct",
      required: expected.person_expected === true,
      conclusive: conclusiveProviderVerdict,
      scoreBacked:
        checks.anatomy === true && checks.performance === true,
    }),
    identity_preserved: detailEvidenceDecision({
      evidence,
      key: "identity_preserved",
      required: expected.identity_expected === true,
      conclusive: conclusiveProviderVerdict,
      scoreBacked: checks.identity === true,
    }),
    product_preserved: detailEvidenceDecision({
      evidence,
      key: "product_preserved",
      required: expected.product_expected === true,
      conclusive: conclusiveProviderVerdict,
      scoreBacked: checks.product === true,
    }),
    music_energy_translated: detailEvidenceDecision({
      evidence,
      key: "music_energy_translated",
      required: expected.music_expected === true,
      conclusive: conclusiveProviderVerdict,
      scoreBacked: checks.music === true,
    }),
  };
  const evidenceChecks = Object.fromEntries(
    Object.entries(evidenceDecisions).map(([key, decision]) => [
      key,
      decision.passed === true,
    ]),
  );
  return {
    passed:
      evidence.passed === true &&
      allChecksPassed &&
      Object.values(evidenceChecks).every(Boolean),
    checks,
    evidence_checks: evidenceChecks,
    evidence_policy: {
      contract: "GENERATED_MEDIA_PERCEPTUAL_EVIDENCE_POLICY_V2",
      conclusive_provider_verdict: conclusiveProviderVerdict,
      provider_passed: evidence.passed === true,
      all_score_and_frame_checks_passed: allChecksPassed,
      failure_count: failures.length,
      repair_instruction_count: repairs.length,
      decisions: evidenceDecisions,
    },
    score_contract: scoreContract,
    evidence,
  };
}

async function holdOrFail(task = {}) {
  if (task.status !== "COMPLETED") return task;
  const evaluated = validation(task);
  const sourceId = text(task.metadata?.source_generation_task_id);
  const source = sourceId ? await ProductionTaskRuntime.get(sourceId) : null;

  if (!evaluated.passed) {
    if (source && source.status === "COMPLETED") {
      await ProductionTaskRuntime.update(source.id, {
        status: "FAILED",
        error: "GENERATED_MEDIA_PERCEPTUAL_VALIDATION_FAILED",
        metadata: {
          ...object(source.metadata),
          perceptual_validation_failed: true,
          perceptual_review_task_id: task.id,
          rejected_before_editing: true,
        },
        output: {
          ...object(source.output),
          perceptual_validation: evaluated,
        },
      });
    }
    return ProductionTaskRuntime.fail(
      task.id,
      new Error("GENERATED_MEDIA_PERCEPTUAL_VALIDATION_FAILED"),
      { perceptual_validation: evaluated },
    );
  }

  if (source) {
    await ProductionTaskRuntime.update(source.id, {
      metadata: {
        ...object(source.metadata),
        automated_perceptual_validation_passed: true,
        perceptual_review_task_id: task.id,
        approved_for_downstream_after_perceptual_review: true,
      },
      output: {
        ...object(source.output),
        perceptual_validation: evaluated,
      },
    });
  }

  return ProductionTaskRuntime.update(task.id, {
    status: "COMPLETED",
    review: {
      ...object(task.review),
      required: false,
      approved: true,
      approved_by: "AVANTIQO_AUTOMATED_PERCEPTUAL_GATE",
    },
    metadata: {
      ...object(task.metadata),
      automated_perceptual_validation_passed: true,
      generated_media_released_for_downstream: true,
    },
    output: {
      ...object(task.output),
      perceptual_validation: evaluated,
    },
  });
}

if (!ProductionTaskRuntime[FLAG]) {
  const dispatch = ProductionTaskRuntime.dispatch.bind(ProductionTaskRuntime);
  Object.defineProperty(ProductionTaskRuntime, FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });
  ProductionTaskRuntime.dispatch = async function dispatchWithGeneratedMediaPerceptualGate(id) {
    let task = await ProductionTaskRuntime.get(id);
    if (!task) throw new Error("Production task not found");
    const contract = text(task.metadata?.contract);
    if (contract === "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1") {
      task = await bindReview(task);
    }
    const result = await dispatch(task.id);
    return contract === "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1"
      ? holdOrFail(result)
      : result;
  };
}

export const CreativeGeneratedMediaPerceptualExecutionGate = {
  installed: true,
  outputUrl,
  normalizeReviewEvidence,
  resultEvidence,
  validation,
};

import {
  CreativeUniversalTemporalDirectionRuntime,
} from "./CreativeUniversalTemporalDirectionRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  sanitizeCreativePromptlessDirectionSpec,
} from "./CreativePromptlessDirectionSpecRuntime";
import {
  evaluateCreativeSourceShotEvidence,
} from "@/lib/creative/assets/intelligence/runtime/CreativeSourceShotEvidenceRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.evidence-constrained-direction.v1",
);
const MINIMUM_CONFIDENCE = 60;

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function unique(values = []) {
  const output = [];
  const seen = new Set();
  for (const value of values.flat(Infinity)) {
    const rendered = text(value);
    const key = rendered.toLowerCase();
    if (!rendered || seen.has(key)) continue;
    seen.add(key);
    output.push(rendered);
  }
  return output;
}

function assetId(value) {
  if (typeof value === "string" || typeof value === "number") {
    return text(value);
  }
  return text(
    value?.asset_id ||
      value?.assetId ||
      value?.creative_asset_id ||
      value?.creativeAssetId ||
      value?.id,
  );
}

function primarySourceId(shot = {}) {
  return text(
    shot.primary_source_asset_id ||
      shot.primarySourceAssetId ||
      shot.generation?.primary_source_asset_id ||
      shot.generation?.primarySourceAssetId ||
      shot.metadata?.primary_source_asset_id ||
      shot.metadata?.primarySourceAssetId,
  );
}

function sourceAssetIds(plan = {}) {
  const ids = [];
  for (const scene of list(plan.scenes)) {
    for (const shot of list(scene.shots)) {
      ids.push(
        primarySourceId(shot),
        list(shot.reference_asset_ids),
        list(shot.referenceAssetIds),
        list(shot.identity_requirements?.reference_asset_ids),
        list(shot.identity_requirements?.referenceAssetIds),
      );
    }
  }
  return [...new Set(ids.flat(Infinity).map(assetId).filter(Boolean))];
}

function claimRows(value, path, inheritedConfidence = null, output = []) {
  if (value === null || value === undefined) return output;
  if (["string", "number", "boolean"].includes(typeof value)) {
    const rendered = text(value);
    if (rendered) {
      output.push({
        path,
        value: rendered,
        confidence: inheritedConfidence,
      });
    }
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      claimRows(item, `${path}[${index}]`, inheritedConfidence, output));
    return output;
  }
  if (typeof value === "object") {
    const localConfidence = finite(value.confidence);
    const confidence = localConfidence === null
      ? inheritedConfidence
      : localConfidence;
    for (const [key, child] of Object.entries(value)) {
      if (key === "confidence" || key === "id" || key === "position") continue;
      claimRows(child, `${path}.${key}`, confidence, output);
    }
  }
  return output;
}

function fieldRows(asset = {}, field) {
  const analysis = object(asset.analysis);
  const rows = claimRows(analysis[field], `analysis.${field}`);
  for (const [index, sample] of list(analysis.frame_samples).entries()) {
    rows.push(...claimRows(
      sample?.analysis?.[field],
      `analysis.frame_samples[${index}].analysis.${field}`,
    ));
  }
  return rows.filter((row) =>
    row.confidence === null || row.confidence >= MINIMUM_CONFIDENCE);
}

function profile(asset = {}) {
  const fields = {
    environments: fieldRows(asset, "environments"),
    visible_subjects: fieldRows(asset, "visible_subjects"),
    objects: fieldRows(asset, "objects"),
    activities: fieldRows(asset, "activities"),
    logos: fieldRows(asset, "logos"),
    visible_text: fieldRows(asset, "visible_text"),
    evidence: fieldRows(asset, "evidence"),
  };
  const ordered = [
    ...fields.environments,
    ...fields.visible_subjects,
    ...fields.objects,
    ...fields.activities,
    ...fields.logos,
    ...fields.visible_text,
    ...fields.evidence,
  ];
  const claims = [];
  const seen = new Set();
  for (const row of ordered) {
    const key = text(row.value).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    claims.push(row);
  }
  return {
    asset,
    fields,
    claims,
    lead: claims[0] || null,
    secondary: claims[1] || claims[0] || null,
  };
}

function sourceBinding(shot = {}, sourceId) {
  const references = list(shot.reference_assets);
  const hasPrimary = references.some((reference) =>
    text(reference?.role).toUpperCase() === "PRIMARY_SOURCE" &&
      assetId(reference) === sourceId);
  return hasPrimary
    ? references
    : [
        {
          asset_id: sourceId,
          role: "PRIMARY_SOURCE",
          required: true,
          source_binding_contract: "VERIFIED_SOURCE_EVIDENCE_V1",
        },
        ...references.filter((reference) => assetId(reference) !== sourceId),
      ];
}

const CAMERA_MODES = [
  {
    shot_size: "wide establishing",
    lens: "28mm",
    movement_path: "slow controlled push-in",
  },
  {
    shot_size: "medium detail",
    lens: "50mm",
    movement_path: "measured lateral drift",
  },
  {
    shot_size: "close detail",
    lens: "85mm",
    movement_path: "locked frame with a subtle focus transfer",
  },
  {
    shot_size: "medium wide",
    lens: "35mm",
    movement_path: "restrained forward tracking move",
  },
];

function claimValue(row, fallback) {
  return text(row?.value) || fallback;
}

function safeShot({ shot, sceneIndex, shotIndex, sourceId, sourceProfile }) {
  const cameraMode = CAMERA_MODES[(sceneIndex + shotIndex) % CAMERA_MODES.length];
  const lead = claimValue(sourceProfile.lead, "the verified source composition");
  const secondary = claimValue(
    sourceProfile.secondary,
    "a second visible detail in the same source",
  );
  const environment = claimValue(
    sourceProfile.fields.environments[0],
    "the verified source setting",
  );
  const objects = unique(
    sourceProfile.fields.objects.slice(0, 4).map((row) => row.value),
  );
  const evidenceRows = sourceProfile.claims.slice(0, 8);
  const purpose = [
    `Make ${lead} the verified visual evidence for this beat.`,
    `Let the viewer register ${secondary} without adding an unseen event or object.`,
  ].join(" ");
  const action = [
    `Preserve the real source state while the camera moves attention from ${lead} toward ${secondary}.`,
    "Do not introduce new people, objects, actions, architecture, text, or branding.",
  ].join(" ");
  const visualDirection = [
    `Begin with ${lead} clearly legible inside ${environment}.`,
    `Use a ${cameraMode.movement_path} to reveal ${secondary} through framing only.`,
    "Maintain the original spatial relationships, visible identities, materials, lighting cues, and source continuity.",
    "Any motion must come from the existing source or from camera movement; no fabricated physical event is permitted.",
  ].join(" ");

  return {
    ...object(shot),
    title: `Verified Source Beat ${sceneIndex + 1}.${shotIndex + 1}`,
    purpose,
    intent: purpose,
    story_function: purpose,
    narrative_function: purpose,
    subject: lead,
    action,
    performance: "Preserve only the activity visibly evidenced by the bound source.",
    description: visualDirection,
    direction: visualDirection,
    visual_direction: visualDirection,
    opening_frame: {
      description: `Open on ${lead} in the verified source composition.`,
      source_asset_id: sourceId,
      evidence_path: sourceProfile.lead?.path || null,
    },
    closing_frame: {
      description: `Close on ${secondary} while preserving the same verified source state.`,
      source_asset_id: sourceId,
      evidence_path: sourceProfile.secondary?.path || null,
    },
    frame_plan: {
      opening_frame: `Open on ${lead}.`,
      progression: `Move attention through framing from ${lead} toward ${secondary}.`,
      closing_frame: `Resolve on ${secondary} without inventing a new event.`,
    },
    camera: {
      ...object(shot.camera),
      ...cameraMode,
      framing: cameraMode.shot_size,
      focus_target: lead,
      movement_motivation: [
        `Use ${cameraMode.movement_path} to transfer attention from ${lead} to ${secondary}.`,
        "The camera move changes emphasis only; it does not imply an unsupported action or change in the source scene.",
      ].join(" "),
    },
    production_design: {
      source_locked: true,
      preserve: unique([environment, lead, secondary, objects]),
      prohibited_changes: [
        "No new people",
        "No new objects",
        "No new architecture",
        "No new text or logos",
        "No unsupported action",
      ],
    },
    props: objects,
    location: environment,
    sound_design: {
      approach: "Use soundtrack and restrained source-derived ambience only.",
      unsupported_diegetic_events_prohibited: true,
    },
    primary_source_asset_id: sourceId,
    reference_asset_ids: unique([
      sourceId,
      list(shot.reference_asset_ids).map(assetId),
      list(shot.referenceAssetIds).map(assetId),
    ]),
    reference_assets: sourceBinding(shot, sourceId),
    generation: {
      ...object(shot.generation),
      primary_source_asset_id: sourceId,
      source_binding_contract: "VERIFIED_SOURCE_EVIDENCE_V1",
      description: visualDirection,
      instruction: undefined,
      instructions: undefined,
      prompt: undefined,
      visual_prompt: undefined,
      video_prompt: undefined,
      change_constraints: {
        preserve_source_geometry: true,
        preserve_visible_identity: true,
        preserve_visible_objects: true,
        introduce_new_physical_content: false,
      },
    },
    metadata: {
      ...object(shot.metadata),
      primary_source_asset_id: sourceId,
      source_binding_contract: "VERIFIED_SOURCE_EVIDENCE_V1",
      evidence_constrained_rebuild: true,
    },
    source_evidence_contract: {
      contract: "CREATIVE_DIRECTION_SOURCE_EVIDENCE_V1",
      source_asset_id: sourceId,
      minimum_confidence: MINIMUM_CONFIDENCE,
      claims: evidenceRows.map((row) => ({
        path: row.path,
        value: row.value,
        confidence: row.confidence,
      })),
      new_physical_content_allowed: false,
    },
  };
}

function fallbackShot({ shot, sceneIndex, shotIndex, sourceId, sourceProfile }) {
  const cameraMode = CAMERA_MODES[(sceneIndex + shotIndex) % CAMERA_MODES.length];
  const visualDirection = [
    "Present the verified source composition exactly as recorded.",
    `Use a ${cameraMode.movement_path} to create progression through crop, scale, and focus only.`,
    "Preserve every visible subject, object, spatial relationship, identity cue, and material without adding a physical event.",
    "The shot must remain a truthful reframing of the bound source asset.",
  ].join(" ");
  return {
    ...safeShot({ shot, sceneIndex, shotIndex, sourceId, sourceProfile }),
    title: `Source-Locked Beat ${sceneIndex + 1}.${shotIndex + 1}`,
    purpose: "Advance the edit through authentic source composition and camera emphasis only.",
    intent: "Advance the edit through authentic source composition and camera emphasis only.",
    story_function: "Advance the edit through authentic source composition and camera emphasis only.",
    narrative_function: "Advance the edit through authentic source composition and camera emphasis only.",
    subject: "the verified source composition",
    action: "Preserve the source state while camera framing creates the progression; introduce no new physical content.",
    performance: "No invented performance or event.",
    description: visualDirection,
    direction: visualDirection,
    visual_direction: visualDirection,
    opening_frame: {
      description: "Open on the verified source composition.",
      source_asset_id: sourceId,
    },
    closing_frame: {
      description: "Close on a different crop of the same verified source composition.",
      source_asset_id: sourceId,
    },
    frame_plan: {
      opening_frame: "Open on the verified source composition.",
      progression: "Change crop, scale, or focus only.",
      closing_frame: "Resolve on the same verified source state.",
    },
    camera: {
      ...object(shot.camera),
      ...cameraMode,
      framing: cameraMode.shot_size,
      focus_target: "the verified source composition",
      movement_motivation: "Create editorial progression through camera emphasis only, without implying an unsupported event.",
    },
    production_design: {
      source_locked: true,
      preserve: ["All visible source content"],
      prohibited_changes: ["Any new physical content"],
    },
    props: [],
    location: "the verified source setting",
    generation: {
      ...object(shot.generation),
      primary_source_asset_id: sourceId,
      source_binding_contract: "VERIFIED_SOURCE_EVIDENCE_V1",
      description: visualDirection,
      instruction: undefined,
      instructions: undefined,
      prompt: undefined,
      visual_prompt: undefined,
      video_prompt: undefined,
      change_constraints: {
        preserve_source_geometry: true,
        preserve_visible_identity: true,
        preserve_visible_objects: true,
        introduce_new_physical_content: false,
      },
    },
  };
}

function sceneLabel(profiles = [], index = 0) {
  const all = profiles.flatMap((item) => item.claims.map((row) => row.value));
  const joined = all.join(" ").toLowerCase();
  if (/\b(logo|brand mark|wordmark)\b/.test(joined)) return "Signature";
  if (/\b(entrance|exterior|facade|stairway)\b/.test(joined)) return "Arrival";
  if (/\b(food|dish|meal|plate)\b/.test(joined)) return "At the Table";
  if (/\b(pool table|billiard|shuffleboard|puck)\b/.test(joined)) return "Play";
  if (/\b(drink|glass|cocktail|beer)\b/.test(joined)) return "Refresh";
  if (/\b(musician|band|stage|singer)\b/.test(joined)) return "Performance";
  if (/\b(person|people|activity|movement)\b/.test(joined)) return "In Motion";
  return `Source Chapter ${index + 1}`;
}

async function loadAssets(organizationId, ids) {
  if (!organizationId) throw new Error("ORGANIZATION_ID_REQUIRED");
  if (!ids.length) throw new Error("EVIDENCE_CONSTRAINED_DIRECTION_SOURCE_ASSETS_REQUIRED");
  const { data, error } = await supabaseAdmin
    .from("creative_assets")
    .select("*")
    .eq("organization_id", organizationId)
    .in("id", ids);
  if (error) throw error;
  const assets = data || [];
  const found = new Set(assets.map((asset) => text(asset.id)));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) {
    throw new Error(`EVIDENCE_CONSTRAINED_DIRECTION_ASSETS_MISSING:${missing.join(",")}`);
  }
  return assets;
}

export async function rebuildCreativeDirectionFromEvidence({
  plan,
  organization_id,
} = {}) {
  const sourceIds = sourceAssetIds(plan);
  const assets = await loadAssets(organization_id, sourceIds);
  const assetById = new Map(assets.map((asset) => [text(asset.id), asset]));
  const profileById = new Map(assets.map((asset) => [text(asset.id), profile(asset)]));
  let globalShotIndex = 0;

  let scenes = list(plan.scenes).map((scene, sceneIndex) => {
    const rebuiltShots = list(scene.shots).map((shot, shotIndex) => {
      const sourceId = primarySourceId(shot);
      const sourceProfile = profileById.get(sourceId);
      if (!sourceProfile) {
        throw new Error(`EVIDENCE_CONSTRAINED_DIRECTION_PRIMARY_SOURCE_REQUIRED:${text(shot.id)}`);
      }
      const rebuilt = safeShot({
        shot,
        sceneIndex,
        shotIndex: globalShotIndex,
        sourceId,
        sourceProfile,
      });
      globalShotIndex += 1;
      return rebuilt;
    });
    const profiles = rebuiltShots
      .map((shot) => profileById.get(primarySourceId(shot)))
      .filter(Boolean);
    const label = sceneLabel(profiles, sceneIndex);
    const purpose = "Build this chapter only from verified visual claims in its bound source assets, preserving authenticity while camera and edit create momentum.";
    return {
      ...object(scene),
      title: label,
      purpose,
      intent: purpose,
      objective: purpose,
      story_function: purpose,
      narrative_function: purpose,
      summary: purpose,
      description: purpose,
      state_change: "The viewer gains a clearer view of the verified source material; no unsupported physical event occurs.",
      shots: rebuiltShots,
    };
  });

  let rebuiltPlan = {
    ...object(plan),
    concept: {
      ...object(plan.concept),
      title: "The Verified Source Portrait",
      statement: "A premium temporal portrait assembled only from visually verified source evidence. Camera, rhythm, sound, and edit create progression without fabricating people, objects, actions, or locations.",
      evidence_policy: "SOURCE_EVIDENCE_ONLY",
    },
    strategy: {
      ...object(plan.strategy),
      creative_principle: "Authenticity first: reveal more through direction, never by inventing physical content.",
      source_evidence_required: true,
    },
    scenes,
    validation: {
      ...object(plan.validation),
      passed: true,
      evidence_constrained: true,
    },
    metadata: {
      ...object(plan.metadata),
      evidence_constrained_direction: {
        contract: "CREATIVE_EVIDENCE_CONSTRAINED_DIRECTION_V1",
        source_asset_ids: sourceIds,
        source_asset_count: sourceIds.length,
        minimum_confidence: MINIMUM_CONFIDENCE,
        physical_content_invention_allowed: false,
      },
    },
  };

  let gate = evaluateCreativeSourceShotEvidence({
    shots: scenes.flatMap((scene) => list(scene.shots)),
    assets,
    minimum_confidence: MINIMUM_CONFIDENCE,
  });
  const failedIds = new Set(
    gate.results.filter((result) => !result.passed).map((result) => result.shot_id),
  );

  if (failedIds.size) {
    globalShotIndex = 0;
    scenes = scenes.map((scene, sceneIndex) => ({
      ...scene,
      shots: list(scene.shots).map((shot) => {
        const sourceId = primarySourceId(shot);
        const rebuilt = failedIds.has(text(shot.id))
          ? fallbackShot({
              shot,
              sceneIndex,
              shotIndex: globalShotIndex,
              sourceId,
              sourceProfile: profileById.get(sourceId),
            })
          : shot;
        globalShotIndex += 1;
        return rebuilt;
      }),
    }));
    rebuiltPlan = { ...rebuiltPlan, scenes };
    gate = evaluateCreativeSourceShotEvidence({
      shots: scenes.flatMap((scene) => list(scene.shots)),
      assets,
      minimum_confidence: MINIMUM_CONFIDENCE,
    });
  }

  if (gate.readiness !== "PASS") {
    throw new Error(
      `EVIDENCE_CONSTRAINED_DIRECTION_GATE_FAILED:${gate.blockers.join(",")}`,
    );
  }

  const promptless = sanitizeCreativePromptlessDirectionSpec(rebuiltPlan);
  const finalGate = evaluateCreativeSourceShotEvidence({
    shots: list(promptless.plan.scenes).flatMap((scene) => list(scene.shots)),
    assets,
    minimum_confidence: MINIMUM_CONFIDENCE,
  });
  if (finalGate.readiness !== "PASS") {
    throw new Error(
      `EVIDENCE_CONSTRAINED_DIRECTION_FINAL_GATE_FAILED:${finalGate.blockers.join(",")}`,
    );
  }

  return {
    plan: {
      ...promptless.plan,
      validation: {
        ...object(promptless.plan.validation),
        passed: true,
        evidence_constrained: true,
        source_shot_evidence: {
          contract: finalGate.contract,
          readiness: finalGate.readiness,
          shot_count: finalGate.shot_count,
          passed_shot_count: finalGate.passed_shot_count,
          failed_shot_count: finalGate.failed_shot_count,
        },
      },
    },
    evidence: {
      contract: "CREATIVE_EVIDENCE_CONSTRAINED_DIRECTION_V1",
      source_asset_ids: sourceIds,
      source_asset_count: sourceIds.length,
      shot_count: finalGate.shot_count,
      passed_shot_count: finalGate.passed_shot_count,
      fallback_shot_count: failedIds.size,
      minimum_confidence: MINIMUM_CONFIDENCE,
      promptless_validation: promptless.evidence.validation,
      source_shot_gate: finalGate,
    },
  };
}

function install() {
  if (CreativeUniversalTemporalDirectionRuntime[INSTALL_FLAG]) return;
  const createWithoutEvidenceRebuild =
    CreativeUniversalTemporalDirectionRuntime.create.bind(
      CreativeUniversalTemporalDirectionRuntime,
    );

  Object.defineProperty(
    CreativeUniversalTemporalDirectionRuntime,
    INSTALL_FLAG,
    { value: true, enumerable: false, configurable: false },
  );

  CreativeUniversalTemporalDirectionRuntime.create =
    async function createWithEvidenceConstrainedDirection(input = {}) {
      const result = await createWithoutEvidenceRebuild(input);
      if (!result?.plan) return result;
      const rebuilt = await rebuildCreativeDirectionFromEvidence({
        plan: result.plan,
        organization_id: text(input.organization_id || input.organizationId),
      });
      console.log(
        `CREATIVE_EVIDENCE_CONSTRAINED_DIRECTION=${JSON.stringify({
          contract: rebuilt.evidence.contract,
          source_asset_count: rebuilt.evidence.source_asset_count,
          shot_count: rebuilt.evidence.shot_count,
          passed_shot_count: rebuilt.evidence.passed_shot_count,
          fallback_shot_count: rebuilt.evidence.fallback_shot_count,
        })}`,
      );
      return {
        ...result,
        plan: rebuilt.plan,
        evidence_constrained_direction: rebuilt.evidence,
      };
    };
}

install();

export const CreativeEvidenceConstrainedDirectionRuntime = Object.freeze({
  installed: true,
  contract: "CREATIVE_EVIDENCE_CONSTRAINED_DIRECTION_V1",
  rebuild: rebuildCreativeDirectionFromEvidence,
});

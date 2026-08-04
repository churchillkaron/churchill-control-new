import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

import {
  CreativeTemporalMasterPlanRuntime,
} from "./CreativeTemporalMasterPlanRuntime";
import {
  CreativeUniversalTemporalDirectionRuntime,
} from "./CreativeUniversalTemporalDirectionRuntime";
import {
  CreativeIdentityAtlasRuntime,
} from "@/lib/creative/identity/runtime/CreativeIdentityAtlasRuntime";
import {
  CreativeUniversalAssetIntelligenceRuntime,
} from "@/lib/creative/assets/intelligence/runtime/CreativeUniversalAssetIntelligenceRuntime";
import {
  ProductionGraphRuntime,
} from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.universal-reference-casting.v1",
);
const bridgeContext = new AsyncLocalStorage();

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

function unique(values = []) {
  return [...new Set(values.flat(Infinity).map((value) => text(
    value?.asset_id || value?.assetId || value?.id || value,
  )).filter(Boolean))];
}

function stableId(prefix, value) {
  return `${prefix}-${crypto.createHash("sha256")
    .update(text(value).toLowerCase())
    .digest("hex")
    .slice(0, 16)}`;
}

function actorLabels(shot = {}) {
  return list(shot.actors)
    .flatMap((actor) => [
      actor?.id,
      actor?.name,
      actor?.label,
      actor?.role,
      actor?.description,
      actor,
    ])
    .map((value) => text(value).toLowerCase())
    .filter(Boolean);
}

function shotCorpus(shot = {}) {
  return JSON.stringify({
    title: shot.title,
    purpose: shot.purpose,
    subject: shot.subject,
    action: shot.action,
    performance: shot.performance,
    actors: shot.actors,
    dialogue: shot.dialogue,
    identity_requirements: shot.identity_requirements,
    performance_contract: shot.performance_contract,
  }).toLowerCase();
}

function humanShot(shot = {}) {
  return list(shot.actors).length > 0 ||
    /\b(person|people|human|artist|performer|singer|actor|actress|model|dancer|staff|employee|team member|customer|client|guest|visitor|audience|crowd|passerby|worker|crew|family|couple|friends|adult|woman|man|girl|boy|face|portrait)\b/.test(
      shotCorpus(shot),
    );
}

function genericCastLabel(value) {
  return /^(staff|employee|team member|service team|customer|client|guest|visitor|audience|crowd|passerby|worker|crew|family|couple|friends|adult|woman|man|girl|boy|people|person|human|extra|extras)$/i.test(
    text(value),
  );
}

function profileAssetIds(profile = {}) {
  return unique([
    profile.reference_asset_ids,
    profile.face_reference_ids,
    profile.body_reference_ids,
    list(profile.references).map((reference) => reference?.asset_id),
  ]);
}

function explicitReferenceIds(shot = {}) {
  return unique([
    shot.reference_asset_ids,
    list(shot.reference_assets).map((reference) => reference?.asset_id || reference),
    shot.identity_requirements?.reference_asset_ids,
    shot.performance_contract?.identity_reference_asset_ids,
    shot.generation?.identity_lock?.reference_asset_node_ids,
  ]);
}

function explicitIdentityProfile(shot = {}, profiles = []) {
  const requestedId = text(
    shot.identity_requirements?.profile_id ||
    shot.identity_requirements?.identity_profile_id ||
    shot.performance_contract?.identity_profile_id ||
    shot.generation?.identity_lock?.identity_profile_id ||
    shot.metadata?.identity_profile_id,
  );
  if (requestedId) {
    const exact = profiles.find((profile) => text(profile.id) === requestedId);
    if (exact) return exact;
  }

  const references = new Set(explicitReferenceIds(shot));
  if (references.size) {
    const matched = profiles.find((profile) =>
      profileAssetIds(profile).some((assetId) => references.has(assetId)),
    );
    if (matched) return matched;
  }

  const labels = actorLabels(shot).filter((label) => !genericCastLabel(label));
  if (!labels.length) return null;
  return profiles.find((profile) => {
    const evidence = [
      profile.id,
      profile.display_name,
      profile.identity_key,
    ].map((value) => text(value).toLowerCase()).filter(Boolean);
    return labels.some((label) => evidence.some((candidate) =>
      candidate === label ||
      candidate.includes(label) ||
      label.includes(candidate),
    ));
  }) || null;
}

function classifyShot(shot = {}, profiles = []) {
  if (!humanShot(shot)) return { mode: "NONE", profile: null };
  const profile = explicitIdentityProfile(shot, profiles);
  if (profile) return { mode: "REAL_IDENTITY", profile };
  return { mode: "SYNTHETIC_CAST", profile: null };
}

function neutralizeText(value) {
  return text(value)
    .replace(/\bpeople\b/gi, "participants")
    .replace(/\bperson\b/gi, "participant")
    .replace(/\bhuman\b/gi, "participant")
    .replace(/\b(artist|performer|singer|actor|actress|model|dancer)\b/gi, "featured talent")
    .replace(/\b(staff|employee)\b/gi, "service team")
    .replace(/\b(founder|owner)\b/gi, "principal")
    .replace(/\b(woman|man)\b/gi, "adult")
    .replace(/\b(girl|boy)\b/gi, "young participant")
    .replace(/\b(face|portrait)\b/gi, "close visual");
}

function neutralizeValue(value) {
  if (typeof value === "string") return neutralizeText(value);
  if (Array.isArray(value)) return value.map(neutralizeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, neutralizeValue(entry)]),
    );
  }
  return value;
}

function sanitizePlan(plan = {}, context = {}) {
  const profiles = list(context.asset_intelligence?.person_profiles);
  const scenes = list(plan.scenes).map((scene, sceneIndex) => ({
    ...scene,
    shots: list(scene.shots).map((shot, shotIndex) => {
      const classification = classifyShot(shot, profiles);
      if (classification.mode !== "SYNTHETIC_CAST") return shot;

      const token = `${context.execution_id}:${context.sequence++}:${sceneIndex}:${shotIndex}`;
      context.original_shots.set(token, shot);
      return {
        ...shot,
        title: neutralizeText(shot.title),
        purpose: neutralizeText(shot.purpose),
        subject: neutralizeText(shot.subject),
        action: neutralizeText(shot.action),
        performance: neutralizeText(shot.performance),
        actors: [],
        dialogue: neutralizeValue(shot.dialogue),
        identity_requirements: {
          mode: "SYNTHETIC_CAST",
          preserve_real_identity: false,
        },
        performance_contract: {
          ...neutralizeValue(object(shot.performance_contract)),
          identity_profile_id: null,
          identity_lock_required: false,
          synthetic_cast: true,
        },
        generation: {
          ...object(shot.generation),
          identity_lock: {
            required: false,
            mode: "SYNTHETIC_CAST",
          },
          provider_prompt: neutralizeText(
            shot.generation?.provider_prompt || shot.provider_prompt,
          ),
        },
        metadata: {
          ...neutralizeValue(object(shot.metadata)),
          universal_cast_bridge_token: token,
          universal_cast_bridge_mode: "SYNTHETIC_CAST",
        },
      };
    }),
  }));
  return { ...plan, scenes };
}

function castDescription(shot = {}) {
  const actors = list(shot.actors).map((actor) =>
    text(actor?.description || actor?.role || actor?.label || actor?.name || actor),
  ).filter(Boolean);
  return actors.join("; ") || text(shot.subject || shot.purpose || "supporting cast");
}

function crowdShot(shot = {}) {
  return /\b(crowd|audience|group|people|customers|guests|visitors|family|friends|team|staff|crew|extras)\b/i.test(
    shotCorpus(shot),
  ) || list(shot.actors).length > 2;
}

function castContract(shot = {}) {
  const description = castDescription(shot);
  const ensemble = crowdShot(shot);
  return {
    contract: "UNIVERSAL_SYNTHETIC_CAST_V1",
    mode: ensemble ? "SYNTHETIC_ENSEMBLE" : "SYNTHETIC_CAST",
    cast_profile_id: stableId("synthetic-cast", description),
    description,
    fictional_people_required: true,
    real_person_identity_reference_prohibited: true,
    reference_person_asset_ids: [],
    continuity_scope: ensemble ? "SHOT_AND_SCENE" : "PROJECT",
    preserve_cast_continuity: true,
    natural_anatomy_required: true,
    natural_skin_texture_required: true,
    role_accurate_behavior_required: true,
    wardrobe_continuity_required: true,
    environment_interaction_required: true,
    ensemble_rules: ensemble ? {
      unique_individuals_required: true,
      duplicate_faces_prohibited: true,
      cloned_body_or_pose_prohibited: true,
      varied_age_appearance_and_styling_required: true,
      coherent_social_relationships_required: true,
      believable_attention_and_eye_lines_required: true,
      background_people_must_perform_real_actions: true,
    } : null,
    prohibited: [
      "matching or imitating any uploaded real person",
      "generic stock-photo posing",
      "duplicate faces or bodies",
      "frozen background figures",
      "synthetic skin or malformed anatomy",
      "role-inaccurate props, uniforms or behavior",
    ],
  };
}

function personAssetIdSet(intelligence = {}) {
  return new Set(list(intelligence.person_profiles).flatMap(profileAssetIds));
}

function referenceProfileMap(intelligence = {}) {
  const map = new Map();
  const add = (profiles, type) => {
    for (const profile of list(profiles)) {
      for (const assetId of profileAssetIds(profile)) {
        if (!map.has(assetId)) map.set(assetId, []);
        map.get(assetId).push({ ...profile, subject_type: type });
      }
    }
  };
  add(intelligence.product_profiles, "PRODUCT");
  add(intelligence.brand_mark_profiles, "BRAND_MARK");
  add(intelligence.location_profiles, "LOCATION");
  return map;
}

function fidelityContract(assetId, profile = {}) {
  const type = text(profile.subject_type).toUpperCase();
  const common = {
    contract: "UNIVERSAL_REFERENCE_FIDELITY_V1",
    source_asset_id: assetId,
    subject_profile_id: profile.id || null,
    subject_type: type,
    source_is_identity_evidence: true,
    source_comparison_required: true,
    automated_validation_required: true,
  };

  if (type === "BRAND_MARK") {
    return {
      ...common,
      mode: "EXACT_COMPOSITE",
      original_pixels_preferred: true,
      regeneration_prohibited: true,
      preserve_geometry: true,
      preserve_wording: true,
      preserve_spelling: true,
      preserve_color_relationships: true,
      preserve_clear_space: true,
      minimum_fidelity_score: 98,
    };
  }
  if (type === "LOCATION") {
    return {
      ...common,
      mode: "PRESERVE_AND_ENHANCE",
      deterministic_enhancement_preferred: true,
      generative_change_mask_required: true,
      preserve_architecture: true,
      preserve_spatial_layout: true,
      preserve_fixed_signage: true,
      preserve_distinctive_materials: true,
      allowed_changes: [
        "exposure and white-balance correction",
        "noise reduction and detail recovery",
        "controlled relighting",
        "removal of temporary visual defects when explicitly approved",
        "addition of synthetic cast without changing the physical identity of the place",
      ],
      prohibited_changes: [
        "moving walls, doors, windows, counters or fixed furniture",
        "inventing signage, logos or architectural features",
        "changing the location into a generic or different place",
      ],
      minimum_fidelity_score: 94,
    };
  }
  return {
    ...common,
    mode: "PRESERVE_AND_ENHANCE",
    deterministic_enhancement_preferred: true,
    generative_change_mask_required: true,
    preserve_shape: true,
    preserve_proportions: true,
    preserve_materials: true,
    preserve_label_and_packaging: true,
    preserve_distinctive_features: true,
    allowed_changes: [
      "lighting, exposure and color correction",
      "surface cleanup that does not alter identity",
      "background replacement when explicitly directed",
    ],
    minimum_fidelity_score: 94,
  };
}

function referenceContracts(shot = {}, profileMap = new Map()) {
  return explicitReferenceIds(shot).flatMap((assetId) =>
    list(profileMap.get(assetId)).map((profile) => fidelityContract(assetId, profile)),
  );
}

function castPrompt(contract = {}, shot = {}) {
  if (!contract?.cast_profile_id) return "";
  return [
    "SYNTHETIC CAST DIRECTIVE:",
    `Generate original fictional cast for profile ${contract.cast_profile_id}.`,
    `Role and behavior: ${contract.description}.`,
    "Do not reproduce, blend, or approximate any uploaded real person's face or body.",
    "Maintain the same fictional individual across recurring shots when the cast profile repeats.",
    "Performance must be candid, role-accurate and physically integrated with the environment; no stock posing or camera-aware staring unless directed.",
    contract.ensemble_rules
      ? "For ensembles, every visible individual must be distinct, socially coherent and naturally occupied. No cloned faces, repeated bodies, mirrored poses or frozen background figures."
      : null,
    `Shot action: ${text(shot.action)}.`,
  ].filter(Boolean).join("\n");
}

function fidelityPrompt(contracts = []) {
  if (!contracts.length) return "";
  return [
    "REFERENCE FIDELITY DIRECTIVE:",
    ...contracts.map((contract) => {
      if (contract.mode === "EXACT_COMPOSITE") {
        return `Asset ${contract.source_asset_id} is an immutable ${contract.subject_type} source. Composite the original mark; do not redraw, restyle, respell or regenerate it. Minimum fidelity ${contract.minimum_fidelity_score}.`;
      }
      return `Asset ${contract.source_asset_id} is a ${contract.subject_type} identity source. Preserve its physical geometry, layout, materials and distinctive features exactly; improve only approved photometric or masked details. Minimum fidelity ${contract.minimum_fidelity_score}.`;
    }),
    "When exact preservation conflicts with a proposed creative change, preservation wins unless the approved brief explicitly authorizes that change.",
  ].join("\n");
}

const CAST_VISUAL_REFERENCE_ROLES = new Set([
  "PRIMARY_SOURCE",
  "IDENTITY_REFERENCE",
  "LOCATION_REFERENCE",
  "CONTINUITY_REFERENCE",
  "PRODUCT_REFERENCE",
  "STYLE_REFERENCE",
  "SUBJECT_REFERENCE",
]);

function normalizeCastReferences(references = [], preferredPrimaryId = null) {
  const rows = list(references)
    .filter((reference) => reference && typeof reference === "object" && !Array.isArray(reference))
    .map((reference) => ({
      ...reference,
      asset_id: text(reference.asset_id || reference.id),
      role: text(reference.role).toUpperCase(),
    }))
    .filter((reference) => reference.asset_id && reference.role);
  const visual = rows.filter((reference) =>
    CAST_VISUAL_REFERENCE_ROLES.has(reference.role),
  );
  const existingPrimary = rows.find((reference) => reference.role === "PRIMARY_SOURCE")?.asset_id;
  const primaryId = preferredPrimaryId || existingPrimary || visual[0]?.asset_id || null;
  return {
    primary_source_asset_id: primaryId,
    reference_assets: rows.map((reference) => ({
      ...reference,
      role: reference.asset_id === primaryId && CAST_VISUAL_REFERENCE_ROLES.has(reference.role)
        ? "PRIMARY_SOURCE"
        : reference.role === "PRIMARY_SOURCE"
          ? "CONTINUITY_REFERENCE"
          : reference.role,
    })),
  };
}

function restoreAndDirectPlan(plan = {}, context = {}) {
  const personIds = personAssetIdSet(context.asset_intelligence);
  const profileMap = referenceProfileMap(context.asset_intelligence);
  const castBible = new Map();

  const scenes = list(plan.scenes).map((scene) => ({
    ...scene,
    shots: list(scene.shots).map((current) => {
      const token = text(current.metadata?.universal_cast_bridge_token);
      const original = token ? context.original_shots.get(token) : null;
      let shot = original ? {
        ...current,
        ...original,
        music_intelligence: current.music_intelligence,
        reuse_policy: current.reuse_policy,
        generation: {
          ...object(current.generation),
          ...object(original.generation),
          provider_parameters: {
            ...object(current.generation?.provider_parameters),
            ...object(original.generation?.provider_parameters),
          },
        },
        metadata: {
          ...object(current.metadata),
          ...object(original.metadata),
        },
      } : current;

      const classification = classifyShot(
        shot,
        context.asset_intelligence?.person_profiles,
      );
      let cast = null;
      if (classification.mode === "SYNTHETIC_CAST") {
        cast = castContract(shot);
        castBible.set(cast.cast_profile_id, cast);
        const nonPersonReferences = list(shot.reference_assets).filter((reference) =>
          !personIds.has(text(reference?.asset_id || reference)),
        );
        const normalizedReferences = normalizeCastReferences(nonPersonReferences);
        shot = {
          ...shot,
          actors: list(shot.actors),
          primary_source_asset_id: normalizedReferences.primary_source_asset_id,
          reference_asset_ids: [],
          reference_assets: normalizedReferences.reference_assets,
          assets: [],
          cast_contract: cast,
          identity_requirements: {
            mode: "SYNTHETIC_CAST",
            profile_id: null,
            identity_profile_id: null,
            preserve_real_identity: false,
            real_person_identity_reference_prohibited: true,
            verification_required: true,
          },
          performance_contract: {
            ...object(shot.performance_contract),
            identity_profile_id: null,
            identity_reference_asset_ids: [],
            identity_lock_required: false,
            identity_verification_required: false,
            synthetic_cast: true,
            synthetic_cast_profile_id: cast.cast_profile_id,
          },
          generation: {
            ...object(shot.generation),
            provider_prompt: [
              text(shot.generation?.provider_prompt || shot.provider_prompt),
              castPrompt(cast, shot),
            ].filter(Boolean).join("\n\n"),
            identity_lock: {
              required: false,
              mode: "SYNTHETIC_CAST",
              synthetic_cast_profile_id: cast.cast_profile_id,
            },
            primary_source_asset_id: normalizedReferences.primary_source_asset_id,
            provider_parameters: {
              ...object(shot.generation?.provider_parameters),
              primary_source_asset_id: normalizedReferences.primary_source_asset_id,
              identity_profile_id: null,
              cast_mode: cast.mode,
              synthetic_cast_contract: cast,
            },
          },
          metadata: {
            ...object(shot.metadata),
            universal_cast_contract: cast.contract,
            synthetic_cast_profile_id: cast.cast_profile_id,
            real_identity_reference_prohibited: true,
          },
        };
      }

      const contracts = referenceContracts(shot, profileMap);
      if (!contracts.length) return shot;
      return {
        ...shot,
        reference_fidelity_contracts: contracts,
        quality: {
          ...object(shot.quality),
          reference_fidelity_required: true,
          minimum_reference_fidelity_score: Math.max(
            ...contracts.map((contract) => contract.minimum_fidelity_score || 0),
          ),
        },
        generation: {
          ...object(shot.generation),
          provider_prompt: [
            text(shot.generation?.provider_prompt || shot.provider_prompt),
            fidelityPrompt(contracts),
          ].filter(Boolean).join("\n\n"),
          provider_parameters: {
            ...object(shot.generation?.provider_parameters),
            reference_fidelity_contracts: contracts,
          },
        },
        metadata: {
          ...object(shot.metadata),
          universal_reference_fidelity_contract:
            "UNIVERSAL_REFERENCE_FIDELITY_V1",
          reference_fidelity_source_asset_ids:
            contracts.map((contract) => contract.source_asset_id),
        },
      };
    }),
  }));

  return {
    ...plan,
    scenes,
    casting_bible: [...castBible.values()],
    reference_fidelity_policy: {
      contract: "UNIVERSAL_REFERENCE_FIDELITY_POLICY_V1",
      exact_brand_marks_use_original_pixels: true,
      real_people_require_identity_atlas: true,
      synthetic_people_must_not_match_real_references: true,
      locations_and_products_use_preserve_and_enhance: true,
      deterministic_enhancement_preferred_when_exactness_is_required: true,
      pure_regeneration_cannot_claim_exact_source_fidelity: true,
    },
    production: {
      ...object(plan.production),
      synthetic_cast_validation_required: castBible.size > 0,
      reference_fidelity_validation_required: scenes.some((scene) =>
        list(scene.shots).some((shot) => list(shot.reference_fidelity_contracts).length),
      ),
    },
    validation_summary: {
      ...object(plan.validation_summary),
      synthetic_cast_profile_count: castBible.size,
      synthetic_cast_shot_count: scenes.reduce((sum, scene) =>
        sum + list(scene.shots).filter((shot) => shot.cast_contract).length,
      0),
      reference_fidelity_shot_count: scenes.reduce((sum, scene) =>
        sum + list(scene.shots).filter((shot) =>
          list(shot.reference_fidelity_contracts).length,
        ).length,
      0),
    },
  };
}

function sanitizeSyntheticForIdentityAtlas(plan = {}) {
  const originals = new Map();
  const scenes = list(plan.scenes).map((scene, sceneIndex) => ({
    ...scene,
    shots: list(scene.shots).map((shot, shotIndex) => {
      if (!shot.cast_contract?.contract) return shot;
      const token = `${sceneIndex}:${shotIndex}`;
      originals.set(token, shot);
      return {
        ...shot,
        title: neutralizeText(shot.title),
        purpose: neutralizeText(shot.purpose),
        subject: neutralizeText(shot.subject),
        action: neutralizeText(shot.action),
        performance: neutralizeText(shot.performance),
        actors: [],
        dialogue: neutralizeValue(shot.dialogue),
        identity_requirements: {
          mode: "SYNTHETIC_CAST",
          preserve_real_identity: false,
        },
        metadata: {
          synthetic_identity_atlas_bridge_token: token,
        },
      };
    }),
  }));
  return { plan: { ...plan, scenes }, originals };
}

function restoreSyntheticAfterIdentityAtlas(plan = {}, originals = new Map()) {
  return {
    ...plan,
    scenes: list(plan.scenes).map((scene) => ({
      ...scene,
      shots: list(scene.shots).map((shot) => {
        const token = text(shot.metadata?.synthetic_identity_atlas_bridge_token);
        const original = token ? originals.get(token) : null;
        return original ? {
          ...shot,
          ...original,
          metadata: {
            ...object(shot.metadata),
            ...object(original.metadata),
          },
          generation: {
            ...object(shot.generation),
            ...object(original.generation),
          },
        } : shot;
      }),
    })),
  };
}

function applyGraphContracts(graph = {}, shots = []) {
  const shotMap = new Map(list(shots).map((shot) => [text(shot.id), shot]));
  const nodes = list(graph.nodes).map((node) => {
    const shotId = text(node.metadata?.shot_id || node.metadata?.final_shot_node_id || node.id);
    const shot = shotMap.get(shotId);
    if (!shot) return node;
    const cast = object(shot.cast_contract);
    const fidelity = list(shot.reference_fidelity_contracts);
    if (!Object.keys(cast).length && !fidelity.length) return node;

    const minimumFidelity = fidelity.length
      ? Math.max(...fidelity.map((contract) => Number(contract.minimum_fidelity_score || 0)))
      : 0;
    const expected = object(node.requirements?.expected_contract);
    const thresholds = {
      ...object(expected.thresholds),
      ...object(node.requirements?.thresholds),
      minimum_reference_fidelity_score: minimumFidelity,
      minimum_cast_realism_score: Object.keys(cast).length ? 90 : 0,
      minimum_cast_continuity_score: Object.keys(cast).length ? 88 : 0,
      minimum_ensemble_uniqueness_score:
        cast.mode === "SYNTHETIC_ENSEMBLE" ? 92 : 0,
    };

    return {
      ...node,
      requirements: {
        ...object(node.requirements),
        cast_contract: cast,
        reference_fidelity_contracts: fidelity,
        synthetic_cast_validation_required: Object.keys(cast).length > 0,
        reference_fidelity_validation_required: fidelity.length > 0,
        compare_exact_source_assets: fidelity.length > 0,
        expected_contract: {
          ...expected,
          cast_contract: cast,
          reference_fidelity_contracts: fidelity,
          thresholds,
        },
        thresholds,
      },
      generation: {
        ...object(node.generation),
        provider_parameters: {
          ...object(node.generation?.provider_parameters),
          cast_contract: cast,
          reference_fidelity_contracts: fidelity,
        },
      },
      metadata: {
        ...object(node.metadata),
        universal_cast_contract: cast.contract || null,
        universal_reference_fidelity_contract: fidelity.length
          ? "UNIVERSAL_REFERENCE_FIDELITY_V1"
          : null,
        reference_fidelity_source_asset_ids:
          fidelity.map((contract) => contract.source_asset_id),
      },
    };
  });
  return {
    ...graph,
    nodes,
    metadata: {
      ...object(graph.metadata),
      universal_reference_casting_contract:
        "UNIVERSAL_REFERENCE_CASTING_GRAPH_V1",
      synthetic_cast_node_count: nodes.filter((node) =>
        node.metadata?.universal_cast_contract,
      ).length,
      reference_fidelity_node_count: nodes.filter((node) =>
        node.metadata?.universal_reference_fidelity_contract,
      ).length,
    },
  };
}

function install() {
  if (CreativeUniversalTemporalDirectionRuntime[INSTALL_FLAG]) return;
  Object.defineProperty(CreativeUniversalTemporalDirectionRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  const temporalCreate = CreativeTemporalMasterPlanRuntime.create.bind(
    CreativeTemporalMasterPlanRuntime,
  );
  CreativeTemporalMasterPlanRuntime.create = async function createWithCastBridge(input = {}) {
    const result = await temporalCreate(input);
    const context = bridgeContext.getStore();
    if (!context || !result?.plan) return result;
    return {
      ...result,
      plan: sanitizePlan(result.plan, context),
    };
  };

  const universalCreate = CreativeUniversalTemporalDirectionRuntime.create.bind(
    CreativeUniversalTemporalDirectionRuntime,
  );
  CreativeUniversalTemporalDirectionRuntime.create = async function createWithUniversalReferenceCasting(input = {}) {
    const assetIntelligence = CreativeUniversalAssetIntelligenceRuntime.analyze({
      project: object(input.project),
      brief: object(input.brief),
      assets: list(input.assets),
    });
    if (!assetIntelligence.passed) {
      throw new Error(
        `UNIVERSAL_ASSET_INTELLIGENCE_BLOCKED:${assetIntelligence.blocking_issues.join(",")}`,
      );
    }
    const context = {
      execution_id: stableId(
        "reference-casting",
        `${input.organization_id}:${input.project?.id}:${Date.now()}:${Math.random()}`,
      ),
      sequence: 0,
      original_shots: new Map(),
      asset_intelligence: assetIntelligence,
    };
    const result = await bridgeContext.run(
      context,
      () => universalCreate(input),
    );
    const plan = restoreAndDirectPlan(object(result.plan), context);
    return {
      ...result,
      plan,
      universal_asset_intelligence: assetIntelligence,
      universal_reference_casting: {
        contract: "UNIVERSAL_REFERENCE_CASTING_DIRECTION_V1",
        synthetic_cast_profile_count: list(plan.casting_bible).length,
        reference_fidelity_required:
          plan.production?.reference_fidelity_validation_required === true,
      },
    };
  };

  const attachToPlan = CreativeIdentityAtlasRuntime.attachToPlan.bind(
    CreativeIdentityAtlasRuntime,
  );
  CreativeIdentityAtlasRuntime.attachToPlan = function attachWithSyntheticCastIsolation(
    plan = {},
    materialization = {},
  ) {
    const sanitized = sanitizeSyntheticForIdentityAtlas(plan);
    const attached = attachToPlan(sanitized.plan, materialization);
    return restoreSyntheticAfterIdentityAtlas(attached, sanitized.originals);
  };

  const graphPlan = ProductionGraphRuntime.plan.bind(ProductionGraphRuntime);
  ProductionGraphRuntime.plan = async function planWithUniversalReferenceCasting(input = {}) {
    const graph = await graphPlan(input);
    const contracted = applyGraphContracts(graph, input.shots);
    if (contracted === graph) return graph;
    return ProductionGraphRuntime.update(graph.id, {
      nodes: contracted.nodes,
      metadata: contracted.metadata,
    });
  };
}

install();

export const CreativeUniversalReferenceCastingRuntime = {
  installed: true,
  classifyShot,
  castContract,
  fidelityContract,
};

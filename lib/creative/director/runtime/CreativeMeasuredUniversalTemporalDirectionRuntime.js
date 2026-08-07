import {
  CreativeMeasuredAudioIntelligenceRuntime,
} from "@/lib/creative/audio/runtime/CreativeMeasuredAudioIntelligenceRuntime";
import {
  CreativeIdentityAtlasRuntime,
} from "@/lib/creative/identity/runtime/CreativeIdentityAtlasRuntime";
import {
  CreativeUniversalTemporalDirectionRuntime,
} from "./CreativeUniversalTemporalDirectionRuntime";

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

function authorized(name) {
  return text(process.env[name]).toLowerCase() === "true";
}

function evidenceConstrainedIdentityAtlasBypass(plan = {}) {
  const approvedIncrementalRepairBudget = Number(
    text(process.env.CREATIVE_APPROVED_INCREMENTAL_REPAIR_BUDGET) || "0",
  );
  const evidenceContract = text(
    plan.metadata?.evidence_constrained_direction?.contract,
  );
  const sourceEvidence = object(
    plan.validation?.source_shot_evidence,
  );

  return Boolean(
    authorized("CREATIVE_EVIDENCE_CONSTRAINED_ZERO_COST_REPLAY_AUTHORIZED") &&
    authorized("CREATIVE_DIRECTION_COMPLETED_REPLAY_AUTHORIZED") &&
    authorized("CREATIVE_ZERO_COST_PROVIDER_FIREWALL_AUTHORIZED") &&
    approvedIncrementalRepairBudget === 0 &&
    !authorized("CREATIVE_ALLOW_AUTOMATIC_REPAIR") &&
    !authorized("REPAIR_EXECUTION_AUTHORIZED") &&
    !authorized("PUBLICATION_AUTHORIZED") &&
    evidenceContract === "CREATIVE_EVIDENCE_CONSTRAINED_DIRECTION_V1" &&
    text(sourceEvidence.contract) === "CREATIVE_SOURCE_SHOT_EVIDENCE_V3" &&
    text(sourceEvidence.readiness).toUpperCase() === "PASS" &&
    Number(sourceEvidence.shot_count) > 0 &&
    Number(sourceEvidence.passed_shot_count) === Number(sourceEvidence.shot_count) &&
    Number(sourceEvidence.failed_shot_count) === 0
  );
}

function deferredIdentityAtlasMaterialization(profiles = []) {
  const references = [
    ...new Set(
      list(profiles)
        .flatMap((profile) => list(profile.reference_asset_ids))
        .map(text)
        .filter(Boolean),
    ),
  ];
  return {
    contract: "CREATIVE_IDENTITY_ATLAS_PLANNING_BOUNDARY_V1",
    status: "DEFERRED_PENDING_EXPLICIT_MATERIALIZATION_AUTHORIZATION",
    profile_count: list(profiles).length,
    profile_ids: list(profiles).map((profile) => profile.id).filter(Boolean),
    reference_asset_ids: references,
    materialization_authorized: false,
    storage_writes_authorized: false,
    database_writes_authorized: false,
    provider_calls_authorized: false,
    task_dispatch_authorized: false,
    production_authorized: false,
    publication_authorized: false,
    storage_writes_executed: false,
    database_writes_executed: false,
    provider_calls_executed: false,
    task_dispatch_executed: false,
  };
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
  if (mime.startsWith("audio/") || /audio|music|voice/.test(type) || /\.(mp3|wav|m4a|aac|flac|ogg|opus)(\?|$)/.test(source)) {
    return "AUDIO";
  }
  return "OTHER";
}

function assetId(asset = {}) {
  return text(asset.id || asset.asset_id);
}

function evidenceText(asset = {}) {
  return [
    asset.name,
    asset.title,
    asset.file_name,
    asset.description,
    asset.analysis?.description,
    asset.analysis?.summary,
    ...list(asset.tags),
    ...list(asset.analysis?.tags),
  ].map(text).filter(Boolean).join(" ").toLowerCase();
}

function selectPrimaryAudio(assets = [], project = {}, brief = {}) {
  const explicitId = text(
    brief.primary_audio_asset_id ||
    brief.metadata?.primary_audio_asset_id ||
    project.metadata?.primary_audio_asset_id ||
    project.metadata?.soundtrack_asset_id,
  );
  return list(assets)
    .filter((asset) => assetKind(asset) === "AUDIO")
    .map((asset) => {
      const duration = finite(
        asset.technical?.duration_seconds ||
        asset.analysis?.duration_seconds ||
        asset.analysis?.technical?.duration_seconds ||
        asset.metadata?.duration_seconds,
      ) || 0;
      const source = evidenceText(asset);
      let score = duration;
      if (/\b(master|song|music|track|single|soundtrack|vocal|mix)\b/.test(source)) score += 10000;
      if (/\b(sfx|sound effect|room tone|ambient|ambience)\b/.test(source)) score -= 5000;
      if (assetId(asset) === explicitId) score += 100000;
      return { asset, score };
    })
    .sort((left, right) => right.score - left.score)[0]?.asset || null;
}

function musicVideoProject(project = {}, brief = {}, audio = null) {
  const corpus = JSON.stringify({ project, brief }).toLowerCase();
  return Boolean(
    audio && (
      project.metadata?.music_video === true ||
      project.metadata?.full_song === true ||
      /music video|full song|artist video|performance video/.test(corpus)
    )
  );
}

function validateMeasuredEvidence(evidence = {}, audio = {}) {
  if (evidence.contract !== "MEASURED_AUDIO_INTELLIGENCE_V1") {
    throw new Error("MEASURED_AUDIO_INTELLIGENCE_CONTRACT_REQUIRED");
  }
  if (text(evidence.source_asset_id) !== assetId(audio)) {
    throw new Error("MEASURED_AUDIO_SOURCE_MISMATCH");
  }
  if (!evidence.aggregate?.signal_presence) {
    throw new Error("MEASURED_AUDIO_SIGNAL_REQUIRED");
  }
  if (!finite(evidence.aggregate?.duration_seconds)) {
    throw new Error("MEASURED_AUDIO_DURATION_REQUIRED");
  }
  if (!list(evidence.energy_curve).length) {
    throw new Error("MEASURED_AUDIO_ENERGY_CURVE_REQUIRED");
  }
  if (!list(evidence.structural_sections).length) {
    throw new Error("MEASURED_AUDIO_STRUCTURAL_SECTIONS_REQUIRED");
  }
  if (!text(evidence.evidence_hash)) {
    throw new Error("MEASURED_AUDIO_EVIDENCE_HASH_REQUIRED");
  }
}

function mergeMeasuredEvidence(asset = {}, evidence = {}) {
  return {
    ...asset,
    analysis: {
      ...object(asset.analysis),
      measured_audio: evidence,
      duration_seconds:
        finite(asset.analysis?.duration_seconds) ||
        finite(evidence.aggregate?.duration_seconds),
      bpm: finite(evidence.tempo?.bpm),
      bpm_confidence: finite(evidence.tempo?.confidence),
      beat_times_seconds: list(evidence.tempo?.beat_times_seconds),
      downbeat_times_seconds: list(evidence.tempo?.downbeat_times_seconds),
      energy_curve: list(evidence.energy_curve),
      structural_sections: list(evidence.structural_sections),
      impacts: list(evidence.impacts),
      signal_evidence_hash: evidence.evidence_hash,
      signal_evidence_contract: evidence.contract,
    },
    metadata: {
      ...object(asset.metadata),
      measured_audio_intelligence: {
        contract: evidence.contract,
        evidence_hash: evidence.evidence_hash,
        confidence: evidence.confidence,
        measured_at: evidence.measured_at,
      },
    },
  };
}

function assertPlanUsesMeasuredEvidence(result = {}, evidence = {}) {
  const synthesis = object(result.universal_creative_synthesis);
  const musicWorld = object(synthesis.music_world);
  const measured = object(musicWorld.measured_evidence || musicWorld.signal_evidence);
  const outputHash = text(
    measured.evidence_hash ||
    musicWorld.measured_evidence_hash ||
    synthesis.measured_audio_evidence_hash,
  );

  if (outputHash && outputHash !== evidence.evidence_hash) {
    throw new Error("CREATIVE_DIRECTION_MEASURED_AUDIO_HASH_MISMATCH");
  }

  const plan = object(result.plan);
  return {
    ...result,
    plan: {
      ...plan,
      measured_audio_intelligence: evidence,
      production: {
        ...object(plan.production),
        measured_audio_intelligence_required: true,
        measured_audio_evidence_hash: evidence.evidence_hash,
        measured_audio_source_asset_id: evidence.source_asset_id,
        prohibit_invented_bpm_or_sections: true,
      },
      validation_summary: {
        ...object(plan.validation_summary),
        measured_audio_contract: evidence.contract,
        measured_audio_evidence_hash: evidence.evidence_hash,
        measured_audio_confidence: evidence.confidence,
        measured_bpm: evidence.tempo?.bpm || null,
        measured_bpm_confidence: evidence.tempo?.confidence || 0,
        measured_beat_count: list(evidence.tempo?.beat_times_seconds).length,
        measured_downbeat_count: list(evidence.tempo?.downbeat_times_seconds).length,
        measured_energy_points: list(evidence.energy_curve).length,
        measured_section_count: list(evidence.structural_sections).length,
        measured_impact_count: list(evidence.impacts).length,
      },
    },
    measured_audio_intelligence: evidence,
  };
}

async function attachIdentityAtlases({
  result,
  organizationId,
  project,
  brief,
  assets,
}) {
  const plan = object(result.plan);
  const profiles = list(
    plan.identity_profiles ||
    plan.subject_profiles ||
    brief.metadata?.universal_subject_profiles ||
    brief.metadata?.universal_asset_intelligence?.person_profiles,
  );
  if (!profiles.length) return result;

  if (evidenceConstrainedIdentityAtlasBypass(plan)) {
    const sourceEvidence = object(plan.validation?.source_shot_evidence);
    const bypass = {
      contract: "SOURCE_LOCKED_EVIDENCE_REPLAY_IDENTITY_ATLAS_BYPASS_V1",
      bypassed: true,
      reason:
        "The direction is source-locked, all shots passed structured source evidence, and identity generation is unauthorized.",
      person_profile_count: profiles.length,
      verified_shot_count: Number(sourceEvidence.passed_shot_count),
      identity_generation_authorized: false,
      identity_keyframe_generation_authorized: false,
      production_authorized: false,
      publication_authorized: false,
    };
    console.log(
      `CREATIVE_IDENTITY_ATLAS_BYPASSED=${JSON.stringify(bypass)}`,
    );
    return {
      ...result,
      plan: {
        ...plan,
        production: {
          ...object(plan.production),
          identity_atlas_required: false,
          identity_generation_authorized: false,
          identity_keyframe_generation_authorized: false,
          source_identity_preservation_required: true,
        },
        metadata: {
          ...object(plan.metadata),
          identity_atlas_bypass: bypass,
        },
      },
      identity_atlas_materialization: bypass,
    };
  }

  if (!authorized("CREATIVE_IDENTITY_ATLAS_MATERIALIZATION_AUTHORIZED")) {
    const deferred = deferredIdentityAtlasMaterialization(profiles);
    return {
      ...result,
      plan: {
        ...plan,
        identity_profiles: profiles,
        production: {
          ...object(plan.production),
          identity_atlas_required: true,
          identity_atlas_materialization_required_before_identity_driven_generation: true,
          identity_atlas_materialization_deferred: true,
          identity_atlas_materialization_authorized: false,
          identity_generation_authorized: false,
          identity_keyframe_generation_authorized: false,
          identity_story_keyframe_required_before_video: true,
          source_identity_preservation_required: true,
        },
        metadata: {
          ...object(plan.metadata),
          identity_atlas_planning_boundary: deferred,
        },
      },
      identity_atlas_materialization: deferred,
    };
  }

  const materialization = await CreativeIdentityAtlasRuntime.materialize({
    organization_id: organizationId,
    creative_project_id: project.id,
    profiles,
    assets,
    policy: {
      ...object(project.metadata?.identity_atlas_policy),
      ...object(brief.metadata?.identity_atlas_policy),
    },
  });
  if (!materialization.all_materialized) {
    throw new Error("IDENTITY_ATLAS_MATERIALIZATION_REQUIRED");
  }

  return {
    ...result,
    plan: CreativeIdentityAtlasRuntime.attachToPlan(plan, materialization),
    identity_atlas_materialization: materialization,
  };
}

export const CreativeMeasuredUniversalTemporalDirectionRuntime = {
  async create(input = {}) {
    const organizationId = input.organization_id;
    const project = object(input.project);
    const brief = object(input.brief);
    const assets = list(input.assets);
    if (!organizationId) throw new Error("organization_id required");
    if (!project.id) throw new Error("creative_project_id required");

    const audio = selectPrimaryAudio(assets, project, brief);
    const isMusicVideo = musicVideoProject(project, brief, audio);
    let directed;

    if (!isMusicVideo) {
      directed = await CreativeUniversalTemporalDirectionRuntime.create(input);
    } else {
      if (!audio) throw new Error("MUSIC_VIDEO_PRIMARY_AUDIO_REQUIRED");

      const existingEvidence = object(
        audio.analysis?.measured_audio ||
        audio.metadata?.measured_audio_intelligence?.evidence,
      );
      const evidence = existingEvidence.contract === "MEASURED_AUDIO_INTELLIGENCE_V1"
        ? existingEvidence
        : await CreativeMeasuredAudioIntelligenceRuntime.analyze({
          organization_id: organizationId,
          asset: audio,
          policy: {
            ...object(project.metadata?.audio_intelligence_policy),
            ...object(brief.metadata?.audio_intelligence_policy),
          },
        });
      validateMeasuredEvidence(evidence, audio);

      const measuredAssets = assets.map((asset) =>
        assetId(asset) === assetId(audio)
          ? mergeMeasuredEvidence(asset, evidence)
          : asset,
      );
      const enrichedBrief = {
        ...brief,
        metadata: {
          ...object(brief.metadata),
          measured_audio_intelligence: evidence,
          director_mandate: {
            ...object(brief.metadata?.director_mandate),
            bpm_must_come_from_measured_audio: true,
            beat_grid_must_come_from_measured_audio: true,
            energy_curve_must_come_from_measured_audio: true,
            signal_sections_are_evidence_not_optional_suggestions: true,
            lyrics_cannot_override_measured_party_energy: true,
            prohibit_invented_bpm_or_fake_audio_sections: true,
          },
        },
      };

      const result = await CreativeUniversalTemporalDirectionRuntime.create({
        ...input,
        brief: enrichedBrief,
        assets: measuredAssets,
      });
      directed = assertPlanUsesMeasuredEvidence(result, evidence);
    }

    return attachIdentityAtlases({
      result: directed,
      organizationId,
      project,
      brief,
      assets,
    });
  },
};
function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function range(value) {
  const source = object(value);
  const start = finite(source.start_seconds, -1);
  const end = finite(source.end_seconds, -1);
  const suppliedDuration = finite(source.duration_seconds, -1);
  const duration = end > start ? end - start : suppliedDuration;
  if (start < 0 || duration <= 0) return null;
  return {
    start_seconds: start,
    end_seconds: start + duration,
    duration_seconds: duration,
  };
}

function upper(value) {
  return text(value).toUpperCase();
}

function candidateStatus(candidate) {
  return upper(candidate?.metadata?.ai_verification_status || "NOT_SELECTED");
}

function exactOriginalRange(moment, shortlistCandidate) {
  const metadata = object(moment?.metadata);
  const direct = range(metadata.original_source_range);
  if (metadata.original_source_range_exact === true && direct) return direct;

  const candidateRange = range(shortlistCandidate?.metadata?.original_source_range);
  const evidenceSection = range(metadata.performance_evidence?.section);
  if (!candidateRange || !evidenceSection) return null;

  const start = candidateRange.start_seconds + evidenceSection.start_seconds;
  const end = candidateRange.start_seconds + evidenceSection.end_seconds;
  if (end > candidateRange.end_seconds + 0.001) return null;

  return {
    start_seconds: Number(start.toFixed(6)),
    end_seconds: Number(end.toFixed(6)),
    duration_seconds: Number((end - start).toFixed(6)),
  };
}

function semanticCoverage(moment, policy = {}) {
  const evidence = object(moment?.metadata?.performance_evidence);
  const section = range(evidence.section);
  const frames = Array.isArray(evidence.frames) ? evidence.frames : [];
  const maximumGap = Math.max(
    0.25,
    finite(
      policy.maximum_semantic_sample_gap_seconds ??
        policy.maximumSemanticSampleGapSeconds,
      2,
    ),
  );
  const minimumQuality = Math.max(
    0,
    finite(
      policy.minimum_verified_frame_quality_score ??
        policy.minimumVerifiedFrameQualityScore,
      55,
    ),
  );

  if (!section || evidence.usable !== true || !frames.length) {
    return {
      complete: false,
      reason: "SEMANTIC_EVIDENCE_REQUIRED",
      sample_count: frames.length,
      maximum_gap_seconds: null,
    };
  }

  const validFrames = frames.filter((frame) => {
    const analysis = object(frame?.analysis);
    return (
      upper(analysis.status) === "VERIFIED" &&
      analysis.primary_performer_present === true &&
      analysis.lead_vocalist_present === true &&
      analysis.usable_for_showreel === true &&
      finite(analysis.technical_quality_score, 0) >= minimumQuality &&
      upper(analysis.occlusion_risk) !== "HIGH"
    );
  });

  if (validFrames.length !== frames.length) {
    return {
      complete: false,
      reason: "SEMANTIC_FRAME_REJECTED",
      sample_count: frames.length,
      valid_sample_count: validFrames.length,
      maximum_gap_seconds: null,
    };
  }

  const sampleTimes = validFrames
    .map((frame) => finite(frame.time_seconds))
    .filter((value) => value !== null)
    .sort((left, right) => left - right);
  const points = [section.start_seconds, ...sampleTimes, section.end_seconds];
  let observedMaximumGap = 0;
  for (let index = 1; index < points.length; index += 1) {
    observedMaximumGap = Math.max(observedMaximumGap, points[index] - points[index - 1]);
  }

  if (observedMaximumGap > maximumGap + 0.001) {
    return {
      complete: false,
      reason: "SEMANTIC_COVERAGE_TOO_SPARSE",
      sample_count: frames.length,
      valid_sample_count: validFrames.length,
      maximum_gap_seconds: Number(observedMaximumGap.toFixed(6)),
      allowed_gap_seconds: maximumGap,
    };
  }

  return {
    complete: true,
    reason: null,
    sample_count: frames.length,
    valid_sample_count: validFrames.length,
    maximum_gap_seconds: Number(observedMaximumGap.toFixed(6)),
    allowed_gap_seconds: maximumGap,
    quality_score: finite(evidence.quality_score, 0),
    performance_energy_score: finite(evidence.performance_energy_score, 0),
    primary_performer_ratio: finite(evidence.primary_performer_ratio, 0),
    lead_vocalist_ratio: finite(evidence.lead_vocalist_ratio, 0),
    usable_ratio: finite(evidence.usable_ratio, 0),
  };
}

function reviewReady(moment, policy = {}) {
  const requireHuman =
    policy.require_human_approval !== false &&
    policy.requireHumanApproval !== false;
  const review = object(moment?.review);
  if (review.ai_reviewed !== true) return false;
  if (!requireHuman) return true;
  return review.human_reviewed === true && review.approved === true;
}

function verifiedMomentRecord(moment, candidate, policy = {}) {
  const metadata = object(moment?.metadata);
  const candidateMetadata = object(candidate?.metadata);
  const exactRange = exactOriginalRange(moment, candidate);
  const coverage = semanticCoverage(moment, policy);
  const verifiedIds = Array.isArray(candidateMetadata.verified_moment_ids)
    ? candidateMetadata.verified_moment_ids.map(String)
    : [];
  const sourceAssetNodeId = text(metadata.source_asset_node_id);

  const reasons = [];
  if (!candidate) reasons.push("SHORTLIST_CANDIDATE_REQUIRED");
  if (candidateStatus(candidate) !== "COMPLETE") {
    reasons.push("AI_VERIFICATION_COMPLETE_REQUIRED");
  }
  if (!verifiedIds.includes(String(moment?.id || ""))) {
    reasons.push("VERIFIED_MOMENT_LINK_REQUIRED");
  }
  if (finite(candidateMetadata.paid_analysis_calls, 0) <= 0) {
    reasons.push("DURABLE_ANALYSIS_USAGE_REQUIRED");
  }
  if (metadata.bounded_paid_verification !== true) {
    reasons.push("BOUNDED_VERIFICATION_REQUIRED");
  }
  if (metadata.performance_verified !== true) {
    reasons.push("PERFORMANCE_VERIFICATION_REQUIRED");
  }
  if (!sourceAssetNodeId) reasons.push("SOURCE_ASSET_REQUIRED");
  if (!text(moment?.url)) reasons.push("VERIFIED_MEDIA_URL_REQUIRED");
  if (!exactRange) reasons.push("EXACT_ORIGINAL_SOURCE_RANGE_REQUIRED");
  if (!coverage.complete) reasons.push(coverage.reason);
  if (!reviewReady(moment, policy)) reasons.push("EDITORIAL_APPROVAL_REQUIRED");

  return {
    moment,
    candidate,
    eligible: reasons.length === 0,
    reasons,
    source_asset_node_id: sourceAssetNodeId || null,
    exact_original_source_range: exactRange,
    semantic_coverage: coverage,
    score: finite(
      metadata.score ?? moment?.intelligence?.reuse_score ??
        moment?.intelligence?.quality_score,
      0,
    ),
  };
}

export function evaluateVerifiedMoments(nodes = [], policy = {}) {
  const byId = new Map(nodes.map((node) => [String(node.id), node]));
  const records = nodes
    .filter((node) =>
      node?.type === "MOMENT" &&
      node?.status !== "ARCHIVED" &&
      node?.metadata?.bounded_paid_verification === true,
    )
    .map((moment) => verifiedMomentRecord(
      moment,
      byId.get(String(moment?.metadata?.local_shortlist_candidate_id || "")) || null,
      policy,
    ));

  const eligible = records
    .filter((record) => record.eligible)
    .sort((left, right) => right.score - left.score);

  return {
    records,
    eligible,
    rejected: records.filter((record) => !record.eligible),
  };
}

export function buildVerifiedSelection({
  nodes = [],
  target_duration_seconds,
  maximum_clips_per_source = 4,
  policy = {},
} = {}) {
  const targetDuration = Math.max(1, finite(target_duration_seconds, 180));
  const maximumPerSource = Math.max(1, Math.floor(finite(maximum_clips_per_source, 4)));
  const evaluation = evaluateVerifiedMoments(nodes, policy);
  const sourceCounts = new Map();
  const preferred = [];
  const overflow = [];

  for (const record of evaluation.eligible) {
    const sourceId = record.source_asset_node_id;
    const count = sourceCounts.get(sourceId) || 0;
    if (count < maximumPerSource) {
      preferred.push(record);
      sourceCounts.set(sourceId, count + 1);
    } else {
      overflow.push(record);
    }
  }

  const entries = [];
  let cursor = 0;
  for (const record of [...preferred, ...overflow]) {
    if (cursor >= targetDuration - 0.001) break;
    const sourceRange = record.exact_original_source_range;
    const duration = Math.min(
      sourceRange.duration_seconds,
      targetDuration - cursor,
    );
    if (duration <= 0) continue;

    entries.push({
      index: entries.length + 1,
      source_asset_node_id: record.source_asset_node_id,
      source_clip_node_id: record.moment.id,
      source_moment_node_id: record.moment.id,
      source_shortlist_candidate_id: record.candidate.id,
      source_url: record.moment.url,
      source_in_seconds: sourceRange.start_seconds,
      source_out_seconds: sourceRange.start_seconds + duration,
      timeline_in_seconds: cursor,
      timeline_out_seconds: cursor + duration,
      duration_seconds: duration,
      selection_score: record.score,
      performance_verified: true,
      semantic_verification_status: "COMPLETE",
      semantic_coverage: record.semantic_coverage,
      original_audio_preserved: true,
      exact_lip_sync_required: true,
      human_review_required:
        policy.require_human_approval !== false &&
        policy.requireHumanApproval !== false,
      exact_original_source_range: sourceRange,
    });
    cursor += duration;
  }

  return {
    ...evaluation,
    entries,
    duration_seconds: Number(cursor.toFixed(6)),
    distinct_source_count: new Set(
      entries.map((entry) => entry.source_asset_node_id).filter(Boolean),
    ).size,
  };
}

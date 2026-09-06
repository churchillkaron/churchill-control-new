import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { CreativeAutonomousRepairDirectorRuntime } from "./CreativeAutonomousRepairDirectorRuntime";

const FLAG = Symbol.for("avantiqo.creative.human-temporal-span-repair.v1");
const CONTRACT = "CREATIVE_HUMAN_TEMPORAL_SPAN_REPAIR_V1";
const MERGE_GAP_SECONDS = 0.25;
const BOUNDARY_HANDLE_SECONDS = 0.2;

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function timecodeSeconds(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Number(value));
  const source = text(value);
  if (!source) return null;
  const normalized = source.replace(",", ".");
  if (/^\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);
  const parts = normalized.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 2) return Math.max(0, parts[0] * 60 + parts[1]);
  if (parts.length === 3) {
    return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  }
  return null;
}

function humanTask(task = {}) {
  const input = object(task.input);
  const generation = object(input.generation);
  const requirements = object(input.requirements);
  const metadata = object(task.metadata);
  const identityLock = object(input.identity_lock);
  const nestedIdentityLock = object(generation.identity_lock);
  const serialized = JSON.stringify({
    type: task.type,
    title: task.title,
    capability: task.capability,
    requirements,
    metadata: {
      human_continuity_contract: metadata.human_continuity_contract,
      identity_profile_id: metadata.identity_profile_id,
      identity_expected: metadata.identity_expected,
      person_expected: metadata.person_expected,
    },
  }).toLowerCase();
  return Boolean(
    Object.keys(identityLock).length ||
    Object.keys(nestedIdentityLock).length ||
    metadata.human_continuity_contract ||
    metadata.identity_profile_id ||
    metadata.identity_expected === true ||
    metadata.person_expected === true ||
    list(requirements.actors).length ||
    /\b(person|people|human|actor|talent|founder|presenter|performer|customer|guest|staff|worker|chef|waiter|woman|man|girl|boy)\b/.test(serialized)
  );
}

function failureLabel(value, fallback = "human_temporal_continuity") {
  const source = text(value).toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return source.replace(/^_+|_+$/g, "") || fallback;
}

function spanFromObject(value = {}, inheritedReason = null) {
  const source = object(value);
  const start = timecodeSeconds(
    source.start_seconds ?? source.start_time ?? source.start ?? source.from_seconds ?? source.from,
  );
  const end = timecodeSeconds(
    source.end_seconds ?? source.end_time ?? source.end ?? source.to_seconds ?? source.to,
  );
  if (start === null && end === null) return null;
  const resolvedStart = start ?? end;
  const resolvedEnd = Math.max(resolvedStart, end ?? resolvedStart);
  return {
    start_seconds: Number(resolvedStart.toFixed(3)),
    end_seconds: Number(resolvedEnd.toFixed(3)),
    reasons: [failureLabel(
      source.reason || source.failure || source.check || source.id || inheritedReason,
    )],
  };
}

function timestampSpans(value, inheritedReason = null, depth = 0, output = []) {
  if (depth > 10 || value === null || value === undefined) return output;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" || typeof item === "number") {
        const second = timecodeSeconds(item);
        if (second !== null) {
          output.push({
            start_seconds: Number(second.toFixed(3)),
            end_seconds: Number(second.toFixed(3)),
            reasons: [failureLabel(inheritedReason)],
          });
        }
      } else {
        timestampSpans(item, inheritedReason, depth + 1, output);
      }
    }
    return output;
  }
  if (typeof value !== "object") return output;

  const source = object(value);
  const reason = source.id || source.check || source.failure || source.reason || inheritedReason;
  const direct = spanFromObject(source, reason);
  if (direct) output.push(direct);

  for (const [key, child] of Object.entries(source)) {
    const normalized = key.toLowerCase();
    if (normalized === "timestamps" && Array.isArray(child)) {
      timestampSpans(child, reason, depth + 1, output);
      continue;
    }
    if (
      normalized.includes("span") ||
      normalized.includes("window") ||
      normalized.includes("failure") ||
      normalized.includes("check") ||
      normalized.includes("evidence") ||
      normalized.includes("temporal") ||
      normalized.includes("review") ||
      normalized.includes("validation")
    ) {
      timestampSpans(child, reason || key, depth + 1, output);
    }
  }
  return output;
}

function mergeSpans(spans = []) {
  const sorted = list(spans)
    .filter((span) => finite(span.start_seconds) !== null && finite(span.end_seconds) !== null)
    .map((span) => ({
      start_seconds: Math.max(0, Number(span.start_seconds)),
      end_seconds: Math.max(Number(span.start_seconds), Number(span.end_seconds)),
      reasons: [...new Set(list(span.reasons).map(failureLabel))],
    }))
    .sort((left, right) => left.start_seconds - right.start_seconds);
  const merged = [];
  for (const span of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || span.start_seconds > previous.end_seconds + MERGE_GAP_SECONDS) {
      merged.push({ ...span });
      continue;
    }
    previous.end_seconds = Math.max(previous.end_seconds, span.end_seconds);
    previous.reasons = [...new Set([...previous.reasons, ...span.reasons])];
  }
  return merged.map((span, index) => ({
    index: index + 1,
    start_seconds: Number(span.start_seconds.toFixed(3)),
    end_seconds: Number(span.end_seconds.toFixed(3)),
    duration_seconds: Number(Math.max(0, span.end_seconds - span.start_seconds).toFixed(3)),
    reasons: span.reasons,
    preserve_before_seconds: Number(Math.max(0, span.start_seconds - BOUNDARY_HANDLE_SECONDS).toFixed(3)),
    preserve_after_seconds: Number((span.end_seconds + BOUNDARY_HANDLE_SECONDS).toFixed(3)),
  }));
}

function repairItems(result = {}) {
  const candidates = [
    ...list(result.created),
    ...list(result.pair_recovery?.created),
  ];
  const seen = new Set();
  return candidates.filter((item) => {
    const replacementId = text(
      item.replacement_source_task_id || item.replacement_task_id,
    );
    if (!replacementId || seen.has(replacementId)) return false;
    seen.add(replacementId);
    return true;
  });
}

async function bindTemporalScope(item = {}) {
  const replacementId = text(
    item.replacement_source_task_id || item.replacement_task_id,
  );
  const sourceId = text(item.source_task_id);
  const qualityId = text(
    item.review_task_id || item.failed_or_rejected_task_id || item.repair_quality_task_id,
  );
  if (!replacementId || !sourceId) return null;

  const [replacement, source, quality] = await Promise.all([
    ProductionTaskRuntime.get(replacementId),
    ProductionTaskRuntime.get(sourceId),
    qualityId ? ProductionTaskRuntime.get(qualityId) : Promise.resolve(null),
  ]);
  if (!replacement || !source || !humanTask(source)) return null;

  const spans = mergeSpans([
    ...timestampSpans(quality?.output, "quality_review"),
    ...timestampSpans(source?.output?.perceptual_validation, "perceptual_validation"),
    ...timestampSpans(source?.output?.cinema_endpoint_fidelity, "cinema_endpoint_fidelity"),
  ]);
  if (!spans.length) return null;

  const specification = object(replacement.input?.repair_specification);
  const temporalScope = {
    contract: CONTRACT,
    mode: "SURGICAL_FAILED_SPANS_ONLY",
    spans,
    span_count: spans.length,
    preserve_unaffected_frames: true,
    preserve_identity_truth: true,
    preserve_anatomy_outside_failed_spans: true,
    preserve_camera_path_outside_failed_spans: true,
    preserve_timing: true,
    preserve_audio_timing: true,
    preserve_governed_endpoints: true,
    boundary_anchor_required: true,
    boundary_handle_seconds: BOUNDARY_HANDLE_SECONDS,
    regenerate_full_shot_forbidden_when_span_repair_supported: true,
    full_shot_rereview_required_after_repair: true,
  };

  await ProductionTaskRuntime.update(replacement.id, {
    input: {
      ...object(replacement.input),
      repair_specification: {
        ...specification,
        change_only_failed_requirements: true,
        temporal_scope: temporalScope,
      },
    },
    metadata: {
      ...object(replacement.metadata),
      human_temporal_span_repair_contract: CONTRACT,
      human_temporal_span_repair_bound: true,
      human_temporal_span_count: spans.length,
      human_temporal_full_shot_regeneration_discouraged: true,
      human_temporal_full_rereview_required: true,
    },
  });

  const reviewId = text(item.repair_review_task_id || item.replacement_review_task_id);
  if (reviewId) {
    const review = await ProductionTaskRuntime.get(reviewId);
    if (review) {
      await ProductionTaskRuntime.update(review.id, {
        input: {
          ...object(review.input),
          repair_evaluation: {
            ...object(review.input?.repair_evaluation),
            temporal_scope: temporalScope,
            reject_regressions_outside_repaired_spans: true,
            verify_boundary_continuity: true,
            verify_identity_across_repair_boundaries: true,
            verify_anatomy_across_repair_boundaries: true,
          },
        },
        metadata: {
          ...object(review.metadata),
          human_temporal_span_repair_contract: CONTRACT,
          human_temporal_full_rereview_required: true,
        },
      });
    }
  }

  return {
    source_task_id: source.id,
    replacement_task_id: replacement.id,
    repair_review_task_id: reviewId || null,
    spans,
  };
}

function install() {
  if (CreativeAutonomousRepairDirectorRuntime[FLAG]) return;
  const ensureWithoutTemporalScope =
    CreativeAutonomousRepairDirectorRuntime.ensure.bind(
      CreativeAutonomousRepairDirectorRuntime,
    );
  Object.defineProperty(CreativeAutonomousRepairDirectorRuntime, FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeAutonomousRepairDirectorRuntime.ensure = async function ensureHumanTemporalSpanRepair(
    input = {},
  ) {
    const result = await ensureWithoutTemporalScope(input);
    const bound = [];
    for (const item of repairItems(result)) {
      const temporal = await bindTemporalScope(item);
      if (temporal) bound.push(temporal);
    }
    return {
      ...result,
      human_temporal_span_repairs: bound,
      human_temporal_span_repair_contract: CONTRACT,
    };
  };
}

install();

export const CreativeHumanTemporalSpanRepairBootstrap = Object.freeze({
  installed: true,
  contract: CONTRACT,
  bindTemporalScope,
});

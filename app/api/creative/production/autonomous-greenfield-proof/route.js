export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 600;

import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  CreativeAutonomousFullSceneProofRuntime,
} from "@/lib/creative/production/approval/CreativeAutonomousFullSceneProofRuntime";

import {
  POST as composeMissionPost,
} from "@/app/api/creative/missions/compose/route";

import {
  POST as directorCanaryPost,
} from "@/app/api/creative/director-jobs/canary-v2/route";

const DIRECTOR_MAXIMUM_SHOT_DURATION_SECONDS = 15;
const DIRECTOR_MINIMUM_SHOT_DURATION_SECONDS = 0.1;

const MISSION_COMPOSITION_RECOVERY_DIRECTIVES = [
  {
    mode: "STRICT_COMPACT_JSON",
    instruction:
      "Return one compact strict JSON object only. Keep all required fields, limit the mission to the strongest production-ready master campaign system, use no prose outside JSON, and keep every array concise.",
    maximum_deliverables: 5,
    maximum_workflow_items: 13,
  },
  {
    mode: "STRICT_MINIMAL_JSON_REPAIR",
    instruction:
      "A previous structured response was invalid or incomplete. Recompose from the original request and supplied business truth. Return valid compact JSON only, with one master FILM deliverable plus only essential supporting deliverables. Never use markdown or commentary.",
    maximum_deliverables: 4,
    maximum_workflow_items: 13,
  },
  {
    mode: "FAILSAFE_PRODUCTION_BLUEPRINT",
    instruction:
      "Produce the smallest complete production-ready JSON blueprint that satisfies the contract. Include one master FILM deliverable, one IMAGE proof system, one AUDIO system, the complete canonical workflow, explicit quality policy, decision gates, and integer confidence. JSON only.",
    maximum_deliverables: 3,
    maximum_workflow_items: 13,
  },
];

const RECOVERABLE_DIRECTOR_FAILURE_CODES = [
  "CREATIVE_DIRECTOR_JOB_PATCH_EMPTY",
  "CREATIVE_DIRECTOR_JOB_SCENE_PATCH_EMPTY",
  "CREATIVE_DIRECTOR_JOB_SHOT_PATCH_EMPTY",
  "CREATIVE_DIRECTOR_JOB_PATCH_REQUIRED",
  "CREATIVE_DIRECTOR_JOB_TOP_LEVEL_SCENES_FORBIDDEN",
  "CREATIVE_DIRECTOR_JOB_STRUCTURE_CHANGE_FORBIDDEN",
  "CREATIVE_DIRECTOR_JOB_PLAN_SCENES_REQUIRED",
  "CREATIVE_DIRECTOR_JOB_SCENE_PATCH_NUMBER_INVALID",
  "CREATIVE_DIRECTOR_JOB_SHOT_PATCH_NUMBER_INVALID",
  "CREATIVE_DIRECTOR_FINAL_AUDIT_REJECTED",
  "CREATIVE_DIRECTOR_DURATION_RECONCILIATION_IMPOSSIBLE",
];

const RECOVERABLE_DIRECTOR_ENVELOPES = [
  "CREATIVE_CANARY_V2_UNSUPPORTED_FAILED_STEP",
  "CREATIVE_CANARY_V2_CYCLE_LIMIT_REACHED",
  "CREATIVE_DIRECTOR_JOB_FAILED_STEP_RETRY_REQUIRED",
];

const EMPTY_DIRECTOR_PATCH_CODES = new Set([
  "CREATIVE_DIRECTOR_JOB_PATCH_EMPTY",
  "CREATIVE_DIRECTOR_JOB_SCENE_PATCH_EMPTY",
  "CREATIVE_DIRECTOR_JOB_SHOT_PATCH_EMPTY",
]);

function text(value) {
  return String(value || "").trim();
}

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function finiteNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function directorDurationContract(durationSeconds) {
  const targetDurationSeconds = Math.max(
    DIRECTOR_MINIMUM_SHOT_DURATION_SECONDS,
    finiteNumber(durationSeconds, 30),
  );
  const minimumShotCount = Math.max(
    1,
    Math.ceil(
      targetDurationSeconds /
      DIRECTOR_MAXIMUM_SHOT_DURATION_SECONDS,
    ),
  );

  return {
    exact_total_duration_seconds: targetDurationSeconds,
    minimum_shot_duration_seconds:
      DIRECTOR_MINIMUM_SHOT_DURATION_SECONDS,
    maximum_shot_duration_seconds:
      DIRECTOR_MAXIMUM_SHOT_DURATION_SECONDS,
    minimum_required_shot_count: minimumShotCount,
    dynamic_scene_and_shot_count_required: true,
    exact_duration_sum_required: true,
    filler_or_padding_forbidden: true,
    every_shot_requires_distinct_story_or_editorial_purpose: true,
  };
}

function directorPatchContract() {
  return {
    focused_patch_existing_addresses_only: true,
    focused_patch_path: "plan_patch.scenes",
    structural_change_path: "plan_patch.production_bible",
    new_scene_or_shot_requires_complete_production_bible: true,
    shot_number_must_exist_in_target_scene_for_focused_patch: true,
    scene_number_must_exist_for_focused_patch: true,
    scenes_forbidden_in_top_level_patch: true,
    schema_placeholder_entries_forbidden: true,
    empty_scene_entries_must_be_omitted: true,
    empty_shot_entries_must_be_omitted: true,
    empty_patch_forbidden_unless_no_change_required: true,
  };
}

function headersFrom(req) {
  const headers = new Headers({
    "Content-Type": "application/json",
  });
  const cookie = req.headers.get("cookie");
  const authorization = req.headers.get("authorization");

  if (cookie) headers.set("cookie", cookie);
  if (authorization) {
    headers.set("authorization", authorization);
  }

  return headers;
}

function internalRequest({ req, pathname, body }) {
  return new Request(new URL(pathname, req.url), {
    method: "POST",
    headers: headersFrom(req),
    body: JSON.stringify(body),
  });
}

async function invoke({ handler, req, pathname, body }) {
  const response = await handler(
    internalRequest({ req, pathname, body }),
  );
  let payload;

  try {
    payload = await response.json();
  } catch (error) {
    payload = {
      success: false,
      error: "CREATIVE_INTERNAL_RESPONSE_INVALID",
      details: { message: error.message },
    };
  }

  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

function missionCompositionFailureMarker(invocation = {}) {
  return JSON.stringify({
    status: invocation.status || null,
    error: invocation.payload?.error || null,
    code: invocation.payload?.code || null,
    details: invocation.payload?.details || null,
  }).toUpperCase();
}

function recoverableMissionCompositionFailure(invocation = {}) {
  if (invocation.ok) return false;

  const marker = missionCompositionFailureMarker(invocation);

  return (
    marker.includes("OPENAI_STRUCTURED_JSON_INVALID") ||
    marker.includes("OPENAI_STRUCTURED_JSON_") ||
    marker.includes("AI_DIRECTOR_INVALID_JSON") ||
    marker.includes("CREATIVE_AI_DIRECTOR_INVALID_OUTPUT") ||
    marker.includes("AI_DIRECTOR_EXECUTION_FAILED") ||
    marker.includes("CREATIVE_INTERNAL_RESPONSE_INVALID")
  );
}

async function composeMissionWithRecovery({
  req,
  organizationId,
  entityId,
  periodId,
  objective,
  durationSeconds,
  context,
  maximumAttempts = 3,
}) {
  const attempts = [];
  const boundedAttempts = Math.max(
    1,
    Math.min(
      MISSION_COMPOSITION_RECOVERY_DIRECTIVES.length,
      Math.round(Number(maximumAttempts || 3)),
    ),
  );
  let lastInvocation = null;

  for (let index = 0; index < boundedAttempts; index += 1) {
    const directive =
      MISSION_COMPOSITION_RECOVERY_DIRECTIVES[index];
    const invocation = await invoke({
      handler: composeMissionPost,
      req,
      pathname: "/api/creative/missions/compose",
      body: {
        organization_id: organizationId,
        entity_id: entityId,
        period_id: periodId,
        request: objective,
        context: {
          ...(context || {}),
          greenfield_reality_test: true,
          requested_master_duration_seconds:
            durationSeconds,
          director_duration_contract:
            directorDurationContract(durationSeconds),
          director_patch_contract:
            directorPatchContract(),
          production_ambition:
            "WORLD_CLASS_CINEMATIC_ADVERTISING",
          autonomous_story_required: true,
          full_scene_reference_synthesis_required: true,
          mask_composition_forbidden: true,
          mission_composition_recovery: {
            enabled: true,
            attempt: index + 1,
            maximum_attempts: boundedAttempts,
            mode: directive.mode,
            instruction: directive.instruction,
            maximum_deliverables:
              directive.maximum_deliverables,
            maximum_workflow_items:
              directive.maximum_workflow_items,
            preserve_original_business_truth: true,
            preserve_original_request: true,
            strict_json_only: true,
          },
        },
      },
    });

    lastInvocation = invocation;
    attempts.push({
      attempt: index + 1,
      mode: directive.mode,
      status: invocation.status,
      success:
        invocation.ok &&
        invocation.payload?.success !== false,
      error: invocation.payload?.error || null,
      code: invocation.payload?.code || null,
      recoverable:
        recoverableMissionCompositionFailure(invocation),
    });

    if (
      invocation.ok &&
      invocation.payload?.success !== false
    ) {
      return {
        ...invocation,
        recovery: {
          attempted: index > 0,
          recovered: index > 0,
          attempt_count: index + 1,
          attempts,
        },
      };
    }

    if (!recoverableMissionCompositionFailure(invocation)) {
      break;
    }
  }

  return {
    ...(lastInvocation || {
      ok: false,
      status: 500,
      payload: {
        success: false,
        error:
          "CREATIVE_GREENFIELD_MISSION_COMPOSITION_NOT_EXECUTED",
      },
    }),
    recovery: {
      attempted: attempts.length > 1,
      recovered: false,
      attempt_count: attempts.length,
      attempts,
    },
  };
}

function directorFailure(invocation = {}) {
  const payload = object(invocation.payload);
  const details = object(payload.details);
  const stepError = object(details.step_error);
  const job = object(payload.job);
  const jobError = object(job.error);
  const jobErrorDetails = object(jobError.details);
  const failedError = object(jobErrorDetails.failed_error);
  const failedErrorDetails = object(failedError.details);

  return {
    job_id:
      details.job_id ||
      job.id ||
      null,
    step_key:
      details.step_key ||
      job.current_step_key ||
      jobErrorDetails.failed_step_key ||
      failedErrorDetails.audit_step ||
      null,
    step_status:
      details.step_status ||
      (job.status === "FAILED" ? "FAILED" : null),
    error:
      payload.error ||
      jobError.code ||
      null,
    error_code:
      stepError.code ||
      failedError.code ||
      jobError.code ||
      payload.code ||
      payload.error ||
      null,
    error_message:
      stepError.message ||
      failedError.message ||
      jobError.message ||
      payload.error ||
      null,
    error_details:
      stepError.details ||
      failedError.details ||
      jobErrorDetails ||
      details.runtime_details ||
      null,
    envelope_error:
      payload.error ||
      null,
  };
}

function recoverableDirectorFailure(invocation = {}) {
  if (invocation.ok) return false;

  const failure = directorFailure(invocation);
  const marker = JSON.stringify({
    error: failure.error,
    envelope_error: failure.envelope_error,
    error_code: failure.error_code,
    step_key: failure.step_key,
  }).toUpperCase();
  const recoverableEnvelope =
    RECOVERABLE_DIRECTOR_ENVELOPES.some((code) =>
      marker.includes(code),
    );
  const recoverableFailure =
    RECOVERABLE_DIRECTOR_FAILURE_CODES.some((code) =>
      marker.includes(code),
    );

  return Boolean(recoverableEnvelope && recoverableFailure);
}

function exactAuditFailures(failure = {}) {
  const details = object(failure.error_details);
  const storyboard = object(details.storyboard);

  return list(details.failures).length
    ? list(details.failures).map(String)
    : list(storyboard.failures).map(String);
}

function directorRecoveryInstruction(failure = {}) {
  const code = String(failure.error_code || "").toUpperCase();

  if (EMPTY_DIRECTOR_PATCH_CODES.has(code)) {
    const details = object(failure.error_details);
    const sceneNumber = finiteNumber(details.scene_number, null);
    const shotNumber = finiteNumber(details.shot_number, null);
    const failedAddress = [
      sceneNumber !== null ? `scene ${sceneNumber}` : null,
      shotNumber !== null ? `shot ${shotNumber}` : null,
    ].filter(Boolean).join(" ");

    return [
      `The previous specialist returned an empty schema-placeholder patch${failedAddress ? ` for ${failedAddress}` : ""}.`,
      "Never copy example placeholder entries from the output schema into the result.",
      "Never return a scene entry whose scene patch is empty and whose shots array contains no substantive shot patch.",
      "Never return a shot entry with patch {}, shot_patch {}, or no substantive fields.",
      "Omit every unmodified scene and shot from plan_patch.scenes entirely.",
      "When one or more existing fields genuinely require correction, return only those concrete mission-specific fields at their exact existing addresses.",
      "When the editorial decision changes scene count, shot count, order, duration distribution or introduces any new address, return the entire corrected plan only in plan_patch.production_bible and set plan_patch.scenes to an empty array.",
      "When this department genuinely requires no correction, set plan_patch.no_change_required=true, set plan_patch.scenes to an empty array, keep plan_patch.top_level empty and omit production_bible.",
      "Never set no_change_required=false unless at least one substantive patch or a complete production_bible is present.",
      "Preserve canonical references, exact duration, factual truth and all valid decisions.",
      "All production dispatch, image generation and video generation remain forbidden.",
    ].join(" ");
  }

  if (code === "CREATIVE_DIRECTOR_JOB_SHOT_PATCH_NUMBER_INVALID") {
    const details = object(failure.error_details);
    const sceneNumber = finiteNumber(details.scene_number, null);
    const receivedShotNumber = finiteNumber(details.received, null);
    const expectedCount = Math.max(
      0,
      finiteNumber(details.expected_count, 0),
    );

    return [
      "The previous specialist attempted to address a shot number that does not exist in the current scene.",
      `Scene ${sceneNumber ?? "unknown"} currently contains ${expectedCount} addressable shot(s), but the patch attempted shot ${receivedShotNumber ?? "unknown"}.`,
      "Focused plan_patch.scenes entries may patch only scene and shot addresses that already exist in the supplied production bible.",
      "Never use a focused patch to append, insert, renumber or create a new shot.",
      "When the narrative or duration correction requires a different scene count, shot count, shot order or any new address, return the entire corrected plan only in plan_patch.production_bible, including every preserved and new scene and shot.",
      "Set plan_patch.scenes to an empty array when returning production_bible; do not include schema-placeholder scene or shot entries beside it.",
      "Do not place scenes in plan_patch.top_level or plan_patch.plan.",
      "When no structural change is required, target only existing shot numbers from 1 through the supplied expected count and omit all invented addresses.",
      "Preserve exact duration, canonical references, business truth and all valid existing direction.",
      "All production dispatch, image generation and video generation remain forbidden.",
    ].join(" ");
  }

  if (code === "CREATIVE_DIRECTOR_JOB_SCENE_PATCH_NUMBER_INVALID") {
    const details = object(failure.error_details);
    const receivedSceneNumber = finiteNumber(details.received, null);
    const expectedCount = Math.max(
      0,
      finiteNumber(details.expected_count, 0),
    );

    return [
      "The previous specialist attempted to address a scene number that does not exist in the current production bible.",
      `The current plan contains ${expectedCount} addressable scene(s), but the patch attempted scene ${receivedSceneNumber ?? "unknown"}.`,
      "Focused plan_patch.scenes entries may patch only scene addresses that already exist.",
      "Any new scene, removed scene, reordered scene or changed scene count requires the complete corrected plan in plan_patch.production_bible.",
      "Set plan_patch.scenes to an empty array when returning production_bible and omit all placeholder entries.",
      "Preserve exact duration, canonical references, business truth and every valid existing decision.",
      "All production dispatch, image generation and video generation remain forbidden.",
    ].join(" ");
  }

  if (code === "CREATIVE_DIRECTOR_DURATION_RECONCILIATION_IMPOSSIBLE") {
    const details = object(failure.error_details);
    const targetDurationSeconds = Math.max(
      DIRECTOR_MINIMUM_SHOT_DURATION_SECONDS,
      finiteNumber(
        details.target_duration_seconds,
        30,
      ),
    );
    const maximumShotDurationSeconds = Math.max(
      DIRECTOR_MINIMUM_SHOT_DURATION_SECONDS,
      finiteNumber(
        details.maximum_shot_duration_seconds,
        DIRECTOR_MAXIMUM_SHOT_DURATION_SECONDS,
      ),
    );
    const minimumShotDurationSeconds = Math.max(
      0,
      finiteNumber(
        details.minimum_shot_duration_seconds,
        DIRECTOR_MINIMUM_SHOT_DURATION_SECONDS,
      ),
    );
    const minimumRequiredShotCount = Math.max(
      1,
      Math.ceil(
        targetDurationSeconds /
        maximumShotDurationSeconds,
      ),
    );

    return [
      "The previous initial director created a story structure whose shot durations could not satisfy the runtime duration contract.",
      "Originate a new complete production bible from the original business truth and campaign objective.",
      `The exact film duration is ${targetDurationSeconds} seconds and the sum of all shot durations must equal it exactly.`,
      `Every shot duration must be at least ${minimumShotDurationSeconds} seconds and no more than ${maximumShotDurationSeconds} seconds.`,
      `Use a dynamic story-led scene and shot structure containing at least ${minimumRequiredShotCount} shots because fewer shots cannot mathematically cover the requested duration.`,
      "Do not create filler, frozen padding, repeated actions, artificially prolonged holds or a single oversized shot merely to reach the duration.",
      "Every shot must carry a distinct narrative, emotional, visual or editorial purpose and must hand off coherently to the next shot.",
      "Return the complete corrected plan only in plan_patch.production_bible whenever scene or shot structure changes are required.",
      "Set plan_patch.scenes to an empty array and omit all schema-placeholder entries when returning production_bible.",
      "Do not attempt to add new shot numbers through plan_patch.scenes focused patches.",
      "All production dispatch, image generation and video generation remain forbidden.",
    ].join(" ");
  }

  if (code === "CREATIVE_DIRECTOR_FINAL_AUDIT_REJECTED") {
    const failures = exactAuditFailures(failure);

    return [
      "The previous plan-only director job reached the final audit after temporal direction passed, but final release was rejected for the exact remaining storyboard failures supplied below.",
      "Rebuild the production bible from the original business truth while preserving the approved story intent, exact duration, canonical reference safety and frame-governing temporal discipline.",
      "The IDENTITY_REFERENCE_CONTINUITY_REALITY department must explicitly define every required physical_reality category on every affected shot.",
      "For any shot depicting people, physical_reality.human must be concrete and independently executable: anatomy and hand integrity, body posture and balance, eye line, facial and breath progression, contact with objects and other people, gravity and momentum, wardrobe persistence, crowd individuality, no cloning, no looping and no impossible occlusion or reflection behavior.",
      "Patch the exact addressed scene and shot fields; do not satisfy the audit with generic language, empty objects or unrelated rewrites.",
      "Omit all unmodified and empty scene or shot patch entries.",
      "All production dispatch, image generation and video generation remain forbidden.",
      `EXACT FINAL AUDIT FAILURES: ${JSON.stringify(failures)}`,
    ].join(" ");
  }

  return [
    "The previous specialist output violated the semantic patch contract.",
    "Re-read the complete production bible and return contract-valid JSON.",
    "For any scene-count, shot-count, shot-order or new-address change, place the full corrected plan only in plan_patch.production_bible.",
    "Never create a new scene or shot address through plan_patch.scenes.",
    "Never put scenes inside plan_patch.top_level or plan_patch.plan.",
    "For focused changes to existing addresses only, use plan_patch.scenes with correctly addressed scene and shot patches.",
    "Omit every unchanged scene and shot. Never return empty schema-placeholder entries.",
    "Return at least one substantive mission-specific patch when correction is required.",
    "When no correction is genuinely required, set plan_patch.no_change_required=true, set plan_patch.scenes to an empty array and omit production_bible.",
    "Never return no_change_required=false with an empty patch.",
  ].join(" ");
}

function compactAssetResolution(value = {}) {
  const resolution = object(value);
  const assets = list(resolution.assets);
  const explicitIds = list(resolution.canonical_asset_ids);
  const ids = explicitIds.length
    ? explicitIds.map(String)
    : assets.map((asset) => asset?.id).filter(Boolean);

  return {
    source: resolution.source || null,
    asset_count:
      Number.isFinite(Number(resolution.asset_count))
        ? Number(resolution.asset_count)
        : assets.length,
    project_asset_count:
      resolution.project_asset_count ?? null,
    mission_asset_count:
      resolution.mission_asset_count ?? null,
    organization_asset_count:
      resolution.organization_asset_count ?? null,
    canonical_asset_id_count: ids.length,
    canonical_asset_ids_sample: ids.slice(0, 8),
  };
}

function compactDirectorPayload(payload = {}) {
  const source = object(payload);
  const job = object(source.job);
  const created = object(source.created);

  return {
    success: source.success === true,
    error: source.error || null,
    details: source.details || null,
    verdict: source.verdict || null,
    thresholds: source.thresholds || null,
    provenance: source.provenance || null,
    event_count: list(source.events).length,
    created: {
      asset_count: created.asset_count ?? null,
      asset_resolution:
        compactAssetResolution(created.asset_resolution),
    },
    job: job.id
      ? {
          id: job.id,
          status: job.status || null,
          current_step_key: job.current_step_key || null,
          current_step_index: job.current_step_index ?? null,
          completed_steps: job.completed_steps ?? null,
          total_steps: job.total_steps ?? null,
          progress_percent: job.progress_percent ?? null,
          error: job.error || null,
        }
      : null,
  };
}

async function runDirectorCanaryWithRecovery({
  req,
  organizationId,
  missionId,
  projectId,
  durationSeconds,
  objective,
  maxTemporalAttempts,
  maxRecoveryHandlerCalls,
  maximumAttempts = 3,
}) {
  const attempts = [];
  const boundedAttempts = Math.max(
    1,
    Math.min(3, Math.round(Number(maximumAttempts || 3))),
  );
  let priorFailure = null;
  let lastInvocation = null;

  for (let index = 0; index < boundedAttempts; index += 1) {
    const semanticRecovery = priorFailure
      ? {
          enabled: true,
          attempt: index + 1,
          maximum_attempts: boundedAttempts,
          previous_job_id: priorFailure.job_id,
          failed_step_key: priorFailure.step_key,
          previous_error_code: priorFailure.error_code,
          previous_error_details: priorFailure.error_details,
          mandatory_instruction:
            directorRecoveryInstruction(priorFailure),
          preserve_canonical_asset_ids: true,
          preserve_factual_truth: true,
          preserve_temporal_discipline: true,
          production_dispatch_forbidden: true,
        }
      : null;
    const durationContract =
      directorDurationContract(durationSeconds);
    const patchContract = directorPatchContract();

    const invocation = await invoke({
      handler: directorCanaryPost,
      req,
      pathname: "/api/creative/director-jobs/canary-v2",
      body: {
        organization_id: organizationId,
        creative_mission_id: missionId,
        creative_project_id: projectId,
        duration_seconds: durationSeconds,
        objective,
        max_temporal_attempts: maxTemporalAttempts,
        max_recovery_handler_calls: maxRecoveryHandlerCalls,
        brief: {
          greenfield_director_constraints: {
            plan_only: true,
            production_dispatch_forbidden: true,
            image_generation_forbidden: true,
            video_generation_forbidden: true,
            duration_contract: durationContract,
            patch_contract: patchContract,
          },
          ...(semanticRecovery
            ? {
                autonomous_director_semantic_recovery:
                  semanticRecovery,
              }
            : {}),
        },
      },
    });

    lastInvocation = invocation;
    const failure = directorFailure(invocation);
    const passed = Boolean(
      invocation.ok &&
      invocation.payload?.success === true &&
      invocation.payload?.verdict
        ?.plan_only_canary_passed === true,
    );
    const recoverable =
      !passed && recoverableDirectorFailure(invocation);

    attempts.push({
      attempt: index + 1,
      job_id:
        invocation.payload?.job?.id ||
        failure.job_id ||
        null,
      status: invocation.status,
      passed,
      recoverable,
      failed_step_key: failure.step_key,
      error: failure.error,
      envelope_error: failure.envelope_error,
      error_code: failure.error_code,
      exact_audit_failures:
        failure.error_code === "CREATIVE_DIRECTOR_FINAL_AUDIT_REJECTED"
          ? exactAuditFailures(failure)
          : [],
      duration_failure_details:
        failure.error_code ===
          "CREATIVE_DIRECTOR_DURATION_RECONCILIATION_IMPOSSIBLE"
          ? failure.error_details
          : null,
      structural_address_failure_details:
        [
          "CREATIVE_DIRECTOR_JOB_SCENE_PATCH_NUMBER_INVALID",
          "CREATIVE_DIRECTOR_JOB_SHOT_PATCH_NUMBER_INVALID",
        ].includes(failure.error_code)
          ? failure.error_details
          : null,
      empty_patch_failure_details:
        EMPTY_DIRECTOR_PATCH_CODES.has(failure.error_code)
          ? failure.error_details
          : null,
    });

    if (passed) {
      return {
        ...invocation,
        recovery: {
          attempted: index > 0,
          recovered: index > 0,
          attempt_count: index + 1,
          attempts,
        },
      };
    }

    if (!recoverable) break;
    priorFailure = failure;
  }

  return {
    ...(lastInvocation || {
      ok: false,
      status: 500,
      payload: {
        success: false,
        error:
          "CREATIVE_GREENFIELD_DIRECTOR_NOT_EXECUTED",
      },
    }),
    recovery: {
      attempted: attempts.length > 1,
      recovered: false,
      attempt_count: attempts.length,
      attempts,
    },
  };
}

function masterFilmProject(projects = []) {
  return (
    projects.find((project) =>
      project.metadata?.production_role === "MASTER" &&
      String(
        project.metadata?.creative_medium ||
        project.production_type ||
        "",
      ).toUpperCase().includes("FILM"),
    ) ||
    projects.find((project) =>
      project.metadata?.production_role === "MASTER",
    ) ||
    projects.find((project) =>
      ["VIDEO", "FILM"].includes(
        String(project.production_type || "").toUpperCase(),
      ),
    ) ||
    projects[0] ||
    null
  );
}

function errorStatus(error = {}) {
  const code = String(
    error.code || error.message || "",
  ).toUpperCase();

  if (
    code.includes("REQUIRED") ||
    code.includes("INVALID")
  ) {
    return 400;
  }
  if (code.includes("NOT_IN_ORGANIZATION")) return 404;
  if (
    code.includes("FAILED") ||
    code.includes("BLOCKED") ||
    code.includes("AUDIT")
  ) {
    return 422;
  }
  return 500;
}

export async function POST(req) {
  let mission = null;
  let project = null;
  let director = null;

  try {
    const body = await req.json();
    const organizationId =
      body.organization_id ||
      body.organizationId ||
      null;
    const objective = text(
      body.objective ||
      body.request ||
      body.prompt,
    );
    const durationSeconds = Math.max(
      10,
      Math.round(Number(body.duration_seconds || 30)),
    );
    const executePaid =
      body.execute_paid_master_still === true;

    const access = await requireOrganizationAccess({
      organizationId,
    });

    if (!access.success) {
      return NextResponse.json(access, {
        status: access.status,
      });
    }
    if (!organizationId) {
      return NextResponse.json({
        success: false,
        error: "organization_id required",
      }, { status: 400 });
    }
    if (!objective) {
      return NextResponse.json({
        success: false,
        error: "objective required",
      }, { status: 400 });
    }
    if (executePaid && body.accept_paid_execution !== true) {
      return NextResponse.json({
        success: false,
        error: "CREATIVE_PAID_EXECUTION_ACCEPTANCE_REQUIRED",
      }, { status: 400 });
    }

    const missionInvocation =
      await composeMissionWithRecovery({
        req,
        organizationId,
        entityId: body.entity_id || null,
        periodId: body.period_id || null,
        objective,
        durationSeconds,
        context: body.context || {},
        maximumAttempts:
          body.max_mission_composition_attempts || 3,
      });

    if (!missionInvocation.ok ||
      missionInvocation.payload?.success === false) {
      return NextResponse.json({
        success: false,
        stage: "MISSION_COMPOSITION",
        error:
          missionInvocation.payload?.error ||
          "CREATIVE_GREENFIELD_MISSION_COMPOSITION_FAILED",
        details: missionInvocation.payload,
        mission_composition_recovery:
          missionInvocation.recovery,
        paid_execution_started: false,
        video_generation_started: false,
      }, { status: missionInvocation.status || 422 });
    }

    mission = missionInvocation.payload.mission || null;
    project = masterFilmProject(
      missionInvocation.payload.projects || [],
    );

    if (!mission?.id || !project?.id) {
      return NextResponse.json({
        success: false,
        stage: "MASTER_PROJECT_SELECTION",
        error:
          "CREATIVE_GREENFIELD_MASTER_FILM_PROJECT_REQUIRED",
        details: {
          mission_id: mission?.id || null,
          project_count:
            missionInvocation.payload.projects?.length || 0,
        },
        mission_composition_recovery:
          missionInvocation.recovery,
        paid_execution_started: false,
      }, { status: 422 });
    }

    const directorInvocation =
      await runDirectorCanaryWithRecovery({
        req,
        organizationId,
        missionId: mission.id,
        projectId: project.id,
        durationSeconds:
          Number(project.target_duration || durationSeconds),
        objective,
        maxTemporalAttempts:
          Number(body.max_temporal_attempts || 6),
        maxRecoveryHandlerCalls:
          Number(body.max_recovery_handler_calls || 6),
        maximumAttempts:
          Number(body.max_director_attempts || 3),
      });

    director = directorInvocation.payload;

    if (!directorInvocation.ok ||
      director?.success !== true ||
      director?.verdict?.plan_only_canary_passed !== true) {
      return NextResponse.json({
        success: false,
        stage: "AUTONOMOUS_DIRECTOR",
        error:
          director?.error ||
          "CREATIVE_GREENFIELD_DIRECTOR_CANARY_FAILED",
        details: compactDirectorPayload(director),
        mission: {
          id: mission.id,
          title: mission.title || null,
        },
        project: {
          id: project.id,
          name: project.name || null,
        },
        mission_composition_recovery:
          missionInvocation.recovery,
        autonomous_director_recovery:
          directorInvocation.recovery,
        paid_execution_started: false,
        video_generation_started: false,
      }, { status: directorInvocation.status || 422 });
    }

    const directorJobId = director.job?.id || null;

    if (!directorJobId) {
      return NextResponse.json({
        success: false,
        stage: "AUTONOMOUS_DIRECTOR",
        error: "CREATIVE_GREENFIELD_DIRECTOR_JOB_ID_MISSING",
        details: compactDirectorPayload(director),
        mission_composition_recovery:
          missionInvocation.recovery,
        autonomous_director_recovery:
          directorInvocation.recovery,
        paid_execution_started: false,
      }, { status: 500 });
    }

    const proof =
      await CreativeAutonomousFullSceneProofRuntime.run({
        organization_id: organizationId,
        creative_project_id: project.id,
        director_job_id: directorJobId,
        human_approved: true,
        execute_paid_master_still: executePaid,
      });

    return NextResponse.json({
      success: proof.success === true,
      greenfield_test: true,
      autonomous_story_required: true,
      mission_created: true,
      project_created: true,
      director_completed: true,
      final_story_audit_passed: true,
      full_scene_only: true,
      masked_composition_allowed: false,
      paid_execution_started: executePaid,
      mission_composition_recovery:
        missionInvocation.recovery,
      autonomous_director_recovery:
        directorInvocation.recovery,
      mission: {
        id: mission.id,
        title: mission.title || null,
        objective: mission.objective || objective,
      },
      project: {
        id: project.id,
        name: project.name || null,
        production_type: project.production_type || null,
        target_duration:
          project.target_duration || durationSeconds,
      },
      business_truth:
        missionInvocation.payload.business_truth || null,
      director: {
        job_id: directorJobId,
        verdict: director.verdict,
        provenance: director.provenance,
        event_count: director.events?.length || 0,
        asset_resolution:
          compactAssetResolution(
            director.created?.asset_resolution,
          ),
      },
      proof,
    }, {
      status: proof.success === true ? 200 : 422,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      greenfield_test: true,
      stage: "AUTONOMOUS_FULL_SCENE_PROOF",
      error:
        error.message ||
        "CREATIVE_AUTONOMOUS_GREENFIELD_PROOF_FAILED",
      code: error.code || null,
      details: error.details || null,
      mission: mission
        ? { id: mission.id, title: mission.title || null }
        : null,
      project: project
        ? { id: project.id, name: project.name || null }
        : null,
      director_verdict:
        director?.verdict || null,
      paid_execution_started: false,
      video_generation_started: false,
    }, { status: errorStatus(error) });
  }
}

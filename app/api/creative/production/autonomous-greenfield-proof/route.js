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

function text(value) {
  return String(value || "").trim();
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

    const directorInvocation = await invoke({
      handler: directorCanaryPost,
      req,
      pathname: "/api/creative/director-jobs/canary-v2",
      body: {
        organization_id: organizationId,
        creative_mission_id: mission.id,
        creative_project_id: project.id,
        duration_seconds:
          Number(project.target_duration || durationSeconds),
        objective,
        max_temporal_attempts:
          Number(body.max_temporal_attempts || 6),
        max_recovery_handler_calls:
          Number(body.max_recovery_handler_calls || 6),
      },
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
        details: director,
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
        paid_execution_started: false,
      }, { status: directorInvocation.status || 422 });
    }

    const directorJobId = director.job?.id || null;

    if (!directorJobId) {
      return NextResponse.json({
        success: false,
        stage: "AUTONOMOUS_DIRECTOR",
        error: "CREATIVE_GREENFIELD_DIRECTOR_JOB_ID_MISSING",
        details: director,
        mission_composition_recovery:
          missionInvocation.recovery,
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
        asset_resolution: director.created?.asset_resolution || null,
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

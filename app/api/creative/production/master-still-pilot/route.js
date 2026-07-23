export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

import {
  CreativeMasterStillPilotQaEvidenceRecoveryRuntime,
} from "@/lib/creative/production/pilot/CreativeMasterStillPilotQaEvidenceRecoveryRuntime";

import {
  calibrateMasterStillQualityReview,
} from "@/lib/creative/quality/runtime/CreativeMasterStillQualityCalibration";

function calibratePilotResult(result = {}) {
  const qualityReview = result.quality_review;
  if (!qualityReview) return result;

  const calibrated = calibrateMasterStillQualityReview(
    qualityReview,
    {
      minimum_score: qualityReview.minimum_score || 90,
    },
  );
  const success =
    result.success === true &&
    calibrated.passed === true;

  return {
    ...result,
    success,
    quality_review: calibrated,
    next_gate: success
      ? "MASTER_STILL_PILOT_APPROVED"
      : result.next_gate === "MASTER_STILL_PILOT_APPROVED"
        ? "MASTER_STILL_MANUAL_REVIEW_REQUIRED"
        : result.next_gate,
  };
}

export async function POST(req) {
  try {
    const body = await req.json();
    const organizationId =
      body.organization_id ||
      body.organizationId ||
      null;
    const projectId =
      body.creative_project_id ||
      body.creativeProjectId ||
      body.project_id ||
      null;

    const access = await requireOrganizationAccess({
      organizationId,
    });

    if (!access.success) {
      return NextResponse.json(access, {
        status: access.status,
      });
    }

    if (!projectId) {
      return NextResponse.json({
        success: false,
        error: "creative_project_id required",
      }, { status: 400 });
    }

    const project = await CreativeProjectRuntime.get(projectId);
    if (!project || project.organization_id !== organizationId) {
      return NextResponse.json({
        success: false,
        error: "CREATIVE_PROJECT_NOT_IN_ORGANIZATION",
      }, { status: 404 });
    }

    const rawResult =
      await CreativeMasterStillPilotQaEvidenceRecoveryRuntime.run({
        organization_id: organizationId,
        creative_project_id: projectId,
        scene_number: Number(body.scene_number || 1),
        shot_number: Number(body.shot_number || 1),
        retry_preflight_blocked:
          body.retry_preflight_blocked === true,
      });
    const result = calibratePilotResult(rawResult);

    return NextResponse.json({
      success: result.success,
      result,
    }, {
      status: result.success ? 200 : 422,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
      code: error.code || null,
      details: error.details || null,
    }, { status: 500 });
  }
}

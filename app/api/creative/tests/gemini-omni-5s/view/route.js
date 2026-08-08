export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  creativeStorageReference,
  signCreativeStorageReference,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT_ID = "0230a08a-6b47-46e1-9f51-7956d70d304b";
const VIDEO_TASK_ID = "85241ba5-675f-4c25-86d2-3b28114fc74e";
const PROVIDER_JOB_ID = "3cueocet0m6q";
const TEST_CONTRACT = "GEMINI_OMNI_FULL_STUDIO_5S_SMOKE_V1";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function outputReference(task = {}) {
  const output = object(task.output);
  const nested = object(output.output);
  const poll = object(output.provider_poll);
  const pollOutput = object(poll.output);
  const raw = object(pollOutput.raw);
  const rawOutput = object(raw.output);

  return text(
    output.video_url ||
    output.file_url ||
    nested.video_url ||
    nested.file_url ||
    pollOutput.video_url ||
    pollOutput.file_url ||
    rawOutput.video_url ||
    rawOutput.file_url,
  ) || null;
}

function providerJobId(task = {}) {
  return text(
    task.output?.provider_job_id ||
    task.output?.provider_submission?.provider_job_id ||
    task.output?.provider_poll?.job_id,
  );
}

function json(payload, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}

export async function GET(request) {
  try {
    const access = await requireOrganizationAccess({
      organizationId: ORGANIZATION_ID,
      request,
      requiredAnyPermission: [
        "creative.execute",
        "creative.production.run",
        "creative.*",
      ],
    });
    if (!access.success) return json(access, access.status);

    const task = await ProductionTaskRuntime.get(VIDEO_TASK_ID);
    if (!task) throw new Error("GEMINI_SMOKE_VIDEO_TASK_NOT_FOUND");
    if (String(task.organization_id) !== ORGANIZATION_ID) {
      throw new Error("GEMINI_SMOKE_TASK_ORGANIZATION_INVALID");
    }
    if (String(task.creative_project_id) !== PROJECT_ID) {
      throw new Error("GEMINI_SMOKE_TASK_PROJECT_INVALID");
    }
    if (text(task.status).toUpperCase() !== "COMPLETED") {
      throw new Error(`GEMINI_SMOKE_VIDEO_NOT_COMPLETED:${text(task.status)}`);
    }
    if (providerJobId(task) !== PROVIDER_JOB_ID) {
      throw new Error("GEMINI_SMOKE_PROVIDER_JOB_CHANGED");
    }

    const reference = outputReference(task);
    const parsed = creativeStorageReference(reference);
    if (!parsed || parsed.bucket !== "creative-assets") {
      throw new Error("GEMINI_SMOKE_PRIVATE_VIDEO_REFERENCE_INVALID");
    }

    const signedUrl = await signCreativeStorageReference({
      organization_id: ORGANIZATION_ID,
      reference,
      expires_in: 900,
    });

    return NextResponse.redirect(signedUrl, 307);
  } catch (error) {
    return json({
      success: false,
      contract: TEST_CONTRACT,
      task_id: VIDEO_TASK_ID,
      provider_job_id: PROVIDER_JOB_ID,
      new_provider_generation_executed: false,
      perceptual_review_executed: false,
      publication_authorized: false,
      error: error?.message || String(error),
    }, 409);
  }
}

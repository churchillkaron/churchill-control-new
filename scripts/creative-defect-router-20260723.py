from pathlib import Path


def replace_once(path, old, new):
    file_path = Path(path)
    content = file_path.read_text(encoding="utf-8")
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one match in {path}, found {count}")
    file_path.write_text(content.replace(old, new), encoding="utf-8")


CANARY = "app/api/creative/director-jobs/canary/route.js"
TEMPORAL = "app/api/creative/director-jobs/converge-temporal/route.js"

replace_once(
    CANARY,
    '''import {
  inspectCreativeRepairProvenance,
} from "@/lib/creative/director/runtime/CreativeRepairProvenanceContract";
''',
    '''import {
  inspectCreativeRepairProvenance,
} from "@/lib/creative/director/runtime/CreativeRepairProvenanceContract";

import {
  classifyCreativeJobFailure,
} from "@/lib/creative/director/runtime/CreativeFailureRouter";
''',
)

replace_once(
    CANARY,
    '''      let kind = "ADVANCE";
      let handler = directorJobPost;
      let pathname =
        "/api/creative/director-jobs";
      let payload = {
        organization_id:
          organizationId,
        job_id: jobId,
        action: "advance",
        retry_failed: false,
      };

      if (stepStatus === "FAILED") {
        if (
          stepKey ===
          "temporal_shot_direction"
        ) {
          kind = "TEMPORAL_CONVERGENCE";
          handler = convergeTemporalPost;
          pathname =
            "/api/creative/director-jobs/converge-temporal";
          payload = {
            organization_id:
              organizationId,
            job_id: jobId,
          };
        } else if (
          stepKey === "targeted_repair_1"
        ) {
          kind =
            "STORYBOARD_CONVERGENCE_1";
          handler = convergeStoryboardPost;
          pathname =
            "/api/creative/director-jobs/converge-storyboard";
          payload = {
            organization_id:
              organizationId,
            job_id: jobId,
          };
        } else if (
          stepKey === "targeted_repair_2"
        ) {
          kind =
            "STORYBOARD_CONVERGENCE_2";
          handler =
            convergeFinalStoryboardPost;
          pathname =
            "/api/creative/director-jobs/converge-storyboard-final";
          payload = {
            organization_id:
              organizationId,
            job_id: jobId,
          };
        } else {
          return canaryResponse({
            success: false,
            status: 422,
            error:
              "CREATIVE_CANARY_UNSUPPORTED_FAILED_STEP",
            details: {
              job_id: jobId,
              step_key: stepKey,
              step_status: stepStatus,
              step_error:
                step?.error ||
                before.error ||
                null,
            },
            events,
            thresholds,
            created,
            job: before,
          });
        }
      }
''',
    '''      let kind = "ADVANCE";
      let handler = directorJobPost;
      let pathname =
        "/api/creative/director-jobs";
      let payload = {
        organization_id:
          organizationId,
        job_id: jobId,
        action: "advance",
        retry_failed: false,
      };

      if (stepStatus === "FAILED") {
        const routing =
          classifyCreativeJobFailure(before);

        if (!routing.retryable) {
          return canaryResponse({
            success: false,
            status: 422,
            error:
              "CREATIVE_CANARY_FAILURE_REQUIRES_REVIEW",
            details: {
              routing,
              job_id: jobId,
              step_key: stepKey,
              step_status: stepStatus,
              step_error:
                step?.error ||
                before.error ||
                null,
            },
            events,
            thresholds,
            created,
            job: before,
          });
        }

        if (
          routing.route ===
          "STRUCTURAL_REPLAN"
        ) {
          kind = "STRUCTURAL_REPLAN";
          handler = directorJobPost;
          pathname =
            "/api/creative/director-jobs";
          payload = {
            organization_id:
              organizationId,
            job_id: jobId,
            action: "replan_structure",
            reason:
              step?.error ||
              before.error ||
              routing,
          };
        } else if (
          routing.route ===
          "TEMPORAL_REFERENCE_RECOVERY" ||
          routing.route ===
          "TEMPORAL_CONVERGENCE"
        ) {
          kind = routing.route;
          handler = convergeTemporalPost;
          pathname =
            "/api/creative/director-jobs/converge-temporal";
          payload = {
            organization_id:
              organizationId,
            job_id: jobId,
          };
        } else if (
          routing.route ===
          "TARGETED_STORYBOARD_REPAIR"
        ) {
          kind =
            "STORYBOARD_CONVERGENCE_1";
          handler = convergeStoryboardPost;
          pathname =
            "/api/creative/director-jobs/converge-storyboard";
          payload = {
            organization_id:
              organizationId,
            job_id: jobId,
          };
        } else if (
          routing.route ===
          "FINAL_EVIDENCE_REPAIR"
        ) {
          kind =
            "STORYBOARD_CONVERGENCE_2";
          handler =
            convergeFinalStoryboardPost;
          pathname =
            "/api/creative/director-jobs/converge-storyboard-final";
          payload = {
            organization_id:
              organizationId,
            job_id: jobId,
          };
        } else {
          kind = "RETRY_FAILED_STEP";
          handler = directorJobPost;
          pathname =
            "/api/creative/director-jobs";
          payload = {
            organization_id:
              organizationId,
            job_id: jobId,
            action: "advance",
            retry_failed: true,
          };
        }
      }
''',
)

replace_once(
    TEMPORAL,
    '''import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
''',
    '''import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  classifyCreativeJobFailure,
} from "@/lib/creative/director/runtime/CreativeFailureRouter";
''',
)

replace_once(
    TEMPORAL,
    '''      const beforeFailure =
        temporalFailure(before);
      const code = String(
        beforeFailure.code || "",
      );

      if (!SUPPORTED_FAILURES.has(code)) {
        return safeResponse({
          success: false,
          status: 422,
          error:
            "CREATIVE_TEMPORAL_CONVERGENCE_UNSUPPORTED_FAILURE",
          details: beforeFailure,
          recoveries,
          job: before,
          stage:
            "UNSUPPORTED_FAILURE",
          cycle,
        });
      }
''',
    '''      const beforeFailure =
        temporalFailure(before);
      const code = String(
        beforeFailure.code || "",
      );
      const routing =
        classifyCreativeJobFailure(before);

      if (
        routing.route ===
        "STRUCTURAL_REPLAN"
      ) {
        return safeResponse({
          success: false,
          status: 422,
          error:
            "CREATIVE_FINAL_STORYBOARD_STRUCTURAL_REPLAN_REQUIRED",
          details: {
            routing,
            current_failure:
              beforeFailure,
          },
          recoveries,
          job: before,
          stage:
            "STRUCTURAL_REPLAN_REQUIRED",
          cycle,
        });
      }

      if (
        !routing.retryable ||
        !SUPPORTED_FAILURES.has(code)
      ) {
        return safeResponse({
          success: false,
          status: 422,
          error:
            "CREATIVE_TEMPORAL_CONVERGENCE_UNSUPPORTED_FAILURE",
          details: {
            routing,
            current_failure:
              beforeFailure,
          },
          recoveries,
          job: before,
          stage:
            "UNSUPPORTED_FAILURE",
          cycle,
        });
      }
''',
)

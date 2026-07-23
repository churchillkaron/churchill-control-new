from pathlib import Path


def replace_exact(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    content = file_path.read_text(encoding="utf-8")
    count = content.count(old)
    if count != 1:
        raise RuntimeError(
            f"Expected exactly one match in {path}, found {count}"
        )
    file_path.write_text(content.replace(old, new), encoding="utf-8")


FINAL_ROUTE = "app/api/creative/director-jobs/converge-storyboard-final/route.js"
CANARY_ROUTE = "app/api/creative/director-jobs/canary/route.js"

replace_exact(
    FINAL_ROUTE,
    '''    if (\n      audit.temporal.shot_count !== 6 ||\n      audit.temporal.total_frames !== 900\n    ) {\n      return safeResponse({\n        success: false,\n        status: 422,\n        error:\n          "CREATIVE_FINAL_STORYBOARD_TEMPORAL_COVERAGE_UNEXPECTED",\n        details: {\n          expected_shot_count: 6,\n          received_shot_count:\n            audit.temporal.shot_count,\n          expected_total_frames: 900,\n          received_total_frames:\n            audit.temporal.total_frames,\n        },\n        audit,\n        convergence,\n      });\n    }\n''',
    '''    const fps = Math.max(\n      1,\n      Math.round(\n        Number(input.fps || 30),\n      ),\n    );\n    const targetDuration = Number(\n      input.target_duration_seconds ||\n      planDuration(plan),\n    );\n    const plannedDuration =\n      planDuration(plan);\n    const expectedShotCount =\n      list(plan.scenes).reduce(\n        (total, scene) =>\n          total + list(scene.shots).length,\n        0,\n      );\n    const expectedTotalFrames =\n      Math.round(targetDuration * fps);\n    const durationMatches =\n      Math.abs(\n        plannedDuration - targetDuration,\n      ) <= 0.1;\n    const shotCoverageMatches =\n      audit.temporal.shot_count ===\n      expectedShotCount;\n    const frameCoverageMatches =\n      audit.temporal.total_frames ===\n      expectedTotalFrames;\n\n    if (\n      !durationMatches ||\n      !shotCoverageMatches ||\n      !frameCoverageMatches\n    ) {\n      return safeResponse({\n        success: false,\n        status: 422,\n        error:\n          "CREATIVE_FINAL_STORYBOARD_STRUCTURAL_REPLAN_REQUIRED",\n        details: {\n          reason:\n            "The accepted production bible does not cover the mission duration and cannot be repaired by the final shot-summary evidence pass.",\n          repair_scope_required:\n            "STRUCTURE_AND_DURATION",\n          current_repair_scope:\n            "SHOT_SUMMARY_EVIDENCE",\n          target_duration_seconds:\n            targetDuration,\n          planned_duration_seconds:\n            plannedDuration,\n          fps,\n          expected_shot_count:\n            expectedShotCount,\n          received_shot_count:\n            audit.temporal.shot_count,\n          expected_total_frames:\n            expectedTotalFrames,\n          received_total_frames:\n            audit.temporal.total_frames,\n          duration_matches:\n            durationMatches,\n          shot_coverage_matches:\n            shotCoverageMatches,\n          frame_coverage_matches:\n            frameCoverageMatches,\n        },\n        audit,\n        convergence,\n      });\n    }\n''',
)

replace_exact(
    CANARY_ROUTE,
    'const MAX_CYCLES = 80;\n',
    'const MAX_CYCLES = 24;\n',
)

replace_exact(
    CANARY_ROUTE,
    '''function currentStep(job = {}) {\n  if (!job.current_step_key) return null;\n\n  return list(job.steps).find(\n    (step) =>\n      step?.step_key ===\n      job.current_step_key,\n  ) || null;\n}\n\nfunction headersFrom(req) {\n''',
    '''function currentStep(job = {}) {\n  if (!job.current_step_key) return null;\n\n  return list(job.steps).find(\n    (step) =>\n      step?.step_key ===\n      job.current_step_key,\n  ) || null;\n}\n\nfunction stableValue(value) {\n  if (Array.isArray(value)) {\n    return value.map(stableValue);\n  }\n\n  if (\n    value &&\n    typeof value === "object"\n  ) {\n    return Object.fromEntries(\n      Object.keys(value)\n        .sort()\n        .map((key) => [\n          key,\n          stableValue(value[key]),\n        ]),\n    );\n  }\n\n  return value;\n}\n\nfunction progressSignature(job = {}) {\n  const step = currentStep(job);\n\n  return JSON.stringify(\n    stableValue({\n      job_status: job.status || null,\n      current_step_key:\n        job.current_step_key || null,\n      current_step_index:\n        job.current_step_index ?? null,\n      completed_steps:\n        job.completed_steps ?? null,\n      progress_percent:\n        job.progress_percent ?? null,\n      step_status: step?.status || null,\n      step_attempt: step?.attempt ?? null,\n      step_error: step?.error || null,\n      job_error: job.error || null,\n    }),\n  );\n}\n\nfunction headersFrom(req) {\n''',
)

replace_exact(
    CANARY_ROUTE,
    '''      events.push(\n        event({\n          cycle,\n          kind,\n          before,\n          invocation,\n          after,\n        }),\n      );\n\n      if (\n        !invocation.ok &&\n        after.status !== "COMPLETED"\n      ) {\n        const afterStep =\n          currentStep(after);\n\n        if (\n''',
    '''      events.push(\n        event({\n          cycle,\n          kind,\n          before,\n          invocation,\n          after,\n        }),\n      );\n\n      const afterStep =\n        currentStep(after);\n\n      if (\n        invocation.payload?.error ===\n        "CREATIVE_FINAL_STORYBOARD_STRUCTURAL_REPLAN_REQUIRED"\n      ) {\n        return canaryResponse({\n          success: false,\n          status: 422,\n          error:\n            "CREATIVE_FINAL_STORYBOARD_STRUCTURAL_REPLAN_REQUIRED",\n          details: {\n            handler_payload:\n              invocation.payload,\n            step_key:\n              after.current_step_key,\n            step_status:\n              afterStep?.status || null,\n          },\n          events,\n          thresholds,\n          created,\n          job: after,\n        });\n      }\n\n      if (\n        stepStatus === "FAILED" &&\n        afterStep?.status === "FAILED" &&\n        progressSignature(before) ===\n          progressSignature(after)\n      ) {\n        return canaryResponse({\n          success: false,\n          status: 422,\n          error:\n            "CREATIVE_CANARY_NO_PROGRESS",\n          details: {\n            reason:\n              "The recovery handler returned without changing the failed job state. Automatic retry was stopped to prevent a non-mutating loop.",\n            cycle,\n            handler_kind: kind,\n            handler_payload:\n              invocation.payload,\n            step_key: stepKey,\n            step_status:\n              afterStep?.status || null,\n            step_attempt:\n              afterStep?.attempt ?? null,\n            state_signature:\n              progressSignature(after),\n          },\n          events,\n          thresholds,\n          created,\n          job: after,\n        });\n      }\n\n      if (\n        !invocation.ok &&\n        after.status !== "COMPLETED"\n      ) {\n        if (\n''',
)

print("Creative P0 convergence contracts repaired")

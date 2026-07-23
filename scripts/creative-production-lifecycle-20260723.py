from pathlib import Path


def replace_once(path, old, new):
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}")
    file.write_text(text.replace(old, new, 1))


orchestrator = "lib/creative/director/orchestrator/CreativePipelineOrchestrator.js"
production = "lib/creative/production/runtime/ProductionRuntime.js"
worker = "lib/creative/worker/CreativeOrchestrationWorker.js"
control = "lib/creative/production/control/CreativeProductionControlRuntime.js"
workspace = "components/creative/ProductionStudio/workspaces/ProductionWorkspace.jsx"

replace_once(
    orchestrator,
    'import {\n  CreativeStateEngine,\n  PIPELINE_STAGES,\n} from "@/lib/creative/state/CreativeStateEngine";\n',
    'import {\n  CreativeStateEngine,\n  PIPELINE_STAGES,\n} from "@/lib/creative/state/CreativeStateEngine";\n\nimport {\n  CreativeProductionLifecycleRuntime,\n} from "@/lib/creative/production/runtime/CreativeProductionLifecycleRuntime";\n',
)

replace_once(
    orchestrator,
    '  const execution = await ExecutionRuntime.create(\n    executionPlan,\n  );\n\n  await CreativeStateEngine.set(\n',
    '  const execution = await ExecutionRuntime.create(\n    executionPlan,\n  );\n\n  const productionLifecycle =\n    await CreativeProductionLifecycleRuntime.markPlanReady({\n      organization_id,\n      creative_project_id,\n    });\n\n  await CreativeStateEngine.set(\n',
)

replace_once(
    orchestrator,
    '    graph,\n    execution,\n    creativePlan,\n',
    '    graph,\n    execution,\n    production_lifecycle: productionLifecycle,\n    creativePlan,\n',
)

replace_once(
    production,
    'import {\n  resolveOrganizationCurrency,\n} from "@/lib/platform/context/resolveOrganizationCurrency";\n',
    'import {\n  resolveOrganizationCurrency,\n} from "@/lib/platform/context/resolveOrganizationCurrency";\n\nimport {\n  CreativeProductionLifecycleRuntime,\n} from "./CreativeProductionLifecycleRuntime";\n',
)

replace_once(
    production,
    '    const production = await CreativeOrchestrationWorker.runProject({\n',
    '    const queuedLifecycle =\n      await CreativeProductionLifecycleRuntime.markQueued({\n        organization_id,\n        creative_project_id,\n      });\n\n    const production = await CreativeOrchestrationWorker.runProject({\n',
)

replace_once(
    production,
    '      execution_plan_id: materialized.plan.id,\n      tasks_materialized: materialized.tasks.length,\n      ...production,\n',
    '      execution_plan_id: materialized.plan.id,\n      tasks_materialized: materialized.tasks.length,\n      queued_lifecycle: queuedLifecycle,\n      ...production,\n',
)

replace_once(
    worker,
    'import {\n  CreativeProductionControlRuntime,\n} from "@/lib/creative/production/control/CreativeProductionControlRuntime";\n',
    'import {\n  CreativeProductionControlRuntime,\n} from "@/lib/creative/production/control/CreativeProductionControlRuntime";\n\nimport {\n  CreativeProductionLifecycleRuntime,\n} from "@/lib/creative/production/runtime/CreativeProductionLifecycleRuntime";\n',
)

replace_once(
    worker,
    '  const deliveryApproved = aiApproved && humanReleased;\n\n  return {\n',
    '  const deliveryApproved = aiApproved && humanReleased;\n  const lifecycle = await CreativeProductionLifecycleRuntime.persist({\n    ...input,\n    control,\n    production_result: {\n      production_complete: productionComplete,\n      post_production: postProduction,\n      picture_assembly: pictureAssembly,\n      picture_finish: pictureFinish,\n      sound_finish: soundFinish,\n      final_film_qa: finalFilmQa,\n      ai_approved: aiApproved,\n      human_released: humanReleased,\n      final_approval: {\n        approved: deliveryApproved,\n        ai_approved: aiApproved,\n        human_released: humanReleased,\n        approved_variants:\n          finalFilmQa?.approved_variants || [],\n        rejected_variants:\n          finalFilmQa?.rejected_variants || [],\n      },\n      queue: finalQueue,\n    },\n  });\n\n  return {\n',
)

replace_once(
    worker,
    '    queue: finalQueue,\n    post_production: postProduction,\n',
    '    queue: finalQueue,\n    lifecycle,\n    post_production: postProduction,\n',
)

replace_once(
    control,
    'import {\n  resolveOrganizationCurrency,\n} from "@/lib/platform/context/resolveOrganizationCurrency";\n',
    'import {\n  resolveOrganizationCurrency,\n} from "@/lib/platform/context/resolveOrganizationCurrency";\n\nimport {\n  deriveCreativeProductionLifecycle,\n} from "@/lib/creative/production/runtime/CreativeProductionLifecycleRuntime";\n',
)

replace_once(
    control,
    '    return {\n      organization_id,\n      creative_project_id,\n      project_status: project.status,\n',
    '    const snapshot = {\n      organization_id,\n      creative_project_id,\n      project_status: project.status,\n',
)

replace_once(
    control,
    '      observed_at: new Date().toISOString(),\n    };\n  },\n\n  async assertExecutionAllowed',
    '      observed_at: new Date().toISOString(),\n    };\n\n    const lifecycle = deriveCreativeProductionLifecycle({\n      project,\n      tasks,\n      control: snapshot,\n    });\n\n    return {\n      ...snapshot,\n      lifecycle,\n      project_status: lifecycle.status,\n    };\n  },\n\n  async assertExecutionAllowed',
)

replace_once(
    workspace,
    '  if (["RUNNING", "PROCESSING", "PRODUCING"].includes(value)) {\n',
    '  if ([\n    "RUNNING",\n    "PROCESSING",\n    "PRODUCING",\n    "PRODUCTION_QUEUED",\n    "PRODUCING_MASTER_STILLS",\n    "PRODUCING_MOTION",\n    "EDITING_AND_AUDIO",\n    "FINAL_QA",\n  ].includes(value)) {\n',
)

replace_once(
    workspace,
    '  const budget = control?.budget || {};\n  const release = control?.release || {};\n',
    '  const budget = control?.budget || {};\n  const release = control?.release || {};\n  const lifecycle = control?.lifecycle || {};\n  const lifecycleProgress = lifecycle.progress || {};\n',
)

replace_once(
    workspace,
    '                <StatusPill value={control?.project_status || "DRAFT"} />\n',
    '                <StatusPill value={lifecycle.status || control?.project_status || "DRAFT"} />\n',
)

replace_once(
    workspace,
    '              <div className="mt-2 flex flex-wrap items-center gap-2">\n                <StatusPill value={lifecycle.status || control?.project_status || "DRAFT"} />\n',
    '              <div className="mt-2 flex flex-wrap items-center gap-2">\n                <StatusPill value={lifecycle.status || control?.project_status || "DRAFT"} />\n',
)

replace_once(
    workspace,
    '              </div>\n            </div>\n\n            <div className="flex flex-wrap gap-3">\n',
    '              </div>\n              {lifecycle.description ? (\n                <div className="mt-3 max-w-3xl text-sm text-white/50">\n                  {lifecycle.description}\n                </div>\n              ) : null}\n            </div>\n\n            <div className="flex flex-wrap gap-3">\n',
)

replace_once(
    workspace,
    '            note={`${activeTasks.length} active`}\n',
    '            note={`${lifecycleProgress.active_tasks ?? activeTasks.length} active · ${lifecycleProgress.total_shots || 0} shots`}\n',
)

replace_once(
    workspace,
    '            note={`${failedTasks.length} failed`}\n',
    '            note={`${lifecycleProgress.progress_percent ?? 0}% complete · ${lifecycleProgress.failed_tasks ?? failedTasks.length} failed`}\n',
)

replace_once(
    workspace,
    '          <Metric\n            label="Creative Assets"\n',
    '          <Metric\n            label="Master Stills"\n            value={`${lifecycleProgress.master_stills?.completed || 0}/${lifecycleProgress.master_stills?.total || 0}`}\n            note={`${lifecycleProgress.motion_clips?.completed || 0}/${lifecycleProgress.motion_clips?.total || 0} motion clips`}\n          />\n          <Metric\n            label="Creative Assets"\n',
)

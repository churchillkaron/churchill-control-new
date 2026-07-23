from pathlib import Path


def replace_once(path, old, new):
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}")
    file.write_text(text.replace(old, new, 1))


production = "lib/creative/production/runtime/ProductionRuntime.js"
director = "lib/creative/director/runtime/CreativeDirectorRuntime.js"
route = "app/api/creative/director/execute/route.js"
button = "components/creative/ProductionStudio/actions/RunCreativePipelineButton.jsx"

replace_once(
    production,
    "  async runProduction({\n    organization_id,\n    creative_project_id,\n    max_cycles = 1,\n  }) {\n",
    "  async queueProduction({\n    organization_id,\n    creative_project_id,\n  }) {\n    if (!organization_id) {\n      throw new Error(\"organization_id required\");\n    }\n\n    if (!creative_project_id) {\n      throw new Error(\"creative_project_id required\");\n    }\n\n    const materialized = await materializeExecutionPlan({\n      organization_id,\n      creative_project_id,\n    });\n\n    const lifecycle =\n      await CreativeProductionLifecycleRuntime.markQueued({\n        organization_id,\n        creative_project_id,\n      });\n\n    return {\n      success: true,\n      execution_plan_id: materialized.plan.id,\n      tasks_materialized: materialized.tasks.length,\n      lifecycle,\n    };\n  },\n\n  async runProduction({\n    organization_id,\n    creative_project_id,\n    max_cycles = 1,\n  }) {\n",
)

replace_once(
    production,
    "    const materialized = await materializeExecutionPlan({\n      organization_id,\n      creative_project_id,\n    });\n\n    const queuedLifecycle =\n      await CreativeProductionLifecycleRuntime.markQueued({\n        organization_id,\n        creative_project_id,\n      });\n\n    const production = await CreativeOrchestrationWorker.runProject({\n",
    "    const queued = await this.queueProduction({\n      organization_id,\n      creative_project_id,\n    });\n\n    const production = await CreativeOrchestrationWorker.runProject({\n",
)

replace_once(
    production,
    "      execution_plan_id: materialized.plan.id,\n      tasks_materialized: materialized.tasks.length,\n      queued_lifecycle: queuedLifecycle,\n",
    "      execution_plan_id: queued.execution_plan_id,\n      tasks_materialized: queued.tasks_materialized,\n      queued_lifecycle: queued.lifecycle,\n",
)

replace_once(
    director,
    "import {\n  ProductionRuntime,\n} from \"@/lib/creative/production/runtime/ProductionRuntime\";\n",
    "import {\n  CreativeProductionHandoffRuntime,\n} from \"@/lib/creative/production/runtime/CreativeProductionHandoffRuntime\";\n",
)

replace_once(
    director,
    "      const production = await ProductionRuntime.runProduction({\n        organization_id: stateRef.organization_id,\n        creative_mission_id: stateRef.creative_mission_id,\n        creative_project_id: stateRef.creative_project_id,\n        max_cycles: input.max_cycles || 1,\n      });\n",
    "      const production =\n        await CreativeProductionHandoffRuntime.start({\n          organization_id: stateRef.organization_id,\n          creative_project_id: stateRef.creative_project_id,\n          approved_by:\n            input.approved_by ||\n            input.approvedBy ||\n            input.requested_by ||\n            null,\n          approval_source:\n            input.approval_source ||\n            \"DIRECTOR_EXECUTE_APPROVAL\",\n          initial_dispatches: 1,\n        });\n",
)

replace_once(
    director,
    "        production.complete\n          ? PIPELINE_STAGES.REVIEWING\n          : PIPELINE_STAGES.PRODUCING,\n",
    "        production.lifecycle?.status === \"RELEASE_READY\"\n          ? PIPELINE_STAGES.REVIEWING\n          : PIPELINE_STAGES.PRODUCING,\n",
)

replace_once(
    director,
    "          production.failed === 0 &&\n          production.blocked === 0,\n",
    "          production.success !== false,\n",
)

replace_once(
    route,
    "    const result =\n      await CreativeDirectorRuntime.execute(body);\n",
    "    const result =\n      await CreativeDirectorRuntime.execute({\n        ...body,\n        approved_by:\n          body.approved_by ||\n          body.approvedBy ||\n          access.user?.id ||\n          access.user_id ||\n          null,\n        approval_source:\n          body.approval_source ||\n          \"AUTHENTICATED_RUN_FILM_PRODUCTION\",\n      });\n",
)

replace_once(
    button,
    '        "Production plan created. Open Production to monitor and continue each controlled pass.",\n',
    '        result.production?.approval_required\n          ? "Production is queued and waiting for the required budget approval."\n          : "Production is queued and will continue automatically. Open Production to monitor live shot progress.",\n',
)

replace_once(
    button,
    '          ? "Building production plan..."\n          : "Run Film Production"}\n',
    '          ? "Planning and queueing production..."\n          : "Approve & Start Production"}\n',
)

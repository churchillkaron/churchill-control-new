from pathlib import Path


def replace_once(path, old, new):
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}")
    file.write_text(text.replace(old, new, 1))


lifecycle = "lib/creative/production/runtime/CreativeProductionLifecycleRuntime.js"
production = "lib/creative/production/runtime/ProductionRuntime.js"

replace_once(
    lifecycle,
    """      if (master.completed < master.total) {
        status = master.running || master.active
          ? CREATIVE_PRODUCTION_STATUS.PRODUCING_MASTER_STILLS
          : CREATIVE_PRODUCTION_STATUS.PRODUCTION_QUEUED;
      } else if (motion.completed < motion.total) {
        status = CREATIVE_PRODUCTION_STATUS.PRODUCING_MOTION;
""",
    """      if (master.completed < master.total) {
        status = master.running || master.review
          ? CREATIVE_PRODUCTION_STATUS.PRODUCING_MASTER_STILLS
          : CREATIVE_PRODUCTION_STATUS.PRODUCTION_QUEUED;
      } else if (motion.completed < motion.total) {
        status = motion.running || motion.review
          ? CREATIVE_PRODUCTION_STATUS.PRODUCING_MOTION
          : CREATIVE_PRODUCTION_STATUS.PRODUCTION_QUEUED;
""",
)

replace_once(
    production,
    """    const queuedLifecycle =
      await CreativeProductionLifecycleRuntime.markQueued({
        organization_id,
        creative_project_id,
      });

    const production = await CreativeOrchestrationWorker.runProject({
""",
    """    const queuedLifecycle =
      await CreativeProductionLifecycleRuntime.markQueued({
        organization_id,
        creative_project_id,
      });

    let production;

    try {
      production = await CreativeOrchestrationWorker.runProject({
""",
)

replace_once(
    production,
    """      max_cycles: Math.max(
        1,
        Math.min(5, Number(max_cycles || 1)),
      ),
    });

    return {
""",
    """        max_cycles: Math.max(
          1,
          Math.min(5, Number(max_cycles || 1)),
        ),
      });
    } catch (error) {
      if (
        error?.message !== "CREATIVE_PROJECT_BUDGET_APPROVAL_REQUIRED" &&
        error?.message !== "CREATIVE_PROJECT_BUDGET_EXCEEDED"
      ) {
        throw error;
      }

      const lifecycle = await CreativeProductionLifecycleRuntime.persist({
        organization_id,
        creative_project_id,
        explicit_status: "APPROVAL_REQUIRED",
      });

      production = {
        success: true,
        complete: false,
        approval_required: true,
        execution_started: false,
        failed: 0,
        blocked: 0,
        submissions: 0,
        polls: 0,
        cycles: 0,
        lifecycle,
      };
    }

    return {
""",
)

# Churchill Execution Governance Contract

## Primary Execution Path

EVENT / SIGNAL
→ event-bus
→ workflows
→ runtime queue
→ shared queue primitives
→ distributed runtime
→ ai-execution
→ kernel orchestration
→ memory / audit / alerts

## Layer Ownership

### lib/event-bus
Owns event publishing and subscriber dispatch.

### lib/workflows
Owns business workflow registration and workflow routing.

### lib/runtime
Owns runtime execution, health, heartbeat, recovery, replay, snapshots and autoscaling.

### lib/shared/queue
Owns low-level queue primitives only.

### lib/distributed/queues
Owns distributed queue scaling.

### lib/ai-execution
Owns autonomous domain execution.

### lib/intelligence
Owns analysis, recommendations and AI reasoning.

### lib/kernel
Owns global enterprise coordination and system-level orchestration.

## Rules

1. No business feature should call shared queue directly unless it is infrastructure code.
2. Business logic must enter through events or workflows.
3. AI decisions must produce events before execution.
4. Runtime queue owns retries and recovery.
5. Kernel owns cross-domain coordination only.
6. No duplicate queue, workflow or runtime systems.
7. New execution modules must declare which layer they belong to.
8. Payroll, finance, procurement, inventory and marketing must use the same execution path.


import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const TERMINAL = [
  "COMPLETED",
  "FAILED",
  "SKIPPED",
];

function dependencyComplete(taskMap, dependencyId) {
  const task = taskMap.get(dependencyId);

  if (!task) return true;

  return TERMINAL.includes(task.status);
}

export const ProductionQueueRuntime = {

  async build({
    organization_id,
    creative_project_id,
  }) {

    const tasks =
      await ProductionTaskRuntime.list({
        organization_id,
        creative_project_id,
      });

    const map =
      new Map(tasks.map((t) => [t.id, t]));

    const waiting = [];
    const ready = [];
    const running = [];
    const review = [];
    const completed = [];

    for (const task of tasks) {

      const deps =
        task.depends_on || [];

      const canRun =
        deps.every((id) =>
          dependencyComplete(map, id)
        );

      if (
        task.status === "WAITING" &&
        canRun
      ) {
        ready.push(task);
        continue;
      }

      switch (task.status) {

        case "READY":
          ready.push(task);
          break;

        case "RUNNING":
          running.push(task);
          break;

        case "REVIEW":
          review.push(task);
          break;

        case "COMPLETED":
          completed.push(task);
          break;

        default:
          waiting.push(task);

      }

    }

    return {

      waiting,

      ready,

      running,

      review,

      completed,

      total: tasks.length,

    };

  },

  async dispatchAll(input) {

    const dispatched=[];

    while(True){

      const next =
        await this.dispatchNext(input);

      if(!next)
        break;

      dispatched.push(next);

    }

    return{

      dispatched,

      total:
        dispatched.length,

    };

  },


  async dispatchNext(input) {

    const queue =
      await this.build(input);

    if (!queue.ready.length)
      return null;

    const next =
      queue.ready.sort(
        (a, b) =>
          a.priority - b.priority
      )[0];

    return ProductionTaskRuntime.dispatch(
      next.id
    );

  },

};

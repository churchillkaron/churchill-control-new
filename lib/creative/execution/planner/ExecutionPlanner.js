import {
  createExecutionPlan,
  createExecutionStep,
} from "../documents/ExecutionPlan";

export function buildExecutionPlan({

  organization_id,

  creative_project_id,

  production_graph,

}) {

  const plan =
    createExecutionPlan({

      organization_id,

      creative_project_id,

      production_graph_id:
        production_graph.id,

    });

  const nodes =
    production_graph.nodes || [];

  const edges =
    production_graph.edges || [];

  plan.steps =
    nodes
      .filter(
        node =>
          node.generation?.required
      )
      .map(node => {

        const deps =
          edges
            .filter(
              edge =>
                edge.to === node.id
            )
            .map(
              edge => edge.from
            );

        return createExecutionStep({

          node_id:
            node.id,

          service:
            node.generation.service,

          capability:
            node.generation.service,

          provider:
            node.generation.provider,

          priority:
            node.priority || 100,

          depends_on:
            deps,

          estimated_cost:
            node.generation.estimated_cost,

          estimated_seconds:
            node.generation.estimated_seconds,

          metadata: {

            node_type:
              node.type,

            node_title:
              node.title,

          },

        });

      });

  plan.estimated_cost =
    plan.steps.reduce(
      (t,s)=>
        t +
        Number(
          s.estimated_cost || 0
        ),
      0,
    );

  plan.estimated_minutes =
    Math.ceil(

      plan.steps.reduce(
        (t,s)=>
          t +
          Number(
            s.estimated_seconds || 0
          ),
        0,
      ) / 60

    );

  return plan;

}

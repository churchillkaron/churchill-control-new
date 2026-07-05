import {
  getProvidersForService,
} from "@/lib/platform/registry/providers/ProviderRegistry";

import {
  ProviderRouter,
  chooseFallback,
} from "../router/ProviderRouter";

import {
  getCreativeProvider,
} from "@/lib/creative/providers/ProviderFactory";

import {
  CreativeJobRuntime,
} from "@/lib/creative/jobs/runtime/CreativeJobRuntime";

import {
  ProviderCircuitBreaker,
} from "@/lib/platform/providers/monitor/ProviderCircuitBreaker";

import {
  ProviderMetricsRuntime,
} from "@/lib/platform/providers/metrics/ProviderMetricsRuntime";

const MAX_PROVIDER_RETRIES = 3;

export const CreativeProviderRuntime = {

  resolveCapability(task = {}) {

    return (
      task.type ||
      task.capability ||
      "GENERATE_IMAGE"
    );

  },

  listProvidersForService(task = {}) {

    const capability =
      this.resolveCapability(task);

    return getProvidersForService({
      requires: [capability],
    });

  },


  chooseProvider({

    task,

    preferredProvider,

  }) {

    return ProviderRouter.choose({

      capability:
        this.resolveCapability(
          task,
        ),

      strategy:
        task.metadata?.provider_strategy,

      preferredProvider,

    });

  },


  async executeTask({

    task,

    preferredProvider,

  }) {

    let lastError;

    const attempted = [];

    for (

      let attempt = 1;

      attempt <= MAX_PROVIDER_RETRIES;

      attempt++

    ) {

      try {

        const providerId =

          attempt === 1

            ? this.chooseProvider({

                task,

                preferredProvider,

              })

            : chooseFallback({

                capability:
                  this.resolveCapability(
                    task,
                  ),

                attempted,

              });

        if (!providerId)
          throw lastError;

        attempted.push(
          providerId,
        );

        const adapter =
          getCreativeProvider(
            providerId,
          );

        const submission =
          await adapter.submitJob(
            task,
          );

        ProviderCircuitBreaker.success(
          providerId,
        );

        ProviderMetricsRuntime.success({

          provider:
            providerId,

        });

        await CreativeJobRuntime.create({

          organization_id:
            task.organization_id,

          creative_project_id:
            task.creative_project_id,

          production_task_id:
            task.id,

          provider_id:
            providerId,

          provider_job_id:
            submission.provider_job_id,

          status:
            "SUBMITTED",

          metadata: {

            ...submission,

            retry_attempt:
              attempt,

          },

        });

        return submission;

      } catch (error) {

        if (
          typeof providerId !==
          "undefined"
        ) {

          ProviderCircuitBreaker.failure(
            providerId,
          );

          ProviderMetricsRuntime.failure({

            provider:
              providerId,

          });

        }

        lastError =
          error;

      }

    }

    throw lastError;

  },


};

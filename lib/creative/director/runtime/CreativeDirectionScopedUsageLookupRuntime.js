import {
  AsyncLocalStorage,
} from "node:async_hooks";

import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  UsageRuntime,
} from "@/lib/platform/service-runtime/usage/UsageRuntime";

const EXECUTION_FLAG = Symbol.for(
  "avantiqo.creative.direction-scoped-usage-execution.v1",
);
const USAGE_FLAG = Symbol.for(
  "avantiqo.creative.direction-scoped-usage-query.v1",
);
const storage = new AsyncLocalStorage();

function text(value) {
  return String(value ?? "").trim();
}

function installUsageScope() {
  if (UsageRuntime[USAGE_FLAG]) return;

  const organizationWithoutScope = UsageRuntime.organization.bind(
    UsageRuntime,
  );

  Object.defineProperty(UsageRuntime, USAGE_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  UsageRuntime.organization = async function organizationWithDirectionScope(
    organizationId,
  ) {
    const scope = storage.getStore();
    if (
      !scope ||
      text(scope.organization_id) !== text(organizationId) ||
      !text(scope.creative_project_id) ||
      !text(scope.operation)
    ) {
      return organizationWithoutScope(organizationId);
    }

    return UsageRuntime.creativeDirectionByProject({
      organization_id: organizationId,
      creative_project_id: scope.creative_project_id,
      operation: scope.operation,
      ascending: false,
      limit: 100,
    });
  };
}

function installExecutionScope() {
  if (ServiceExecutionRuntime[EXECUTION_FLAG]) return;

  const executeWithoutScope = ServiceExecutionRuntime.execute.bind(
    ServiceExecutionRuntime,
  );

  Object.defineProperty(ServiceExecutionRuntime, EXECUTION_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ServiceExecutionRuntime.execute =
    async function executeWithDirectionUsageScope(input = {}) {
      const category = text(input.category).toUpperCase();
      const organizationId = text(input.organization_id);
      const projectId = text(input.metadata?.creative_project_id);
      const operation = text(input.metadata?.operation).toUpperCase();

      if (
        category !== "CREATIVE_DIRECTION" ||
        !organizationId ||
        !projectId ||
        !operation
      ) {
        return executeWithoutScope(input);
      }

      return storage.run({
        organization_id: organizationId,
        creative_project_id: projectId,
        operation,
      }, () => executeWithoutScope(input));
    };
}

installUsageScope();
installExecutionScope();

export const CreativeDirectionScopedUsageLookupRuntime = {
  installed: true,
};

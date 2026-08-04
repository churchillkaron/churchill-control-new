import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.zero-cost-provider-firewall.v1",
);

function text(value) {
  return String(value ?? "").trim();
}

function authorized(name) {
  return text(process.env[name]).toLowerCase() === "true";
}

export function installCreativeZeroCostProviderFirewall() {
  if (ServiceExecutionRuntime[INSTALL_FLAG]) return;

  const executeWithoutFirewall =
    ServiceExecutionRuntime.execute.bind(ServiceExecutionRuntime);
  const settleWithoutFirewall =
    ServiceExecutionRuntime.settle.bind(ServiceExecutionRuntime);

  Object.defineProperty(ServiceExecutionRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ServiceExecutionRuntime.execute =
    async function executeWithZeroCostProviderFirewall(input = {}) {
      if (!authorized("CREATIVE_ZERO_COST_PROVIDER_FIREWALL_AUTHORIZED")) {
        return executeWithoutFirewall(input);
      }

      const category = text(input.category).toUpperCase() || "UNKNOWN";
      const operation = text(
        input.metadata?.operation || input.operation || input.service_id,
      ).toUpperCase() || "UNKNOWN";

      console.log(
        `CREATIVE_ZERO_COST_PROVIDER_FIREWALL_BLOCKED=${category}:${operation}`,
      );
      throw new Error(
        `CREATIVE_ZERO_COST_PROVIDER_EXECUTION_BLOCKED:${category}:${operation}`,
      );
    };

  ServiceExecutionRuntime.settle =
    async function settleWithZeroCostProviderFirewall(input = {}) {
      if (!authorized("CREATIVE_ZERO_COST_PROVIDER_FIREWALL_AUTHORIZED")) {
        return settleWithoutFirewall(input);
      }

      const provider = text(input.provider).toUpperCase() || "UNKNOWN";
      const jobId = text(input.provider_job_id) || "UNKNOWN";
      console.log(
        `CREATIVE_ZERO_COST_PROVIDER_SETTLEMENT_FIREWALL_BLOCKED=${provider}:${jobId}`,
      );
      throw new Error(
        `CREATIVE_ZERO_COST_PROVIDER_SETTLEMENT_BLOCKED:${provider}:${jobId}`,
      );
    };

  console.log("CREATIVE_ZERO_COST_PROVIDER_FIREWALL_INSTALLED=YES");
}

installCreativeZeroCostProviderFirewall();

export const CreativeZeroCostProviderFirewallRuntime = Object.freeze({
  installed: true,
});

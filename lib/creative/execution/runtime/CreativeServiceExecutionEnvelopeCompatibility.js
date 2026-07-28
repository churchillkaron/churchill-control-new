import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const PATCH_KEY = Symbol.for(
  "avantiqo.creative.service-execution-envelope-compatibility.v1",
);

if (!ServiceExecutionRuntime[PATCH_KEY]) {
  const execute = ServiceExecutionRuntime.execute.bind(ServiceExecutionRuntime);

  ServiceExecutionRuntime.execute = async function creativeCompatibleExecute(input) {
    const execution = await execute(input);
    const providerOutput = execution?.output?.output;

    if (
      providerOutput &&
      typeof providerOutput === "object" &&
      typeof providerOutput.text === "string"
    ) {
      return {
        ...execution,
        output: {
          ...execution.output,
          output: providerOutput.text,
          provider_output: providerOutput,
        },
      };
    }

    return execution;
  };

  Object.defineProperty(ServiceExecutionRuntime, PATCH_KEY, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
}

export const CreativeServiceExecutionEnvelopeCompatibility = true;

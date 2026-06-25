import { DomainRegistry } from "@/lib/domain-registry";
import { ContextRegistry } from "@/lib/context-registry";
import { DocumentRegistry } from "@/lib/document-registry";
import { AggregateRegistry } from "@/lib/aggregate-registry";
import { CapabilityRegistry } from "@/lib/capability-registry";
import { WorkflowRegistry } from "@/lib/workflow-registry";
import { EventRegistry } from "@/lib/event-registry";
import { AIRegistry } from "@/lib/ai-registry";

function call(name, registry) {
  console.log("[CHECK]", name, typeof registry, Object.keys(registry || {}));

  if (!registry)
    throw new Error(name + " undefined");

  if (typeof registry.all !== "function")
    throw new Error(
      name + ".all missing. Keys=" +
      Object.keys(registry).join(",")
    );

  return registry.all();
}

export function getPlatformManifest() {

  const domains = call("DomainRegistry", DomainRegistry);
  const contexts = call("ContextRegistry", ContextRegistry);
  const documents = call("DocumentRegistry", DocumentRegistry);
  const aggregates = call("AggregateRegistry", AggregateRegistry);
  const capabilities = call("CapabilityRegistry", CapabilityRegistry);
  const workflows = call("WorkflowRegistry", WorkflowRegistry);
  const events = call("EventRegistry", EventRegistry);
  const aiAgents = call("AIRegistry", AIRegistry);

  return {
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    domains,
    contexts,
    documents,
    aggregates,
    capabilities,
    workflows,
    events,
    aiAgents,
  };
}

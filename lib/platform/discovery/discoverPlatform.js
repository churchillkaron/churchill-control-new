import { DomainRegistry } from "@/lib/domain-registry";
import { ContextRegistry } from "@/lib/context-registry";
import { DocumentRegistry } from "@/lib/document-registry";
import { AggregateRegistry } from "@/lib/aggregate-registry";
import { CapabilityRegistry } from "@/lib/capability-registry";
import { WorkflowRegistry } from "@/lib/workflow-registry";
import { EventRegistry } from "@/lib/event-registry";
import { AIRegistry } from "@/lib/ai-registry";

export function discoverPlatform() {
  return {
    domains: DomainRegistry.all(),
    contexts: ContextRegistry.all(),
    documents: DocumentRegistry.all(),
    aggregates: AggregateRegistry.all(),
    capabilities: CapabilityRegistry.all(),
    workflows: WorkflowRegistry.all(),
    events: EventRegistry.all(),
    aiAgents: AIRegistry.all(),
  };
}

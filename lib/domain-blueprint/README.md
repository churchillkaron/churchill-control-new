# Avantiqo Domain Blueprint

Every business domain must follow the same contract.

Domain structure:

- runtime
- documents
- objects
- aggregates
- capabilities
- workflows
- repositories
- events
- services
- reports
- ui
- integrations
- ai

Rules:

1. Business logic belongs inside domains.
2. Platform/UBTE owns runtime, identity, permissions, events, queue, AI runtime, audit, and integrations.
3. Domains never import other domains directly.
4. Cross-domain work goes through UBTE events or execution contracts.
5. Every domain must define documents, capabilities, workflows, events, and repositories.

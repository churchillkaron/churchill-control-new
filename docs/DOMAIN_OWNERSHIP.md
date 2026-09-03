# Avantiqo Domain Ownership

**Status: living conceptual ownership guidance**

Exact domain/workspace/capability topology belongs to current `ERP_REGISTRY` and source on `main`. This document describes ownership principles and must not become a shadow registry.

Canonical domains are:

- Dashboard
- Finance
- Operations
- Supply Chain
- Commercial
- People
- Projects
- Documents
- Analytics
- AI
- Solutions
- Administration
- Compliance
- Creative

## Ownership principle

A domain owns the business rules, lifecycle semantics, capabilities, and domain-specific evidence for a coherent business area.

A domain does **not** own a feature simply because a route, screen, table, or historical folder lives under that name.

Before assigning ownership, ask what business reality is being modeled and which canonical capability should produce the effect.

## Dashboard

Owns role/context-oriented presentation and orchestration of operating insight and work entrypoints.

Does not own the underlying Finance, Operations, Commercial, People, or other domain truth it displays.

## Finance

Owns financial/accounting semantics including ledgers, journals, periods, dimensions, posting, reconciliation, receivables/payables, cash/bank workflows, tax/statutory work, review/sign-off, reporting, and other financial capabilities.

Payroll/compensation may originate in People but resulting accounting effects belong to Finance through governed integration.

## Operations

Owns neutral operational execution concepts such as orders, services/jobs/tasks, locations/resources/workstations, reservations/schedules, fulfilment, assets, and operational customer interactions.

POS/kitchen/floor/expo are not canonical domains. They are possible solution/workspace experiences composed from generic capabilities.

## Supply Chain

Owns procurement/purchasing, suppliers in their supply relationship, receiving, inventory/resource movements, transfers/adjustments, replenishment, availability, and supply performance.

Do not place supply-chain logic in Operations merely because an industry UI historically displayed it there.

## Commercial

Owns customer/lead commercial relationships, CRM/sales processes, opportunities, offers/quotations, pricing/terms, commercial orders/contracts, channels, and revenue-generating customer workflows.

Marketing is normally a composition across Commercial, Creative, Analytics, Documents/communications, and AI rather than a separate top-level architecture.

## People

Owns workforce/person relationships in their employment/contract/work context, roles, scheduling/time, compensation/payroll preparation, performance/development, and people workflows.

A staff portal is a delivery surface, not the People domain itself.

## Projects

Owns project/work-program structure: objectives, milestones, dependencies, assignments, project work, resources, cost/budget references, and project outcomes.

Projects compose other domains for financial, procurement, people, document, or operational effects instead of cloning them.

## Documents

Owns/document-enables governed document lifecycles, templates/rendering relationships, storage/reference behavior, and evidence for business artifacts such as invoices, purchase orders, quotations, contracts, statements, reports, receipts, certificates, approvals, and generated communication.

Business semantics remain with the capability/domain that creates or consumes the document.

## Analytics

Owns reproducible analytical models, metrics, reporting/insight computation, forecasting, comparisons, anomaly/exception analysis, and analytical evidence.

Does not replace operational/financial source-of-truth.

## AI

Owns Avantiqo Intelligence orchestration and strategic AI-engine capability boundaries where they are platform AI concerns.

AI does not own another domain's business truth merely because a model reasons over it. Intelligence must invoke the domain's governed capability for real business effects.

## Solutions

Owns composition/configuration of reusable capabilities for industries, roles, packaged workflows, or business problems.

Solutions must not duplicate core domain logic or create industry-specific parallel architecture.

## Administration

Owns cross-platform/business administrative configuration and governance surfaces that do not naturally belong to a business operating domain, including organization/entity setup and administrative access/configuration concerns.

## Compliance

Owns compliance-control workflows, obligations, evidence, reviews, attestations, exceptions, and policy/control relationships while referencing underlying domain truth rather than duplicating it.

## Creative

Owns creative strategy/production workflows and Studio orchestration:

**mission → context → brief → strategy → concept → storyboard → production → review/verification → output/publication**

Creative uses canonical shared AI/media engines and commercial/publication capabilities instead of maintaining duplicate provider/business runtimes.

## Shared platform ownership

Cross-domain infrastructure may be shared when the concept is genuinely universal, including:

- authentication/authorization foundations
- business context
- audit/evidence primitives
- tasks/workflow/approvals
- documents/files infrastructure
- wallet/usage/pricing/settlement
- communications
- automation/events
- scheduling/notifications
- provider/AI execution infrastructure
- common persistence/transport clients

Shared infrastructure must have a clear contract/owner and must not become a dumping ground for domain business logic.

## Persistence ownership

Persistence is not an independent business domain. Tables/stores belong conceptually to the business capability/domain whose truth they represent, while shared persistence infrastructure provides governed access patterns.

Do not make `lib/supabase/*` or any database wrapper the owner of business rules merely because it performs reads/writes.

## API ownership

Routes are delivery boundaries. They authenticate/authorize/validate/translate and invoke the owning capability/runtime.

A route does not own domain logic and must not become a second execution path.

## Cross-domain dependencies

Domains may depend on other domains through clear contracts/events/capabilities when a real workflow spans boundaries.

Avoid both extremes:

- duplicating another domain's logic locally
- creating a central mega-service that owns every domain

Prefer explicit governed composition with evidence and verification.

## Ownership test

For any new behavior ask:

1. What real business object/event/state/action is this?
2. Which canonical domain owns that business meaning?
3. Which workspace/capability should expose it in `ERP_REGISTRY`?
4. Does a shared platform primitive already implement the cross-domain mechanics?
5. Would placing it here duplicate another domain's source of truth?
6. Is an industry/route/UI name misleading the ownership decision?
7. How will cross-domain side effects be governed and verified?

If ownership is ambiguous, improve the business model before adding another parallel layer.

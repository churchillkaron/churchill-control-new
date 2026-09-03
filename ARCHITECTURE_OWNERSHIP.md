# Avantiqo Architecture Ownership Map

**Status: living conceptual ownership map**

This document does not define a second domain registry. Exact domain/workspace/capability topology belongs to current `ERP_REGISTRY` on `main`. The permanent architecture contract is [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Canonical platform domains

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

Ownership is determined by the real business meaning of an object/event/state/action, not by historical route names or industry screens.

## Platform and business context

Platform-level foundations own cross-cutting contracts such as identity/authentication foundations, canonical business context, governance primitives, execution/evidence foundations, usage/wallet infrastructure, shared AI/provider infrastructure, observability, and other genuinely cross-domain services.

Canonical business context is:

**organization → entity → party**

with period where applicable.

Do not create a parallel tenant architecture.

## Dashboard

Owns role/context-oriented operating views, summaries, exceptions, and work entrypoints.

It does not own the underlying business truth it presents.

## Finance

Owns financial truth and accounting semantics, including:

- general ledger/journals/posting
- accounts payable/receivable
- cash/bank/treasury
- reconciliation
- periods/dimensions
- tax/statutory workflows
- fixed assets
- budgeting/forecasting/consolidation where implemented
- financial review/sign-off
- financial reporting

Financial effects from other domains enter Finance through governed contracts/events/capabilities rather than duplicated accounting logic.

## Operations

Owns neutral operational execution primitives such as:

- order
- service/job/task
- reservation/schedule
- location/resource/workstation
- fulfilment
- asset
- operational customer interaction

POS, kitchen, floor, expo, restaurant, hotel front desk, or other industry surfaces are compositions of canonical capabilities; they are not canonical top-level domains.

## Supply Chain

Owns supply and inventory/resource lifecycle semantics such as:

- procurement/purchasing
- supplier supply relationships
- purchase requests/orders
- receiving/returns
- inventory/resource movements
- replenishment/availability
- transfers/adjustments
- warehouse/storage behavior where relevant
- supply performance

Production/manufacturing/recipe/yield/waste concepts may be scoped capabilities/solutions built from Supply Chain + Operations + Finance depending on the real business model. They are not automatically separate canonical domains.

## Commercial

Owns revenue-facing commercial relationships and workflows such as:

- CRM/customer/lead relationships
- opportunities
- offers/quotations
- pricing/terms
- sales/commercial orders
- contracts/agreements
- customer communication/channels
- commercial lifecycle

Marketing is normally a composition across Commercial, Creative, Analytics, AI, Documents/communications, and channel capabilities rather than an independent platform architecture.

## People

Owns workforce/person relationships in their work context, including:

- employment/contract relationships
- roles
- scheduling/time/attendance
- compensation/payroll preparation
- performance/development
- people approvals/workflows

Payroll accounting effects belong to Finance through governed integration. A staff portal is a delivery surface, not a domain.

## Projects

Owns project/program structure such as objectives, milestones, dependencies, assignments, project work, resources, budgets/cost references, and outcomes.

Projects compose domain capabilities rather than duplicating Finance, People, Supply Chain, Documents, or Operations logic.

## Documents

Owns/document-enables governed document lifecycles, templates/rendering, storage/reference behavior, and evidence relationships for business artifacts such as invoices, quotations, purchase orders, contracts, statements, reports, receipts, certificates, approvals, and communications.

The business semantics of a document remain with the capability/domain that creates or consumes it.

## Analytics

Owns reproducible metrics, analytical models, reporting/insight computation, forecasting, comparisons, anomalies, and decision support.

Analytics does not replace operational or financial source-of-truth.

## AI

Owns Avantiqo Intelligence orchestration and platform-level strategic AI engine boundaries where appropriate.

AI does not own another domain's business truth merely because it reasons over it. Real business effects must execute through the owning governed capability.

AI may recommend **and execute authorized capabilities** under the same or stronger authorization, lifecycle, safety, and evidence requirements as human execution.

## Solutions

Owns composition/configuration of reusable domains/workspaces/capabilities for industries, roles, packaged workflows, or business problems.

Solutions must not fork the core into restaurant-, hotel-, retail-, construction-, accounting-, agency-, manufacturing-, or other industry-specific architectures.

## Administration

Owns governed organization/entity setup, platform/business configuration, administrative controls, and access/configuration surfaces that do not naturally belong to another operating domain.

## Compliance

Owns compliance obligations, controls, policy relationships, reviews, attestations, exceptions, and evidence coordination while referencing real underlying domain truth.

## Creative

Owns creative strategy and production workflow orchestration:

**mission → business/brand context → brief → strategy → concept → storyboard → production plan → canonical AI/media capabilities → review/verification → final output/publication**

Creative uses canonical Image/Video/Voice/Audio/Music/publication runtimes rather than duplicating engines per Studio surface.

## Governance, approvals, and workflow

Approval, workflow, tasks, audit, evidence, eventing, and orchestration are generally shared platform primitives when the mechanics are cross-domain.

They are not separate business domains merely because many domains use them. Domain-specific approval semantics remain with the owning capability.

## Ownership rules

Before assigning new behavior:

1. Model the real business concept/event/state/action.
2. Find the canonical domain/capability that owns that meaning.
3. Reuse shared platform primitives for genuinely cross-domain mechanics.
4. Avoid duplicate sources of truth and execution paths.
5. Do not infer domain ownership from folders, routes, customer names, providers, or industry terminology.
6. Add a new canonical domain only when research and implementation evidence prove the existing domain model cannot represent a genuinely distinct business capability family cleanly.
7. Keep this document descriptive; update `ERP_REGISTRY`/implementation when executable topology changes.

The test is simple: **does the ownership decision make Avantiqo one stronger reusable platform, or another isolated piece?**

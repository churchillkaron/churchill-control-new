# Avantiqo Domain Execution Map

**Status: living conceptual map**

This document explains how canonical Avantiqo domains participate in business execution. Exact workspaces/capabilities are defined by current `ERP_REGISTRY` and source on `main`.

It must not be used as a second registry.

## Canonical flow

**PLATFORM → USER → BUSINESS CONTEXT → UBTE → ERP_REGISTRY → DOMAIN → WORKSPACE → CAPABILITY → DOCUMENT / ACTION / PROCESS**

Domains own coherent business capability areas. Cross-domain workflows should compose capabilities rather than duplicate the same business logic inside each domain.

## Dashboard

Consumes governed information from other domains and presents role/context-relevant operating state, exceptions, work, and decisions.

Dashboard does not become a second source of business truth.

## Finance

Typical inputs:

- business events/documents with financial effect
- invoices, payments, receipts, expenses
- bank activity
- inventory/cost movements where applicable
- payroll/compensation results
- periods, entities, dimensions

Typical capabilities/results:

- journals/posting
- ledger and trial balance
- reconciliation
- receivables/payables
- tax/statutory workflows
- review/approval/sign-off
- financial statements/reports
- forecasts/insights

Financial effects must remain deterministic, auditable, and verifiable.

## Operations

Uses neutral operational primitives such as:

- order
- service/job/task
- location/resource/workstation
- reservation/schedule
- fulfilment
- asset
- customer interaction

Typical outputs are governed state transitions, fulfilment events, tasks, resource changes, and operational evidence.

A restaurant POS/kitchen workflow is one composition of Operations plus other domains; POS and Kitchen are not canonical top-level domains.

## Supply Chain

Typical inputs:

- demand/replenishment signals
- products/items/resources
- suppliers/parties
- purchase requirements
- receipts/returns
- inventory/resource movements

Typical capabilities/results:

- purchasing/procurement
- receiving
- inventory control
- transfers/adjustments
- supplier performance
- availability/replenishment
- cost/movement evidence

## Commercial

Typical inputs:

- customers/leads/parties
- products/services/offers
- pricing/terms
- opportunities/orders/contracts
- channels/campaign outcomes

Typical capabilities/results:

- CRM/sales workflows
- quotations/offers
- commercial orders/agreements
- pricing/discount governance
- customer communication
- revenue-generating workflow state

Marketing is a Commercial/Creative/Analytics composition, not a separate platform architecture.

## People

Typical inputs:

- people/party relationships
- roles/employment/contract context
- attendance/time/schedule
- performance/compensation inputs
- approvals

Typical capabilities/results:

- workforce records
- scheduling/time workflows
- payroll/compensation preparation and execution
- performance/development
- approvals/documents

A `/staff` experience is a delivery surface over People and other job-relevant capabilities, not a canonical domain by itself.

## Projects

Coordinates planned work across time, responsibility, resources, cost, documents, dependencies, tasks, milestones, and outcomes.

Projects may compose Finance, People, Supply Chain, Commercial, Documents, Analytics, and Operations capabilities without recreating their logic.

## Documents

Owns/document-enables first-class business artifacts and their lifecycle/evidence relationships, including invoices, quotations, purchase orders, contracts, certificates, statements, reports, receipts, approvals, and generated communication.

A file/PDF is a representation; the governed document/business relationship is the important contract.

## Analytics

Consumes governed domain data and produces reproducible metrics, analysis, forecasts, anomalies, comparisons, and decision support.

Analytics should not silently become a second operational/financial source of truth.

## AI

Avantiqo Intelligence and strategic engines understand context, reason, synthesize, discuss, navigate, prepare, and invoke/execute governed capabilities.

AI is **not limited to recommendations**. It may execute authorized capabilities when permissions, lifecycle, safety, and evidence contracts allow it.

Preferred pattern:

**AI reasoning → governed capability → deterministic execution where possible → deterministic verification → result/evidence**

## Solutions

Solutions compose reusable Avantiqo capabilities for a role, industry, workflow, or business problem.

A Solution must not fork the platform into an industry-specific architecture. It configures/composes shared domains, workspaces, capabilities, documents, and automation.

## Administration

Owns governed platform/business configuration, access/authorization surfaces, organization/entity setup, and administrative controls that do not belong inside a specific operating domain.

Administration must not become a dumping ground for unrelated business features.

## Compliance

Coordinates policies, obligations, evidence, reviews, controls, exceptions, and attestations across domains where required.

Compliance should reference the real underlying business events/documents rather than duplicating them.

## Creative

Canonical direction:

**mission → business/brand context → brief → strategy → concept → storyboard → production plan → canonical AI/media capabilities → review/verification → final output/publication**

Studio should use the same canonical Image/Video/Voice/Audio/Music and publication capabilities rather than maintaining separate production engines.

## Cross-domain execution rule

A cross-domain workflow should:

1. identify the owning capability for each business effect
2. preserve shared organization/entity/party context
3. execute each effect through its canonical governed runtime
4. preserve immutable execution identity where needed
5. emit/reference business events/evidence rather than directly mutating another domain's hidden state
6. verify important resulting invariants

Do not centralize all business logic into one mega-domain merely because a workflow spans domains.

## Industry composition example

A restaurant sale can compose:

- Commercial: customer/order/pricing
- Operations: service/fulfilment/workstation flow
- Supply Chain: inventory/resource movements
- Finance: payment/revenue/accounting effects
- People: staff context where relevant
- Documents: receipt/invoice
- Analytics: performance metrics
- AI: assistance/automation

Retail, hotel, construction, accounting, manufacturing, agency, and other solutions compose the same platform differently.

The architecture stays generic.

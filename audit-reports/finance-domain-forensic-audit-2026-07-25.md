# Avantiqo Finance Domain — Deep Forensic Reality Audit

**Audit date:** 2026-07-25  
**Repository:** `churchillkaron/churchill-control-new`  
**Branch:** `finance-full-audit-20260721`  
**Pull request:** #2 — Finance full reality audit and convergence  
**Supersedes:** `audit-reports/finance-domain-reality-audit-2026-07-22.md`  
**Release verdict:** **BLOCKED — Finance is not complete, production-safe, or world-class**

## 1. Binding audit standard

This audit does not treat a route, registry entry, rendered page, successful build, or visible menu as proof that a Finance capability works.

A Finance capability is complete only when the full chain is proven:

`PLATFORM -> AUTHENTICATED USER -> BUSINESS CONTEXT -> ERP_REGISTRY -> FORM/ACTION -> DOMAIN COMMAND -> ATOMIC DOCUMENT/SUBLEDGER WRITE -> ACCOUNTING EVENT -> JOURNAL -> GENERAL LEDGER -> REPORT/DOCUMENT -> AUDIT EVIDENCE`

Every active capability must prove:

- organization, legal-entity, period, actor, currency, locale, and accounting-basis context;
- authorization and cross-company isolation;
- correct form fields, typed lookups, validation, totals, and lifecycle state;
- atomic and idempotent persistence;
- balanced posting and source-document lineage;
- canonical detail, document, preview, print, export, and attachment behavior where applicable;
- exact reconciliation to the posted General Ledger;
- browser, API, database, migration, isolation, concurrency, and failure-injection tests.

## 2. Executive verdict

The Finance branch contains meaningful repairs, especially the atomic journal-posting RPC. It is still far from a complete Finance system.

The current product surface overstates reality. Planned capabilities remain visible as clickable work centers. Generic row and top menus expose actions that have no executable target. Open/View commonly displays a generic row dump instead of the Finance document. Attachments explicitly has no provider. Several statutory and treasury reports are not accounting statements despite their labels.

The accounting kernel is only partially transactional. Journal posting is atomic and idempotent, but customer invoices, customer payments, vendor bills, vendor payments, and period close still perform multiple independent writes. Failures can leave invoices without lines, payments without ledger posting, AP marked paid without a completed bank/GL chain, or periods partially closed.

The current branch must remain draft.

## 3. Proven improvements since the 2026-07-22 audit

The following repairs are real and should be retained:

1. `postJournalEntrySafe()` now requires organization, entity, posting date, currency, positive exchange rate, valid period, and balanced lines.
2. `finance_post_journal_atomic` posts journal header, lines, and General Ledger rows inside a database transaction.
3. Journal numbering and source retry protection have scoped uniqueness and idempotency controls.
4. Accounting-event processing now propagates currency and exchange rate instead of silently choosing THB.
5. Entity-specific posting mappings are checked before organization-level fallback.
6. The Finance gateway now accepts `VENDOR_INVOICE_CREATED` and other canonical events used by current flows.
7. Customer payment rejects amounts above the selected invoice balance.
8. Master create submission now carries organization, entity, period, currency, and idempotency metadata.
9. Required form fields are checked before submission.
10. Currency fields use the organization lookup rather than a fixed client-side currency list.
11. Organization-access checks were added to several previously unsafe endpoints, including platform lookups, document preview, customer upsert, and tax-code upsert.
12. The current PR head passes dependency installation, lint, production build, and repository-hygiene checks.

These improvements do not close the Finance release gate because they cover selected paths rather than the whole domain.

## 4. Current P0 release blockers

### P0-01 — Registry and navigation do not tell the truth

**Evidence**

- `components/workspace/WorkspaceModuleGrid.jsx` renders every registry item as a clickable link and ignores `status: "planned"`.
- `lib/platform/registry/erpRegistry.js` contains many planned Finance items with real routes.
- Planned items can reach a runtime with no usable renderer, API, form, or action and produce an empty or misleading page.

**Required state**

Planned capabilities must be disabled or hidden. CI must reject any `status: "active"` item that lacks a complete route, renderer, data, form/action, detail/document, permission, and test contract.

### P0-02 — The central Finance registry is contradictory and malformed

The central registry still contains repeated boilerplate menus and conflicting structures:

- read-only workspaces contain `New`, `Edit`, `Duplicate`, or `Delete` actions;
- items with `create.enabled: false` still declare a `new` top-menu action;
- several items contain duplicate `ui` objects or misplaced `topMenu`/`rowMenu` blocks;
- generic Import, Export, Automation, AI, Settings, History, Attachments, and Delete actions are declared without a verified implementation;
- planned capabilities are mixed with active ones without a machine-enforced readiness contract.

The registry must become a compiled Finance capability manifest, not an optimistic menu catalog.

### P0-03 — Generic platform code contains Finance business behavior

**Evidence**

- `lib/platform/registry/serializeCapability.js` imports Finance primary-action policy.
- `components/workspace/master-data/MasterDataWorkCenter.jsx` imports Finance action presentation.
- The same generic component hardcodes Customer Invoice form initialization.
- Finance-specific behavior is distributed across platform serializers, forms, workspace engines, and runtime components.

**Required state**

Platform must expose domain-neutral extension contracts. Finance must own its forms, actions, presentation adapters, documents, commands, and lifecycle policy.

### P0-04 — Organization-scoped setup is blocked until an entity is selected

`MasterDataRuntimeWorkCenter` loads only when both organization and entity are available.

That blocks or deadlocks organization-scoped setup such as:

- Legal Entities;
- Organization Profile;
- Accounting Settings;
- Currencies;
- Payment Terms;
- Number Sequences;
- Posting Rules;
- Approval Workflows;
- Finance Permissions;
- Banking and government connections.

These capabilities are required to create and configure the first entity and must explicitly declare their context level.

### P0-05 — Authorization is not complete across Finance reporting

The statutory report routes currently accept browser-supplied organization/entity/period identifiers and call the reporting runtime without `requireOrganizationAccess`:

- `app/api/finance/reports/profit-loss/route.js`;
- `app/api/finance/reports/balance-sheet/route.js`;
- `app/api/finance/reports/cash-flow/route.js`.

Every Finance list, lookup, detail, document, preview, report, export, and mutation endpoint must prove organization and entity access server-side. A source query filtered by a caller-provided organization ID is not authorization.

### P0-06 — Customer Invoice is not an accounting-grade aggregate

`createCustomerInvoice()` currently:

1. inserts the invoice;
2. inserts invoice lines;
3. inserts Accounts Receivable;
4. emits an accounting event.

These steps are not in one transaction. Tax is hardcoded to zero. There is no idempotency key. Lines contain only description, quantity, and unit price. There is no product/service reference, tax code, revenue account, unit, discount, dimension, project, cost center, department, or line currency model.

A failure can leave a partial invoice aggregate.

### P0-07 — Customer Payment remains non-atomic and concurrency-unsafe

The flow now rejects overpayment, but it still:

1. reads the current receivable balance;
2. inserts a payment;
3. updates Accounts Receivable;
4. updates the invoice;
5. emits the accounting event.

There is no single transaction, row lock, allocation aggregate, or idempotency key. The optimistic balance predicate is not followed by an affected-row verification. Concurrent payments can still create inconsistent subledger and ledger states.

World-class O2C requires partial and multi-invoice allocation, unapplied cash, credit balances, refunds, write-offs, discounts, bank lineage, and exact AR-to-GL reconciliation.

### P0-08 — Vendor Bill still discards accounting detail

`createVendorInvoice()` requires currency and emits an accepted event, but it does not accept or store vendor-invoice lines. It inserts a header and emits posting after the insert, outside a shared transaction.

Missing aggregate data includes:

- item/service and description;
- quantity, unit price, discounts, tax, withholding, and total;
- expense/asset/inventory account;
- cost center, department, project, and location;
- PO line and goods-receipt line matching;
- match exceptions and approval evidence;
- document attachment and OCR lineage;
- idempotency and duplicate-invoice controls.

The lifecycle is not a complete Draft -> Received -> Matched -> Approved -> Posted -> Paid workflow.

### P0-09 — Vendor Payment can mark AP paid before bank and GL completion

`processVendorPayment()` inserts a payment, marks Accounts Payable as paid, inserts a bank-ledger row, and then posts the GL in separate operations.

A failure after the AP update can leave a paid liability with no valid bank or GL result. The flow is full-payment only and lacks payment batches, payment proposals, approvals, bank account selection, partial allocations, payment files, rejection/return handling, fees, FX, idempotency, and bank-reconciliation lineage.

### P0-10 — Period Close remains period-incorrect and non-atomic

`runMonthlyClose()`:

- checks every non-posted journal for the entity rather than the selected period;
- updates the period, locks it separately, then writes audit evidence separately;
- does not roll back if lock or audit insertion fails;
- defaults the actor to `system` instead of binding the authenticated user;
- lacks a deterministic close checklist, subledger reconciliation, exception ownership, approval, reopen governance, and retained evidence.

A close must be a controlled, auditable aggregate with transactional state change and period-specific validation.

### P0-11 — Multi-entity accounting is still disabled in account resolution

`getAccountingMode()` still returns `SINGLE_ENTITY` as a constant. `findAccount()` therefore nulls the entity unless the mode is `MULTI_ENTITY`.

This contradicts the platform's multi-entity architecture and can resolve the wrong account mapping. Accounting mode, chart ownership, posting mappings, sequences, currencies, periods, books, and reporting basis must resolve from effective-dated organization/legal-entity configuration.

### P0-12 — Open, View, History, Attachments, and lifecycle actions are not canonical Finance actions

`RowActionEngine` renders generic scalar fields for Open/View rather than a canonical Finance document/detail model. It shows only the first fields from the list row. Attachments explicitly says no provider is configured. Unsupported actions can still render a `Check Action` button.

Journal detail enrichment is guarded by `moduleKey === "finance"`, although the Journal module key is normally `journals`, so journal lines are commonly not loaded.

Every Finance row action must have a typed target, required permission, lifecycle guard, endpoint/command, confirmation policy, and deterministic success/failure result.

### P0-13 — Forms are not business-correct documents

The dynamic line editor renders every column as a plain text input. It cannot correctly model accounts, amounts, tax, quantities, currency, projects, departments, cost centers, parties, products, or effective-dated lookups.

Confirmed examples:

- Journal line account is a free-text Account ID.
- Customer Invoice has no tax, discount, currency, dimensions, product/service, or totals model.
- Customer Payment invoice is not a scoped open-receivable lookup.
- Vendor Payment omits amount, date, bank account, currency, allocation, and reference controls.
- Fixed Asset, Budget, Intercompany, and Consolidation forms are too shallow for their labels.
- Create forms are reused for Edit/Duplicate without a separately proven update contract.

### P0-14 — Profit & Loss is not a valid financial statement

`generateProfitAndLoss()`:

- filters only by organization;
- ignores legal entity and accounting period;
- reads every General Ledger row;
- classifies rows by searching text in an `account` field;
- sends everything not containing `revenue` or `cogs` to expenses;
- returns `null` on query error instead of failing closed.

A valid P&L must use the selected book/entity/period, posted ledger, account classifications and reporting hierarchy, opening/closing rules, comparative periods, functional/reporting currency, and reconciliation controls.

### P0-15 — Balance Sheet is not derived from the General Ledger

`generateBalanceSheet()` assembles assets and liabilities from:

- `inventory_ledger`;
- the latest `cash_flow_snapshots` row;
- purchase orders treated as liabilities;
- profitability snapshots treated as retained earnings.

It ignores entity and selected period and does not prove `Assets = Liabilities + Equity`. This is not a statutory or management balance sheet.

### P0-16 — Cash Flow and Liquidity are materially mislabeled

The current cash-flow implementations use either profitability snapshots/purchase orders or unscoped bank transactions. They do not implement a direct or indirect cash-flow statement for the selected entity and period.

Liquidity currently treats every Asset account as cash and all purchase orders as short-term liabilities. It ignores bank-account designation, reconciled balances, AP/AR maturity, due dates, commitments, facilities, currencies, and forecast horizon.

These surfaces must be hidden/renamed until a treasury-grade model exists.

### P0-17 — Reporting runtime contracts are inconsistent

`ReportRuntime` sends camel-case context to `generateTrialBalance()`, while that generator requires `organization_id` and `entity_id`. This can fail even when a valid page context exists.

Report endpoints and generators use inconsistent parameter names, clients, error contracts, scoping, and document shapes. No automated report-reconciliation suite proves Trial Balance, P&L, Balance Sheet, Cash Flow, AR, AP, bank, retained earnings, or consolidation against the same posted ledger dataset.

### P0-18 — CI proves buildability, not Finance correctness

The current CI validates installation, lint, build, migration-folder presence, and ignored files. It does not test:

- cross-company isolation;
- entity/period context;
- atomicity under injected failure;
- idempotency and double-click/retry;
- concurrent payment allocation;
- journal/ledger/subledger reconciliation;
- tax effective dates;
- multi-currency and multi-entity posting;
- period close/reopen/year-end;
- documents, row actions, top actions, or browser traversal.

The remote database also has pre-existing schema-lint failures involving obsolete `tenant_id` references and missing legacy relations. A Finance release cannot rely on a live schema with unresolved invalid functions.

## 5. Capability verdict by Finance group

### Accounting

| Capability | Current verdict |
|---|---|
| Chart of Accounts | PARTIAL — real list/form/upsert, but classifications, detail, lifecycle, multi-entity, validation, and reporting hierarchy are incomplete |
| General Ledger | PARTIAL — atomic journal posting is strong; ledger inquiry, source drill-down, books, currencies, dimensions, and reconciliation are incomplete |
| Journals | PARTIAL — atomic posting exists; draft/approve/post/reverse, detail rendering, attachments, recurring generation, and browser proof are incomplete |
| Trial Balance | BLOCKED — generator/runtime parameter mismatch and no retained reconciliation suite |
| Fiscal Periods | PARTIAL — basic lifecycle exists; onboarding context and close governance are blocked |
| Dimensions | PARTIAL — insufficient dimension model and typed posting controls |
| Opening Balances | PARTIAL/UNPROVEN — requires atomic posting, duplicate guard, approvals, source import, and reconciliation proof |
| Recurring Journals | PARTIAL/UNPROVEN — requires schedule, approval, generated-journal idempotency, failures, and audit proof |

### Order to Cash

| Capability | Current verdict |
|---|---|
| Customers | PARTIAL — security improved; entity model, update contract, credit controls, contacts/addresses/tax profiles, and lifecycle remain incomplete |
| Customer Invoices | BLOCKED — tax zero, shallow lines, non-atomic aggregate/posting, no idempotency |
| Accounts Receivable | BLOCKED by invoice/payment chains |
| Customer Payments | BLOCKED — non-atomic and allocation/concurrency model incomplete |
| Collections | PLANNED |
| Customer Statements | PARTIAL/UNPROVEN |
| Revenue Recognition | PLANNED/UNPROVEN |
| Credit Notes, Refunds, Write-offs, Deposits | MISSING as complete governed flows |

### Procure to Pay

| Capability | Current verdict |
|---|---|
| Vendors | PARTIAL |
| Purchase Orders / Goods Receipts | Must remain Supply Chain-owned with canonical Finance contracts; end-to-end integration is unproven |
| Vendor Bills | BLOCKED — lines missing and aggregate non-atomic |
| Invoice Matching | PARTIAL/UNPROVEN — no complete three-way-match and exception workflow |
| Accounts Payable | BLOCKED by bill/payment chains |
| Vendor Payments | BLOCKED — AP can be marked paid before bank/GL completion |
| Vendor Statements | PLANNED/UNPROVEN |
| Credit Memos, Advances, Payment Proposals | MISSING as complete governed flows |

### Treasury

| Capability | Current verdict |
|---|---|
| Bank Accounts | PARTIAL |
| Bank Statements | PARTIAL/PLANNED |
| Bank Reconciliation | PARTIAL/UNPROVEN |
| Cash Management | BLOCKED as labeled |
| Cash Flow | BLOCKED as labeled |
| Payment Factory | MISSING |
| Cash Forecast | MISSING as a governed treasury forecast |
| Debt, Facilities, Interest, Covenants | MISSING |
| FX Revaluation / Realized FX | PLANNED/UNPROVEN |

### Tax, Assets, Close, and Compliance

| Capability | Current verdict |
|---|---|
| Tax Codes | PARTIAL — effective dates exist; jurisdiction/category/account/recoverability/computation controls incomplete |
| VAT/Tax Returns | PLANNED/UNPROVEN |
| Withholding Tax | MISSING as a complete effective-dated flow |
| E-Invoicing / Authority Submission | PLANNED |
| Fixed Assets | PARTIAL — acquisition-to-disposal and multi-book depreciation unproven |
| Lease Accounting | MISSING |
| Audit Trail | PARTIAL — generic record history is not accounting evidence |
| Period Close | BLOCKED |
| Year End | BLOCKED/UNPROVEN |
| Statutory Filings | PLANNED |

### Enterprise, FP&A, Reporting, Administration

Legal Entities, Intercompany, Consolidation, Budgets, Forecasts, KPIs, Executive Dashboard, Financial Health, Accounting Settings, Number Sequences, Posting Rules, Approval Workflows, Exchange Rates, Document Templates, Permissions, Report Builder, and Scheduled Reports remain partial or planned. None has complete multi-entity, configuration, workflow, document, reconciliation, and automated-test proof.

## 6. What is missing for a world-class Finance system

### 6.1 Accounting foundation

- multiple books/ledgers per entity where required;
- configurable chart templates and reporting hierarchies;
- complete dimensions with validation rules and effective dates;
- draft, approval, posting, reversal, correction, and recurring journal lifecycles;
- functional, transaction, and reporting currency amounts on every posting line;
- controlled exchange-rate source, date, triangulation, rounding, and revaluation;
- immutable source-document and accounting-event lineage;
- subledger control-account reconciliation;
- accounting policies and standards configured by entity and effective date.

### 6.2 World-class Order to Cash

- sales-order/contract/billing schedule integration;
- invoice, credit note, debit note, pro forma, deposit, refund, write-off, and adjustment documents;
- product/service, quantity, unit, pricing, discount, tax, revenue account, and dimension lines;
- payment terms, due-date rules, installments, credit limits, holds, and approvals;
- partial/multi-invoice allocations and unapplied cash;
- dunning strategies, promises to pay, disputes, collection cases, and aging;
- revenue recognition schedules, deferred revenue, contract assets/liabilities;
- customer statements that reconcile exactly to AR and GL.

### 6.3 World-class Procure to Pay

- supplier tax/payment/bank/approval profiles;
- PO/receipt/service-entry/bill line matching;
- configurable two-way/three-way matching tolerances;
- duplicate-invoice detection and fraud controls;
- exception queues, approvals, holds, credit memos, advances, and prepayments;
- payment proposals, batches, approval, bank files/API submission, acknowledgements, rejects, returns, fees, and reconciliation;
- supplier statements and AP aging reconciled to GL.

### 6.4 World-class Treasury

- bank feeds and statement formats with durable import idempotency;
- matching rules, suggestions, tolerances, manual review, and reconciliation certification;
- bank-account book balance versus statement balance with opening/movement/closing proof;
- daily cash position by bank/entity/currency;
- rolling 13-week cash forecast with scenarios and confidence;
- payment factory and liquidity concentration;
- debt, facilities, interest, covenants, guarantees, and counterparty exposure;
- realized/unrealized FX and revaluation posting.

### 6.5 Tax and localization

- effective-dated jurisdiction, registration, nexus, party/product category, place-of-supply, exemption, reverse-charge, withholding, recoverability, and rounding rules;
- VAT/GST/sales tax/withholding returns built from traceable tax subledger entries;
- tax payment, filing, amendment, audit evidence, and authority acknowledgements;
- country adapters as configuration and statutory logic, never generic runtime constants;
- e-invoicing networks, schemas, signatures, status callbacks, cancellation, and archival;
- local statutory charts and IFRS/local-GAAP mappings where required.

### 6.6 Assets and leases

- capitalization from procurement/project completion;
- asset components, locations, custodians, books, methods, conventions, useful lives, residual values, impairments, transfers, disposals, and gains/losses;
- transactional depreciation runs with idempotent posting;
- lease schedules, right-of-use assets, liabilities, modifications, interest, and disclosures.

### 6.7 Close, consolidation, and controls

- configurable close calendar and checklist by entity/period;
- automated subledger-to-GL, bank, tax, inventory, payroll, and intercompany reconciliation;
- owned exceptions, materiality, approvals, evidence, sign-off, and reopen governance;
- intercompany matching, settlement, eliminations, ownership, and minority interests;
- currency translation, CTA, consolidation journals, and retained earnings carry-forward;
- segregation of duties, maker-checker, approval limits, emergency access, and periodic access review;
- immutable audit evidence with before/after values and actor/session/source.

### 6.8 FP&A and management reporting

- driver-based budgets and rolling forecasts;
- versions, scenarios, workflow, allocations, spreading, and commentary;
- actual/budget/forecast variance and drill-down to source;
- management packs, custom report builder, scheduled delivery, and governed metrics;
- entity, segment, location, department, product, project, customer, and channel profitability.

### 6.9 Reliability, scale, and operability

- transaction boundaries for every financial aggregate;
- deterministic idempotency for UI, API, import, event, callback, and retry paths;
- optimistic/pessimistic concurrency where business invariants require it;
- outbox/inbox pattern for cross-domain accounting events;
- immutable posted records and controlled correcting entries;
- database constraints for all accounting invariants;
- query/index strategy for large ledgers and closing workloads;
- observability, dead-letter queues, reconciliation monitors, and repair tooling;
- backup, restore, retention, legal hold, and disaster-recovery proof.

### 6.10 Governed Finance intelligence

AI must operate on reconciled, authorized, explainable Finance data. World-class intelligence should support anomaly detection, coding recommendations, match suggestions, forecast explanations, collections prioritization, close assistance, and narrative reporting, but it must never silently post, invent tax/accounting policy, or bypass approvals and evidence.

## 7. Mandatory repair sequence

### Wave 0 — Product truth

- disable/hide planned workspaces;
- compile a machine-readable capability matrix;
- remove unsupported top and row actions;
- fail CI for incomplete active contracts.

### Wave 1 — Security and context

- authorize every Finance endpoint and report;
- introduce explicit organization/entity/period/book context levels;
- unblock organization-level setup before entity creation;
- remove Finance business branches from generic platform code.

### Wave 2 — Transactional subledgers

Implement atomic, idempotent aggregates for:

- Customer Invoice/Credit Note;
- Customer Payment/Allocation/Refund;
- Vendor Bill/Credit Memo/Match/Approval;
- Vendor Payment/Batch/Bank/GL;
- Bank Statement/Reconciliation;
- Depreciation;
- Period and Year Close.

### Wave 3 — Canonical Finance forms and documents

- typed line editor;
- scoped lookups;
- server/client schema validation;
- totals and tax calculation;
- separate create/edit/approve/post/reverse commands;
- canonical detail, preview, print, export, attachments, and history.

### Wave 4 — Accounting-grade reports and treasury

- rebuild P&L, Balance Sheet, Trial Balance, Cash Flow, AR, AP, bank, and tax reports from posted accounting data;
- add comparative periods, currencies, basis, drill-down, and reconciliation;
- implement bank feeds, matching, reconciliation, cash position, forecast, and FX.

### Wave 5 — Enterprise Finance

- multi-entity configuration and tests;
- intercompany, consolidation, translation, eliminations, and ownership;
- close management, controls, approvals, audit evidence;
- localization, e-invoicing, filings, assets, leases, and FP&A.

### Wave 6 — Proof

Do not mark Finance complete until all automated and live gates below pass.

## 8. Mandatory exit gates

1. Registry gate: every Finance item is Active, Planned, or Hidden truthfully.
2. Contract gate: every Active item has route, renderer, auth, context, form/action, data, detail/document, permission, and test contracts.
3. Isolation gate: a user cannot read, preview, export, or mutate another organization/entity by changing identifiers.
4. Context gate: every mutation and report verifies organization, entity, period, actor, book, and currency as applicable.
5. Atomicity gate: injected failure at every step leaves no partial financial aggregate.
6. Idempotency gate: double-click, retry, duplicate event, import replay, and provider callback produce one result.
7. Concurrency gate: simultaneous invoice/payment/reconciliation/close activity preserves invariants.
8. Multi-entity gate: separate charts, mappings, currencies, periods, sequences, and reports remain isolated.
9. Currency gate: at least two functional currencies and one foreign-currency transaction post, settle, revalue, and report correctly.
10. Tax gate: two jurisdictions/categories/effective dates produce correct configured treatment without runtime constants.
11. Journal gate: balance, open-period, source lineage, approval, reversal, and immutable-posted-record rules pass.
12. O2C gate: invoice/tax/AR/allocation/statement/GL reconcile exactly.
13. P2P gate: PO/receipt/bill/match/approval/AP/payment/bank/GL reconcile exactly.
14. Treasury gate: opening statement balance + transactions = closing balance and reconciled book balance.
15. Asset gate: acquisition + depreciation + impairment/transfer/disposal reconcile to GL.
16. Close gate: selected-period checklist, reconciliations, approval, lock, reopen, and year-end carry-forward are deterministic.
17. Consolidation gate: entity trial balances, translation, eliminations, and consolidated statements reconcile.
18. Document gate: every supported document opens, previews, prints/exports, and carries correct company/entity/template/data.
19. Report gate: Trial Balance, P&L, Balance Sheet, Cash Flow, AR, AP, bank, tax, and retained earnings reconcile to the same posted dataset.
20. Browser gate: automated traversal of every active Finance work center, form, row action, and top action.
21. Migration/schema gate: local/remote history matches; schema lint has no invalid Finance/platform dependencies.
22. Performance gate: realistic ledger, invoice, bank, report, and close volumes meet defined service levels.
23. Recovery gate: backup/restore and replay preserve financial integrity and idempotency.
24. CI gate: all preceding suites run and pass on every Finance change.

## 9. Current Definition of Done

- [ ] Planned items are disabled/hidden and cannot open a fake work center.
- [ ] Central Finance registry is normalized and contract-validated.
- [ ] Generic platform contains no Finance business policy.
- [ ] Organization-level Finance setup works without an entity.
- [ ] Every Finance endpoint, report, preview, export, and mutation verifies access.
- [ ] All financial aggregates are atomic and idempotent.
- [ ] Multi-entity and multi-currency behavior is configuration-driven and proven.
- [ ] Every form matches its command and uses typed, scoped controls.
- [ ] Every row/top action has a real executable/document target and permission.
- [ ] Every detail/preview uses the canonical Finance document model.
- [ ] O2C and P2P subledgers reconcile exactly to GL.
- [ ] Bank and treasury models are accounting-grade.
- [ ] Tax, assets, close, year-end, intercompany, and consolidation are complete.
- [ ] Statutory and management reports derive from posted GL and reconcile.
- [ ] Browser, API, database, isolation, atomicity, concurrency, migration, and recovery suites pass.
- [ ] PR #2 is no longer draft only after every checkbox is supported by retained evidence.

## 10. Final forensic conclusion

Avantiqo Finance has a promising registry-driven shell and a materially improved journal-posting kernel. It is not yet a complete accounting product. The largest remaining gap is not visual polish; it is the absence of complete transactional subledgers, accounting-grade statements, treasury, close governance, canonical document/action contracts, and proof.

The correct next move is to keep PR #2 as the single Finance workstream, close the P0s in the repair order above, and update this report with exact commits, migrations, tests, live organization/entity/period evidence, and reconciliation outputs after every wave.

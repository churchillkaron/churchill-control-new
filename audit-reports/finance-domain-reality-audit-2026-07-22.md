# Avantiqo Finance Domain — Full Reality Audit

**Audit date:** 2026-07-22  
**Repository:** `churchillkaron/churchill-control-new`  
**Audit branch:** `finance-full-audit-20260721`  
**Pull request:** #2 — Finance full audit and convergence  
**Current release verdict:** **BLOCKED — Finance is not ready to leave**

## 1. Purpose

This is the binding end-to-end reality audit for the complete Finance domain: Finance landing, Accounting, General Ledger, Order to Cash, Procure to Pay, Treasury, Tax and Compliance, Enterprise Finance, Planning, Reporting, Administration, every visible action, every API boundary, every form, every detail/document view, and the final accounting write.

The audit is intentionally stricter than a registry count or a successful production build. A capability is not complete because it appears in `ERP_REGISTRY`, opens a page, renders rows, or passes lint. It is complete only when the entire chain is correct:

`PLATFORM -> USER -> BUSINESS CONTEXT -> UBTE -> ERP_REGISTRY -> FINANCE CAPABILITY -> DOCUMENT/WORKFLOW -> ACCOUNTING EVENT -> JOURNAL -> LEDGER -> REPORT`

## 2. Avantiqo blueprint contract used by this audit

The repository blueprint in `lib/domain-blueprint/README.md` is the governing contract:

1. Finance owns Finance business rules, documents, workflows, repositories and events.
2. Platform/UBTE owns generic execution, identity, authorization, audit, queueing and integration boundaries.
3. Domains do not import other domains directly.
4. Cross-domain execution uses UBTE contracts/events.
5. Organization, legal entity and accounting period are explicit runtime context.
6. No jurisdiction-specific business values are hardcoded in generic platform or Finance runtime. Currency, tax, tax accounts, rates, standards and effective rules must resolve from configuration.
7. A multi-company installation must never trust an organization ID supplied by the browser without proving access.

## 3. Executive reality verdict

The branch has made useful convergence repairs and its current CI run passes lint/build/repository hygiene. That is not sufficient for Finance sign-off.

The current source contains release-blocking defects across all four layers:

- **Product/UI truth:** planned or incomplete capabilities are displayed as working clickable work centers.
- **Platform contract:** generic platform components contain Finance-specific behavior and hardcoded Finance values.
- **Security/context:** several admin-client endpoints accept caller-supplied organization IDs without authorization; direct form submission drops entity/period context.
- **Accounting integrity:** multi-step financial writes are not atomic, several event chains are semantically mismatched, currency defaults are hardcoded, multi-entity posting is disabled by a hardcoded mode, and reports labeled as Finance statements do not always calculate accounting statements.

**No Finance capability is approved as fully production-ready by this source-only audit.** Some are materially implemented and repairable; others are placeholders or planned work presented as active product surface.

## 4. End-to-end trace and current result

### 4.1 Finance button and landing

- `resolveWorkspaceRoute()` correctly resolves the Finance domain button to `/workspace/{organizationId}/finance`.
- The generic module landing loads Finance groups from `ERP_REGISTRY`.
- `WorkspaceModuleGrid` ignores `item.status`. Planned items are rendered exactly like active items and remain clickable.
- A planned item with no renderer can reach `ERPEngine` and return no UI, producing an empty/black capability page.

**Result:** Finance navigation is structurally connected, but the landing page misrepresents readiness.

### 4.2 Capability route resolution

- Child routes resolve through `app/(system)/workspace/[organizationId]/finance/[...financeRoute]/page.jsx`.
- Capabilities are serialized through a Finance-specific policy in the platform serializer.
- `FinancePrimaryActionPolicy` says many capabilities are create-enabled, but `serializeCapability()` only preserves an already valid create contract. A policy entry therefore does not mean a usable form exists.

**Result:** registry coverage and policy coverage are not runtime coverage.

### 4.3 Business context

- Organization/entity/period are passed into `ERPEngine`.
- `MasterDataRuntimeWorkCenter` loads data only when both organization and entity exist.
- Organization-scoped setup workspaces such as Legal Entities, Currencies, Payment Terms and Organization Profile can therefore be blocked before an entity is selected — an onboarding/setup deadlock.
- Direct create submission in `MasterDataWorkCenter.saveForm()` sends organization context but does not send `entityId/entity_id` or `periodId/period_id` to direct endpoints.

**Result:** context exists at page level but is not consistently preserved to the final write.

### 4.4 Forms

- The Finance form allow-list contains only a subset of Finance create/action surfaces.
- Missing forms fail silently as `[]`; the primary action is then hidden rather than failing a contract check.
- Required markers are visual only; there is no generic required-field validation.
- Line tables render every field as a plain text input. Account, tax, project, department, cost center, currency and numeric columns are not typed lookups/amount controls.
- Vendor fields are not supported as a custom form type and fall back to plain text.
- Currency controls default to a hardcoded THB/USD/EUR/GBP list and select THB when no value exists.
- New-customer entry defaults country to Thailand.
- Edit and duplicate actions can reuse create forms without a verified update/duplicate persistence contract.

**Result:** forms can render, but many are not business-correct documents.

### 4.5 Lookups and multi-company isolation

- `/api/platform/lookups` has no organization-access check.
- Lookup providers query through `supabaseAdmin` using the organization ID provided by the client.
- `/api/documents/preview` also accepts organization/entity IDs without proving access.
- `/api/customers/upsert` and `/api/finance/tax-codes/upsert` perform admin-client writes without `requireOrganizationAccess`.

**Result:** cross-company read/write exposure is possible and is a P0 release blocker.

### 4.6 Action execution

- Many Finance actions are presentation-only menu entries with no endpoint, engine or real workflow.
- The generic row engine can show an Execute/Check Action button even when no endpoint exists.
- `Open` and `View` generally show the first scalar fields from the list row; they do not resolve a canonical Finance document/detail service.
- Journal detail enrichment is guarded by `moduleKey === "finance"`, while the journal module key is normally `journals`, so full journal lines may not load.
- Platform components import Finance-specific action resolution and include Finance-specific invoice initialization, contrary to the blueprint's generic-platform boundary.

**Result:** visible actions do not consistently correspond to executable capabilities.

### 4.7 Preview and documents

- Every create action receives a Preview handler whether the capability has a document preview contract or not.
- The preview event stores the action under `activeEngine.props.action`, while the engine host checks `activeEngine.action`, so the preview can render nothing.
- `PreviewEngine` defaults every preview to `CustomerInvoice` unless an explicit type is passed.
- Only Customer Invoice, Financial Report and Journal Entry client renderers are registered.
- Row `Open` does not use the document renderer registry; it uses the generic row modal.

**Result:** document preview/detail is not an end-to-end contract.

### 4.8 Final accounting write

- Financial writes use multiple sequential admin-client inserts/updates without a database transaction.
- Journals can be inserted and marked POSTED before all lines and General Ledger rows succeed.
- Customer invoices can be inserted before lines, receivable and accounting posting succeed.
- Customer payments can be inserted and balances updated before journal posting succeeds.
- Vendor payments mark AP paid before bank and GL posting completes.
- There is no universal idempotency key preventing duplicate posting on retry/double-click.

**Result:** partial accounting states are possible. This alone prevents Finance sign-off.

## 5. P0 release blockers

### P0-01 — Planned capabilities are presented as active

**Files:**
- `components/workspace/WorkspaceModuleGrid.jsx`
- `lib/platform/registry/erpRegistry.js`
- `lib/platform/registry/serializeCapability.js`

**Defect:** `status` is ignored by the landing UI; missing renderer/form/action contracts are not rejected centrally.

**Required repair:** introduce a registry readiness contract. Hide or visibly disable planned items. CI must fail if an active capability lacks its required renderer, list contract, form/action contract, detail contract or report contract.

### P0-02 — Platform is Finance-aware

**Files:**
- `lib/platform/registry/serializeCapability.js`
- `lib/platform/forms/FinanceFormContract.js`
- `components/workspace/master-data/MasterDataWorkCenter.jsx`
- `components/workspace/master-data/MasterDataRuntimeWorkCenter.jsx`

**Defect:** the generic platform imports Finance policy, Finance action presentation and Finance-specific defaults/branches.

**Required repair:** platform exposes generic extension points; Finance registers its policy/adapters from the Finance domain. No Finance document or business behavior remains hardcoded in generic workspace components.

### P0-03 — Cross-company authorization gaps

**Confirmed endpoints:**
- `app/api/platform/lookups/route.js`
- `app/api/documents/preview/route.js`
- `app/api/customers/upsert/route.js`
- `app/api/finance/tax-codes/upsert/route.js`

**Defect:** caller-supplied organization IDs reach admin-client queries/writes without access proof.

**Required repair:** every endpoint must resolve authenticated user and call `requireOrganizationAccess`; entity access must also be verified where entity-scoped data is requested. Add negative cross-organization tests.

### P0-04 — Direct form submission drops entity and period

**File:** `components/workspace/master-data/MasterDataWorkCenter.jsx`

**Defect:** direct endpoint payloads omit entity and period. Journal creation requires entity and can fail despite a valid page context. Customer records may be created with null entity.

**Required repair:** one canonical execution envelope for direct and UBTE execution containing authenticated organization, entity, period, actor, locale, currency and idempotency metadata. Do not build financial context independently in each form.

### P0-05 — Hardcoded jurisdiction and currency values

**Confirmed examples:**
- `components/workspace/engines/DynamicForm.jsx` — THB default and fixed currency list.
- `components/workspace/engines/DynamicCustomerField.jsx` — Thailand default.
- `components/workspace/master-data/MasterDataWorkCenter.jsx` — THB in UBTE request.
- `lib/finance/createCustomer.js` — THB fallback.
- `lib/finance/general-ledger/capabilities/postJournalEntrySafe.js` — THB fallback.
- `lib/finance/general-ledger/postJournalToLedger.js` — THB fallback.
- `app/api/finance/vendor-invoices/create/route.js` and `lib/finance/accounts-payable/documents/createVendorInvoice.js` — THB fallback.

**Required repair:** resolve currency/country/tax from legal entity, transaction date, party/product tax category and effective-dated configuration. Country adapters may contain country-specific statutory logic, but generic runtime may not.

### P0-06 — Financial writes are not atomic or idempotent

**Confirmed flows:** journal posting, customer invoice, customer payment, vendor bill, vendor payment, period close.

**Required repair:** move each financial aggregate write to a transactional database RPC or equivalent transaction boundary. Add unique idempotency/source constraints. Status must change to POSTED/PAID/CLOSED only inside the same successful transaction as ledger/audit effects.

### P0-07 — Vendor bill chain is directly broken

**Files:**
- `app/api/finance/vendor-invoices/create/route.js`
- `lib/finance/accounts-payable/documents/createVendorInvoice.js`
- `lib/finance/runtime/financeGateway.js`

**Defects:**
- Form lines are used only to calculate subtotal and are not stored.
- Currency defaults to THB.
- The document is stored as `RECEIVED` but emits `AP_INVOICE_APPROVED`.
- `financeGateway` does not accept `AP_INVOICE_APPROVED`.
- The API can return failure after the invoice row has already been inserted.

**Required repair:** define one Vendor Bill aggregate and lifecycle: Draft -> Received -> Matched -> Approved -> Posted -> Paid. Store lines, taxes, allocations and source links. Emit only canonical events accepted by posting rules.

### P0-08 — Multi-entity posting is disabled

**Files:**
- `lib/finance/general-ledger/rules/getAccountingMode.js`
- `lib/finance/general-ledger/repositories/getPostingRule.js`

**Defect:** accounting mode is hardcoded to `SINGLE_ENTITY`, causing entity-specific posting mappings to be ignored.

**Required repair:** resolve accounting mode and posting rules from organization/legal-entity configuration with effective dates. Add two-entity tests proving different mappings remain isolated.

### P0-09 — Event journals lose currency context

**Files:**
- `lib/finance/general-ledger/workflows/processAccountingEvent.js`
- `lib/finance/general-ledger/capabilities/postJournalEntrySafe.js`
- `lib/finance/general-ledger/postJournalToLedger.js`

**Defect:** event processing does not pass transaction currency/exchange rate into journal posting; downstream defaults to THB.

**Required repair:** canonical accounting event schema must require transaction currency, functional currency, exchange rate source/date and base amounts where applicable.

### P0-10 — Customer payment can over-apply and race

**File:** `lib/finance/accounts-receivable/capabilities/postCustomerPayment.js`

**Defects:** payment above outstanding balance is silently capped to zero balance while the full payment is posted; concurrent payments can read the same balance; payment/invoice/AR/journal updates are non-atomic.

**Required repair:** payment allocation aggregate with row locking/transaction, explicit unapplied cash or rejection policy, partial/multi-invoice allocation and idempotency.

### P0-11 — Period close is not period-correct

**Files:**
- `lib/finance/period-close/workflows/runMonthlyClose.js`
- `lib/finance/period-close/capabilities/PeriodLock.js`

**Defects:** checks every non-posted journal for the entity rather than the selected period; uses multiple state changes without a transaction; audit insert errors are ignored; actor is not bound to authenticated user.

**Required repair:** close checklist scoped to organization/entity/period, transactional close/lock/audit, authenticated actor, reopen governance and failure-safe rollback.

### P0-12 — Cash Flow and Liquidity labels overstate the implementation

**Files:**
- `lib/finance/reporting/workflows/runCashFlowEngine.js`
- `lib/intelligence/finance/runLiquidityAnalysis.js`

**Defects:** cash flow sums profitability snapshots as cash inflow and purchase orders as outflow; liquidity treats every ASSET account as cash and all purchase orders as short-term liabilities; period/entity/status are incomplete or ignored.

**Required repair:** either rename these as experimental operational indicators or implement accounting-grade cash-flow and liquidity models from bank/cash accounts, posted ledger, open AP/AR, due dates, commitments and selected period/entity.

## 6. P1 functional and UX defects

1. No typed dynamic line editor for accounts, taxes, quantities, prices, dimensions, projects or currency amounts.
2. Required fields are not validated before submission.
3. Form/API contracts are not compiled or tested; missing forms disappear silently.
4. Vendor selection is a text field, not a tenant-scoped party lookup.
5. Customer Invoice tax is forced to zero; payment terms do not calculate due date.
6. Vendor Payment form does not represent the service behavior and omits bank account, date, amount/allocation, currency and reference controls.
7. Fixed Asset, Budget and Intercompany forms are too shallow for their claimed workflows.
8. `Open`/`View` displays generic row fields rather than canonical documents and related lines/history.
9. Attachments action is visible but explicitly has no provider.
10. Filter, Sort, Segments and Columns controls render without implemented behavior.
11. Import/Export/AI availability is inferred from registry boilerplate rather than verified capability contracts.
12. Error status handling is inconsistent; business validation often returns HTTP 500 or even HTTP 200 with `success:false`.
13. Extensive production console logging exposes payload/context and obscures real diagnostics.
14. Existing Finance audit text files are stale grep outputs and still include legacy `tenantId` references; they are not release evidence.

## 7. Capability reality matrix

Legend:
- **BLOCKED:** known broken, unsafe, misleading or non-atomic path.
- **PARTIAL:** meaningful source exists but at least one release gate is missing.
- **PLANNED:** registry surface without a complete end-to-end contract.
- **READY:** all gates proven by automated and live evidence. **None yet.**

### Accounting

| Capability | Reality |
|---|---|
| Chart of Accounts | PARTIAL — real form/list/upsert, but generic direct execution, hardcoded classifications/tax labels and incomplete validation/detail contract |
| General Ledger | PARTIAL — read model exists; posting atomicity/currency and document lineage are blocked |
| Journals | BLOCKED — direct create loses entity context; posting is non-atomic; event currency defaults remain |
| Trial Balance | PARTIAL — requires live entity/period reconciliation to GL and retained earnings tests |
| Fiscal Periods | PARTIAL — create surface exists; lifecycle/close correctness blocked |
| Dimensions | PARTIAL — limited schema; line editor does not support dimensions correctly |
| Opening Balances | PLANNED/PARTIAL — not proven through canonical form, posting, duplicate guard and period controls in this branch |
| Recurring Journals | PLANNED/PARTIAL — not proven from schedule through generated journal, approval, posting and idempotency |

### Order to Cash

| Capability | Reality |
|---|---|
| Customers | BLOCKED — unauthorised upsert endpoint, entity dropped, THB fallback |
| Customer Invoices | BLOCKED — tax zero, non-atomic aggregate/posting, incomplete line model/document flow |
| Accounts Receivable | PARTIAL — read model exists; depends on unsafe invoice/payment chains |
| Customer Payments | BLOCKED — over-application, race and non-atomic posting |
| Collections | PLANNED |
| Customer Statements | PLANNED/PARTIAL — report action exists, canonical statement contract not proven |
| Revenue Recognition | PLANNED |

### Procure to Pay

| Capability | Reality |
|---|---|
| Vendors | PARTIAL — master form exists; full access/update/detail contract must be verified |
| Purchase Orders | PLANNED in Finance and should remain Supply Chain-owned with a Finance read/integration contract |
| Goods Receipts | PLANNED in Finance and should remain Supply Chain-owned with a Finance event contract |
| Vendor Bills | BLOCKED — lines discarded, event mismatch, THB fallback, non-atomic posting |
| Invoice Matching | PLANNED/PARTIAL — no proven three-way-match lifecycle |
| Accounts Payable | PARTIAL — read model depends on incomplete Vendor Bill chain |
| Vendor Payments | BLOCKED — full-only payment, non-atomic paid/bank/GL chain, incomplete form |
| Vendor Statements | PLANNED |

### Treasury

| Capability | Reality |
|---|---|
| Bank Accounts | PARTIAL — master form exists; authorization, reconciliation and statement ownership need proof |
| Cash Management | BLOCKED as labeled — current liquidity calculation is not treasury-grade |
| Bank Statements | PLANNED/PARTIAL |
| Bank Reconciliation | PARTIAL — action/runtime exists; method, matching, locking and statement tests required |
| Cash Flow | BLOCKED as labeled — current algorithm is not a cash-flow statement |
| Payments | PARTIAL — payment register exists; source and bank reconciliation lineage not proven |
| FX Revaluation | PLANNED |

### Tax, Assets and Close

| Capability | Reality |
|---|---|
| Tax | PARTIAL — configuration/runtime exists; jurisdiction/effective-date contract incomplete |
| VAT Returns | PLANNED |
| Tax Codes | BLOCKED — unauthorised admin write and insufficient jurisdiction/effective-date controls |
| Fixed Assets | PARTIAL — shallow form and lifecycle; acquisition, capitalization, depreciation and disposal chain not proven |
| Depreciation | PARTIAL — action exists; transactional posting/idempotency and asset-book rules require proof |
| Audit Trail | PARTIAL — generic history is not a financial audit trail |
| Period Close | BLOCKED |
| Year End | PARTIAL/BLOCKED until retained earnings, carry-forward, lock and reversal tests pass |
| Statutory Filings | PLANNED |

### Enterprise, Planning, Reporting and Administration

All capabilities in these groups remain **PARTIAL or PLANNED** until their organization/entity scoping, configuration ownership, forms, reports and execution contracts are proven. This includes Legal Entities, Cost Centers, Currencies, Intercompany, Consolidation, Budgeting, Forecasting, Profit and Loss, Balance Sheet, Cash Flow Statement, Financial Statements, Executive Dashboard, KPIs, Financial Health, Organization Profile, Accounting Settings, Number Sequences, Posting Rules, Approval Workflows, Government Connections, Banking Integrations, Exchange Rates, E-Invoicing, Document Templates, Report Builder, Scheduled Reports and Finance Permissions.

Organization-scoped setup must be usable before an entity is selected. Reports must reconcile to posted GL for the selected organization, entity, period, currency and accounting basis.

## 8. Required remediation waves

### Wave 0 — Freeze and automated inventory

- Keep PR #2 in draft.
- Generate a machine-readable matrix for every Finance registry item.
- Fail CI when an active item has a missing route, renderer, list API, auth boundary, form/action schema, endpoint/UBTE capability, detail renderer or report contract.
- Hide/disable planned items immediately so the UI tells the truth.

### Wave 1 — Architecture and security

- Remove Finance imports/branches from generic platform components.
- Register Finance adapters through domain extension points.
- Enforce organization/entity access on every lookup, list, detail, preview and mutation endpoint.
- Replace all client-trusted scope with server-resolved scope.
- Remove jurisdiction/currency defaults from generic runtime.

### Wave 2 — Transactional accounting kernel

- Introduce transactional RPCs/services for journal, invoice, payment, AP bill/payment, depreciation, reconciliation and close.
- Add idempotency/source uniqueness constraints.
- Resolve accounting mode, currency, exchange rates and posting rules from configuration.
- Guarantee journal balance and status/ledger atomicity.

### Wave 3 — Canonical Finance form system

- Define a Finance form/action manifest owned by Finance.
- Compile every form against its command/API schema in CI.
- Implement typed line controls, tenant-scoped lookups, totals, tax calculation, dimensions, attachments and validation.
- Separate Create, Edit, Duplicate, Approve, Post, Reverse and Close commands.

### Wave 4 — Complete business flows

- Accounting: COA -> journal -> posting -> ledger -> trial balance -> statements -> close.
- O2C: customer -> invoice -> tax/posting -> AR -> payment allocation -> statement/collections -> revenue recognition.
- P2P: supplier/PO/receipt contracts -> bill -> match -> approval -> AP -> payment -> bank/GL -> supplier statement.
- Treasury: bank import -> statement -> match -> reconciliation -> cash position -> forecast -> FX revaluation.
- Compliance: effective tax rules -> returns -> filing/payment -> audit evidence.

### Wave 5 — Documents, details and reports

- Every document workspace opens a canonical document/detail model, not a generic row dump.
- Preview only appears when a real document contract and renderer exist.
- Reports reconcile to GL and expose organization/entity/period/currency/basis in the header.
- Implement export/print/email only where the underlying document is valid.

### Wave 6 — Proof and Finance exit

Run automated API, database and browser tests for every capability. Record evidence in this audit. Only then mark PR #2 ready for review.

## 9. Mandatory test gates

1. **Registry gate:** enumerate all Finance items; no active item has an incomplete contract.
2. **Route gate:** Finance button, every group and every active child route render without blank/error pages.
3. **Isolation gate:** User A cannot read/write/preview Organization B data by changing organization/entity IDs.
4. **Context gate:** every mutation receives and verifies organization/entity/period/actor.
5. **Currency gate:** two legal entities with different currencies post and report correctly; no runtime default chooses THB.
6. **Tax gate:** effective-dated tax rules vary by jurisdiction/category/date without application constants.
7. **Atomicity gate:** injected failure at every write step leaves no partial invoice/payment/journal/ledger/close state.
8. **Idempotency gate:** retry/double-click creates one financial result.
9. **Multi-entity gate:** separate posting mappings, sequences, periods, currencies and reports remain isolated.
10. **Journal gate:** debit equals credit; closed periods reject posting; reversal preserves lineage.
11. **O2C gate:** invoice totals/tax/AR/payment allocation/statement reconcile exactly.
12. **P2P gate:** bill lines/match/approval/AP/payment/bank/GL reconcile exactly.
13. **Treasury gate:** statement import and reconciliation prove opening + movements = closing.
14. **Close gate:** selected-period checklist, close, lock, reopen governance and year-end carry forward are deterministic.
15. **Document gate:** every supported document opens, previews, prints/exports with correct company/entity/template/data.
16. **Report gate:** trial balance, P&L and balance sheet reconcile to the same posted GL dataset.
17. **Browser gate:** Playwright traverses all active Finance capabilities, forms, row actions and top actions.
18. **CI gate:** lint/build plus contract, integration, migration, RLS/isolation and browser suites.

## 10. Definition of Finance done

Finance can be left only when all statements below are true:

- [ ] Every Finance item is truthfully marked Active, Planned or Hidden.
- [ ] Every Active item has a complete route-to-database-to-document contract.
- [ ] No generic platform file contains Finance-specific business policy or jurisdiction values.
- [ ] No admin-client endpoint trusts browser-supplied company scope.
- [ ] All financial writes are atomic and idempotent.
- [ ] Multi-company and multi-entity isolation is proven.
- [ ] Currency, tax, rates, standards and posting mappings are configuration-driven and effective-dated.
- [ ] Every create/edit/action form matches its command and shows correct data/lookups.
- [ ] Every row action and top action has a real target and correct lifecycle permissions.
- [ ] Every document/detail/preview uses the canonical Finance document model.
- [ ] Trial Balance, P&L, Balance Sheet, AR, AP, bank and close reconcile to posted GL.
- [ ] All mandatory tests pass in CI and in the connected test environment.
- [ ] PR #2 contains the repairs and evidence and is no longer draft.

## 11. Current GitHub/CI evidence

The current PR head passed `Churchill CI` run 308. The job executes dependency installation, lint, application build, migration-folder verification, environment-file ignore verification and backup ignore verification.

That CI does **not** currently prove Finance workflow correctness, accounting atomicity, company isolation, form/API alignment or end-to-end browser behavior. The additional gates in this audit are mandatory before completion.

## 12. Working rule for PR #2

All Finance repairs and validation evidence stay in PR #2 on `finance-full-audit-20260721`. Do not create parallel Finance branches or rely on pasted terminal files. Each remediation wave must update this audit with:

- files changed,
- migrations/RPCs changed,
- tests added,
- exact CI run,
- live test organization/entity/period,
- pass/fail evidence,
- remaining blockers.

PR #2 remains draft until every P0 is closed and every Definition of Done checkbox is proven.
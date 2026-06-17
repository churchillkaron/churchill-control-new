# Avantiqo ERP Capability Registry

## Purpose

This document is the source of truth for Avantiqo ERP domains, capabilities, routes, dependencies, industry usage, and build status.

The ERP structure is:

Organization
→ Domains
→ Capabilities
→ Screens
→ APIs
→ Services

---

## Top-Level Domains

1. Sales
2. Operations
3. Finance
4. Accounting
5. People
6. Customer
7. Marketing
8. AI
9. Administration

---

## Sales

| Capability | Existing UI | Existing APIs | Existing Services | Dependencies | Industries | Status |
|---|---|---|---|---|---|---|
| Orders | app/(system)/pos/page.js, app/(system)/pos/orders/page.jsx, app/(system)/pos/new/page.jsx | app/api/pos/create, app/api/pos/orders, app/api/orders/update | lib/pos/sendOrder.js, lib/pos/loadActiveOrders.js, lib/orders/stateMachine.js | Customers, Payments | Restaurant, Retail, Hotel | Built |
| Tables | app/(system)/tables/page.jsx, app/(system)/settings/tables/page.jsx | app/api/pos/tables, app/api/pos/table-management | lib/pos/tables, lib/restaurant/services, lib/floor/getFloorTables.js | Orders | Restaurant | Built |
| Payments | app/(system)/pos/payments/page.jsx, app/(system)/finance/payments/page.jsx | app/api/pos/payments, app/api/pos/payment-state, app/api/finance/payments | lib/pos/payments, lib/payments, lib/finance/payments | Orders, Accounting | All | Built |
| Receipts | app/(system)/pos/receipts/page.jsx | app/api/pos/receipts, app/api/pos/receipts/generate | lib/pos/receipts, lib/finance/generateReceiptNumber.js | Payments | All | Built |
| Discounts | app/(system)/pos/modifiers/page.jsx | app/api/pos/discounts, app/api/pos/discount | lib/pos/discounts, lib/pos/applyDiscount.js | Orders | Retail, Restaurant | Built |
| Refunds and Voids | None dedicated | app/api/pos/refunds, app/api/pos/voids, app/api/pos/void | lib/pos/refunds, lib/pos/voids, lib/pos/refundPayment.js, lib/pos/voidOrder.js | Payments, Approvals | All | Backend Built |
| Reservations and Bookings | app/(system)/workspace/[organizationId]/hotel/reservations/page.jsx | app/api/hotel/bookings | lib/hotel/createBooking.js | Customers, Billing | Hotel, Restaurant | Partial |
| Billing | app/(system)/workspace/[organizationId]/healthcare/billing/page.jsx | app/api/healthcare/billing | lib/finance/core/createCustomerInvoice.js | Customer, Payments | Healthcare, Hotel | Partial |

---

## Operations

| Capability | Existing UI | Existing APIs | Existing Services | Dependencies | Industries | Status |
|---|---|---|---|---|---|---|
| Kitchen | app/(system)/kitchen/page.jsx, app/(system)/kitchen/dashboard/page.jsx | app/api/kitchen, app/api/pos/kitchen | lib/kitchen, lib/pos/kitchen | Orders | Restaurant | Built |
| Expo | app/(system)/kitchen/expo/page.jsx | app/api/kitchen/serve-item, app/api/kitchen/mark-ready | lib/kitchen/serveKitchenItem.js, lib/kitchen/markKitchenItemReady.js | Kitchen | Restaurant | Built |
| Stations | app/(system)/kitchen/stations/page.jsx | app/api/kitchen/reassign-station, app/api/production/stations | lib/kitchen/stations, lib/kitchen/routing | Kitchen | Restaurant | Built |
| Production | None main page identified | app/api/production/process-order, app/api/production/production-sessions | lib/production/processOrderProduction.js, lib/production/processProductionOrder.js | Orders, Inventory | Restaurant, Manufacturing | Backend Built |
| Recipes | app/(system)/settings/dishes/page.jsx | app/api/production/recipes, app/api/recipes | lib/production/createRecipe.js, lib/production/recipes | Inventory, Production | Restaurant | Partial |
| Inventory | app/(system)/inventory/page.jsx | app/api/inventory | lib/inventory | Procurement, Production | All | Built |
| Stock Ledger | app/(system)/inventory/ledger/page.jsx | app/api/inventory/stock-ledger | lib/inventory/ledger, lib/inventory/core/updateStockLedger.js | Inventory | All | Built |
| Low Stock | app/(system)/inventory/low-stock/page.jsx | app/api/inventory/stock-alerts | lib/inventory/loadLowStockItems.js, lib/inventory/alerts | Inventory, Procurement | All | Built |
| Expiry | app/(system)/inventory/expiry/page.jsx | app/api/inventory/expiry | lib/inventory/expiry, lib/production/expiry | Inventory | Restaurant, Healthcare, Retail | Built |
| Monitoring | app/(system)/inventory/monitoring/page.jsx | app/api/inventory/monitoring | lib/inventory/monitoring | Inventory | All | Built |
| Procurement | app/(system)/procurement/page.jsx | app/api/procurement | lib/procurement | Inventory, Finance | All | Built |
| Purchase Requests | app/(system)/procurement/purchase-requests/page.jsx | app/api/procurement/purchase-requests | lib/procurement/core/createPurchaseRequest.js | Procurement | All | Built |
| Purchase Orders | app/(system)/procurement/purchase-orders/page.jsx | app/api/procurement/purchase-orders | lib/procurement/core/createPurchaseOrder.js | Procurement, Vendors | All | Built |
| Goods Receiving | app/(system)/procurement/goods-receipts/page.jsx | app/api/procurement/goods-receipts | lib/procurement/receiving | Procurement, Inventory | All | Built |
| Replenishment | app/(system)/procurement/replenishment/page.jsx | app/api/procurement/replenishment | lib/procurement/replenishment | Inventory | All | Built |

---

## Finance

| Capability | Existing UI | Existing APIs | Existing Services | Dependencies | Industries | Status |
|---|---|---|---|---|---|---|
| Finance Overview | app/(system)/finance/page.jsx, app/(system)/finance/overview/page.jsx | app/api/finance/overview, app/api/finance/summary | lib/finance/loadFinanceOverview.js, lib/finance/services/getFinanceSummary.js | Accounting | All | Built |
| Executive Finance | app/(system)/finance/executive/page.jsx | app/api/finance/executive-dashboard | lib/finance/dashboard, lib/finance/executive | Accounting | All | Built |
| Cash Flow | app/(system)/finance/cashflow/page.jsx | app/api/finance/cashflow, app/api/finance/cash-flow | lib/finance/cashflow | Accounting, Payments | All | Built |
| Forecasting | app/(system)/finance/forecast/page.jsx | app/api/finance/forecast | lib/finance/forecasting | Sales, Accounting | All | Built |
| Budgeting | app/(system)/finance/budgeting/page.jsx, app/(system)/finance/budgets/page.jsx | app/api/finance/budgeting | lib/finance/budgeting | Accounting | All | Built |
| Food Cost | app/(system)/finance/food-cost/page.jsx | app/api/finance/profit | lib/finance/core/runItemProfitability.js, lib/production/costing | Inventory, Production | Restaurant | Partial |
| Treasury | app/(system)/finance/payments/page.jsx | app/api/finance/treasury | lib/finance/enterprise/getTreasuryPositions.js | Payments | All | Backend Built |
| Consolidation | app/(system)/finance/consolidation/page.jsx, app/(system)/finance/consolidated-reporting/page.jsx | app/api/finance/consolidation | lib/finance/consolidation | Legal Entities, Accounting | Group Companies | Built |

---

## Accounting

| Capability | Existing UI | Existing APIs | Existing Services | Dependencies | Industries | Status |
|---|---|---|---|---|---|---|
| General Ledger | app/(system)/finance/general-ledger/page.jsx | app/api/finance/general-ledger | lib/finance/general-ledger | Journals | All | Built |
| Journals | app/(system)/finance/journals/page.jsx | app/api/finance/journals, app/api/finance/journal | lib/finance/postJournalEntry.js, lib/finance/accounting/createJournalEntry.js | Chart of Accounts | All | Built |
| Chart of Accounts | app/(system)/finance/chart-of-accounts/page.jsx | app/api/finance/general-ledger | lib/finance/master-data | Accounting Setup | All | Built |
| Trial Balance | app/(system)/finance/trial-balance/page.jsx | app/api/finance/trial-balance | lib/finance/getTrialBalance.js | General Ledger | All | Built |
| Balance Sheet | app/(system)/finance/balance-sheet/page.jsx | app/api/finance/balance-sheet | lib/finance/getBalanceSheet.js | General Ledger | All | Built |
| Profit and Loss | app/(system)/finance/profit-loss/page.jsx | app/api/finance/profit-loss | lib/finance/getProfitLoss.js | General Ledger | All | Built |
| Reconciliation | app/(system)/finance/reconciliation/page.jsx | app/api/finance/reconciliation | lib/finance/reconciliation | Payments, Bank | All | Built |
| Tax | app/(system)/finance/tax/page.jsx | app/api/finance/tax-engine | lib/finance/tax, lib/finance/core/calculateTax.js | Accounting | All | Built |
| Period Close | app/(system)/finance/period-close/page.jsx, app/(system)/finance/periods/page.jsx | app/api/finance/period-close, app/api/finance/periods | lib/finance/period-close, lib/finance/monthEnd | Accounting | All | Built |
| Fixed Assets | app/(system)/finance/fixed-assets/page.jsx | app/api/finance/fixed-assets | lib/finance/fixed-assets, lib/finance/fixedAssets | Accounting | All | Built |
| Depreciation | app/(system)/finance/depreciation/page.jsx | app/api/finance/depreciation | lib/finance/fixedAssets/calculateDepreciation.js | Fixed Assets | All | Built |
| Audit | app/(system)/finance/audit/page.jsx | app/api/finance/audit-trail | lib/finance/audit, lib/finance/core/writeImmutableAudit.js | Accounting | All | Built |

---

## People

| Capability | Existing UI | Existing APIs | Existing Services | Dependencies | Industries | Status |
|---|---|---|---|---|---|---|
| Staff | app/(system)/management/staff/page.jsx, app/(system)/settings/staff-setup/page.js | app/api/staff | lib/staff | Users | All | Partial |
| Schedule | app/(system)/schedule/page.jsx, app/(system)/management/schedule/page.jsx | app/api/schedule | lib/schedule | Staff | All | Partial |
| Attendance | None dedicated | app/api/payroll/attendance/check-in | lib/payroll/core/checkInStaff.js | Staff | All | Backend Built |
| Payroll | app/(system)/payroll/page.jsx | app/api/payroll/generate, app/api/payroll/calculate | lib/payroll/calculatePayroll.js, lib/payroll/generatePayrollRecords.js | Staff, Attendance | All | Built |
| Payroll Governance | app/(system)/payroll/governance/page.jsx | app/api/payroll | lib/payroll/consolidation | Payroll | All | Partial |
| Payroll Live | app/(system)/payroll/live/page.jsx | app/api/payroll | lib/payroll/runtime | Payroll | All | Partial |
| Payslips | None dedicated | app/api/payroll/payslip | lib/payroll/payslips | Payroll | All | Backend Built |
| Payroll Payments | None dedicated | app/api/payroll/export | lib/payroll/payments | Payroll, Finance | All | Backend Built |
| Compliance | None dedicated | None dedicated | lib/payroll/compliance | Payroll | Thailand, UAE | Backend Built |

---

## Customer

| Capability | Existing UI | Existing APIs | Existing Services | Dependencies | Industries | Status |
|---|---|---|---|---|---|---|
| Customers | app/(system)/customers/page.jsx | app/api/customers/search, app/api/customers/upsert, app/api/customers/history | lib/customer | Sales | All | Partial |
| CRM | None dedicated | app/api/customers | lib/customer/runtime/createVIPCustomerEvent.js | Customers | All | Backend Partial |
| Customer Portal | None identified | None identified | None identified | Customers | All | Missing |
| Reviews | None main page identified | app/api/reviews | None identified | Customer, Marketing | Hospitality, Retail | Backend Partial |
| Messaging | app/(system)/management/messages/page.jsx | app/api/messages | lib/messages | Customer, Staff | All | Partial |
| Loyalty | None identified | None identified | lib/customer/processCustomerVisit.js | Customers, Sales | Retail, Restaurant, Hotel | Backend Partial |

---

## Marketing

| Capability | Existing UI | Existing APIs | Existing Services | Dependencies | Industries | Status |
|---|---|---|---|---|---|---|
| Marketing Dashboard | app/(system)/marketing/page.jsx, app/(system)/marketing/dashboard/page.js | app/api/marketing | lib/marketing/services/getMarketingOperations.js | Assets, Campaigns | All | Built |
| Design Studio | app/(system)/marketing/design/page.js | app/api/marketing/generate | lib/marketing/ai, lib/marketing/services/runCampaignGeneration.js | Assets, AI | All | Built |
| Assets | app/(system)/marketing/assets/page.js | app/api/marketing/assets, app/api/marketing/upload-asset | lib/marketing/assets, lib/marketing/repositories | Marketing | All | Built |
| Campaigns | None dedicated page identified | app/api/marketing/campaigns, app/api/marketing/campaign | lib/marketing/repositories/saveCampaign.js | Assets, Design Studio | All | Backend Built |
| Queue | app/(system)/marketing/queue/page.js | app/api/marketing/queue, app/api/marketing/process-queue | lib/marketing/repositories/queueCampaign.js | Campaigns, Publishing | All | Built |
| Publishing | app/(system)/marketing/social/page.jsx | app/api/marketing/publish, app/api/marketing/publish-instagram, app/api/meta | lib/marketing/distribution/meta | Campaigns, Integrations | All | Built |
| Analytics | None dedicated page identified | app/api/marketing/sync-analytics | lib/marketing/services/processCampaignAnalytics.js | Campaigns | All | Backend Built |
| Recommendations | None dedicated page identified | app/api/marketing/recommendations | lib/marketing/ai/recommendations | Campaigns, AI | All | Backend Built |

---

## AI

| Capability | Existing UI | Existing APIs | Existing Services | Dependencies | Industries | Status |
|---|---|---|---|---|---|---|
| Owner AI | None dedicated page identified | app/api/owner | lib/owner | All Domains | All | Partial |
| Marketing AI | app/(system)/marketing/design/page.js | app/api/marketing/generate | lib/marketing/ai | Marketing | All | Built |
| Forecasting | None dedicated top page | app/api/forecasting, app/api/finance/forecast | lib/intelligence/forecasting, lib/finance/forecasting | Finance, Sales | All | Backend Built |
| Recommendations | None dedicated top page | app/api/marketing/recommendations | lib/intelligence/recommendations | All Domains | All | Backend Built |
| Runtime AI | None dedicated page | app/api/runtime, app/api/workers | lib/runtime, lib/aiOperations | Platform | All | Backend Built |

---

## Administration

| Capability | Existing UI | Existing APIs | Existing Services | Dependencies | Industries | Status |
|---|---|---|---|---|---|---|
| Settings | app/(system)/settings/page.jsx | app/api/settings | lib/settings | Organization | All | Built |
| Users | app/(system)/settings/users/page.jsx | app/api/users | lib/users | Organization | All | Built |
| POS Settings | app/(system)/settings/pos/page.jsx | app/api/settings/pos | lib/settings/defaultPOSSettings.js | Sales | Restaurant, Retail | Built |
| Table Settings | app/(system)/settings/tables/page.jsx | app/api/settings/tables | lib/settings/defaultTableSettings.js | Tables | Restaurant | Built |
| Kitchen Settings | app/(system)/settings/kitchen/page.jsx | app/api/settings/kitchen | lib/settings/defaultKitchenSettings.js | Kitchen | Restaurant | Built |
| Payroll Settings | app/(system)/settings/payroll/page.jsx | app/api/settings/payroll | lib/settings | Payroll | All | Built |
| Business Setup | app/(system)/settings/business/page.jsx | app/api/settings | lib/business | Organization | All | Built |
| System Setup | app/(system)/settings/system/page.jsx | app/api/settings | lib/system | Platform | All | Built |
| Service Charge Setup | app/(system)/settings/service-charge/page.jsx | app/api/settings | lib/servicecharge | Sales, Payroll | Restaurant, Hotel | Built |

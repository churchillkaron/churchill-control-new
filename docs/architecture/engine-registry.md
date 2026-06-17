# Avantiqo Engine Registry

## Purpose

Engines are the operating components of Avantiqo OS.

Channels create events.

Events trigger engines.

Engines update business objects.

Pages and modules do not directly control the business.

Engines do.

---

# Core Engines

## Order Engine

Purpose:
Handles orders from all channels.

Consumes:
- ORDER_CREATED
- ORDER_CONFIRMED
- ORDER_UPDATED
- ORDER_CANCELLED

Updates:
- Order
- Order Item
- Order Status
- Customer History

Used By:
- POS
- Webshop
- Mobile App
- Marketplace
- Kiosk

---

## Payment Engine

Purpose:
Handles payments, split payments, tips, refunds, voids and payment status.

Consumes:
- PAYMENT_RECEIVED
- PAYMENT_REFUNDED
- PAYMENT_VOIDED

Updates:
- Payment
- Receipt
- Cash Position
- Order Payment Status

Used By:
- POS
- Webshop
- Finance
- Customer Portal

---

## Customer Engine

Purpose:
Handles customers, CRM, loyalty, visits, reviews and customer history.

Consumes:
- CUSTOMER_CREATED
- CUSTOMER_VISIT
- ORDER_CREATED
- PAYMENT_RECEIVED
- REVIEW_RECEIVED

Updates:
- Customer
- Customer History
- Loyalty
- CRM Signals

Used By:
- Sales
- Customer
- Marketing
- AI

---

## Inventory Engine

Purpose:
Handles stock, stock ledger, valuation, expiry, waste and movements.

Consumes:
- ORDER_COMPLETED
- INVENTORY_MOVEMENT_CREATED
- GOODS_RECEIVED
- WASTE_LOGGED
- STOCK_COUNT_FINALIZED

Updates:
- Inventory Item
- Stock Movement
- Stock Ledger
- Valuation
- Low Stock Alerts

Used By:
- Operations
- Procurement
- Production
- Finance

---

## Production Engine

Purpose:
Handles recipes, prep, production sessions, dish costing, theoretical usage and order consumption.

Consumes:
- ORDER_COMPLETED
- PRODUCTION_STARTED
- PRODUCTION_COMPLETED
- WASTE_LOGGED

Updates:
- Recipe Usage
- Production Order
- Prep Batch
- Costing
- Variance

Used By:
- Kitchen
- Inventory
- Finance
- Analytics

---

## Kitchen Engine

Purpose:
Handles kitchen tickets, stations, item status, expo, timing and kitchen performance.

Consumes:
- ORDER_CONFIRMED
- KITCHEN_ITEM_STARTED
- KITCHEN_ITEM_COMPLETED
- KITCHEN_ITEM_SERVED

Updates:
- Kitchen Ticket
- Kitchen Item
- Station Queue
- Expo Queue
- Kitchen Metrics

Used By:
- Kitchen
- Expo
- POS
- Operations

---

## Procurement Engine

Purpose:
Handles purchase requests, purchase orders, goods receiving, replenishment and supplier workflows.

Consumes:
- LOW_STOCK_DETECTED
- PURCHASE_REQUEST_CREATED
- PURCHASE_ORDER_CREATED
- GOODS_RECEIVED

Updates:
- Purchase Request
- Purchase Order
- Goods Receipt
- Supplier Performance

Used By:
- Operations
- Inventory
- Finance

---

## Workforce Engine

Purpose:
Handles staff, attendance, shifts, performance, scheduling and service charge.

Consumes:
- SHIFT_STARTED
- SHIFT_ENDED
- ORDER_COMPLETED
- PAYROLL_GENERATED

Updates:
- Staff
- Attendance
- Shift
- Performance
- Service Charge Allocation

Used By:
- Workforce
- Payroll
- Operations

---

## Payroll Engine

Purpose:
Handles salary, service charge payout, payslips, deductions, payroll periods and payroll governance.

Consumes:
- SHIFT_ENDED
- PAYROLL_GENERATED
- PAYROLL_APPROVED
- PAYROLL_PAID

Updates:
- Payroll Record
- Payslip
- Payroll Payment
- Payroll Audit

Used By:
- Workforce
- Finance
- Accounting

---

## Finance Engine

Purpose:
Handles cashflow, forecasting, treasury, budgeting, profitability and executive finance.

Consumes:
- PAYMENT_RECEIVED
- PAYMENT_REFUNDED
- GOODS_RECEIVED
- PAYROLL_GENERATED
- ORDER_COMPLETED

Updates:
- Cash Position
- Forecast
- Budget Variance
- Profitability
- Financial Health

Used By:
- Finance
- Analytics
- AI

---

## Accounting Engine

Purpose:
Handles ledger, journals, tax, reconciliation, fixed assets, period close and reporting.

Consumes:
- PAYMENT_RECEIVED
- JOURNAL_POSTED
- GOODS_RECEIVED
- PAYROLL_GENERATED
- PERIOD_CLOSED

Updates:
- Journal Entry
- Ledger Entry
- Tax Liability
- Trial Balance
- Financial Statements

Used By:
- Accounting
- Finance
- Governance

---

## Marketing Engine

Purpose:
Handles campaigns, publishing, queue, assets, social distribution and campaign performance.

Consumes:
- CAMPAIGN_CREATED
- CAMPAIGN_PUBLISHED
- CUSTOMER_VISIT
- REVIEW_RECEIVED

Updates:
- Campaign
- Publishing Queue
- Marketing Asset Usage
- Campaign Performance

Used By:
- Marketing
- Creative
- Customer
- AI

---

## Creative Engine

Purpose:
Handles design studio, assets, templates, brand assets and creative production.

Consumes:
- CREATIVE_ASSET_CREATED
- CAMPAIGN_CREATED
- ASSET_APPROVED

Updates:
- Marketing Asset
- Brand Asset
- Creative Version
- Asset Performance

Used By:
- Creative
- Marketing
- AI

---

## Analytics Engine

Purpose:
Aggregates business data into metrics, dashboards, forecasts and performance intelligence.

Consumes:
- All Business Events

Updates:
- KPI Snapshots
- Analytics Tables
- Forecast Inputs
- Executive Dashboards

Used By:
- Analytics
- AI
- Owner Dashboard

---

## AI Engine

Purpose:
Generates recommendations, forecasts, copilots, agents, content, risk alerts and optimization actions.

Consumes:
- KPI_SNAPSHOT_CREATED
- RECOMMENDATION_REQUESTED
- BUSINESS_EVENT_STREAM
- CAMPAIGN_PERFORMANCE_UPDATED

Updates:
- Recommendations
- AI Insights
- Actions
- Agent Memory

Used By:
- Owner AI
- Marketing AI
- Analytics
- Operations

---

## Governance Engine

Purpose:
Handles approvals, audit, risk, compliance, authorization and controls.

Consumes:
- APPROVAL_REQUESTED
- PAYMENT_REFUNDED
- VOID_REQUESTED
- PERIOD_CLOSED
- PAYROLL_APPROVED

Updates:
- Approval Task
- Audit Log
- Compliance Score
- Control Status

Used By:
- Governance
- Finance
- Accounting
- Workforce

---

## Notification Engine

Purpose:
Sends notifications to staff, managers, customers and external channels.

Consumes:
- ORDER_READY
- PAYMENT_RECEIVED
- APPROVAL_REQUESTED
- REVIEW_RECEIVED
- LOW_STOCK_DETECTED

Updates:
- Notification
- Message
- Delivery Status

Used By:
- All Domains

---

## Integration Engine

Purpose:
Connects Avantiqo to external systems.

Consumes:
- INTEGRATION_SYNC_REQUESTED
- PAYMENT_RECEIVED
- CAMPAIGN_PUBLISHED
- BOOKING_CREATED

Updates:
- External Sync Log
- Integration Status
- Webhook Delivery

Used By:
- Platform
- Channels
- Finance
- Marketing

---

## Workflow Engine

Purpose:
Runs multi-step workflows across engines.

Consumes:
- WORKFLOW_STARTED
- WORKFLOW_STEP_COMPLETED
- BUSINESS_EVENT

Updates:
- Workflow State
- Task Queue
- Dead Letter Queue
- Recovery Log

Used By:
- Platform
- Governance
- Operations
- AI

---

# Core Principle

Engines own business logic.

Pages show data.

APIs expose engine actions.

Events connect engines.

No page should directly implement business rules that belong inside an engine.

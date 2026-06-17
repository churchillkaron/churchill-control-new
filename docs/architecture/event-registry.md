# Avantiqo Event Registry

## Purpose

Avantiqo is event-driven.

Channels do not directly update every module.

Channels create business events.

Business events trigger engines.

Engines update business objects.

---

# Revenue Events

## ORDER_CREATED

Sources:
- POS
- Webshop
- Mobile
- Marketplace
- Kiosk

Triggers:
- Order Engine

Updates:
- Order
- Customer
- Analytics

---

## ORDER_CONFIRMED

Triggers:
- Operations
- Inventory Reservation
- Customer Notification

---

## ORDER_COMPLETED

Triggers:
- Production
- Inventory Deduction
- Revenue Recognition
- Performance Tracking

Updates:
- Inventory
- Finance
- Analytics
- Customer History

---

## PAYMENT_RECEIVED

Triggers:
- Finance
- Accounting

Updates:
- Payment
- Cash Position
- Customer

---

## PAYMENT_REFUNDED

Triggers:
- Finance
- Accounting
- Audit

Updates:
- Payment
- Customer History

---

# Customer Events

## CUSTOMER_CREATED

Updates:
- CRM
- Analytics

---

## CUSTOMER_VISIT

Updates:
- Loyalty
- Analytics
- Recommendations

---

## REVIEW_RECEIVED

Updates:
- Customer
- Marketing
- Analytics

---

# Operations Events

## KITCHEN_ITEM_STARTED

Updates:
- Kitchen Metrics

---

## KITCHEN_ITEM_COMPLETED

Updates:
- Kitchen
- Expo
- Performance

---

## INVENTORY_MOVEMENT_CREATED

Updates:
- Inventory Ledger
- Costing

---

## GOODS_RECEIVED

Updates:
- Inventory
- Procurement
- Finance

---

# Workforce Events

## SHIFT_STARTED

Updates:
- Attendance
- Payroll

---

## SHIFT_ENDED

Updates:
- Payroll
- Performance

---

## PAYROLL_GENERATED

Updates:
- Payroll Records
- Finance

---

# Finance Events

## JOURNAL_POSTED

Updates:
- Ledger
- Reporting

---

## PERIOD_CLOSED

Updates:
- Accounting
- Governance

---

# Marketing Events

## CAMPAIGN_CREATED

Updates:
- Marketing
- Analytics

---

## CAMPAIGN_PUBLISHED

Updates:
- Marketing
- Reporting

---

# AI Events

## RECOMMENDATION_GENERATED

Updates:
- AI
- Analytics

---

# Core Principle

Modules do not talk to modules.

Events talk to engines.

Example:

ORDER_COMPLETED

does not call:

Inventory
Finance
Payroll

directly.

Instead:

ORDER_COMPLETED

triggers:

Production Engine
Inventory Engine
Finance Engine
Performance Engine

which update their own business objects.


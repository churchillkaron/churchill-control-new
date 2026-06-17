# Avantiqo Business Object Registry

## Purpose

Business Objects are the core entities of the ERP.

Capabilities operate on business objects.

The same object may be used by multiple capabilities.

Example:

Orders
Payments
Kitchen
Accounting

all touch:

Order

---

# Sales

## Order

Used By:
- Orders
- Kitchen
- Payments
- Receipts
- Analytics

Lifecycle:
Draft
Open
Sent
In Progress
Ready
Completed
Closed

---

## Order Item

Used By:
- Orders
- Kitchen
- Production

---

## Payment

Used By:
- Payments
- Finance
- Accounting

---

## Receipt

Used By:
- Receipts
- Finance

---

## Table

Used By:
- Tables
- Orders
- Kitchen

---

# Customer

## Customer

Used By:
- CRM
- Orders
- Marketing
- Loyalty

---

## Customer Visit

Used By:
- CRM
- Loyalty
- Analytics

---

# Operations

## Kitchen Ticket

Used By:
- Kitchen
- Expo

---

## Production Order

Used By:
- Production
- Inventory

---

## Recipe

Used By:
- Production
- Inventory
- Costing

---

## Inventory Item

Used By:
- Inventory
- Procurement
- Production

---

## Stock Movement

Used By:
- Inventory
- Finance

---

## Purchase Request

Used By:
- Procurement

---

## Purchase Order

Used By:
- Procurement
- Finance

---

## Goods Receipt

Used By:
- Procurement
- Inventory
- Finance

---

# Finance

## Journal Entry

Used By:
- Accounting

---

## Ledger Entry

Used By:
- Accounting

---

## Vendor

Used By:
- Procurement
- Accounting

---

## Invoice

Used By:
- Accounting
- Finance

---

## Asset

Used By:
- Fixed Assets
- Accounting

---

# People

## Employee

Used By:
- Staff
- Payroll
- Schedule

---

## Shift

Used By:
- Schedule
- Payroll
- Operations

---

## Payroll Run

Used By:
- Payroll
- Finance

---

# Marketing

## Campaign

Used By:
- Marketing

---

## Marketing Asset

Used By:
- Design Studio
- Campaigns

---

## Publish Queue

Used By:
- Publishing


# Avantiqo Navigation Architecture

## Purpose

Navigation must be generated from runtime.

Navigation must never be hardcoded.

Different industries, packages and roles see different navigation.

---

# Navigation Hierarchy

Organization
↓
Domain
↓
Capability
↓
Screen

Example:

Revenue
↓
Sales
↓
Orders
↓
Order Details

---

# Level 1

Domain Navigation

Displayed in sidebar.

Examples:

Revenue
Execution
Control
Intelligence
Platform

---

# Level 2

Capability Navigation

Displayed after domain selection.

Example:

Revenue

Commerce
Sales
Customer
Marketing
Creative

---

# Level 3

Screen Navigation

Displayed inside capability.

Example:

Sales

Orders
Payments
Receipts
Reservations
Billing

---

# Role Filtering

Owner:
- All Domains

Manager:
- Revenue
- Execution
- Intelligence

Staff:
- Assigned Capabilities Only

Accountant:
- Finance
- Accounting
- Governance

Marketing:
- Marketing
- Creative
- Customer

---

# Workspace Rule

Workspace opens at domain level.

Not screen level.

Bad:

Workspace
→ POS

Good:

Workspace
→ Revenue
→ Sales

---

# Capability Dashboard Pattern

Every capability gets:

Overview
Operations
Analytics
Settings

Example:

Sales

Overview
Orders
Payments
Receipts
Analytics
Settings

---

# Industry Examples

Restaurant

Revenue
Execution
Control
Intelligence
Platform

Execution

Operations
Workforce

Operations

Kitchen
Inventory
Procurement
Production

---

Hotel

Revenue
Execution
Control
Intelligence
Platform

Execution

Operations
Workforce

Operations

Reservations
Front Desk
Housekeeping
Maintenance
Concierge

---

Retail

Revenue
Execution
Control
Intelligence
Platform

Execution

Operations

Operations

Inventory
Procurement
Fulfillment

---

# Future Rule

No page should appear in navigation unless:

1. Capability exists
2. Capability enabled by package
3. Capability enabled for organization
4. User role has access


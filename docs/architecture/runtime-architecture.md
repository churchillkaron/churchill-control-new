# Avantiqo Runtime Architecture

## Purpose

Runtime decides what an organization, user, package and role can see and use.

Runtime connects:

Organization
Industry
Package
Domains
Capabilities
Permissions
Channels
Engines
Navigation
Workspace

---

## Runtime Flow

1. User logs in
2. Active organization is resolved
3. Organization industry is loaded
4. Organization package is loaded
5. Enabled domains are resolved
6. Enabled capabilities are resolved
7. User role permissions are applied
8. Navigation is generated
9. Workspace is rendered
10. Screens call APIs
11. APIs call engines
12. Engines update business objects
13. Events trigger other engines

---

## Runtime Layers

### Organization Runtime

Resolves:
- organization
- tenant_id
- industry
- package
- enabled capabilities

---

### Capability Runtime

Resolves:
- domains
- capabilities
- routes
- dependencies
- status
- availability

---

### Permission Runtime

Resolves:
- can_view
- can_create
- can_update
- can_approve
- can_delete

---

### Navigation Runtime

Builds:
- top-level groups
- domain navigation
- capability cards
- screen links

---

### Workspace Runtime

Builds:
- dashboard
- KPIs
- enabled domains
- enabled capabilities
- alerts
- quick actions

---

### Engine Runtime

Routes events and actions to:
- Order Engine
- Payment Engine
- Inventory Engine
- Finance Engine
- Accounting Engine
- Workforce Engine
- Marketing Engine
- AI Engine

---

## Core Rule

Workspace must never hardcode modules.

Workspace must render from runtime.

---

## Final Runtime Output

Organization workspace should receive:

organization
domains
capabilities
permissions
navigation
dashboards
alerts
actions

---

## Example

Restaurant Professional package enables:

Revenue:
- Commerce
- Sales
- Customer
- Marketing
- Creative

Execution:
- Operations
- Workforce

Control:
- Finance

Platform:
- Administration

But not:
- Accounting
- Governance
- Advanced AI

---

## Implementation Order

1. Keep current workspace runtime working
2. Add capability runtime beside it
3. Do not replace platform_modules immediately
4. Map current modules to capabilities
5. Generate new navigation from domains and capabilities
6. Replace old flat module grid only after runtime works

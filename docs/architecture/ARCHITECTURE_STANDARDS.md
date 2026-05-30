# Avantiqo Architecture Standards

## Core Rule

Avantiqo is a multi-tenant enterprise operating platform.

Do not build isolated apps.
Do not duplicate modules.
Do not create industry-specific copies of core systems.

One module must support many organizations, industries, and runtimes.

---

## Runtime Hierarchy

Platform
→ Tenant
→ Organization
→ Industry Runtime
→ Module Runtime
→ Permissions
→ Data
→ AI / Automation

---

## Root Layers

### app/
UI routing only.

Pages must stay thin.
Pages should load runtime context and render components.

### components/
Reusable UI and module rendering.

No business logic.
No direct database writes unless explicitly approved.

### lib/
Business logic, services, runtime engines, permissions, calculations, AI, orchestration.

### lib/shared/
Shared infrastructure only:
- Supabase clients
- auth
- tenant
- approvals
- events
- routing
- architecture guards
- shared errors
- shared validation

### lib/platform/
Platform configuration:
- modules
- industries
- navigation
- permissions
- onboarding
- tenant modules
- platform runtime metadata

### lib/runtime/
Live execution:
- realtime
- workers
- queues
- health
- recovery
- operational runtime
- AI execution runtime

### lib/organizations/
Organization hierarchy:
- enterprise groups
- accounting firms
- direct businesses
- client companies
- organization relationships

### lib/workspace/
Workspace orchestration:
- active organization
- active module
- workspace context
- runtime shell behavior

---

## Module Rule

Never duplicate modules per industry.

Correct:
workspace/[organizationId]/finance

Wrong:
finance-hotel
finance-construction
finance-entertainment

Industries configure modules.
They do not clone modules.

---

## Module Structure Standard

Every major module should eventually follow:

lib/[module]/
├── services/
├── runtime/
├── permissions/
├── analytics/
├── ai/
├── audit/
└── index.js

components/[module]/
├── [Module]Content.jsx
├── [Module]Header.jsx
├── [Module]Panel.jsx
└── [Module]Table.jsx

app/(system)/[module]/page.jsx
→ legacy or direct wrapper only

app/(system)/workspace/[organizationId]/[moduleId]/page.jsx
→ primary enterprise runtime route

---

## Supabase Rule

Use only shared Supabase clients:

lib/shared/supabase/client.js
lib/shared/supabase/server.js
lib/shared/supabase/admin.js
lib/shared/supabase/service.js

Do not create new Supabase clients elsewhere.
Legacy lib/supabase.js and lib/supabase/* must be migrated over time.

---

## Page Rule

Pages must not contain heavy business logic.

Allowed in pages:
- layout
- routing
- runtime loading
- rendering module components

Not allowed in pages:
- calculations
- accounting logic
- payroll rules
- procurement logic
- AI orchestration
- direct complex database workflows

Move those to lib/.

---

## Organization Runtime Rule

All enterprise modules must become organization-aware.

Use active organization runtime:

organization_id
tenant_id
organization_type
industry_runtime
module_id
permissions

A user should be able to switch organizations without logging out.

---

## Industry Runtime Rule

Industry runtime configures:
- visible modules
- KPIs
- navigation
- dashboards
- AI prompts
- default permissions
- onboarding templates

Industry runtime must not duplicate core modules.

---

## Permission Rule

Permissions must be:
- tenant scoped
- organization scoped
- module scoped
- role aware

SUPER_ADMIN can access all within tenant/platform runtime.
Accounting firm users access assigned clients and allowed modules.
Direct business users access their own organization and allowed modules.

---

## AI Rule

AI should converge under lib/intelligence/.

Legacy AI folders may remain temporarily, but new AI systems should be created inside:

lib/intelligence/
├── agents/
├── orchestration/
├── memory/
├── forecasting/
├── automation/
├── recommendations/
├── optimization/
└── executive/

---

## Build Rule

Full file replacements only when editing important architecture files.
One change at a time.
Test after each structural change.
Do not move working systems without confirming imports.
Do not delete legacy systems until replacement is verified.


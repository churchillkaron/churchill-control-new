# Engineering Rules

# Core Philosophy

The platform is:
an operational SaaS system

NOT:
a collection of pages.

Changes must preserve:
- operational integrity
- auditability
- tenant isolation
- financial correctness
- workflow stability

---

# Change Rules

Always:
- one controlled change at a time
- full file replacements
- identify root cause first
- build after important changes
- verify affected workflows
- commit stable checkpoints

Never:
- random restructuring
- uncontrolled refactors
- architecture drift
- duplicate infrastructure
- duplicate business logic

---

# Avantiqo-First Compute and Cost Boundary

Canonical contracts:
- `docs/STUDIO_FIRST_COMPUTE.md`
- `config/avantiqo-compute-cost-policy.json`
- `AVANTIQO_STUDIO_FIRST_COMPUTE_BOUNDARY_V1`
- `AVANTIQO_COMPUTE_COST_ARCHITECTURE_V1`

Mandatory priority:
1. reuse an existing result/cache/artifact when possible
2. run inside Avantiqo at zero separate supplier-variable compute cost
3. use an Avantiqo-owned paid accelerator only for the smallest irreducible GPU/model stage
4. use a paid external specialist only when the capability genuinely cannot be provided by Avantiqo and governed fallback is allowed

Rules:
- if Avantiqo can execute an operation correctly itself without a separate supplier-variable compute charge, it MUST remain inside Avantiqo
- Modal is an elastic GPU/accelerator execution layer, not Avantiqo's application backend
- business logic, orchestration, validation, wallet/pricing, storage ownership, polling, retries, deterministic CPU work, final persistence and ordinary gateways belong in Avantiqo
- paid workers execute only the smallest irreducible GPU/model/external-side-effect operation
- existing worker lifetime, existing dependencies, implementation convenience, or avoiding Avantiqo engineering work are never valid reasons to use paid compute
- CPU media work such as FFmpeg, encode, transcode, mux/demux, frame extraction, ordinary resize/crop, storage finalization, metadata, validation, packaging and cleanup belongs in Avantiqo whenever technically possible
- paid workers return control as soon as the irreducible paid operation is complete
- scale paid GPU workers to zero by default
- use the cheapest GPU that satisfies model fit, runtime, quality and latency requirements
- H100/B200-class hardware requires evidence that cheaper hardware cannot satisfy the requirement or that the higher tier lowers measured total cost per successful result
- no speculative GPU prewarming
- no duplicate Modal + RunPod execution for the same job
- no repeated paid retries against an unchanged structural failure
- paid model bake/cache seeding requires explicit approval
- one canonical persistent model storage per engine; duplicate storage is forbidden
- certification should use one real paid job after zero-cost/static gates pass unless a broader benchmark is explicitly approved

Existing lightweight Modal CPU gateways are transitional migration debt only. They must remain transport-only and must not become precedent for new general-purpose Modal CPU services.

Every paid-worker change must pass:
- `scripts/studio-first-compute-boundary-audit.mjs`
- `scripts/avantiqo-compute-cost-policy-audit.mjs`

---

# API Rules

Routes:
app/api/*

Responsibilities only:
- parse request
- validate input
- resolve tenant
- call services
- return response

Never:
- large business logic
- scoring systems
- AI prompt assembly
- inventory calculations
- payroll calculations

---

# Service Layer Rules

Business logic belongs in:
lib/**/services/*

Services should:
- be domain-specific
- be reusable
- avoid UI assumptions
- avoid request/response logic

---

# Infrastructure Rules

Allowed Supabase clients only:
- shared/supabase/client.js
- shared/supabase/admin.js
- shared/supabase/server.js

Forbidden:
- random createClient()

---

# Tenant Rules

Tenant access only through:
getTenantId()

Never:
- hardcoded tenant IDs
- bypass tenant governance

---

# Operational Safety Rules

High-risk domains:
- production
- payroll
- kitchen
- inventory
- finance

Rules:
- isolate changes
- test workflows immediately
- avoid simultaneous refactors

---

# Queue Rules

Heavy processing must become async.

Examples:
- AI generation
- publishing
- OCR
- analytics
- payroll generation

---

# Database Rules

Never:
- mutate historical financial records
- overwrite payroll history
- bypass inventory logging

Always:
- preserve audit trail
- preserve timestamps
- preserve workflow states

---

# Frontend Rules

Pages should:
- orchestrate UI only
- call APIs/services
- avoid heavy calculations

Never:
- duplicate backend logic
- duplicate financial logic
- duplicate production logic

---

# Git Workflow

Recommended:
- build before commit
- stable commits only
- architecture tags
- rollback checkpoints

Example:
git tag architecture-stabilization-v1

---

# Long-Term Goal

Build:
AI-powered operational infrastructure platform

NOT:
just restaurant software.

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

# Studio-First Compute Boundary

Canonical contract:
- `docs/STUDIO_FIRST_COMPUTE.md`
- `AVANTIQO_STUDIO_FIRST_COMPUTE_BOUNDARY_V1`

Rule:
- if an operation can run correctly inside Avantiqo Studio without paid external compute or paid GPU execution, it MUST run in Studio
- paid workers execute only the smallest irreducible GPU/model/external-side-effect operation
- existing worker lifetime, existing container dependencies, implementation convenience, or avoiding Studio engineering work are never valid reasons to place Studio-capable work on paid compute
- CPU media work such as FFmpeg, encode, transcode, mux/demux, frame extraction, ordinary resize/crop, storage finalization, metadata, validation, packaging and cleanup belongs in Studio whenever technically possible
- paid workers must return control as soon as the irreducible paid operation is complete

Every paid-worker change must pass `scripts/studio-first-compute-boundary-audit.mjs`.

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
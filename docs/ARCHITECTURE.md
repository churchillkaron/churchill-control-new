# Churchill SaaS Architecture

## Core Principles

### API Layer
- Thin routes only
- Validation only
- Tenant resolution only
- Service orchestration only

### Service Layer
Location:
lib/{domain}/services/*

Responsibilities:
- Business logic
- Workflow orchestration
- Analytics calculations
- AI orchestration

### Domain Layer
Location:
lib/{domain}/*

Responsibilities:
- Domain-specific logic
- Engines
- Recommendations
- Scoring
- Domain utilities

### Shared Layer
Location:
lib/shared/*

Responsibilities:
- HTTP framework
- Logging
- Validation
- Tenant resolution
- Shared infrastructure
- Shared Supabase clients

### Persistence Layer
Location:
lib/supabase/*

Responsibilities:
- Database persistence
- Storage persistence
- Queue persistence
- Supabase access wrappers

## Rules
- Build before commit
- One migration at a time
- No mass refactors
- No duplicated logic
- No root-level random services
- Domains own their logic
- Shared layer owns infrastructure
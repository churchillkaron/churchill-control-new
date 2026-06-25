# AVANTIQO PLATFORM CONSTITUTION

Version: 1.0

Status:
LOCKED

After this document is accepted, platform architecture is considered frozen.
Future changes require a demonstrated platform gap, not preference.

============================================================
1. PLATFORM
============================================================

Platform owns ONLY platform responsibilities.

Platform owns:

- Organizations
- Multi-company
- Multi-tenant
- Identity
- Authentication
- Authorization
- Permissions
- Runtime construction
- Discovery
- Metadata
- Navigation
- Billing
- Security
- Analytics infrastructure
- Workspace infrastructure
- Templates
- Platform configuration

Platform NEVER owns:

- Restaurant logic
- Finance logic
- Inventory logic
- Procurement logic
- Hotel logic
- Healthcare logic
- Construction logic
- Manufacturing logic
- Retail logic
- Pest Control logic

============================================================
2. UBTE
============================================================

UBTE is the execution layer.

UBTE owns:

- Capability execution
- Workflow execution
- Event execution
- Queue execution
- AI execution
- Runtime execution
- Integration execution

UBTE NEVER owns:

- Business rules
- Business documents
- Business repositories
- Business UI

============================================================
3. BUSINESS DOMAINS
============================================================

Every business domain owns its own business.

Example:

Restaurant

Finance

Inventory

Procurement

Hotel

Healthcare

Construction

Manufacturing

Retail

Pest Control

Every domain owns:

runtime/
documents/
objects/
aggregates/
repositories/
capabilities/
workflows/
events/
reports/
ui/
ai/
integrations/

============================================================
4. OWNERSHIP
============================================================

Every responsibility has exactly ONE owner.

No duplicates.

No alternative implementations.

No compatibility layers after migration.

============================================================
5. DEPENDENCIES
============================================================

Allowed:

Platform
↓

UBTE
↓

Business Domain
↓

Repository

Forbidden:

Domain
↓

Platform Business Logic

Domain
↓

Another Domain Repository

Circular imports

============================================================
6. MIGRATION
============================================================

Migration strategy:

Audit

↓

Move

↓

Compile

↓

Test

↓

Delete old implementation

↓

Commit

↓

Freeze

Never migrate the same responsibility twice.

============================================================
7. DEVELOPMENT RULES
============================================================

Never create:

core2

runtime2

helpers2

legacy2

actions2

Duplicate registry

Duplicate workflow

Duplicate runtime

Duplicate repository

Every new capability must extend the existing owner.

============================================================
8. DOMAIN COMPLETION
============================================================

A domain is COMPLETE only when:

Architecture = 100%

Business Logic = 100%

Reports = 100%

AI = 100%

UI = 100%

Integrations = 100%

Tests = Passing

Legacy = Deleted

Duplicates = Zero

Only then may the next domain begin.

============================================================
9. PRODUCTION PRINCIPLE
============================================================

Platform evolves rarely.

Business domains evolve continuously.

Platform stability is more important than architecture experimentation.

============================================================
10. FINAL PRINCIPLE
============================================================

Build the platform once.

Build business capabilities forever.

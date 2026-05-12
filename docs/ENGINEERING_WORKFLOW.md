# Engineering Workflow

## Standard Workflow

Every change follows:

1. Refactor
2. Build
3. Verify
4. Commit
5. Push

Never skip build verification.

---

## Migration Workflow

Rules:
- One migration at a time
- One route at a time
- No mass refactors
- Preserve existing functionality
- Fix root cause only

---

## Architecture Workflow

Before creating new code:
- Check domain ownership
- Check naming conventions
- Check anti-patterns
- Check shared utilities first

Questions:
- Does this belong in shared?
- Does this belong in a service?
- Does this belong in persistence?
- Is this domain-specific?

---

## API Workflow

Routes should only:
- Validate
- Resolve tenant
- Call services
- Return responses

Routes should NOT:
- Contain calculations
- Contain orchestration
- Contain AI logic
- Contain inventory logic

---

## Service Workflow

Services own:
- Business workflows
- Orchestration
- Analytics
- AI coordination
- Domain operations

---

## Stability Rules

Always:
- Build before commit
- Commit before large changes
- Keep migrations incremental
- Verify operational systems carefully

High-risk domains:
- POS
- Kitchen
- Production
- Orders
- Control

Require extra caution.

---

## Documentation Rules

Every major architecture change must update:
- ARCHITECTURE.md
- DOMAIN_OWNERSHIP.md
- MIGRATION_PRIORITY.md
- ANTI_PATTERNS.md
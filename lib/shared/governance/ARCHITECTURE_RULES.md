# Architecture Rules

1. shared is the kernel only.
2. No domain business logic in shared.
3. UI must not own business writes.
4. API routes call domain services.
5. Domain services use shared core/workflow/infra only.
6. Supabase access must go through shared/supabase clients.

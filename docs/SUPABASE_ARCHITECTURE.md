# Supabase Architecture

## Shared Infrastructure

### Client
Location:
lib/shared/supabase/client.js

Purpose:
Browser-safe client.

Use for:
- frontend
- safe client-side operations
- authenticated browser usage

Never use:
SERVICE_ROLE_KEY

---

### Admin
Location:
lib/shared/supabase/admin.js

Purpose:
Privileged backend infrastructure.

Use for:
- backend services
- admin operations
- operational workflows
- financial workflows
- queue processing

Never import into:
- frontend
- client components

---

### Server
Location:
lib/shared/supabase/server.js

Purpose:
Server-side authenticated request context.

Use for:
- authenticated server routes
- future session-aware flows
- tenant-aware auth flows

---

## Rules

Never:
- create random createClient() usage
- duplicate infrastructure setup
- expose service role to frontend

Always:
- use shared infrastructure clients
- keep infrastructure centralized
- standardize usage patterns

---

## Future Goals

Planned:
- session-aware auth
- tenant-aware auth
- RLS standardization
- audit logging
- infrastructure observability
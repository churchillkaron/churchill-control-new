# AVANTIQO / CHURCHILL FREEZE v1

## SUPABASE RULES

CLIENT:
- supabase from /lib/shared/supabase/client

SERVER:
- createServerSupabase ONLY
- never use createClient directly

ADMIN:
- supabaseAdmin ONLY

## FORBIDDEN
- SUPABASE_URL
- direct env Supabase initialization
- mixed client/server usage

## RULE
If unsure → ask before changing architecture

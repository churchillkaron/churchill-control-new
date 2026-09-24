-- Allow explicit, audited retries after terminal provider failures.
-- Exactly-once remains enforced per organization + execution_key, while a
-- production task may own multiple numbered execution attempts.
drop index if exists public.creative_provider_execution_claims_task_uidx;

comment on table public.creative_provider_execution_claims is
  'Exactly-once provider execution claims. One task may have multiple explicit attempts; each organization + execution_key remains unique.';
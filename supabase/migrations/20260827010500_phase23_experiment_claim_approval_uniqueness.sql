-- Avantiqo Intelligence Phase 23
-- Enforce one immutable experiment execution claim per governed approval.
--
-- The generic intelligence memory key is already unique, but claim fingerprints are
-- caller supplied. This partial unique index makes approval replay impossible even if
-- two different claim fingerprints race concurrently or a future caller bypasses the
-- normal application helper.

create unique index if not exists intelligence_memories_one_experiment_claim_per_approval_idx
on public.intelligence_memories (
  organization_id,
  (metadata->>'approval_fingerprint')
)
where memory_scope = 'platform_learning_experiment_execution_claims'
  and coalesce(metadata->>'approval_fingerprint','') <> '';

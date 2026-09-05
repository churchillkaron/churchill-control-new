begin;

create or replace function public.avantiqo_commit_final_knowledge_release(
  p_organization_id uuid,
  p_authorization_id uuid,
  p_authorization_memory_key text,
  p_authorization_expected_updated_at timestamptz,
  p_candidate_id uuid,
  p_candidate_expected_updated_at timestamptz,
  p_consumption_row jsonb,
  p_release_row jsonb,
  p_candidate_metadata jsonb,
  p_committed_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_authorization public.intelligence_memories%rowtype;
  v_candidate public.intelligence_memories%rowtype;
  v_consumption_id uuid;
  v_release_id uuid;
  v_consumption_memory_key text;
  v_release_memory_key text;
  v_authorization_id_text text;
  v_candidate_memory_key text;
  v_candidate_mac text;
  v_claim_digest text;
  v_release_metadata jsonb;
  v_consumption_metadata jsonb;
begin
  if p_organization_id is null or p_authorization_id is null or p_candidate_id is null then
    raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_REQUIRED_IDS_MISSING';
  end if;
  if p_committed_at is null then
    raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_COMMITTED_AT_REQUIRED';
  end if;

  select *
    into v_authorization
  from public.intelligence_memories
  where organization_id = p_organization_id
    and id = p_authorization_id
    and memory_scope = 'platform_learning_knowledge_release_authorizations'
    and memory_key = p_authorization_memory_key
    and active = true
    and updated_at = p_authorization_expected_updated_at
  for update;

  if not found then
    raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_AUTHORIZATION_STATE_CONFLICT';
  end if;
  if coalesce(v_authorization.metadata->>'status', '') <> 'READY' then
    raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_AUTHORIZATION_NOT_READY';
  end if;
  if v_authorization.valid_until is null or v_authorization.valid_until <= p_committed_at then
    raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_AUTHORIZATION_EXPIRED';
  end if;
  if coalesce(v_authorization.metadata->>'one_use_required', 'false') <> 'true'
     or coalesce(v_authorization.metadata->>'replay_detection_required', 'false') <> 'true'
     or coalesce(v_authorization.metadata->>'automatic_release_allowed', 'true') <> 'false' then
    raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_AUTHORIZATION_GOVERNANCE_INVALID';
  end if;

  select *
    into v_candidate
  from public.intelligence_memories
  where organization_id = p_organization_id
    and id = p_candidate_id
    and memory_scope = 'platform_learning_knowledge_final_promotion_candidates'
    and active = true
    and updated_at = p_candidate_expected_updated_at
  for update;

  if not found then
    raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_CANDIDATE_STATE_CONFLICT';
  end if;

  v_authorization_id_text := coalesce(v_authorization.metadata->>'authorization_id', '');
  v_candidate_memory_key := coalesce(v_candidate.memory_key, '');
  v_candidate_mac := coalesce(v_candidate.metadata->>'final_promotion_candidate_authenticity_mac', '');
  v_claim_digest := coalesce(v_candidate.metadata->>'provisional_claim_digest', '');
  v_consumption_metadata := coalesce(p_consumption_row->'metadata', '{}'::jsonb);
  v_release_metadata := coalesce(p_release_row->'metadata', '{}'::jsonb);
  v_consumption_memory_key := coalesce(p_consumption_row->>'memory_key', '');
  v_release_memory_key := coalesce(p_release_row->>'memory_key', '');

  if v_authorization_id_text = ''
     or coalesce(v_authorization.metadata->>'candidate_memory_key', '') <> v_candidate_memory_key
     or coalesce(v_authorization.metadata->>'candidate_authenticity_mac', '') <> v_candidate_mac
     or coalesce(v_authorization.metadata->>'provisional_claim_digest', '') <> v_claim_digest then
    raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_AUTHORIZATION_CANDIDATE_BINDING_MISMATCH';
  end if;

  if coalesce(p_consumption_row->>'organization_id', '') <> p_organization_id::text
     or coalesce(p_consumption_row->>'memory_scope', '') <> 'platform_learning_knowledge_release_authorization_consumptions'
     or coalesce(p_consumption_row->>'memory_type', '') <> 'completed_step'
     or coalesce(v_consumption_metadata->>'authorization_id', '') <> v_authorization_id_text
     or coalesce(v_consumption_metadata->>'candidate_memory_key', '') <> v_candidate_memory_key
     or coalesce(v_consumption_metadata->>'provisional_claim_digest', '') <> v_claim_digest
     or coalesce(v_consumption_metadata->>'replay_allowed', 'true') <> 'false' then
    raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_CONSUMPTION_RECEIPT_INVALID';
  end if;

  if coalesce(p_release_row->>'organization_id', '') <> p_organization_id::text
     or coalesce(p_release_row->>'memory_scope', '') <> 'platform_knowledge'
     or coalesce(p_release_row->>'memory_type', '') <> 'fact'
     or coalesce(p_release_row->>'source', '') <> 'avantiqo_explicit_final_knowledge_release'
     or coalesce(v_release_metadata->>'final_release_authorization_id', '') <> v_authorization_id_text
     or coalesce(v_release_metadata->>'final_release_authorization_one_use_consumed', 'false') <> 'true'
     or coalesce(v_release_metadata->>'final_promotion_candidate_authenticity_verified', 'false') <> 'true'
     or coalesce(v_release_metadata->>'provisional_claim_digest', '') <> v_claim_digest
     or coalesce(v_release_metadata->>'reusable_platform_knowledge', 'false') <> 'true'
     or coalesce(v_release_metadata->>'knowledge_router_reuse_allowed', 'false') <> 'true' then
    raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_RELEASE_ROW_INVALID';
  end if;

  if coalesce(p_candidate_metadata->>'production_knowledge_release_authorization_id', '') <> v_authorization_id_text
     or coalesce(p_candidate_metadata->>'production_knowledge_release_authorization_consumed', 'false') <> 'true'
     or coalesce(p_candidate_metadata->>'platform_knowledge_written', 'false') <> 'true'
     or coalesce(p_candidate_metadata->>'release_memory_key', '') <> v_release_memory_key then
    raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_CANDIDATE_FINALIZATION_INVALID';
  end if;

  insert into public.intelligence_memories (
    organization_id, party_id, entity_id, conversation_id, source_turn_id,
    memory_scope, memory_key, memory_type, subject, content,
    importance, confidence, source, active, valid_until,
    superseded_by, superseded_at, forgotten_at, metadata, updated_at
  ) values (
    p_organization_id,
    nullif(p_consumption_row->>'party_id', '')::uuid,
    nullif(p_consumption_row->>'entity_id', '')::uuid,
    nullif(p_consumption_row->>'conversation_id', '')::uuid,
    nullif(p_consumption_row->>'source_turn_id', '')::uuid,
    p_consumption_row->>'memory_scope',
    v_consumption_memory_key,
    p_consumption_row->>'memory_type',
    p_consumption_row->>'subject',
    p_consumption_row->>'content',
    coalesce((p_consumption_row->>'importance')::numeric, 1),
    coalesce((p_consumption_row->>'confidence')::numeric, 1),
    p_consumption_row->>'source',
    true,
    nullif(p_consumption_row->>'valid_until', '')::timestamptz,
    nullif(p_consumption_row->>'superseded_by', '')::uuid,
    nullif(p_consumption_row->>'superseded_at', '')::timestamptz,
    nullif(p_consumption_row->>'forgotten_at', '')::timestamptz,
    v_consumption_metadata,
    p_committed_at
  )
  returning id into v_consumption_id;

  update public.intelligence_memories
  set active = false,
      metadata = v_authorization.metadata || jsonb_build_object(
        'status', 'CONSUMED',
        'consumed_at', p_committed_at,
        'consumption_memory_key', v_consumption_memory_key
      ),
      updated_at = p_committed_at
  where id = v_authorization.id
    and organization_id = p_organization_id
    and active = true
    and updated_at = p_authorization_expected_updated_at;
  if not found then
    raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_AUTHORIZATION_CONSUME_CONFLICT';
  end if;

  insert into public.intelligence_memories (
    organization_id, party_id, entity_id, conversation_id, source_turn_id,
    memory_scope, memory_key, memory_type, subject, content,
    importance, confidence, source, active, valid_until,
    superseded_by, superseded_at, forgotten_at, metadata, updated_at
  ) values (
    p_organization_id,
    nullif(p_release_row->>'party_id', '')::uuid,
    nullif(p_release_row->>'entity_id', '')::uuid,
    nullif(p_release_row->>'conversation_id', '')::uuid,
    nullif(p_release_row->>'source_turn_id', '')::uuid,
    p_release_row->>'memory_scope',
    v_release_memory_key,
    p_release_row->>'memory_type',
    p_release_row->>'subject',
    p_release_row->>'content',
    (p_release_row->>'importance')::numeric,
    (p_release_row->>'confidence')::numeric,
    p_release_row->>'source',
    true,
    nullif(p_release_row->>'valid_until', '')::timestamptz,
    nullif(p_release_row->>'superseded_by', '')::uuid,
    nullif(p_release_row->>'superseded_at', '')::timestamptz,
    nullif(p_release_row->>'forgotten_at', '')::timestamptz,
    v_release_metadata,
    p_committed_at
  )
  returning id into v_release_id;

  update public.intelligence_memories
  set metadata = p_candidate_metadata,
      updated_at = p_committed_at
  where id = v_candidate.id
    and organization_id = p_organization_id
    and active = true
    and updated_at = p_candidate_expected_updated_at;
  if not found then
    raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_CANDIDATE_FINALIZE_CONFLICT';
  end if;

  return jsonb_build_object(
    'success', true,
    'contract', 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_COMMIT_V1',
    'authorization_id', v_authorization_id_text,
    'authorization_consumed', true,
    'consumption_memory_key', v_consumption_memory_key,
    'consumption_id', v_consumption_id,
    'release_memory_key', v_release_memory_key,
    'release_id', v_release_id,
    'candidate_memory_key', v_candidate_memory_key,
    'candidate_finalized', true,
    'committed_at', p_committed_at,
    'transaction_atomic', true
  );
end;
$$;

revoke all on function public.avantiqo_commit_final_knowledge_release(
  uuid, uuid, text, timestamptz, uuid, timestamptz, jsonb, jsonb, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.avantiqo_commit_final_knowledge_release(
  uuid, uuid, text, timestamptz, uuid, timestamptz, jsonb, jsonb, jsonb, timestamptz
) to service_role;

comment on function public.avantiqo_commit_final_knowledge_release(
  uuid, uuid, text, timestamptz, uuid, timestamptz, jsonb, jsonb, jsonb, timestamptz
) is 'Atomically consumes one signed final-knowledge release authorization, inserts its one-use receipt and released knowledge row, and finalizes the exact candidate. SECURITY INVOKER; service_role only; cryptographic verification occurs in the server runtime before this transaction boundary.';

commit;

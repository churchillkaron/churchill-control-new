begin;

create or replace function public.avantiqo_commit_final_knowledge_release(
  p_organization_id uuid,
  p_authorization_id uuid,
  p_authorization_memory_key text,
  p_authorization_expected_updated_at timestamptz,
  p_candidate_id uuid,
  p_candidate_expected_updated_at timestamptz,
  p_provisional_id uuid,
  p_provisional_expected_updated_at timestamptz,
  p_consumption_row jsonb,
  p_release_row jsonb,
  p_candidate_metadata jsonb,
  p_provisional_metadata jsonb,
  p_receipt_row jsonb,
  p_transaction_id uuid,
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
  v_provisional public.intelligence_memories%rowtype;
  v_consumption_id uuid;
  v_release_id uuid;
  v_receipt_id uuid;
  v_consumption_memory_key text;
  v_release_memory_key text;
  v_receipt_memory_key text;
  v_authorization_id_text text;
  v_candidate_memory_key text;
  v_candidate_mac text;
  v_claim_digest text;
  v_release_metadata jsonb;
  v_consumption_metadata jsonb;
  v_receipt_metadata jsonb;
begin
  if p_organization_id is null or p_authorization_id is null or p_candidate_id is null or p_provisional_id is null then
    raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_REQUIRED_IDS_MISSING';
  end if;
  if p_committed_at is null or p_transaction_id is null then
    raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_TRANSACTION_ID_AND_TIME_REQUIRED';
  end if;
  if abs(extract(epoch from (transaction_timestamp() - p_committed_at))) > 60 then
    raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_COMMIT_TIME_SKEW_EXCEEDED';
  end if;

  select * into v_authorization
  from public.intelligence_memories
  where organization_id = p_organization_id
    and id = p_authorization_id
    and memory_scope = 'platform_learning_knowledge_release_authorizations'
    and memory_key = p_authorization_memory_key
    and active = true
    and updated_at = p_authorization_expected_updated_at
  for update;
  if not found then raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_AUTHORIZATION_STATE_CONFLICT'; end if;
  if coalesce(v_authorization.metadata->>'status', '') <> 'READY' then raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_AUTHORIZATION_NOT_READY'; end if;
  if v_authorization.valid_until is null or v_authorization.valid_until <= p_committed_at then raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_AUTHORIZATION_EXPIRED'; end if;
  if coalesce(v_authorization.metadata->>'one_use_required', 'false') <> 'true'
     or coalesce(v_authorization.metadata->>'replay_detection_required', 'false') <> 'true'
     or coalesce(v_authorization.metadata->>'automatic_release_allowed', 'true') <> 'false' then
    raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_AUTHORIZATION_GOVERNANCE_INVALID';
  end if;

  select * into v_candidate
  from public.intelligence_memories
  where organization_id = p_organization_id
    and id = p_candidate_id
    and memory_scope = 'platform_learning_knowledge_final_promotion_candidates'
    and active = true
    and updated_at = p_candidate_expected_updated_at
  for update;
  if not found then raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_CANDIDATE_STATE_CONFLICT'; end if;

  select * into v_provisional
  from public.intelligence_memories
  where organization_id = p_organization_id
    and id = p_provisional_id
    and memory_scope = 'platform_provisional_knowledge'
    and active = true
    and updated_at = p_provisional_expected_updated_at
  for update;
  if not found then raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_PROVISIONAL_STATE_CONFLICT'; end if;

  v_authorization_id_text := coalesce(v_authorization.metadata->>'authorization_id', '');
  v_candidate_memory_key := coalesce(v_candidate.memory_key, '');
  v_candidate_mac := coalesce(v_candidate.metadata->>'final_promotion_candidate_authenticity_mac', '');
  v_claim_digest := coalesce(v_candidate.metadata->>'provisional_claim_digest', '');
  v_consumption_metadata := coalesce(p_consumption_row->'metadata', '{}'::jsonb);
  v_release_metadata := coalesce(p_release_row->'metadata', '{}'::jsonb);
  v_receipt_metadata := coalesce(p_receipt_row->'metadata', '{}'::jsonb);
  v_consumption_id := nullif(p_consumption_row->>'id', '')::uuid;
  v_release_id := nullif(p_release_row->>'id', '')::uuid;
  v_receipt_id := nullif(p_receipt_row->>'id', '')::uuid;
  if v_consumption_id is null or v_release_id is null or v_receipt_id is null then
    raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_PREASSIGNED_ROW_IDS_REQUIRED';
  end if;
  if v_consumption_id = v_release_id or v_consumption_id = v_receipt_id or v_release_id = v_receipt_id then
    raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_ROW_IDS_MUST_BE_DISTINCT';
  end if;
  v_consumption_memory_key := coalesce(p_consumption_row->>'memory_key', '');
  v_release_memory_key := coalesce(p_release_row->>'memory_key', '');
  v_receipt_memory_key := coalesce(p_receipt_row->>'memory_key', '');

  if v_authorization_id_text = ''
     or coalesce(v_authorization.metadata->>'candidate_memory_key', '') <> v_candidate_memory_key
     or coalesce(v_authorization.metadata->>'candidate_authenticity_mac', '') <> v_candidate_mac
     or coalesce(v_authorization.metadata->>'provisional_claim_memory_key', '') <> v_provisional.memory_key
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

  if coalesce(p_receipt_row->>'organization_id', '') <> p_organization_id::text
     or coalesce(p_receipt_row->>'memory_scope', '') <> 'platform_learning_knowledge_release_receipts'
     or coalesce(p_receipt_row->>'memory_type', '') <> 'completed_step'
     or coalesce(p_receipt_row->>'source', '') <> 'immutable_final_knowledge_release_receipt'
     or coalesce(v_receipt_metadata->>'contract', '') <> 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_V1'
     or coalesce(v_receipt_metadata->>'atomic_binding_contract', '') <> 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_ATOMIC_BINDING_V1'
     or coalesce(v_receipt_metadata->>'status', '') <> 'COMMITTED'
     or coalesce(v_receipt_metadata->>'receipt_immutable', 'false') <> 'true'
     or coalesce(v_receipt_metadata->>'receipt_append_only', 'false') <> 'true'
     or coalesce(v_receipt_metadata->>'transaction_atomic', 'false') <> 'true'
     or coalesce(v_receipt_metadata->>'partial_release_state_allowed', 'true') <> 'false'
     or coalesce(v_receipt_metadata->>'transaction_id', '') <> p_transaction_id::text
     or nullif(v_receipt_metadata->>'committed_at', '')::timestamptz <> p_committed_at
     or coalesce(v_receipt_metadata->>'authorization_id', '') <> v_authorization_id_text
     or coalesce(v_receipt_metadata->>'authorization_memory_key', '') <> v_authorization.memory_key
     or coalesce(v_receipt_metadata->>'authorization_consumption_memory_key', '') <> v_consumption_memory_key
     or coalesce(v_receipt_metadata->>'consumption_row_id', '') <> v_consumption_id::text
     or coalesce(v_receipt_metadata->>'release_row_id', '') <> v_release_id::text
     or coalesce(v_receipt_metadata->>'receipt_row_id', '') <> v_receipt_id::text
     or coalesce(v_receipt_metadata->>'candidate_id', '') <> v_candidate.id::text
     or coalesce(v_receipt_metadata->>'candidate_memory_key', '') <> v_candidate_memory_key
     or coalesce(v_receipt_metadata->>'candidate_authenticity_mac', '') <> v_candidate_mac
     or coalesce(v_receipt_metadata->>'provisional_id', '') <> v_provisional.id::text
     or coalesce(v_receipt_metadata->>'provisional_claim_memory_key', '') <> v_provisional.memory_key
     or coalesce(v_receipt_metadata->>'provisional_claim_digest', '') <> v_claim_digest
     or coalesce(v_receipt_metadata->>'release_memory_key', '') <> v_release_memory_key
     or coalesce(v_receipt_metadata->>'release_id', '') <> coalesce(v_release_metadata->>'release_id', '')
     or length(coalesce(v_receipt_metadata->>'released_knowledge_binding_digest', '')) <> 64
     or coalesce(v_receipt_metadata->>'release_receipt_signature_contract', '') <> 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_V1'
     or coalesce(v_receipt_metadata->>'release_receipt_signature_algorithm', '') <> 'Ed25519'
     or coalesce(v_receipt_metadata->>'release_receipt_signature_key_id', '') = ''
     or coalesce(v_receipt_metadata->>'release_receipt_signature', '') = ''
     or coalesce(v_receipt_metadata->>'exact_persisted_row_ids_bound', 'false') <> 'true'
     or coalesce(v_receipt_metadata->>'receipt_mutation_allowed', 'true') <> 'false'
     or coalesce(v_receipt_metadata->>'replay_allowed', 'true') <> 'false' then
    raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_IMMUTABLE_RECEIPT_INVALID';
  end if;

  if coalesce(p_candidate_metadata->>'production_knowledge_release_authorization_id', '') <> v_authorization_id_text
     or coalesce(p_candidate_metadata->>'production_knowledge_release_authorization_consumed', 'false') <> 'true'
     or coalesce(p_candidate_metadata->>'platform_knowledge_written', 'false') <> 'true'
     or coalesce(p_candidate_metadata->>'release_memory_key', '') <> v_release_memory_key then
    raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_CANDIDATE_FINALIZATION_INVALID';
  end if;

  if coalesce(p_provisional_metadata->>'status', '') <> 'PROMOTED_TO_EXPLICITLY_RELEASED_PLATFORM_KNOWLEDGE'
     or coalesce(p_provisional_metadata->>'released_knowledge_memory_key', '') <> v_release_memory_key
     or coalesce(p_provisional_metadata->>'reusable_platform_knowledge', 'true') <> 'false'
     or coalesce(p_provisional_metadata->>'knowledge_router_reuse_allowed', 'true') <> 'false' then
    raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_PROVISIONAL_FINALIZATION_INVALID';
  end if;

  insert into public.intelligence_memories (
    id, organization_id, party_id, entity_id, conversation_id, source_turn_id,
    memory_scope, memory_key, memory_type, subject, content,
    importance, confidence, source, active, valid_until,
    superseded_by, superseded_at, forgotten_at, metadata, updated_at
  ) values (
    v_consumption_id, p_organization_id, nullif(p_consumption_row->>'party_id', '')::uuid,
    nullif(p_consumption_row->>'entity_id', '')::uuid, nullif(p_consumption_row->>'conversation_id', '')::uuid,
    nullif(p_consumption_row->>'source_turn_id', '')::uuid, p_consumption_row->>'memory_scope',
    v_consumption_memory_key, p_consumption_row->>'memory_type', p_consumption_row->>'subject',
    p_consumption_row->>'content', coalesce((p_consumption_row->>'importance')::numeric, 1),
    coalesce((p_consumption_row->>'confidence')::numeric, 1), p_consumption_row->>'source', true,
    nullif(p_consumption_row->>'valid_until', '')::timestamptz, nullif(p_consumption_row->>'superseded_by', '')::uuid,
    nullif(p_consumption_row->>'superseded_at', '')::timestamptz, nullif(p_consumption_row->>'forgotten_at', '')::timestamptz,
    v_consumption_metadata, p_committed_at
  );

  update public.intelligence_memories
  set active = false,
      metadata = v_authorization.metadata || jsonb_build_object('status','CONSUMED','consumed_at',p_committed_at,'consumption_memory_key',v_consumption_memory_key),
      updated_at = p_committed_at
  where id = v_authorization.id and organization_id = p_organization_id and active = true and updated_at = p_authorization_expected_updated_at;
  if not found then raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_AUTHORIZATION_CONSUME_CONFLICT'; end if;

  insert into public.intelligence_memories (
    id, organization_id, party_id, entity_id, conversation_id, source_turn_id,
    memory_scope, memory_key, memory_type, subject, content,
    importance, confidence, source, active, valid_until,
    superseded_by, superseded_at, forgotten_at, metadata, updated_at
  ) values (
    v_release_id, p_organization_id, nullif(p_release_row->>'party_id', '')::uuid,
    nullif(p_release_row->>'entity_id', '')::uuid, nullif(p_release_row->>'conversation_id', '')::uuid,
    nullif(p_release_row->>'source_turn_id', '')::uuid, p_release_row->>'memory_scope', v_release_memory_key,
    p_release_row->>'memory_type', p_release_row->>'subject', p_release_row->>'content',
    (p_release_row->>'importance')::numeric, (p_release_row->>'confidence')::numeric,
    p_release_row->>'source', true, nullif(p_release_row->>'valid_until', '')::timestamptz,
    nullif(p_release_row->>'superseded_by', '')::uuid, nullif(p_release_row->>'superseded_at', '')::timestamptz,
    nullif(p_release_row->>'forgotten_at', '')::timestamptz, v_release_metadata, p_committed_at
  );

  insert into public.intelligence_memories (
    id, organization_id, party_id, entity_id, conversation_id, source_turn_id,
    memory_scope, memory_key, memory_type, subject, content,
    importance, confidence, source, active, valid_until,
    superseded_by, superseded_at, forgotten_at, metadata, updated_at
  ) values (
    v_receipt_id, p_organization_id, nullif(p_receipt_row->>'party_id', '')::uuid,
    nullif(p_receipt_row->>'entity_id', '')::uuid, nullif(p_receipt_row->>'conversation_id', '')::uuid,
    nullif(p_receipt_row->>'source_turn_id', '')::uuid, p_receipt_row->>'memory_scope', v_receipt_memory_key,
    p_receipt_row->>'memory_type', p_receipt_row->>'subject', p_receipt_row->>'content',
    coalesce((p_receipt_row->>'importance')::numeric, 1), coalesce((p_receipt_row->>'confidence')::numeric, 1),
    p_receipt_row->>'source', true, nullif(p_receipt_row->>'valid_until', '')::timestamptz,
    nullif(p_receipt_row->>'superseded_by', '')::uuid, nullif(p_receipt_row->>'superseded_at', '')::timestamptz,
    nullif(p_receipt_row->>'forgotten_at', '')::timestamptz, v_receipt_metadata, p_committed_at
  );

  update public.intelligence_memories
  set metadata = p_candidate_metadata, updated_at = p_committed_at
  where id = v_candidate.id and organization_id = p_organization_id and active = true and updated_at = p_candidate_expected_updated_at;
  if not found then raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_CANDIDATE_FINALIZE_CONFLICT'; end if;

  update public.intelligence_memories
  set active = false,
      superseded_by = v_release_id,
      superseded_at = p_committed_at,
      metadata = p_provisional_metadata,
      updated_at = p_committed_at
  where id = v_provisional.id and organization_id = p_organization_id and active = true and updated_at = p_provisional_expected_updated_at;
  if not found then raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_PROVISIONAL_FINALIZE_CONFLICT'; end if;

  return jsonb_build_object(
    'success', true,
    'contract', 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_COMMIT_V1',
    'authorization_id', v_authorization_id_text,
    'authorization_consumed', true,
    'consumption_memory_key', v_consumption_memory_key,
    'consumption_id', v_consumption_id,
    'release_memory_key', v_release_memory_key,
    'release_id', v_release_id,
    'transaction_id', p_transaction_id,
    'release_receipt_persisted', true,
    'release_receipt_memory_key', v_receipt_memory_key,
    'release_receipt_id', v_receipt_id,
    'candidate_memory_key', v_candidate_memory_key,
    'candidate_finalized', true,
    'provisional_memory_key', v_provisional.memory_key,
    'provisional_superseded', true,
    'committed_at', p_committed_at,
    'transaction_atomic', true
  );
end;
$$;

revoke all on function public.avantiqo_commit_final_knowledge_release(
  uuid, uuid, text, timestamptz, uuid, timestamptz, uuid, timestamptz, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.avantiqo_commit_final_knowledge_release(
  uuid, uuid, text, timestamptz, uuid, timestamptz, uuid, timestamptz, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, timestamptz
) to service_role;

comment on function public.avantiqo_commit_final_knowledge_release(
  uuid, uuid, text, timestamptz, uuid, timestamptz, uuid, timestamptz, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, timestamptz
) is 'Atomically consumes one signed final-knowledge release authorization, inserts one-use consumption evidence, released knowledge and an immutable Ed25519 receipt bound to exact persisted row identities, finalizes the exact candidate, and supersedes the exact provisional claim. SECURITY INVOKER; service_role only; cryptographic verification occurs in the server runtime before this transaction boundary.';

create or replace function public.avantiqo_block_final_knowledge_release_receipt_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_IMMUTABLE';
end;
$$;

revoke all on function public.avantiqo_block_final_knowledge_release_receipt_mutation() from public, anon, authenticated;

drop trigger if exists trg_avantiqo_final_knowledge_release_receipt_immutable on public.intelligence_memories;
create trigger trg_avantiqo_final_knowledge_release_receipt_immutable
before update or delete on public.intelligence_memories
for each row
when (old.memory_scope = 'platform_learning_knowledge_release_receipts')
execute function public.avantiqo_block_final_knowledge_release_receipt_mutation();

commit;

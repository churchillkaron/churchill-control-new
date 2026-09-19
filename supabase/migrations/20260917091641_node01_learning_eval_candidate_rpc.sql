-- Bounded read-only platform-learning agenda feed for authenticated local compute nodes.
-- This function never claims, leases, updates, promotes, trains, or exposes customer-scoped memory.
drop function if exists public.read_avantiqo_local_learning_eval_candidate(text,text);
drop function if exists public.read_avantiqo_local_learning_eval_candidate(text,text,integer);

create or replace function public.read_avantiqo_local_learning_eval_candidate(
  p_node_id text,
  p_node_token text,
  p_offset integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org_id uuid;
  v_org_count integer;
  v_offset integer := greatest(0, least(coalesce(p_offset, 0), 32));
  v_row public.intelligence_memories%rowtype;
begin
  if not public.avantiqo_local_node_authorized(p_node_id, p_node_token) then
    raise exception 'AVANTIQO_LOCAL_NODE_UNAUTHORIZED';
  end if;

  select count(distinct m.organization_id), min(m.organization_id::text)::uuid
  into v_org_count, v_org_id
  from public.intelligence_memories m
  where m.memory_scope = 'platform_learning_agenda'
    and m.active = true
    and m.forgotten_at is null
    and m.party_id is null
    and m.entity_id is null
    and m.conversation_id is null
    and m.source_turn_id is null;

  if v_org_count <> 1 or v_org_id is null then
    raise exception 'AVANTIQO_LOCAL_LEARNING_PLATFORM_ORG_INVALID';
  end if;

  select m.* into v_row
  from public.intelligence_memories m
  where m.organization_id = v_org_id
    and m.active = true
    and m.memory_scope = 'platform_learning_agenda'
    and m.party_id is null
    and m.entity_id is null
    and m.conversation_id is null
    and m.source_turn_id is null
    and m.forgotten_at is null
    and m.superseded_at is null
    and upper(coalesce(m.metadata ->> 'status', '')) in ('READY', 'ERROR')
    and (
      nullif(m.metadata ->> 'next_research_at', '') is null
      or (m.metadata ->> 'next_research_at')::timestamptz <= now()
    )
  order by
    case when upper(coalesce(m.metadata ->> 'status', '')) = 'READY' then 0 else 1 end,
    m.importance desc nulls last,
    coalesce((m.metadata ->> 'next_research_at')::timestamptz, m.updated_at) asc,
    m.updated_at asc
  offset v_offset
  limit 1;

  if v_row.id is null then
    return jsonb_build_object(
      'available', false,
      'contract', 'AVANTIQO_NODE01_LEARNING_EVAL_CANDIDATE_V1',
      'offset', v_offset
    );
  end if;

  return jsonb_build_object(
    'available', true,
    'contract', 'AVANTIQO_NODE01_LEARNING_EVAL_CANDIDATE_V1',
    'offset', v_offset,
    'agenda_id', v_row.id,
    'memory_key', v_row.memory_key,
    'subject', left(coalesce(v_row.subject, ''), 500),
    'importance', v_row.importance,
    'confidence', v_row.confidence,
    'topic_key', left(coalesce(v_row.metadata ->> 'topic_key', ''), 300),
    'knowledge_domain', left(coalesce(v_row.metadata ->> 'knowledge_domain', ''), 120),
    'jurisdiction', left(coalesce(v_row.metadata ->> 'jurisdiction', ''), 120),
    'freshness_days', case when coalesce(v_row.metadata ->> 'freshness_days', '') ~ '^[0-9]+$' then (v_row.metadata ->> 'freshness_days')::integer else null end,
    'source_count', case when coalesce(v_row.metadata ->> 'last_source_count', v_row.metadata ->> 'source_count', '') ~ '^[0-9]+$' then coalesce(v_row.metadata ->> 'last_source_count', v_row.metadata ->> 'source_count')::integer else 0 end,
    'claim_count', case when coalesce(v_row.metadata ->> 'last_claim_count', v_row.metadata ->> 'claim_count', '') ~ '^[0-9]+$' then coalesce(v_row.metadata ->> 'last_claim_count', v_row.metadata ->> 'claim_count')::integer else 0 end,
    'uncertainty_count', case when coalesce(v_row.metadata ->> 'last_uncertainty_count', v_row.metadata ->> 'uncertainty_count', '') ~ '^[0-9]+$' then coalesce(v_row.metadata ->> 'last_uncertainty_count', v_row.metadata ->> 'uncertainty_count')::integer else 0 end,
    'agenda_status', left(coalesce(v_row.metadata ->> 'status', ''), 40),
    'next_research_at', v_row.metadata ->> 'next_research_at',
    'failure_count', case
      when coalesce(v_row.metadata ->> 'failure_count', '') ~ '^[0-9]+$'
        then (v_row.metadata ->> 'failure_count')::integer
      else 0
    end,
    'customer_private_content_included', false,
    'mutation_authority', false,
    'promotion_authority', false
  );
end;
$$;

revoke all on function public.read_avantiqo_local_learning_eval_candidate(text,text,integer) from public;
grant execute on function public.read_avantiqo_local_learning_eval_candidate(text,text,integer)
  to anon, authenticated, service_role;

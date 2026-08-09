create or replace function public.commercial_loyalty_process_system_event(
  p_event_id uuid,
  p_actor_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_event public.system_events%rowtype;
  v_org uuid;
  v_party uuid;
  v_account public.customer_loyalty_accounts%rowtype;
  v_program public.commercial_loyalty_programs%rowtype;
  v_rule jsonb;
  v_rule_index integer := 0;
  v_mode text;
  v_points numeric;
  v_fixed_points numeric;
  v_amount numeric;
  v_unit_amount numeric;
  v_points_per_unit numeric;
  v_amount_field text;
  v_currency_field text;
  v_event_currency text;
  v_rule_currency text;
  v_rule_id text;
  v_result jsonb;
  v_source_document_id uuid;
  v_source_document_type text;
  v_matched boolean := false;
begin
  if p_event_id is null then
    raise exception 'event_id required';
  end if;

  select * into v_event
  from public.system_events
  where id = p_event_id;

  if not found then
    return jsonb_build_object('success',true,'awarded',false,'reason','EVENT_NOT_FOUND','event_id',p_event_id);
  end if;

  v_org := coalesce(v_event.organization_id,nullif(v_event.payload->>'organization_id','')::uuid);
  if v_org is null then
    return jsonb_build_object('success',true,'awarded',false,'reason','ORGANIZATION_MISSING','event_id',p_event_id,'event_type',v_event.type);
  end if;

  begin
    v_party := coalesce(nullif(v_event.payload->>'party_id','')::uuid,nullif(v_event.payload->>'customer_party_id','')::uuid);
  exception when invalid_text_representation then
    return jsonb_build_object('success',true,'awarded',false,'reason','PARTY_INVALID','event_id',p_event_id,'event_type',v_event.type);
  end;

  if v_party is null then
    return jsonb_build_object('success',true,'awarded',false,'reason','PARTY_MISSING','event_id',p_event_id,'event_type',v_event.type);
  end if;

  select * into v_account
  from public.customer_loyalty_accounts
  where organization_id=v_org and party_id=v_party and upper(coalesce(status,'ACTIVE'))='ACTIVE'
  limit 1;
  if not found then
    return jsonb_build_object('success',true,'awarded',false,'reason','LOYALTY_ACCOUNT_NOT_FOUND','event_id',p_event_id,'event_type',v_event.type,'party_id',v_party);
  end if;

  select * into v_program
  from public.commercial_loyalty_programs
  where id=v_account.program_id and organization_id=v_org and status='ACTIVE'
    and (starts_at is null or starts_at<=v_event.created_at)
    and (ends_at is null or ends_at>=v_event.created_at);
  if not found then
    return jsonb_build_object('success',true,'awarded',false,'reason','ACTIVE_PROGRAM_NOT_FOUND','event_id',p_event_id,'event_type',v_event.type,'party_id',v_party);
  end if;

  if jsonb_typeof(v_program.earning_policy->'event_rules') <> 'array' then
    return jsonb_build_object('success',true,'awarded',false,'reason','NO_EVENT_RULES_CONFIGURED','event_id',p_event_id,'event_type',v_event.type,'party_id',v_party,'program_id',v_program.id);
  end if;

  for v_rule in select value from jsonb_array_elements(v_program.earning_policy->'event_rules') loop
    v_rule_index := v_rule_index + 1;
    if upper(coalesce(v_rule->>'event_type','')) <> upper(coalesce(v_event.type,'')) then continue; end if;
    if coalesce((v_rule->>'enabled')::boolean,true) is not true then continue; end if;

    v_matched := true;
    v_mode := upper(coalesce(nullif(btrim(v_rule->>'mode'),''),'FIXED'));
    v_rule_id := coalesce(nullif(btrim(v_rule->>'id'),''),v_rule_index::text);
    v_points := null;

    if v_mode='FIXED' then
      begin v_fixed_points := (v_rule->>'points')::numeric;
      exception when others then
        return jsonb_build_object('success',false,'awarded',false,'reason','INVALID_FIXED_RULE','event_id',p_event_id,'program_id',v_program.id,'rule_id',v_rule_id);
      end;
      v_points := v_fixed_points;
    elsif v_mode='AMOUNT_RATE' then
      v_amount_field := coalesce(nullif(btrim(v_rule->>'amount_field'),''),'amount');
      v_currency_field := coalesce(nullif(btrim(v_rule->>'currency_field'),''),'currency_code');
      begin
        v_amount := nullif(v_event.payload->>v_amount_field,'')::numeric;
        v_unit_amount := nullif(v_rule->>'unit_amount','')::numeric;
        v_points_per_unit := nullif(v_rule->>'points_per_unit','')::numeric;
      exception when others then
        return jsonb_build_object('success',false,'awarded',false,'reason','INVALID_AMOUNT_RATE_RULE','event_id',p_event_id,'program_id',v_program.id,'rule_id',v_rule_id);
      end;
      if v_amount is null or v_unit_amount is null or v_points_per_unit is null or v_unit_amount<=0 then
        return jsonb_build_object('success',false,'awarded',false,'reason','INCOMPLETE_AMOUNT_RATE_RULE','event_id',p_event_id,'program_id',v_program.id,'rule_id',v_rule_id);
      end if;
      v_event_currency := upper(nullif(btrim(v_event.payload->>v_currency_field),''));
      v_rule_currency := upper(nullif(btrim(v_rule->>'currency_code'),''));
      if v_rule_currency is not null and v_event_currency is distinct from v_rule_currency then continue; end if;
      v_points := floor(v_amount/v_unit_amount)*v_points_per_unit;
    else
      return jsonb_build_object('success',false,'awarded',false,'reason','UNSUPPORTED_RULE_MODE','event_id',p_event_id,'program_id',v_program.id,'rule_id',v_rule_id,'mode',v_mode);
    end if;

    if v_points is null or v_points<=0 then
      return jsonb_build_object('success',true,'awarded',false,'reason','RULE_CALCULATED_ZERO_POINTS','event_id',p_event_id,'program_id',v_program.id,'rule_id',v_rule_id);
    end if;

    begin v_source_document_id := nullif(v_event.payload->>'source_document_id','')::uuid;
    exception when invalid_text_representation then v_source_document_id := null;
    end;
    v_source_document_type := coalesce(nullif(btrim(v_event.payload->>'source_document_type'),''),nullif(btrim(v_event.type),''));

    v_result := public.commercial_loyalty_apply_points_idempotent(
      v_org,v_party,v_points,'EARN',coalesce(nullif(btrim(v_rule->>'source_domain'),''),'SYSTEM_EVENT'),
      v_source_document_type,v_source_document_id,v_event.id,
      case when v_mode='AMOUNT_RATE' then v_amount else null end,
      case when v_mode='AMOUNT_RATE' then v_event_currency else null end,
      jsonb_build_object('event_type',v_event.type,'event_id',v_event.id,'rule_id',v_rule_id,'rule_mode',v_mode),
      p_actor_id,'loyalty-event:'||v_event.id::text||':rule:'||v_rule_id
    );

    return jsonb_build_object('success',true,'awarded',true,'event_id',v_event.id,'event_type',v_event.type,'party_id',v_party,'program_id',v_program.id,'rule_id',v_rule_id,'mode',v_mode,'points',v_points,'result',v_result);
  end loop;

  return jsonb_build_object('success',true,'awarded',false,'reason',case when v_matched then 'MATCHED_RULE_NOT_ELIGIBLE' else 'NO_MATCHING_EVENT_RULE' end,'event_id',p_event_id,'event_type',v_event.type,'party_id',v_party,'program_id',v_program.id);
end;
$$;

revoke all on function public.commercial_loyalty_process_system_event(uuid,uuid) from public,anon,authenticated;
grant execute on function public.commercial_loyalty_process_system_event(uuid,uuid) to service_role;

-- Keep node1's canonical text[] claim RPC unambiguous for PostgREST.
drop function if exists public.claim_avantiqo_local_compute_jobs(text,text,text,integer,integer);

-- The older Home owned-provider guard predates the certified local Qwen text lane.
-- Permit Qwen 4B only when the full node1/local-only production evidence is present.
create or replace function public.enforce_avantiqo_home_owned_pricing_certification_v1()
returns trigger
language plpgsql
as $$
declare
  md jsonb := coalesce(new.metadata,'{}'::jsonb);
  expected_model text;
  owner_restore boolean := coalesce((md->>'owner_restore_test_mode')::boolean,false);
  local_qwen boolean := new.provider='avantiqo-intelligence'
    and new.capability='ai.text.generate'
    and new.model='Qwen/Qwen3-4B-GGUF:Q4_K_M'
    and coalesce(md->>'infrastructure_provider','')='AVANTIQO_LOCAL_NODE_V1'
    and coalesce(md->>'lane_model_binding','')='OWNED_INTELLIGENCE_LOCAL_QWEN4B_V1'
    and lower(coalesce(md->>'external_fallback_allowed','true'))='false';
  missing text[] := array[]::text[];
begin
  if new.active is not true then return new; end if;
  if local_qwen then
    if upper(coalesce(md->>'pricing_status',''))<>'PRODUCTION_CERTIFIED' then missing:=array_append(missing,'pricing_status'); end if;
    if lower(coalesce(md->>'owned_inference','false'))<>'true' then missing:=array_append(missing,'owned_inference'); end if;
    if lower(coalesce(md->>'benchmark_certified','false'))<>'true' then missing:=array_append(missing,'benchmark_certified'); end if;
    if lower(coalesce(md->>'economics_certified','false'))<>'true' then missing:=array_append(missing,'economics_certified'); end if;
    if lower(coalesce(md->>'model_license_verified','false'))<>'true' then missing:=array_append(missing,'model_license_verified'); end if;
    if lower(coalesce(md->>'runtime_compatible','false'))<>'true' then missing:=array_append(missing,'runtime_compatible'); end if;
    if lower(coalesce(md->>'recalibration_required','true'))<>'false' then missing:=array_append(missing,'recalibration_clear'); end if;
    if lower(coalesce(md->>'production_routing_allowed','false'))<>'true' then missing:=array_append(missing,'production_routing_allowed'); end if;
    if lower(coalesce(md->>'production_certified','false'))<>'true' then missing:=array_append(missing,'production_certified'); end if;
    if coalesce((md->>'local_context_tokens')::integer,0) < 20000 then missing:=array_append(missing,'local_context_tokens'); end if;
    if cardinality(missing)>0 then
      raise exception 'AVANTIQO_HOME_OWNED_LOCAL_QWEN_CERTIFICATION_REQUIRED:%',array_to_string(missing,',') using errcode='23514';
    end if;
    return new;
  end if;

  if new.provider='avantiqo-intelligence' and new.capability='ai.text.generate' then expected_model:='Qwen/Qwen3-30B-A3B-Instruct-2507';
  elsif new.provider='avantiqo-intelligence' and new.capability='ai.reasoning.execute' then expected_model:='Qwen/Qwen3-30B-A3B-Thinking-2507';
  elsif new.provider='avantiqo-voice' and new.capability='ai.speech.to.text' then expected_model:='openai/whisper-large-v3-turbo';
  elsif new.provider='avantiqo-voice' and new.capability='ai.text.to.speech' then expected_model:='resemble-ai/chatterbox:multilingual-v3';
  else return new; end if;
  if new.provider='avantiqo-intelligence' and owner_restore then
    if new.model is distinct from expected_model then missing:=array_append(missing,'exact_model_binding'); end if;
    if upper(coalesce(md->>'pricing_status',''))<>'PRODUCTION_CERTIFIED' then missing:=array_append(missing,'pricing_status'); end if;
    if upper(coalesce(md->>'owner_restore_scope',''))<>'FAST_AND_DEEP' then missing:=array_append(missing,'owner_restore_scope'); end if;
    if lower(coalesce(md->>'owned_inference','false'))<>'true' then missing:=array_append(missing,'owned_inference'); end if;
    if lower(coalesce(md->>'runtime_compatible','false'))<>'true' then missing:=array_append(missing,'runtime_compatible'); end if;
    if lower(coalesce(md->>'model_license_verified','false'))<>'true' then missing:=array_append(missing,'model_license_verified'); end if;
    if lower(coalesce(md->>'production_routing_allowed','false'))<>'true' then missing:=array_append(missing,'routing'); end if;
    if lower(coalesce(md->>'external_fallback_allowed','true'))<>'false' then missing:=array_append(missing,'fallback'); end if;
    if lower(coalesce(md->>'production_certified','true'))<>'false' then missing:=array_append(missing,'production_certified_must_be_false'); end if;
    if lower(coalesce(md->>'benchmark_certified','false'))<>'true' then missing:=array_append(missing,'benchmark_gate'); end if;
    if lower(coalesce(md->>'economics_certified','false'))<>'true' then missing:=array_append(missing,'economics_gate'); end if;
    if lower(coalesce(md->>'recalibration_required','true'))<>'false' then missing:=array_append(missing,'recalibration_gate'); end if;
    if cardinality(missing)>0 then
      raise exception 'AVANTIQO_HOME_OWNED_PRICING_OWNER_RESTORE_INVALID:%',array_to_string(missing,',') using errcode='23514';
    end if;
    return new;
  end if;

  if new.model is distinct from expected_model then missing:=array_append(missing,'exact_model_binding'); end if;
  if upper(coalesce(md->>'pricing_status',''))<>'PRODUCTION_CERTIFIED' then missing:=array_append(missing,'pricing_status'); end if;
  if lower(coalesce(md->>'owned_inference','false'))<>'true' then missing:=array_append(missing,'owned_inference'); end if;
  if lower(coalesce(md->>'benchmark_certified','false'))<>'true' then missing:=array_append(missing,'benchmark_certified'); end if;
  if lower(coalesce(md->>'economics_certified','false'))<>'true' then missing:=array_append(missing,'economics_certified'); end if;
  if lower(coalesce(md->>'model_license_verified','false'))<>'true' then missing:=array_append(missing,'model_license_verified'); end if;
  if lower(coalesce(md->>'runtime_compatible','false'))<>'true' then missing:=array_append(missing,'runtime_compatible'); end if;
  if lower(coalesce(md->>'recalibration_required','true'))<>'false' then missing:=array_append(missing,'recalibration_clear'); end if;
  if lower(coalesce(md->>'production_routing_allowed','false'))<>'true' then missing:=array_append(missing,'production_routing_allowed'); end if;
  if lower(coalesce(md->>'external_fallback_allowed','true'))<>'false' then missing:=array_append(missing,'external_fallback_forbidden'); end if;
  if lower(coalesce(md->>'production_certified','false'))<>'true' then missing:=array_append(missing,'production_certified'); end if;
  if cardinality(missing)>0 then
    raise exception 'AVANTIQO_HOME_OWNED_PRICING_CERTIFICATION_REQUIRED:%',array_to_string(missing,',') using errcode='23514';
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';

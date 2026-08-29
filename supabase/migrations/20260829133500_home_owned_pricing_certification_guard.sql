-- Prevent Home Voice/Intelligence pricing from ever becoming active with
-- incomplete owned-provider certification metadata.

create or replace function public.enforce_avantiqo_home_owned_pricing_certification_v1()
returns trigger
language plpgsql
as $$
declare
  md jsonb := coalesce(new.metadata, '{}'::jsonb);
  expected_model text;
  missing_checks text[] := array[]::text[];
begin
  if new.active is not true then return new; end if;
  if new.provider = 'avantiqo-intelligence' and new.capability = 'ai.text.generate' then expected_model := 'Qwen/Qwen3-30B-A3B-Instruct-2507';
  elsif new.provider = 'avantiqo-intelligence' and new.capability = 'ai.reasoning.execute' then expected_model := 'Qwen/Qwen3-30B-A3B-Thinking-2507';
  elsif new.provider = 'avantiqo-voice' and new.capability = 'ai.speech.to.text' then expected_model := 'openai/whisper-large-v3-turbo';
  elsif new.provider = 'avantiqo-voice' and new.capability = 'ai.text.to.speech' then expected_model := 'resemble-ai/chatterbox:multilingual-v3';
  else return new; end if;
  if coalesce(new.model, '') <> expected_model then missing_checks := array_append(missing_checks, 'exact_model_binding'); end if;
  if upper(coalesce(md->>'pricing_status', '')) <> 'PRODUCTION_CERTIFIED' then missing_checks := array_append(missing_checks, 'pricing_status'); end if;
  if lower(coalesce(md->>'owned_inference', 'false')) <> 'true' then missing_checks := array_append(missing_checks, 'owned_inference'); end if;
  if lower(coalesce(md->>'benchmark_certified', 'false')) <> 'true' then missing_checks := array_append(missing_checks, 'benchmark_certified'); end if;
  if lower(coalesce(md->>'economics_certified', 'false')) <> 'true' then missing_checks := array_append(missing_checks, 'economics_certified'); end if;
  if lower(coalesce(md->>'model_license_verified', 'false')) <> 'true' then missing_checks := array_append(missing_checks, 'model_license_verified'); end if;
  if lower(coalesce(md->>'runtime_compatible', 'false')) <> 'true' then missing_checks := array_append(missing_checks, 'runtime_compatible'); end if;
  if lower(coalesce(md->>'recalibration_required', 'true')) <> 'false' then missing_checks := array_append(missing_checks, 'recalibration_clear'); end if;
  if lower(coalesce(md->>'production_routing_allowed', 'false')) <> 'true' then missing_checks := array_append(missing_checks, 'production_routing_allowed'); end if;
  if lower(coalesce(md->>'external_fallback_allowed', 'true')) <> 'false' then missing_checks := array_append(missing_checks, 'external_fallback_forbidden'); end if;
  if lower(coalesce(md->>'production_certified', 'false')) <> 'true' then missing_checks := array_append(missing_checks, 'production_certified'); end if;
  if cardinality(missing_checks) > 0 then
    raise exception 'AVANTIQO_HOME_OWNED_PRICING_CERTIFICATION_REQUIRED:%:%:%', new.provider, new.capability, array_to_string(missing_checks, ',') using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_avantiqo_home_owned_pricing_certification_v1 on public.provider_pricing;
create trigger trg_enforce_avantiqo_home_owned_pricing_certification_v1
before insert or update of active, provider, capability, model, metadata on public.provider_pricing
for each row execute function public.enforce_avantiqo_home_owned_pricing_certification_v1();

do $$
declare invalid_count integer;
begin
  select count(*) into invalid_count
  from public.provider_pricing p
  where p.active is true
    and ((p.provider = 'avantiqo-intelligence' and p.capability in ('ai.text.generate','ai.reasoning.execute')) or (p.provider = 'avantiqo-voice' and p.capability in ('ai.speech.to.text','ai.text.to.speech')))
    and (coalesce(p.metadata->>'pricing_status','') <> 'PRODUCTION_CERTIFIED' or lower(coalesce(p.metadata->>'owned_inference','false')) <> 'true' or lower(coalesce(p.metadata->>'benchmark_certified','false')) <> 'true' or lower(coalesce(p.metadata->>'economics_certified','false')) <> 'true' or lower(coalesce(p.metadata->>'model_license_verified','false')) <> 'true' or lower(coalesce(p.metadata->>'runtime_compatible','false')) <> 'true' or lower(coalesce(p.metadata->>'recalibration_required','true')) <> 'false' or lower(coalesce(p.metadata->>'production_routing_allowed','false')) <> 'true' or lower(coalesce(p.metadata->>'external_fallback_allowed','true')) <> 'false' or lower(coalesce(p.metadata->>'production_certified','false')) <> 'true');
  if invalid_count <> 0 then raise exception 'AVANTIQO_HOME_OWNED_PRICING_EXISTING_ACTIVE_ROWS_INVALID:%', invalid_count; end if;
end;
$$;

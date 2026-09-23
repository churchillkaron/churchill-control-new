begin;

alter function public.enforce_avantiqo_voice_owned_provider_pricing()
  set search_path = public, pg_temp;

alter function public.enforce_avantiqo_home_owned_pricing_certification_v1()
  set search_path = public, pg_temp;

alter function public.enforce_avantiqo_intelligence_owned_provider_pricing()
  set search_path = public, pg_temp;

alter function public.enforce_avantiqo_intelligence_active_requires_production_certif()
  set search_path = public, pg_temp;

alter function public.settle_modal_compute_actual_cost(
  uuid, uuid, uuid, text, text, numeric, numeric, numeric, numeric, uuid, text, numeric, jsonb
)
  set search_path = public, pg_temp;

revoke execute on function public.can_read_organization_payroll(uuid) from anon;
revoke execute on function public.current_staff_account_id() from anon;

commit;

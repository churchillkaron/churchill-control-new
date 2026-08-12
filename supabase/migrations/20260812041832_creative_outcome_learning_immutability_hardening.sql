revoke update, delete, truncate on public.creative_outcome_observations from service_role;
revoke references, trigger on public.creative_outcome_observations from service_role;
grant select, insert on public.creative_outcome_observations to service_role;

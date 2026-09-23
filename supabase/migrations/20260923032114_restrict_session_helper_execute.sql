begin;

revoke execute on function public.can_read_organization_payroll(uuid) from public, anon;
grant execute on function public.can_read_organization_payroll(uuid) to authenticated, service_role;

revoke execute on function public.current_staff_account_id() from public, anon;
grant execute on function public.current_staff_account_id() to authenticated, service_role;

commit;

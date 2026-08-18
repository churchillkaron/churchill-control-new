-- P0 security convergence: authorization helpers are policy primitives for
-- authenticated organization members. They must not be directly executable by
-- anonymous/public database roles.

begin;

revoke execute on function public.same_organization(uuid) from public, anon;
revoke execute on function public.can_manage_organization(uuid) from public, anon;

grant execute on function public.same_organization(uuid) to authenticated, service_role;
grant execute on function public.can_manage_organization(uuid) to authenticated, service_role;

commit;

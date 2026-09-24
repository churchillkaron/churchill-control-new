begin;

revoke all on table public.supplier_portal_invitations from anon, authenticated;
revoke all on table public.supplier_portal_access from anon, authenticated;
revoke all on table public.developer_portal_invitations from anon, authenticated;
revoke all on table public.developer_portal_access from anon, authenticated;
revoke all on table public.organization_client_invitations from anon, authenticated;

grant select, insert, update, delete on table public.supplier_portal_invitations to service_role;
grant select, insert, update, delete on table public.supplier_portal_access to service_role;
grant select, insert, update, delete on table public.developer_portal_invitations to service_role;
grant select, insert, update, delete on table public.developer_portal_access to service_role;
grant select, insert, update, delete on table public.organization_client_invitations to service_role;

commit;

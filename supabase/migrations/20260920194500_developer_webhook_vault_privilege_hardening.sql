begin;

revoke all on function public.provision_developer_webhook_secret(uuid,uuid,text) from public;
revoke all on function public.provision_developer_webhook_secret(uuid,uuid,text) from anon;
revoke all on function public.provision_developer_webhook_secret(uuid,uuid,text) from authenticated;
grant execute on function public.provision_developer_webhook_secret(uuid,uuid,text) to service_role;

revoke all on function public.read_developer_webhook_secret(uuid,uuid) from public;
revoke all on function public.read_developer_webhook_secret(uuid,uuid) from anon;
revoke all on function public.read_developer_webhook_secret(uuid,uuid) from authenticated;
grant execute on function public.read_developer_webhook_secret(uuid,uuid) to service_role;

comment on function public.provision_developer_webhook_secret(uuid,uuid,text)
is 'Service-role-only Avantiqo developer webhook Vault provisioning boundary.';
comment on function public.read_developer_webhook_secret(uuid,uuid)
is 'Service-role-only Avantiqo developer webhook signing-secret broker. Never expose through client RPC.';

commit;

begin;

update public.staff_accounts
set party_id = '9d3ef9bc-5f10-4684-a2b4-f51ad995631c'::uuid
where id = '195662f5-496d-4a34-b49e-ce7c5bb31824'::uuid
  and auth_user_id = '195662f5-496d-4a34-b49e-ce7c5bb31824'::uuid
  and active = true
  and party_id is null
  and exists (
    select 1
    from public.parties p
    where p.id = '9d3ef9bc-5f10-4684-a2b4-f51ad995631c'::uuid
      and p.organization_id = '33336a72-acb5-474e-856b-8be0269360e2'::uuid
      and p.status = 'active'
      and lower(coalesce(p.email, '')) = 'patric@pcsphuket.com'
  );

commit;

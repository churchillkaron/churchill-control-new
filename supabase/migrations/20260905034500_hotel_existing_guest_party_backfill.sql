do $$
declare
  v_guest record;
  v_party_id uuid;
begin
  for v_guest in
    select id, organization_id, full_name, email, phone
    from public.hotel_guests
    where party_id is null
    order by created_at, id
  loop
    insert into public.parties (
      organization_id, party_type, display_name, email, phone, status, legal_name
    ) values (
      v_guest.organization_id,
      'person',
      coalesce(nullif(btrim(v_guest.full_name),''), 'Hotel guest'),
      nullif(btrim(v_guest.email),''),
      nullif(btrim(v_guest.phone),''),
      'active',
      coalesce(nullif(btrim(v_guest.full_name),''), 'Hotel guest')
    ) returning id into v_party_id;

    update public.hotel_guests
    set party_id = v_party_id
    where id = v_guest.id
      and organization_id = v_guest.organization_id
      and party_id is null;
  end loop;
end;
$$;

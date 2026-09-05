create or replace function public.hotel_create_guest_with_party(
  p_organization_id uuid,
  p_full_name text,
  p_email text default null,
  p_phone text default null,
  p_nationality text default null,
  p_document_type text default null,
  p_document_number text default null,
  p_notes text default null
) returns public.hotel_guests
language plpgsql
set search_path to 'public','pg_temp'
as $$
declare
  v_party public.parties%rowtype;
  v_guest public.hotel_guests%rowtype;
begin
  if p_organization_id is null or nullif(btrim(p_full_name),'') is null then
    raise exception 'HOTEL_GUEST: organization and full name required';
  end if;

  insert into public.parties (
    organization_id, party_type, display_name, email, phone, status, legal_name
  ) values (
    p_organization_id, 'person', btrim(p_full_name), nullif(btrim(p_email),''),
    nullif(btrim(p_phone),''), 'active', btrim(p_full_name)
  ) returning * into v_party;

  insert into public.hotel_guests (
    organization_id, party_id, full_name, email, phone, nationality,
    document_type, document_number, notes
  ) values (
    p_organization_id, v_party.id, btrim(p_full_name), nullif(btrim(p_email),''),
    nullif(btrim(p_phone),''), nullif(btrim(p_nationality),''),
    nullif(btrim(p_document_type),''), nullif(btrim(p_document_number),''),
    nullif(btrim(p_notes),'')
  ) returning * into v_guest;

  return v_guest;
end;
$$;

revoke all on function public.hotel_create_guest_with_party(uuid,text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.hotel_create_guest_with_party(uuid,text,text,text,text,text,text,text) to service_role;

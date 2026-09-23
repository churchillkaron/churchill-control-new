begin;

alter policy staff_accounts_read
on public.staff_accounts
using (
  auth_user_id = (select auth.uid())
  or public.can_manage_organization(active_organization_id)
);

alter policy hotel_booking_reinstatements_org_read
on public.hotel_booking_reinstatements
using (
  exists (
    select 1
    from public.organization_users ou
    join public.staff_accounts sa on sa.id = ou.staff_account_id
    where ou.organization_id = hotel_booking_reinstatements.organization_id
      and upper(coalesce(ou.status, 'ACTIVE')) = 'ACTIVE'
      and coalesce(sa.auth_user_id, sa.user_id) = (select auth.uid())
      and coalesce(sa.active, true) = true
  )
);

alter policy hotel_shift_handover_context_org_read
on public.hotel_shift_handover_context
using (
  exists (
    select 1
    from public.organization_users ou
    join public.staff_accounts sa on sa.id = ou.staff_account_id
    where ou.organization_id = hotel_shift_handover_context.organization_id
      and upper(coalesce(ou.status, 'ACTIVE')) = 'ACTIVE'
      and coalesce(sa.auth_user_id, sa.user_id) = (select auth.uid())
      and coalesce(sa.active, true) = true
  )
);

commit;

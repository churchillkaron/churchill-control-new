-- Harden the server-only at-most-once Operator dispatch journal.
-- Supabase default privileges can grant service_role broader table rights than
-- this journal requires. Remove destructive/DDL-adjacent privileges and then
-- grant only the exact runtime contract used by OperatorMissionDispatchRuntime.

revoke all on table public.operator_mission_dispatches from anon, authenticated, service_role;
grant select, insert, update on table public.operator_mission_dispatches to service_role;

comment on table public.operator_mission_dispatches is
  'Server-only at-most-once dispatch journal for Avantiqo Operator mission mutations. service_role is limited to SELECT, INSERT, and UPDATE; claimed dispatches are never deleted or automatically replayed.';

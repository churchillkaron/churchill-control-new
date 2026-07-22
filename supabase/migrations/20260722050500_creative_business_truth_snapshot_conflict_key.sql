begin;

alter table public.creative_business_truth_snapshots
  drop constraint if exists creative_business_truth_snapshot_conflict_key;

alter table public.creative_business_truth_snapshots
  add constraint creative_business_truth_snapshot_conflict_key
  unique (
    organization_id,
    payload_hash,
    creative_mission_id,
    creative_project_id
  );

commit;

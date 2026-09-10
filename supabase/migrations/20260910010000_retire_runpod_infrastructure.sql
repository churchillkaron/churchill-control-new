-- Retire obsolete provider-specific RunPod infrastructure after Modal convergence.
begin;

alter table if exists public.avantiqo_voice_async_jobs
  drop column if exists lease_id;

drop function if exists public.acquire_avantiqo_voice_runpod_lease_v2(uuid, text, text, text, uuid, integer);
drop function if exists public.refresh_avantiqo_voice_runpod_lease_v2(uuid, uuid, integer);
drop function if exists public.release_avantiqo_voice_runpod_lease_v2(uuid, uuid, text, text);
drop table if exists public.avantiqo_voice_runpod_leases cascade;

drop function if exists public.acquire_avantiqo_video_runpod_lease_v2(uuid, text, text, text, uuid, integer);
drop function if exists public.refresh_avantiqo_video_runpod_lease_v2(uuid, uuid, integer);
drop function if exists public.release_avantiqo_video_runpod_lease_v2(uuid, uuid, text, text);
drop table if exists public.avantiqo_video_runpod_leases cascade;

drop trigger if exists avantiqo_intelligence_runpod_lease_provenance_guard on public.intelligence_memories;
drop function if exists public.avantiqo_enforce_intelligence_runpod_lease_provenance();
drop function if exists public.acquire_avantiqo_intelligence_runpod_lease_v1(uuid, text, text, uuid, integer);
drop function if exists public.refresh_avantiqo_intelligence_runpod_lease_v1(uuid, uuid, integer);
drop function if exists public.release_avantiqo_intelligence_runpod_lease_v1(uuid, uuid, text, text);
drop function if exists public.acquire_avantiqo_intelligence_runpod_lease_v2(uuid, text, text, text, uuid, integer);
drop function if exists public.refresh_avantiqo_intelligence_runpod_lease_v2(uuid, uuid, integer);
drop function if exists public.release_avantiqo_intelligence_runpod_lease_v2(uuid, uuid, text, text);
drop table if exists public.avantiqo_intelligence_runpod_leases cascade;

commit;

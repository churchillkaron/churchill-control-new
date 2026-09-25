-- Reconcile the live front-lane reservation with the repository Code scheduler and
-- give fresh interactive Code workers first access to the shared GPU at job boundaries.
-- Running exclusive media is never preempted. Strong Code stays queued while media
-- already owns the GPU; lightweight Code may still use its deterministic CPU fallback.
create or replace function public.claim_avantiqo_local_compute_jobs(
  p_node_id text,
  p_node_token text,
  p_capabilities text[],
  p_limit integer default 1,
  p_lease_seconds integer default 300
)
returns setof public.avantiqo_local_compute_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 1), 4));
  v_lease integer := greatest(30, least(coalesce(p_lease_seconds, 300), 900));
  v_registered_capabilities text[];
  v_metadata jsonb := '{}'::jsonb;
  v_code_lane_active boolean := false;
  v_code_lane_fresh boolean := false;
  v_code_claim boolean := false;
  v_live_claimer boolean := false;
begin
  if not public.avantiqo_local_node_authorized(p_node_id, p_node_token) then
    raise exception 'AVANTIQO_LOCAL_NODE_UNAUTHORIZED';
  end if;

  -- One physical node makes one claim decision at a time. The lock is transaction
  -- scoped and is never held while inference or media generation is running.
  perform pg_advisory_xact_lock(hashtextextended('avantiqo-local-claim:' || btrim(p_node_id), 0));

  select capabilities, coalesce(metadata, '{}'::jsonb)
    into v_registered_capabilities, v_metadata
  from public.avantiqo_local_compute_nodes
  where id = btrim(p_node_id) and enabled = true;

  v_code_lane_active :=
    coalesce(v_metadata->'scheduler'->'active_lanes', '[]'::jsonb) ? 'code'
    or coalesce(v_metadata->'worker_lanes', '[]'::jsonb) ? 'code';

  begin
    v_code_lane_fresh :=
      v_code_lane_active
      and nullif(v_metadata#>>'{lane_attestations,code,observed_at}', '') is not null
      and (v_metadata#>>'{lane_attestations,code,observed_at}')::timestamptz >= now() - interval '90 seconds';
  exception when others then
    -- Malformed telemetry must never block the shared GPU indefinitely.
    v_code_lane_fresh := false;
  end;

  v_code_claim :=
    coalesce(p_capabilities, '{}'::text[]) && array[
      'ai.code.generate','ai.code.edit','ai.code.refactor','ai.code.review','ai.code.debug',
      'ai.code.test','ai.web.build','ai.web.repair','ai.app.build','ai.integration.build'
    ]::text[]
    and not (
      coalesce(p_capabilities, '{}'::text[]) && array[
        'ai.text.generate','ai.reasoning.execute','ai.image.analyze','ai.image.generate',
        'document.ocr','document.classify','creative.materials.estimate','ai.speech.to.text',
        'ai.image.upscale','ai.audio.stems','ai.audio.vocal-correct','ai.text.to.speech',
        'ai.audio.elastic-warp','media.ffmpeg.process','ai.music.generate','ai.sfx.generate',
        'ai.model.train','ai.code.live-conversation'
      ]::text[]
    );

  -- Preserve the live Business Partner front-lane reservation. A dedicated live/front
  -- worker can claim ai.text.generate/front even when that exact capability is not in
  -- the caller's reduced capability list.
  v_live_claimer :=
    coalesce(p_capabilities, '{}'::text[]) && array[
      'ai.code.live-conversation',
      'ai.text.generate',
      'ai.code.debug'
    ]::text[];

  if v_code_claim then
    v_limit := 1;
  end if;

  update public.avantiqo_local_compute_nodes
  set last_seen_at = now(), updated_at = now()
  where id = btrim(p_node_id);

  return query
  with requested as (
    select unnest(coalesce(p_capabilities, '{}'::text[])) as capability
  ), allowed as (
    select r.capability
    from requested r
    where r.capability = any(coalesce(v_registered_capabilities, '{}'::text[]))
  ), candidates as (
    select j.id
    from public.avantiqo_local_compute_jobs j
    where (
      (j.status = 'QUEUED' and j.available_at <= now())
      or (
        j.status = 'RUNNING'
        and j.leased_until is not null
        and j.leased_until <= now()
        and j.attempts < j.max_attempts
      )
    )
      and (
        (j.lane = 'front' and j.capability = 'ai.text.generate' and v_live_claimer)
        or (
          not (j.lane = 'front' and j.capability = 'ai.text.generate')
          and j.capability in (select capability from allowed)
        )
      )
      -- When a fresh dedicated Code worker has executable work waiting, the shared GPU worker
      -- yields only fast/deep Intelligence text at the claim boundary. Front/live conversation
      -- remains available through the dedicated live worker, and media capabilities are untouched.
      and not (
        j.workload = 'intelligence_text'
        and j.lane in ('fast','deep')
        and not v_code_claim
        and v_code_lane_fresh
        and exists (
          select 1
          from public.avantiqo_local_compute_jobs waiting_code
          where waiting_code.workload = 'code_text'
            and (
              (waiting_code.status = 'QUEUED' and waiting_code.available_at <= now())
              or (
                waiting_code.status = 'RUNNING'
                and waiting_code.leased_until is not null
                and waiting_code.leased_until <= now()
                and waiting_code.attempts < waiting_code.max_attempts
              )
            )
        )
      )
      -- Code stays single-flight on one physical node.
      and not (
        j.workload = 'code_text'
        and exists (
          select 1
          from public.avantiqo_local_compute_jobs active
          where active.node_id = btrim(p_node_id)
            and active.status = 'RUNNING'
            and active.leased_until > now()
            and active.workload = 'code_text'
        )
      )
      -- Strong mutation/review Code cannot make progress without the GPU. Leave it
      -- queued while exclusive media already owns the GPU instead of claiming it and
      -- failing after the worker's bounded headroom wait.
      and not (
        j.workload = 'code_text'
        and lower(coalesce(j.payload->>'strong_model_required', 'false')) in ('true','1','yes','on')
        and exists (
          select 1
          from public.avantiqo_local_compute_jobs active
          where active.node_id = btrim(p_node_id)
            and active.status = 'RUNNING'
            and active.leased_until > now()
            and active.workload in (
              'document_vision','voice_stt','image_generate','video_ltx25','image_upscale',
              'music_separator','music_vocal_correction','voice_tts','model_training'
            )
        )
      )
      -- Legacy nodes without a dedicated Code lane still fail closed against any
      -- Code/media GPU overlap.
      and not (
        j.workload = 'code_text'
        and not v_code_lane_active
        and exists (
          select 1
          from public.avantiqo_local_compute_jobs active
          where active.node_id = btrim(p_node_id)
            and active.status = 'RUNNING'
            and active.leased_until > now()
            and active.workload in (
              'document_vision','voice_stt','image_generate','video_ltx25','image_upscale',
              'music_separator','music_vocal_correction','voice_tts','model_training'
            )
        )
      )
      -- Exclusive media does not start while strong Code owns the GPU. Lightweight
      -- Code is CPU-fallback eligible and therefore does not hold media hostage.
      and not (
        j.workload in (
          'document_vision','voice_stt','image_generate','video_ltx25','image_upscale',
          'music_separator','music_vocal_correction','voice_tts','model_training'
        )
        and exists (
          select 1
          from public.avantiqo_local_compute_jobs active
          where active.node_id = btrim(p_node_id)
            and active.status = 'RUNNING'
            and active.leased_until > now()
            and active.workload = 'code_text'
            and lower(coalesce(active.payload->>'strong_model_required', 'true')) in ('true','1','yes','on')
        )
      )
      -- At a free job boundary, higher-priority queued Code gets first access to the
      -- shared GPU, but only while the dedicated Code worker has a fresh heartbeat.
      -- This never kills/preempts running media and cannot starve media if Code dies.
      and not (
        j.workload in (
          'document_vision','voice_stt','image_generate','video_ltx25','image_upscale',
          'music_separator','music_vocal_correction','voice_tts','model_training'
        )
        and v_code_lane_fresh
        and exists (
          select 1
          from public.avantiqo_local_compute_jobs waiting_code
          where waiting_code.workload = 'code_text'
            and waiting_code.priority >= j.priority
            and (
              (waiting_code.status = 'QUEUED' and waiting_code.available_at <= now())
              or (
                waiting_code.status = 'RUNNING'
                and waiting_code.leased_until is not null
                and waiting_code.leased_until <= now()
                and waiting_code.attempts < waiting_code.max_attempts
              )
            )
        )
      )
    order by j.priority desc, j.created_at asc
    for update skip locked
    limit v_limit
  )
  update public.avantiqo_local_compute_jobs j
  set status = 'RUNNING',
      node_id = btrim(p_node_id),
      attempts = j.attempts + 1,
      started_at = coalesce(j.started_at, now()),
      leased_until = now() + make_interval(secs => v_lease),
      updated_at = now(),
      error_code = null
  from candidates c
  where j.id = c.id
  returning j.*;
end;
$$;

revoke all on function public.claim_avantiqo_local_compute_jobs(text,text,text[],integer,integer) from public;
grant execute on function public.claim_avantiqo_local_compute_jobs(text,text,text[],integer,integer) to anon, authenticated, service_role;

comment on function public.claim_avantiqo_local_compute_jobs(text,text,text[],integer,integer)
  is 'Claims authenticated local compute with live front-lane reservation, Code single-flight, strong-Code/media coexistence, fresh-Code media priority, and deep-text yield while executable Code is waiting.';

notify pgrst, 'reload schema';

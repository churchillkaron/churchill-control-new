BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO service_role;

CREATE TABLE IF NOT EXISTS private.creative_direction_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  creative_project_id uuid NOT NULL,
  plan_fingerprint text NOT NULL,
  instruction text,
  revision_scope text[] NOT NULL DEFAULT '{}'::text[],
  shot_ids uuid[] NOT NULL,
  before_state jsonb NOT NULL,
  after_state jsonb NOT NULL,
  restored_state jsonb,
  status text NOT NULL DEFAULT 'APPLIED'
    CHECK (status IN ('APPLIED', 'RESTORED', 'SUPERSEDED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  restored_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE private.creative_direction_checkpoints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.creative_direction_checkpoints FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE private.creative_direction_checkpoints TO service_role;

CREATE INDEX IF NOT EXISTS creative_direction_checkpoints_project_created_idx
ON private.creative_direction_checkpoints (
  organization_id,
  creative_project_id,
  created_at DESC
);

CREATE OR REPLACE FUNCTION public.creative_apply_shot_set_revision_atomic(
  p_organization_id uuid,
  p_creative_project_id uuid,
  p_plan_fingerprint text,
  p_instruction text,
  p_revision_scope text[],
  p_changes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_scope text[];
  v_ids uuid[];
  v_change jsonb;
  v_patch jsonb;
  v_shot public.creative_shots%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
  v_checkpoint_id uuid;
  v_expected_revision integer;
  v_current_revision integer;
  v_expected_updated_at timestamptz;
  v_reason text;
  v_metadata jsonb;
  v_history jsonb;
  v_entry jsonb;
  v_touched jsonb;
  v_now timestamptz := clock_timestamp();
  v_count integer;
  v_unique_count integer;
BEGIN
  IF p_organization_id IS NULL THEN RAISE EXCEPTION 'organization_id required'; END IF;
  IF p_creative_project_id IS NULL THEN RAISE EXCEPTION 'creative_project_id required'; END IF;
  IF NULLIF(BTRIM(COALESCE(p_plan_fingerprint, '')), '') IS NULL THEN RAISE EXCEPTION 'plan_fingerprint required'; END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array' THEN RAISE EXCEPTION 'changes must be a JSON array'; END IF;
  IF jsonb_array_length(p_changes) < 1 OR jsonb_array_length(p_changes) > 24 THEN RAISE EXCEPTION 'changes must contain 1..24 shots'; END IF;

  SELECT array_agg(DISTINCT lower(btrim(value)) ORDER BY lower(btrim(value)))
    INTO v_scope
  FROM unnest(COALESCE(p_revision_scope, '{}'::text[])) AS source(value)
  WHERE NULLIF(btrim(value), '') IS NOT NULL;

  IF v_scope IS NULL OR cardinality(v_scope) = 0 THEN RAISE EXCEPTION 'revision_scope required'; END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_scope) AS scope(value)
    WHERE value NOT IN ('camera','coverage','continuity','performance','edit')
  ) THEN RAISE EXCEPTION 'invalid revision scope'; END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' || p_creative_project_id::text,
      0
    )
  );

  SELECT
    array_agg((item->>'shot_id')::uuid ORDER BY (item->>'shot_id')::uuid),
    count(DISTINCT item->>'shot_id')
  INTO v_ids, v_unique_count
  FROM jsonb_array_elements(p_changes) AS source(item);

  IF v_ids IS NULL
     OR cardinality(v_ids) <> jsonb_array_length(p_changes)
     OR v_unique_count <> jsonb_array_length(p_changes)
  THEN
    RAISE EXCEPTION 'shot_ids must be present, valid and unique';
  END IF;

  PERFORM 1
  FROM public.creative_shots AS shot
  WHERE shot.organization_id = p_organization_id
    AND shot.creative_project_id = p_creative_project_id
    AND shot.archived_at IS NULL
    AND shot.id = ANY(v_ids)
  ORDER BY shot.id
  FOR UPDATE;

  SELECT count(*) INTO v_count
  FROM public.creative_shots AS shot
  WHERE shot.organization_id = p_organization_id
    AND shot.creative_project_id = p_creative_project_id
    AND shot.archived_at IS NULL
    AND shot.id = ANY(v_ids);

  IF v_count <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'one or more shots are missing from the verified project';
  END IF;

  SELECT jsonb_agg(to_jsonb(shot) ORDER BY shot.scene_number NULLS LAST, shot.shot_number NULLS LAST, shot.id)
    INTO v_before
  FROM public.creative_shots AS shot
  WHERE shot.organization_id = p_organization_id
    AND shot.creative_project_id = p_creative_project_id
    AND shot.id = ANY(v_ids);

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_changes)
  LOOP
    IF EXISTS (
      SELECT 1 FROM jsonb_object_keys(v_change) AS keys(key)
      WHERE key NOT IN ('shot_id','expected_revision_number','expected_updated_at','patch','reason')
    ) THEN RAISE EXCEPTION 'unsupported change envelope field'; END IF;

    SELECT * INTO v_shot
    FROM public.creative_shots
    WHERE id = (v_change->>'shot_id')::uuid
      AND organization_id = p_organization_id
      AND creative_project_id = p_creative_project_id
      AND archived_at IS NULL;

    IF NOT FOUND THEN RAISE EXCEPTION 'shot disappeared during atomic revision'; END IF;

    v_current_revision := COALESCE(NULLIF(v_shot.metadata->>'revision_number','')::integer, 0);
    v_expected_revision := NULLIF(v_change->>'expected_revision_number','')::integer;
    IF v_expected_revision IS NULL OR v_current_revision <> v_expected_revision THEN
      RAISE EXCEPTION 'CREATIVE_ATOMIC_REVISION_STALE_REVISION:%', v_shot.id;
    END IF;

    v_expected_updated_at := NULLIF(v_change->>'expected_updated_at','')::timestamptz;
    IF v_expected_updated_at IS NULL OR v_shot.updated_at IS DISTINCT FROM v_expected_updated_at THEN
      RAISE EXCEPTION 'CREATIVE_ATOMIC_REVISION_STALE_UPDATED_AT:%', v_shot.id;
    END IF;

    v_patch := COALESCE(v_change->'patch', '{}'::jsonb);
    IF jsonb_typeof(v_patch) <> 'object' OR v_patch = '{}'::jsonb THEN
      RAISE EXCEPTION 'CREATIVE_ATOMIC_REVISION_EMPTY_PATCH:%', v_shot.id;
    END IF;

    IF EXISTS (
      SELECT 1 FROM jsonb_object_keys(v_patch) AS keys(key)
      WHERE key NOT IN ('camera','coverage','continuity','performance','transition_in','transition_out')
    ) THEN RAISE EXCEPTION 'CREATIVE_ATOMIC_REVISION_PATCH_SCOPE_INVALID:%', v_shot.id; END IF;

    IF v_patch ? 'camera' AND NOT ('camera' = ANY(v_scope)) THEN RAISE EXCEPTION 'camera patch outside scope'; END IF;
    IF v_patch ? 'continuity' AND NOT ('continuity' = ANY(v_scope)) THEN RAISE EXCEPTION 'continuity patch outside scope'; END IF;
    IF v_patch ? 'performance' AND NOT ('performance' = ANY(v_scope)) THEN RAISE EXCEPTION 'performance patch outside scope'; END IF;
    IF (v_patch ? 'transition_in' OR v_patch ? 'transition_out') AND NOT ('edit' = ANY(v_scope)) THEN RAISE EXCEPTION 'transition patch outside edit scope'; END IF;
    IF v_patch ? 'coverage' AND NOT ('coverage' = ANY(v_scope) OR 'edit' = ANY(v_scope)) THEN RAISE EXCEPTION 'coverage patch outside scope'; END IF;

    IF v_patch ? 'camera' AND jsonb_typeof(v_patch->'camera') <> 'object' THEN RAISE EXCEPTION 'camera patch must be object'; END IF;
    IF v_patch ? 'coverage' AND jsonb_typeof(v_patch->'coverage') <> 'object' THEN RAISE EXCEPTION 'coverage patch must be object'; END IF;
    IF v_patch ? 'continuity' AND jsonb_typeof(v_patch->'continuity') <> 'object' THEN RAISE EXCEPTION 'continuity patch must be object'; END IF;
    IF v_patch ? 'performance' AND jsonb_typeof(v_patch->'performance') NOT IN ('string','null') THEN RAISE EXCEPTION 'performance patch must be string or null'; END IF;
    IF v_patch ? 'transition_in' AND jsonb_typeof(v_patch->'transition_in') NOT IN ('string','null') THEN RAISE EXCEPTION 'transition_in patch must be string or null'; END IF;
    IF v_patch ? 'transition_out' AND jsonb_typeof(v_patch->'transition_out') NOT IN ('string','null') THEN RAISE EXCEPTION 'transition_out patch must be string or null'; END IF;

    IF v_patch ? 'coverage'
       AND NOT ('coverage' = ANY(v_scope))
       AND 'edit' = ANY(v_scope)
       AND EXISTS (
         SELECT 1 FROM jsonb_object_keys(v_patch->'coverage') AS coverage_keys(key)
         WHERE key NOT IN (
           'shot_to_shot_contrast',
           'edit_compatibility_status',
           'edit_relationship',
           'match_action',
           'continuity_consequence'
         )
       )
    THEN RAISE EXCEPTION 'edit-only coverage patch widened scope'; END IF;

    v_reason := NULLIF(left(COALESCE(v_change->>'reason',''), 2000), '');
    v_metadata := COALESCE(v_shot.metadata, '{}'::jsonb);

    IF v_patch ? 'coverage' THEN
      v_metadata := jsonb_set(
        v_metadata,
        '{coverage}',
        COALESCE(v_metadata->'coverage', '{}'::jsonb) || (v_patch->'coverage'),
        true
      );
    END IF;

    SELECT COALESCE(jsonb_agg(key ORDER BY key), '[]'::jsonb)
      INTO v_touched
    FROM jsonb_object_keys(v_patch) AS touched(key);

    v_entry := jsonb_build_object(
      'at', v_now,
      'authority', 'AI_ATOMIC_MULTI_SHOT_REVISION',
      'plan_fingerprint', p_plan_fingerprint,
      'scope', to_jsonb(v_scope),
      'instruction', left(COALESCE(p_instruction,''), 1000),
      'reason', COALESCE(v_reason, ''),
      'touched', v_touched
    );

    v_history := COALESCE(v_metadata->'revision_history', '[]'::jsonb) || jsonb_build_array(v_entry);
    SELECT COALESCE(jsonb_agg(value ORDER BY ordinality), '[]'::jsonb)
      INTO v_history
    FROM (
      SELECT value, ordinality
      FROM jsonb_array_elements(v_history) WITH ORDINALITY
      ORDER BY ordinality DESC
      LIMIT 20
    ) AS recent;

    v_metadata := v_metadata || jsonb_build_object(
      'direction_authority', 'AI_ATOMIC_MULTI_SHOT_REVISION',
      'last_revision_scope', to_jsonb(v_scope),
      'last_revision_instruction', left(COALESCE(p_instruction,''), 1600),
      'last_revision_reason', COALESCE(v_reason, ''),
      'last_revision_at', v_now,
      'revision_number', v_current_revision + 1,
      'revision_history', v_history,
      'atomic_plan_fingerprint', p_plan_fingerprint
    );

    UPDATE public.creative_shots
    SET
      camera = CASE WHEN v_patch ? 'camera' THEN COALESCE(v_shot.camera, '{}'::jsonb) || (v_patch->'camera') ELSE v_shot.camera END,
      continuity = CASE WHEN v_patch ? 'continuity' THEN COALESCE(v_shot.continuity, '{}'::jsonb) || (v_patch->'continuity') ELSE v_shot.continuity END,
      performance = CASE WHEN v_patch ? 'performance' THEN v_patch->>'performance' ELSE v_shot.performance END,
      transition_in = CASE WHEN v_patch ? 'transition_in' THEN v_patch->>'transition_in' ELSE v_shot.transition_in END,
      transition_out = CASE WHEN v_patch ? 'transition_out' THEN v_patch->>'transition_out' ELSE v_shot.transition_out END,
      metadata = v_metadata,
      revision_reason = COALESCE(v_reason, v_shot.revision_reason),
      updated_at = v_now
    WHERE id = v_shot.id
      AND organization_id = p_organization_id
      AND creative_project_id = p_creative_project_id;
  END LOOP;

  SELECT jsonb_agg(to_jsonb(shot) ORDER BY shot.scene_number NULLS LAST, shot.shot_number NULLS LAST, shot.id)
    INTO v_after
  FROM public.creative_shots AS shot
  WHERE shot.organization_id = p_organization_id
    AND shot.creative_project_id = p_creative_project_id
    AND shot.id = ANY(v_ids);

  INSERT INTO private.creative_direction_checkpoints (
    organization_id,
    creative_project_id,
    plan_fingerprint,
    instruction,
    revision_scope,
    shot_ids,
    before_state,
    after_state,
    status,
    metadata
  ) VALUES (
    p_organization_id,
    p_creative_project_id,
    p_plan_fingerprint,
    left(COALESCE(p_instruction,''), 1600),
    v_scope,
    v_ids,
    v_before,
    v_after,
    'APPLIED',
    jsonb_build_object('contract','AVANTIQO_ATOMIC_SHOT_SET_REVISION_V1')
  ) RETURNING id INTO v_checkpoint_id;

  RETURN jsonb_build_object(
    'success', true,
    'contract', 'AVANTIQO_ATOMIC_SHOT_SET_REVISION_V1',
    'checkpoint_id', v_checkpoint_id,
    'plan_fingerprint', p_plan_fingerprint,
    'shot_count', cardinality(v_ids),
    'applied_at', v_now
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.creative_apply_shot_set_revision_atomic(uuid, uuid, text, text, text[], jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.creative_apply_shot_set_revision_atomic(uuid, uuid, text, text, text[], jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.creative_restore_shot_set_checkpoint_atomic(
  p_organization_id uuid,
  p_creative_project_id uuid,
  p_checkpoint_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_checkpoint private.creative_direction_checkpoints%ROWTYPE;
  v_current jsonb;
  v_restored jsonb;
  v_before_row jsonb;
  v_shot public.creative_shots%ROWTYPE;
  v_before_metadata jsonb;
  v_metadata jsonb;
  v_history jsonb;
  v_entry jsonb;
  v_now timestamptz := clock_timestamp();
  v_current_revision integer;
BEGIN
  IF p_organization_id IS NULL THEN RAISE EXCEPTION 'organization_id required'; END IF;
  IF p_creative_project_id IS NULL THEN RAISE EXCEPTION 'creative_project_id required'; END IF;
  IF p_checkpoint_id IS NULL THEN RAISE EXCEPTION 'checkpoint_id required'; END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' || p_creative_project_id::text,
      0
    )
  );

  SELECT * INTO v_checkpoint
  FROM private.creative_direction_checkpoints
  WHERE id = p_checkpoint_id
    AND organization_id = p_organization_id
    AND creative_project_id = p_creative_project_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'CREATIVE_DIRECTION_CHECKPOINT_NOT_FOUND'; END IF;
  IF v_checkpoint.status <> 'APPLIED' THEN RAISE EXCEPTION 'CREATIVE_DIRECTION_CHECKPOINT_NOT_RESTORABLE'; END IF;

  PERFORM 1
  FROM public.creative_shots AS shot
  WHERE shot.organization_id = p_organization_id
    AND shot.creative_project_id = p_creative_project_id
    AND shot.id = ANY(v_checkpoint.shot_ids)
  ORDER BY shot.id
  FOR UPDATE;

  SELECT jsonb_agg(to_jsonb(shot) ORDER BY shot.scene_number NULLS LAST, shot.shot_number NULLS LAST, shot.id)
    INTO v_current
  FROM public.creative_shots AS shot
  WHERE shot.organization_id = p_organization_id
    AND shot.creative_project_id = p_creative_project_id
    AND shot.id = ANY(v_checkpoint.shot_ids);

  IF v_current IS DISTINCT FROM v_checkpoint.after_state THEN
    RAISE EXCEPTION 'CREATIVE_DIRECTION_CHECKPOINT_STALE';
  END IF;

  FOR v_before_row IN SELECT value FROM jsonb_array_elements(v_checkpoint.before_state)
  LOOP
    SELECT * INTO v_shot
    FROM public.creative_shots
    WHERE id = (v_before_row->>'id')::uuid
      AND organization_id = p_organization_id
      AND creative_project_id = p_creative_project_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'checkpoint shot missing'; END IF;

    v_current_revision := COALESCE(NULLIF(v_shot.metadata->>'revision_number','')::integer, 0);
    v_before_metadata := COALESCE(v_before_row->'metadata', '{}'::jsonb);
    v_metadata := COALESCE(v_shot.metadata, '{}'::jsonb);

    IF v_before_metadata ? 'coverage' THEN
      v_metadata := jsonb_set(v_metadata, '{coverage}', v_before_metadata->'coverage', true);
    ELSE
      v_metadata := v_metadata - 'coverage';
    END IF;

    v_entry := jsonb_build_object(
      'at', v_now,
      'authority', 'HUMAN_CHECKPOINT_RESTORE',
      'checkpoint_id', p_checkpoint_id,
      'restored_plan_fingerprint', v_checkpoint.plan_fingerprint
    );
    v_history := COALESCE(v_metadata->'revision_history', '[]'::jsonb) || jsonb_build_array(v_entry);

    v_metadata := v_metadata || jsonb_build_object(
      'direction_authority', 'HUMAN_CHECKPOINT_RESTORE',
      'last_revision_scope', to_jsonb(v_checkpoint.revision_scope),
      'last_revision_instruction', 'Restore prior verified multi-shot direction checkpoint',
      'last_revision_reason', 'User-confirmed checkpoint restore',
      'last_revision_at', v_now,
      'revision_number', v_current_revision + 1,
      'revision_history', v_history,
      'restored_checkpoint_id', p_checkpoint_id
    );

    UPDATE public.creative_shots
    SET
      camera = CASE WHEN v_before_row->'camera' = 'null'::jsonb THEN NULL ELSE v_before_row->'camera' END,
      continuity = COALESCE(v_before_row->'continuity', '{}'::jsonb),
      performance = v_before_row->>'performance',
      transition_in = v_before_row->>'transition_in',
      transition_out = v_before_row->>'transition_out',
      metadata = v_metadata,
      revision_reason = 'User-confirmed checkpoint restore',
      updated_at = v_now
    WHERE id = v_shot.id
      AND organization_id = p_organization_id
      AND creative_project_id = p_creative_project_id;
  END LOOP;

  SELECT jsonb_agg(to_jsonb(shot) ORDER BY shot.scene_number NULLS LAST, shot.shot_number NULLS LAST, shot.id)
    INTO v_restored
  FROM public.creative_shots AS shot
  WHERE shot.organization_id = p_organization_id
    AND shot.creative_project_id = p_creative_project_id
    AND shot.id = ANY(v_checkpoint.shot_ids);

  UPDATE private.creative_direction_checkpoints
  SET status = 'RESTORED', restored_at = v_now, restored_state = v_restored
  WHERE id = p_checkpoint_id;

  RETURN jsonb_build_object(
    'success', true,
    'contract', 'AVANTIQO_ATOMIC_SHOT_SET_RESTORE_V1',
    'checkpoint_id', p_checkpoint_id,
    'restored_shot_count', cardinality(v_checkpoint.shot_ids),
    'restored_at', v_now
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.creative_restore_shot_set_checkpoint_atomic(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.creative_restore_shot_set_checkpoint_atomic(uuid, uuid, uuid) TO service_role;

COMMIT;

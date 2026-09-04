BEGIN;

CREATE OR REPLACE FUNCTION public.creative_direction_checkpoint_shot_ids(
  p_organization_id uuid,
  p_creative_project_id uuid,
  p_checkpoint_id uuid
)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT checkpoint.shot_ids
  FROM private.creative_direction_checkpoints AS checkpoint
  WHERE checkpoint.id = p_checkpoint_id
    AND checkpoint.organization_id = p_organization_id
    AND checkpoint.creative_project_id = p_creative_project_id
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.creative_direction_checkpoint_shot_ids(uuid, uuid, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.creative_direction_checkpoint_shot_ids(uuid, uuid, uuid)
TO service_role;

COMMIT;




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."analyze_customer_sentiment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

begin

  if new.rating >= 4 then

    new.sentiment := 'positive';

  elsif new.rating = 3 then

    new.sentiment := 'neutral';

  else

    new.sentiment := 'negative';

  end if;

  return new;

end;

$$;


ALTER FUNCTION "public"."analyze_customer_sentiment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_dynamic_pricing"("p_order_item_id" "uuid", "p_original_price" numeric, "p_target_category" "text" DEFAULT NULL::"text") RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_rule record;

  v_adjusted_price numeric := p_original_price;

begin

  select *
  into v_rule

  from public.dynamic_pricing_rules

  where tenant_id = public.get_my_tenant_id()

  and active = true

  and (
    target_category is null
    or target_category = p_target_category
  )

  and (
    starts_at is null
    or starts_at <= now()
  )

  and (
    ends_at is null
    or ends_at >= now()
  )

  order by created_at desc

  limit 1;

  if found then

    v_adjusted_price :=

      p_original_price +

      (
        p_original_price *
        (v_rule.adjustment_percent / 100)
      );

    insert into public.dynamic_price_adjustments (

      tenant_id,
      order_item_id,
      pricing_rule_id,
      original_price,
      adjusted_price,
      adjustment_percent,
      adjustment_reason

    )

    values (

      public.get_my_tenant_id(),
      p_order_item_id,
      v_rule.id,
      p_original_price,
      v_adjusted_price,
      v_rule.adjustment_percent,
      v_rule.rule_name

    );

  end if;

  return round(v_adjusted_price, 2);

end;

$$;


ALTER FUNCTION "public"."apply_dynamic_pricing"("p_order_item_id" "uuid", "p_original_price" numeric, "p_target_category" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_enterprise_document"("p_document_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_role_level integer;

begin

  v_role_level := public.get_my_role_level();

  if v_role_level < 80 then
    raise exception
    'Insufficient permissions to approve document';
  end if;

  update public.enterprise_documents
  set
    document_status = 'approved',
    approved_by = auth.uid(),
    approved_at = now(),
    updated_at = now()
  where id = p_document_id
  and tenant_id = public.get_my_tenant_id();

  perform public.publish_realtime_event(

    'enterprise_document_approved',

    'documents',

    'enterprise_documents',

    p_document_id,

    jsonb_build_object(

      'document_id', p_document_id,
      'approved_by', auth.uid(),
      'approved_at', now()

    )

  );

  return true;

end;

$$;


ALTER FUNCTION "public"."approve_enterprise_document"("p_document_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_customer_segments"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

begin

  insert into public.customer_segment_memberships (

    tenant_id,
    customer_loyalty_account_id,
    customer_segment_id,
    assigned_at,
    active,
    metadata

  )

  select

    cla.tenant_id,

    cla.id,

    cs.id,

    now(),

    true,

    jsonb_build_object(

      'assigned_by', 'automatic_segmentation_engine',
      'customer_total_spent', cla.total_spent,
      'customer_visit_count', cla.visit_count,
      'customer_tier', cla.tier

    )

  from public.customer_loyalty_accounts cla

  join public.customer_segments cs

    on cs.tenant_id = cla.tenant_id

  where cla.tenant_id =
    public.get_my_tenant_id()

  and cs.active = true

  and cla.total_spent >= cs.minimum_spend

  and cla.visit_count >= cs.minimum_visits

  and (
    cs.loyalty_tier is null
    or cs.loyalty_tier = cla.tier
  )

  and not exists (

    select 1
    from public.customer_segment_memberships csm

    where csm.tenant_id = cla.tenant_id
    and csm.customer_loyalty_account_id = cla.id
    and csm.customer_segment_id = cs.id
    and csm.active = true

  );

  return true;

end;

$$;


ALTER FUNCTION "public"."assign_customer_segments"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_trigger_function"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

begin

  insert into public.audit_logs (

    tenant_id,
    table_name,
    record_id,
    action,
    changed_by,
    changed_at

  )

  values (

    coalesce(new.tenant_id, old.tenant_id),
    tg_table_name,
    coalesce(new.id, old.id),
    tg_op,
    auth.uid(),
    now()

  );

  return coalesce(new, old);

end;

$$;


ALTER FUNCTION "public"."audit_trigger_function"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_create_kitchen_ticket"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_station_id uuid;

begin

  if new.status = 'pending' then

    select id
    into v_station_id
    from public.kitchen_stations
    where tenant_id = new.tenant_id
    and active = true
    order by created_at asc
    limit 1;

    if v_station_id is not null then

      insert into public.kitchen_station_orders (

        tenant_id,
        kitchen_station_id,
        order_item_id,
        order_id,
        status,
        priority

      )

      values (

        new.tenant_id,
        v_station_id,
        new.id,
        new.order_id,
        'pending',
        'normal'

      );

    end if;

  end if;

  return new;

end;

$$;


ALTER FUNCTION "public"."auto_create_kitchen_ticket"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_process_order_production"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_total_cost numeric;

begin

  if new.status = 'completed'
  and (
    old.status is distinct from 'completed'
  ) then

    perform public.process_production_run(

      new.order_id,
      new.id,
      new.dish_id,
      new.quantity

    );

  end if;

  return new;

end;

$$;


ALTER FUNCTION "public"."auto_process_order_production"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_kitchen_station_performance"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

begin

  insert into public.kitchen_station_performance (

    tenant_id,
    kitchen_station_id,
    staff_id,
    total_orders,
    completed_orders,
    average_completion_minutes,
    delayed_orders,
    performance_score,
    snapshot_date

  )

  select

    kso.tenant_id,

    kso.kitchen_station_id,

    kso.assigned_to,

    count(*) as total_orders,

    count(*) filter (
      where kso.status = 'completed'
    ) as completed_orders,

    coalesce(

      avg(

        extract(
          epoch from (
            kso.completed_at - kso.started_at
          )
        ) / 60

      ),

      0

    ) as average_completion_minutes,

    count(*) filter (

      where
        kso.completed_at is not null
        and kso.started_at is not null
        and (
          extract(
            epoch from (
              kso.completed_at - kso.started_at
            )
          ) / 60
        ) > 30

    ) as delayed_orders,

    greatest(

      0,

      100 -

      (
        count(*) filter (

          where
            kso.completed_at is not null
            and kso.started_at is not null
            and (
              extract(
                epoch from (
                  kso.completed_at - kso.started_at
                )
              ) / 60
            ) > 30

        ) * 5
      )

    ) as performance_score,

    current_date

  from public.kitchen_station_orders kso

  where kso.tenant_id =
    public.get_my_tenant_id()

  and kso.created_at::date =
    current_date

  group by

    kso.tenant_id,
    kso.kitchen_station_id,
    kso.assigned_to;

  return true;

end;

$$;


ALTER FUNCTION "public"."calculate_kitchen_station_performance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_role"("target_role" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

  select exists (

    select 1

    from public.staff_accounts sa

    join public.role_hierarchy my_role
      on my_role.tenant_id = sa.tenant_id
     and my_role.role = sa.role

    join public.role_hierarchy target
      on target.tenant_id = sa.tenant_id
     and target.role = target_role

    where sa.auth_user_id = auth.uid()
    and my_role.level > target.level

  );

$$;


ALTER FUNCTION "public"."can_manage_role"("target_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_inventory_alerts"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

begin

  insert into public.inventory_alerts (

    tenant_id,
    ingredient_id,
    alert_type,
    current_quantity,
    minimum_quantity,
    message

  )

  select

    i.tenant_id,

    i.id,

    'low_stock',

    i.current_stock,

    i.minimum_stock,

    'Inventory below minimum threshold'

  from public.ingredients i

  where i.tenant_id =
    public.get_my_tenant_id()

  and i.current_stock <= i.minimum_stock

  and not exists (

    select 1
    from public.inventory_alerts ia

    where ia.tenant_id = i.tenant_id
    and ia.ingredient_id = i.id
    and ia.alert_type = 'low_stock'
    and ia.resolved = false

  );

  return true;

end;

$$;


ALTER FUNCTION "public"."check_inventory_alerts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_rate_limit"("p_limit_key" "text", "p_identifier" "text", "p_window_type" "text" DEFAULT 'minute'::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_limit record;

  v_log record;

  v_max_requests integer;

  v_window_start timestamptz;

  v_window_expiry timestamptz;

begin

  select *
  into v_limit

  from public.enterprise_rate_limits

  where tenant_id = public.get_my_tenant_id()

  and limit_key = p_limit_key

  and active = true

  limit 1;

  if not found then
    return true;
  end if;

  if p_window_type = 'minute' then

    v_max_requests :=
      v_limit.requests_per_minute;

    v_window_start :=
      date_trunc('minute', now());

    v_window_expiry :=
      v_window_start + interval '1 minute';

  elsif p_window_type = 'hour' then

    v_max_requests :=
      v_limit.requests_per_hour;

    v_window_start :=
      date_trunc('hour', now());

    v_window_expiry :=
      v_window_start + interval '1 hour';

  else

    v_max_requests :=
      v_limit.requests_per_day;

    v_window_start :=
      date_trunc('day', now());

    v_window_expiry :=
      v_window_start + interval '1 day';

  end if;

  select *
  into v_log

  from public.enterprise_rate_limit_logs

  where tenant_id = public.get_my_tenant_id()

  and limit_key = p_limit_key

  and identifier = p_identifier

  and window_type = p_window_type

  and window_started_at = v_window_start

  limit 1;

  if not found then

    insert into public.enterprise_rate_limit_logs (

      tenant_id,
      limit_key,
      identifier,
      request_count,
      window_type,
      window_started_at,
      expires_at,
      blocked

    )

    values (

      public.get_my_tenant_id(),
      p_limit_key,
      p_identifier,
      1,
      p_window_type,
      v_window_start,
      v_window_expiry,
      false

    );

    return true;

  end if;

  update public.enterprise_rate_limit_logs
  set

    request_count = request_count + 1,

    blocked = (
      request_count + 1 > v_max_requests
    ),

    updated_at = now()

  where id = v_log.id;

  return (
    v_log.request_count + 1 <= v_max_requests
  );

end;

$$;


ALTER FUNCTION "public"."check_rate_limit"("p_limit_key" "text", "p_identifier" "text", "p_window_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_ai_agent_memory"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_deleted_count integer := 0;

begin

  delete from public.ai_agent_memory

  where tenant_id = public.get_my_tenant_id()

  and expires_at is not null

  and expires_at <= now();

  get diagnostics v_deleted_count = row_count;

  return v_deleted_count;

end;

$$;


ALTER FUNCTION "public"."cleanup_expired_ai_agent_memory"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_rate_limit_logs"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_deleted_count integer := 0;

begin

  delete from public.enterprise_rate_limit_logs

  where tenant_id = public.get_my_tenant_id()

  and expires_at <= now();

  get diagnostics v_deleted_count = row_count;

  return v_deleted_count;

end;

$$;


ALTER FUNCTION "public"."cleanup_expired_rate_limit_logs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_stale_presence"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_cleanup_count integer := 0;

begin

  update public.realtime_presence
  set
    status = 'offline'
  where tenant_id = public.get_my_tenant_id()
  and status != 'offline'
  and last_seen_at < now() - interval '5 minutes';

  get diagnostics v_cleanup_count = row_count;

  return v_cleanup_count;

end;

$$;


ALTER FUNCTION "public"."cleanup_stale_presence"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."close_financial_period"("p_period_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_role_level integer;

begin

  v_role_level := public.get_my_role_level();

  if v_role_level < 90 then
    raise exception 'Only general_manager or owner can close periods';
  end if;

  update public.financial_periods
  set
    status = 'closed',
    closed_by = auth.uid(),
    closed_at = now()
  where id = p_period_id
  and tenant_id = public.get_my_tenant_id();

  return true;

end;

$$;


ALTER FUNCTION "public"."close_financial_period"("p_period_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_inventory_fifo"("p_ingredient_id" "uuid", "p_quantity" numeric) RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_remaining numeric := p_quantity;

  v_total_cost numeric := 0;

  v_layer record;

  v_consumed numeric;

begin

  for v_layer in

    select *
    from public.inventory_cost_layers

    where tenant_id = public.get_my_tenant_id()

    and ingredient_id = p_ingredient_id

    and quantity_remaining > 0

    order by received_at asc

  loop

    exit when v_remaining <= 0;

    v_consumed := least(
      v_remaining,
      v_layer.quantity_remaining
    );

    update public.inventory_cost_layers
    set quantity_remaining =
      quantity_remaining - v_consumed
    where id = v_layer.id;

    v_total_cost :=
      v_total_cost +
      (v_consumed * v_layer.unit_cost);

    v_remaining :=
      v_remaining - v_consumed;

  end loop;

  if v_remaining > 0 then
    raise exception
    'Insufficient inventory cost layers';
  end if;

  return v_total_cost;

end;

$$;


ALTER FUNCTION "public"."consume_inventory_fifo"("p_ingredient_id" "uuid", "p_quantity" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_ai_agent_task"("p_task_type" "text", "p_task_category" "text", "p_priority" "text" DEFAULT 'medium'::"text", "p_assigned_agent" "text" DEFAULT NULL::"text", "p_reference_table" "text" DEFAULT NULL::"text", "p_reference_id" "uuid" DEFAULT NULL::"uuid", "p_task_payload" "jsonb" DEFAULT '{}'::"jsonb", "p_scheduled_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_task_id uuid;

begin

  insert into public.ai_agent_tasks (

    tenant_id,
    task_type,
    task_category,
    priority,
    assigned_agent,
    reference_table,
    reference_id,
    task_payload,
    scheduled_at,
    created_by

  )

  values (

    public.get_my_tenant_id(),
    p_task_type,
    p_task_category,
    p_priority,
    p_assigned_agent,
    p_reference_table,
    p_reference_id,
    p_task_payload,
    p_scheduled_at,
    auth.uid()

  )

  returning id into v_task_id;

  return v_task_id;

end;

$$;


ALTER FUNCTION "public"."create_ai_agent_task"("p_task_type" "text", "p_task_category" "text", "p_priority" "text", "p_assigned_agent" "text", "p_reference_table" "text", "p_reference_id" "uuid", "p_task_payload" "jsonb", "p_scheduled_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_backup_job"("p_backup_type" "text", "p_backup_scope" "text", "p_storage_location" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_backup_job_id uuid;

begin

  insert into public.backup_jobs (

    tenant_id,
    backup_type,
    backup_scope,
    backup_status,
    storage_location,
    started_at,
    initiated_by

  )

  values (

    public.get_my_tenant_id(),
    p_backup_type,
    p_backup_scope,
    'running',
    p_storage_location,
    now(),
    auth.uid()

  )

  returning id into v_backup_job_id;

  return v_backup_job_id;

end;

$$;


ALTER FUNCTION "public"."create_backup_job"("p_backup_type" "text", "p_backup_scope" "text", "p_storage_location" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_enterprise_audit_event"("p_event_table" "text", "p_event_action" "text", "p_reference_id" "uuid" DEFAULT NULL::"uuid", "p_event_payload" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_rule record;

  v_event_id uuid;

begin

  select *
  into v_rule

  from public.enterprise_audit_rules

  where tenant_id = public.get_my_tenant_id()

  and active = true

  and monitored_table = p_event_table

  and monitored_action = p_event_action

  limit 1;

  if not found then
    return null;
  end if;

  insert into public.enterprise_audit_events (

    tenant_id,
    enterprise_audit_rule_id,
    event_table,
    event_action,
    reference_id,
    triggered_by,
    severity,
    event_payload

  )

  values (

    public.get_my_tenant_id(),
    v_rule.id,
    p_event_table,
    p_event_action,
    p_reference_id,
    auth.uid(),
    v_rule.severity,
    p_event_payload

  )

  returning id into v_event_id;

  if v_rule.notification_enabled = true then

    perform public.publish_realtime_event(

      'enterprise_audit_event_created',

      'audit',

      'enterprise_audit_events',

      v_event_id,

      jsonb_build_object(

        'audit_event_id', v_event_id,
        'event_table', p_event_table,
        'event_action', p_event_action,
        'severity', v_rule.severity

      )

    );

  end if;

  return v_event_id;

end;

$$;


ALTER FUNCTION "public"."create_enterprise_audit_event"("p_event_table" "text", "p_event_action" "text", "p_reference_id" "uuid", "p_event_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_enterprise_document"("p_document_type" "text", "p_document_name" "text", "p_reference_table" "text" DEFAULT NULL::"text", "p_reference_id" "uuid" DEFAULT NULL::"uuid", "p_storage_path" "text" DEFAULT NULL::"text", "p_file_size_bytes" bigint DEFAULT 0, "p_mime_type" "text" DEFAULT NULL::"text", "p_generated_by" "text" DEFAULT 'system'::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_document_id uuid;

begin

  insert into public.enterprise_documents (

    tenant_id,
    document_type,
    document_name,
    reference_table,
    reference_id,
    storage_path,
    file_size_bytes,
    mime_type,
    generated_by,
    metadata,
    created_by

  )

  values (

    public.get_my_tenant_id(),
    p_document_type,
    p_document_name,
    p_reference_table,
    p_reference_id,
    p_storage_path,
    p_file_size_bytes,
    p_mime_type,
    p_generated_by,
    p_metadata,
    auth.uid()

  )

  returning id into v_document_id;

  return v_document_id;

end;

$$;


ALTER FUNCTION "public"."create_enterprise_document"("p_document_type" "text", "p_document_name" "text", "p_reference_table" "text", "p_reference_id" "uuid", "p_storage_path" "text", "p_file_size_bytes" bigint, "p_mime_type" "text", "p_generated_by" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_enterprise_document_version"("p_document_id" "uuid", "p_storage_path" "text", "p_file_size_bytes" bigint DEFAULT 0, "p_mime_type" "text" DEFAULT NULL::"text", "p_change_summary" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_document record;

  v_next_version integer;

  v_version_id uuid;

begin

  select *
  into v_document
  from public.enterprise_documents
  where id = p_document_id
  and tenant_id = public.get_my_tenant_id();

  if not found then
    raise exception 'Document not found';
  end if;

  v_next_version :=
    coalesce(v_document.version_number, 1) + 1;

  insert into public.enterprise_document_versions (

    tenant_id,
    enterprise_document_id,
    version_number,
    storage_path,
    file_size_bytes,
    mime_type,
    change_summary,
    uploaded_by

  )

  values (

    public.get_my_tenant_id(),
    p_document_id,
    v_next_version,
    p_storage_path,
    p_file_size_bytes,
    p_mime_type,
    p_change_summary,
    auth.uid()

  )

  returning id into v_version_id;

  update public.enterprise_documents
  set
    version_number = v_next_version,
    storage_path = p_storage_path,
    file_size_bytes = p_file_size_bytes,
    mime_type = p_mime_type,
    updated_at = now()
  where id = p_document_id;

  perform public.publish_realtime_event(

    'enterprise_document_version_created',

    'documents',

    'enterprise_documents',

    p_document_id,

    jsonb_build_object(

      'document_id', p_document_id,
      'version_number', v_next_version,
      'uploaded_by', auth.uid(),
      'created_at', now()

    )

  );

  return v_version_id;

end;

$$;


ALTER FUNCTION "public"."create_enterprise_document_version"("p_document_id" "uuid", "p_storage_path" "text", "p_file_size_bytes" bigint, "p_mime_type" "text", "p_change_summary" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_enterprise_notification"("p_notification_type" "text", "p_category" "text", "p_title" "text", "p_message" "text", "p_severity" "text" DEFAULT 'info'::"text", "p_target_role" "text" DEFAULT NULL::"text", "p_target_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_notification_id uuid;

begin

  insert into public.enterprise_notifications (

    tenant_id,
    notification_type,
    category,
    title,
    message,
    severity,
    target_role,
    target_user_id

  )

  values (

    public.get_my_tenant_id(),
    p_notification_type,
    p_category,
    p_title,
    p_message,
    p_severity,
    p_target_role,
    p_target_user_id

  )

  returning id into v_notification_id;

  return v_notification_id;

end;

$$;


ALTER FUNCTION "public"."create_enterprise_notification"("p_notification_type" "text", "p_category" "text", "p_title" "text", "p_message" "text", "p_severity" "text", "p_target_role" "text", "p_target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_security_incident"("p_incident_type" "text", "p_incident_category" "text", "p_severity" "text" DEFAULT 'medium'::"text", "p_source_system" "text" DEFAULT NULL::"text", "p_reference_table" "text" DEFAULT NULL::"text", "p_reference_id" "uuid" DEFAULT NULL::"uuid", "p_incident_summary" "text" DEFAULT ''::"text", "p_incident_details" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_incident_id uuid;

begin

  insert into public.enterprise_security_incidents (

    tenant_id,
    incident_type,
    incident_category,
    severity,
    source_system,
    reference_table,
    reference_id,
    detected_by,
    incident_summary,
    incident_details

  )

  values (

    public.get_my_tenant_id(),
    p_incident_type,
    p_incident_category,
    p_severity,
    p_source_system,
    p_reference_table,
    p_reference_id,
    'system',
    p_incident_summary,
    p_incident_details

  )

  returning id into v_incident_id;

  perform public.publish_realtime_event(

    'security_incident_created',

    'security',

    'enterprise_security_incidents',

    v_incident_id,

    jsonb_build_object(

      'incident_id', v_incident_id,
      'incident_type', p_incident_type,
      'severity', p_severity,
      'summary', p_incident_summary

    )

  );

  return v_incident_id;

end;

$$;


ALTER FUNCTION "public"."create_security_incident"("p_incident_type" "text", "p_incident_category" "text", "p_severity" "text", "p_source_system" "text", "p_reference_table" "text", "p_reference_id" "uuid", "p_incident_summary" "text", "p_incident_details" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decrement_dish_stock"("p_item_id" "uuid", "p_quantity" numeric, "p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE dish_stock
  SET quantity = quantity - p_quantity
  WHERE dish_id = p_item_id
  AND tenant_id = p_tenant_id;
END;
$$;


ALTER FUNCTION "public"."decrement_dish_stock"("p_item_id" "uuid", "p_quantity" numeric, "p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decrement_dish_stock"("p_tenant_id" "uuid", "p_dish_id" "uuid", "p_qty" numeric) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  update dish_stock
  set quantity = quantity - p_qty
  where tenant_id = p_tenant_id
  and dish_id = p_dish_id;
end;
$$;


ALTER FUNCTION "public"."decrement_dish_stock"("p_tenant_id" "uuid", "p_dish_id" "uuid", "p_qty" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decrement_ingredient_stock"("p_item_id" "uuid", "p_quantity" numeric, "p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE ingredient_stock
  SET quantity = quantity - p_quantity
  WHERE ingredient_id = p_item_id
  AND tenant_id = p_tenant_id;
END;
$$;


ALTER FUNCTION "public"."decrement_ingredient_stock"("p_item_id" "uuid", "p_quantity" numeric, "p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decrement_ingredient_stock"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_qty" numeric) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  update ingredients
  set quantity = greatest(quantity - p_qty, 0)
  where tenant_id = p_tenant_id
    and id = p_ingredient_id;
end;
$$;


ALTER FUNCTION "public"."decrement_ingredient_stock"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_qty" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decrement_stock"("ing_id" "uuid", "amount" numeric) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  update inventory
  set stock = stock - amount
  where ingredient_id = ing_id;
end;
$$;


ALTER FUNCTION "public"."decrement_stock"("ing_id" "uuid", "amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."detect_suspicious_api_key_activity"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_api_key record;

  v_incident_count integer := 0;

begin

  for v_api_key in

    select *
    from public.enterprise_api_keys

    where tenant_id = public.get_my_tenant_id()

    and revoked = false

    and expires_at is not null

    and expires_at <= now()

  loop

    perform public.create_security_incident(

      'expired_api_key_usage',
      'api_security',
      'high',
      'enterprise_api_keys',
      'enterprise_api_keys',
      v_api_key.id,

      'Expired API key detected still marked as active.',

      jsonb_build_object(

        'api_key_id', v_api_key.id,
        'key_name', v_api_key.key_name,
        'api_provider', v_api_key.api_provider,
        'expires_at', v_api_key.expires_at

      )

    );

    update public.enterprise_api_keys
    set

      revoked = true,
      revoked_at = now()

    where id = v_api_key.id;

    v_incident_count :=
      v_incident_count + 1;

  end loop;

  return v_incident_count;

end;

$$;


ALTER FUNCTION "public"."detect_suspicious_api_key_activity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."disconnect_websocket_session"("p_connection_id" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

begin

  update public.websocket_sessions
  set
    active = false,
    disconnected_at = now()
  where tenant_id = public.get_my_tenant_id()
  and connection_id = p_connection_id;

  return true;

end;

$$;


ALTER FUNCTION "public"."disconnect_websocket_session"("p_connection_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enterprise_document_audit_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

begin

  if tg_op = 'INSERT' then

    perform public.create_enterprise_audit_event(

      'enterprise_documents',

      'insert',

      new.id,

      jsonb_build_object(

        'document_name', new.document_name,
        'document_type', new.document_type,
        'document_status', new.document_status,
        'created_by', new.created_by

      )

    );

    return new;

  elsif tg_op = 'UPDATE' then

    perform public.create_enterprise_audit_event(

      'enterprise_documents',

      'update',

      new.id,

      jsonb_build_object(

        'old_status', old.document_status,
        'new_status', new.document_status,
        'version_number', new.version_number,
        'updated_at', new.updated_at

      )

    );

    return new;

  elsif tg_op = 'DELETE' then

    perform public.create_enterprise_audit_event(

      'enterprise_documents',

      'delete',

      old.id,

      jsonb_build_object(

        'document_name', old.document_name,
        'document_type', old.document_type,
        'deleted_at', now()

      )

    );

    return old;

  end if;

  return null;

end;

$$;


ALTER FUNCTION "public"."enterprise_document_audit_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_approval"("p_entity_type" "text", "p_entity_id" "uuid", "p_next_status" "text", "p_tenant_id" "uuid", "p_from_status" "text", "p_to_status" "text", "p_acted_by" "uuid", "p_role" "text", "p_notes" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $_$

DECLARE

  v_table TEXT;

BEGIN

  -- SAFE TABLE RESOLUTION

  CASE p_entity_type

    WHEN 'invoice'
    THEN v_table := 'invoices';

    WHEN 'payroll'
    THEN v_table := 'monthly_payroll';

    WHEN 'expense'
    THEN v_table := 'expenses';

    ELSE
      RAISE EXCEPTION
      'Invalid entity type';

  END CASE;

  -- PERMISSION ENFORCEMENT

  IF p_entity_type = 'invoice' THEN

    IF p_from_status = 'pending_manager'
       AND p_role NOT IN (
         'manager',
         'owner'
       )
    THEN

      RAISE EXCEPTION
      'Unauthorized manager approval';

    END IF;

    IF p_from_status = 'pending_accounting'
       AND p_role NOT IN (
         'accounting',
         'owner'
       )
    THEN

      RAISE EXCEPTION
      'Unauthorized accounting approval';

    END IF;

    IF p_from_status = 'pending_owner'
       AND p_role != 'owner'
    THEN

      RAISE EXCEPTION
      'Unauthorized owner approval';

    END IF;

  END IF;

  -- UPDATE ENTITY

  EXECUTE format(
    'UPDATE %I
     SET status = $1,
         updated_at = NOW()
     WHERE id = $2',
    v_table
  )

  USING
    p_next_status,
    p_entity_id;

  -- APPROVAL LOG

  INSERT INTO approval_logs (

    tenant_id,

    entity_type,
    entity_id,

    from_status,
    to_status,

    acted_by,
    role,
    notes,

    created_at

  )

  VALUES (

    p_tenant_id,

    p_entity_type,
    p_entity_id,

    p_from_status,
    p_to_status,

    p_acted_by,
    p_role,
    p_notes,

    NOW()

  );

END;

$_$;


ALTER FUNCTION "public"."execute_approval"("p_entity_type" "text", "p_entity_id" "uuid", "p_next_status" "text", "p_tenant_id" "uuid", "p_from_status" "text", "p_to_status" "text", "p_acted_by" "uuid", "p_role" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_approval"("p_table" "text", "p_entity_id" "uuid", "p_next_status" "text", "p_tenant_id" "uuid", "p_entity_type" "text", "p_from_status" "text", "p_to_status" "text", "p_acted_by" "uuid", "p_role" "text", "p_notes" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $_$

BEGIN

  -- 1. UPDATE ENTITY

  EXECUTE format(
    'UPDATE %I
     SET status = $1,
         updated_at = NOW()
     WHERE id = $2',
    p_table
  )

  USING
    p_next_status,
    p_entity_id;

  -- 2. INSERT APPROVAL LOG

  INSERT INTO approval_logs (

    tenant_id,

    entity_type,
    entity_id,

    from_status,
    to_status,

    acted_by,
    role,
    notes,

    created_at

  )

  VALUES (

    p_tenant_id,

    p_entity_type,
    p_entity_id,

    p_from_status,
    p_to_status,

    p_acted_by,
    p_role,
    p_notes,

    NOW()

  );

END;

$_$;


ALTER FUNCTION "public"."execute_approval"("p_table" "text", "p_entity_id" "uuid", "p_next_status" "text", "p_tenant_id" "uuid", "p_entity_type" "text", "p_from_status" "text", "p_to_status" "text", "p_acted_by" "uuid", "p_role" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_enterprise_workflow"("p_workflow_id" "uuid", "p_trigger_source" "text" DEFAULT 'manual'::"text", "p_input_payload" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_workflow record;

  v_run_id uuid;

  v_started_at timestamptz;

  v_steps_processed integer := 0;

begin

  v_started_at := clock_timestamp();

  select *
  into v_workflow
  from public.enterprise_workflows
  where id = p_workflow_id
  and tenant_id = public.get_my_tenant_id();

  if not found then
    raise exception 'Workflow not found';
  end if;

  insert into public.enterprise_workflow_runs (

    tenant_id,
    enterprise_workflow_id,
    run_status,
    trigger_source,
    input_payload,
    started_at

  )

  values (

    public.get_my_tenant_id(),
    p_workflow_id,
    'running',
    p_trigger_source,
    p_input_payload,
    now()

  )

  returning id into v_run_id;

  v_steps_processed :=
    public.execute_enterprise_workflow_steps(
      v_run_id
    );

  update public.enterprise_workflow_runs
  set

    run_status = 'completed',

    output_payload = jsonb_build_object(

      'workflow_name', v_workflow.workflow_name,
      'workflow_type', v_workflow.workflow_type,
      'status', 'success',
      'processed_steps', v_steps_processed,
      'processed_at', now()

    ),

    completed_at = now(),

    duration_ms = extract(
      milliseconds from (
        clock_timestamp() - v_started_at
      )
    )::integer

  where id = v_run_id;

  update public.enterprise_workflows
  set

    last_run_at = now(),

    total_runs = total_runs + 1,

    successful_runs = successful_runs + 1,

    updated_at = now()

  where id = p_workflow_id;

  perform public.publish_realtime_event(

    'workflow_completed',

    'workflow_engine',

    'enterprise_workflows',

    p_workflow_id,

    jsonb_build_object(

      'workflow_id', p_workflow_id,
      'workflow_run_id', v_run_id,
      'workflow_name', v_workflow.workflow_name,
      'processed_steps', v_steps_processed,
      'status', 'completed'

    )

  );

  return v_run_id;

exception when others then

  if v_run_id is not null then

    update public.enterprise_workflow_runs
    set

      run_status = 'failed',

      error_message = sqlerrm,

      completed_at = now(),

      duration_ms = extract(
        milliseconds from (
          clock_timestamp() - v_started_at
        )
      )::integer

    where id = v_run_id;

  end if;

  update public.enterprise_workflows
  set

    total_runs = total_runs + 1,

    failed_runs = failed_runs + 1,

    updated_at = now()

  where id = p_workflow_id;

  raise;

end;

$$;


ALTER FUNCTION "public"."execute_enterprise_workflow"("p_workflow_id" "uuid", "p_trigger_source" "text", "p_input_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_enterprise_workflow_steps"("p_workflow_run_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_workflow_run record;

  v_step record;

  v_step_run_id uuid;

  v_processed_steps integer := 0;

  v_started_at timestamptz;

begin

  select *
  into v_workflow_run
  from public.enterprise_workflow_runs
  where id = p_workflow_run_id
  and tenant_id = public.get_my_tenant_id();

  if not found then
    raise exception 'Workflow run not found';
  end if;

  for v_step in

    select *
    from public.enterprise_workflow_steps

    where tenant_id = public.get_my_tenant_id()

    and enterprise_workflow_id =
        v_workflow_run.enterprise_workflow_id

    and active = true

    order by step_order asc

  loop

    v_started_at := clock_timestamp();

    insert into public.enterprise_workflow_step_runs (

      tenant_id,
      enterprise_workflow_run_id,
      enterprise_workflow_step_id,
      run_status,
      input_payload,
      started_at

    )

    values (

      public.get_my_tenant_id(),
      p_workflow_run_id,
      v_step.id,
      'running',
      v_workflow_run.input_payload,
      now()

    )

    returning id into v_step_run_id;

    -- SIMULATED STEP EXECUTION

    update public.enterprise_workflow_step_runs
    set

      run_status = 'completed',

      output_payload = jsonb_build_object(

        'step_name', v_step.step_name,
        'step_type', v_step.step_type,
        'action_type', v_step.action_type,
        'status', 'success',
        'executed_at', now()

      ),

      completed_at = now(),

      duration_ms = extract(
        milliseconds from (
          clock_timestamp() - v_started_at
        )
      )::integer

    where id = v_step_run_id;

    v_processed_steps :=
      v_processed_steps + 1;

  end loop;

  return v_processed_steps;

exception when others then

  if v_step_run_id is not null then

    update public.enterprise_workflow_step_runs
    set

      run_status = 'failed',

      error_message = sqlerrm,

      completed_at = now(),

      duration_ms = extract(
        milliseconds from (
          clock_timestamp() - v_started_at
        )
      )::integer

    where id = v_step_run_id;

  end if;

  raise;

end;

$$;


ALTER FUNCTION "public"."execute_enterprise_workflow_steps"("p_workflow_run_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."feature_flag_audit_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

begin

  insert into public.enterprise_feature_flag_audit_logs (

    tenant_id,
    feature_flag_id,
    feature_key,

    old_enabled,
    new_enabled,

    old_rollout_percentage,
    new_rollout_percentage,

    environment,

    changed_by,

    metadata

  )

  values (

    new.tenant_id,

    new.id,

    new.feature_key,

    old.enabled,
    new.enabled,

    old.rollout_percentage,
    new.rollout_percentage,

    new.environment,

    auth.uid(),

    jsonb_build_object(

      'feature_name', new.feature_name,
      'feature_category', new.feature_category,
      'updated_at', now()

    )

  );

  return new;

end;

$$;


ALTER FUNCTION "public"."feature_flag_audit_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_ai_business_insights"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

begin

  -- LOW STOCK ALERTS

  insert into public.ai_business_insights (

    tenant_id,
    insight_type,
    category,
    title,
    description,
    severity,
    recommendation

  )

  select

    i.tenant_id,

    'inventory',

    'stock',

    'Low Inventory Risk',

    'Ingredient "' || i.name || '" is below minimum stock level.',

    'high',

    'Restock ingredient immediately to avoid production disruption.'

  from public.ingredients i

  where i.tenant_id =
    public.get_my_tenant_id()

  and i.current_stock <= i.minimum_stock;

  -- LOW PERFORMANCE KITCHEN

  insert into public.ai_business_insights (

    tenant_id,
    insight_type,
    category,
    title,
    description,
    severity,
    recommendation

  )

  select

    ksp.tenant_id,

    'kitchen',

    'performance',

    'Kitchen Performance Drop',

    'Kitchen station performance score below acceptable level.',

    'medium',

    'Review kitchen workflow, staffing, and delayed orders.'

  from public.kitchen_station_performance ksp

  where ksp.tenant_id =
    public.get_my_tenant_id()

  and ksp.performance_score < 70;

  -- NEGATIVE CUSTOMER FEEDBACK

  insert into public.ai_business_insights (

    tenant_id,
    insight_type,
    category,
    title,
    description,
    severity,
    recommendation

  )

  select

    cf.tenant_id,

    'customer',

    'feedback',

    'Negative Customer Feedback',

    coalesce(cf.feedback, 'Negative feedback received.'),

    'high',

    'Manager follow-up recommended with customer recovery action.'

  from public.customer_feedback cf

  where cf.tenant_id =
    public.get_my_tenant_id()

  and cf.sentiment = 'negative'

  and cf.resolved = false;

  return true;

end;

$$;


ALTER FUNCTION "public"."generate_ai_business_insights"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_ai_campaign_recommendations"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

begin

  insert into public.ai_campaign_recommendations (

    tenant_id,
    recommendation_type,
    target_segment_id,
    recommended_campaign_type,
    recommended_channel,
    recommendation_reason,
    predicted_engagement_score,
    predicted_conversion_rate,
    predicted_revenue,
    metadata

  )

  select

    cs.tenant_id,

    'customer_retention',

    cs.id,

    case

      when cs.segment_type = 'vip'
      then 'exclusive_offer'

      when cs.segment_type = 'inactive'
      then 'reactivation_campaign'

      else 'promotional_campaign'

    end,

    case

      when cs.segment_type = 'vip'
      then 'personalized_sms'

      when cs.segment_type = 'inactive'
      then 'email'

      else 'social_media'

    end,

    'AI-generated campaign recommendation based on customer segment behavior and loyalty metrics.',

    case

      when cs.segment_type = 'vip'
      then 92

      when cs.segment_type = 'inactive'
      then 68

      else 80

    end,

    case

      when cs.segment_type = 'vip'
      then 35

      when cs.segment_type = 'inactive'
      then 12

      else 20

    end,

    case

      when cs.segment_type = 'vip'
      then 150000

      when cs.segment_type = 'inactive'
      then 30000

      else 75000

    end,

    jsonb_build_object(

      'generated_at', now(),
      'source', 'ai_campaign_engine',
      'segment_name', cs.segment_name

    )

  from public.customer_segments cs

  where cs.tenant_id =
    public.get_my_tenant_id()

  and cs.active = true;

  return true;

end;

$$;


ALTER FUNCTION "public"."generate_ai_campaign_recommendations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_ai_forecasts"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_avg_daily_revenue numeric;

  v_avg_daily_orders numeric;

  v_avg_payroll_cost numeric;

begin

  -- REVENUE FORECAST

  select coalesce(avg(daily_total), 0)
  into v_avg_daily_revenue

  from (

    select
      created_at::date as order_date,
      sum(total_amount) as daily_total

    from public.orders

    where tenant_id = public.get_my_tenant_id()
    and status = 'paid'
    and created_at >= now() - interval '30 days'

    group by created_at::date

  ) revenue_data;

  insert into public.ai_forecasts (

    tenant_id,
    forecast_type,
    forecast_date,
    predicted_value,
    confidence_score,
    forecast_metadata

  )

  values (

    public.get_my_tenant_id(),

    'revenue',

    current_date + interval '1 day',

    v_avg_daily_revenue,

    85,

    jsonb_build_object(
      'model', 'rolling_30_day_average',
      'source', 'orders'
    )

  );

  -- ORDER FORECAST

  select coalesce(avg(daily_orders), 0)
  into v_avg_daily_orders

  from (

    select
      created_at::date as order_date,
      count(*) as daily_orders

    from public.orders

    where tenant_id = public.get_my_tenant_id()
    and created_at >= now() - interval '30 days'

    group by created_at::date

  ) order_data;

  insert into public.ai_forecasts (

    tenant_id,
    forecast_type,
    forecast_date,
    predicted_value,
    confidence_score,
    forecast_metadata

  )

  values (

    public.get_my_tenant_id(),

    'orders',

    current_date + interval '1 day',

    v_avg_daily_orders,

    82,

    jsonb_build_object(
      'model', 'rolling_30_day_average',
      'source', 'orders'
    )

  );

  -- PAYROLL FORECAST

  select coalesce(avg(daily_payroll), 0)
  into v_avg_payroll_cost

  from (

    select
      created_at::date as payout_date,
      sum(amount) as daily_payroll

    from public.payroll_payouts

    where tenant_id = public.get_my_tenant_id()
    and created_at >= now() - interval '30 days'

    group by created_at::date

  ) payroll_data;

  insert into public.ai_forecasts (

    tenant_id,
    forecast_type,
    forecast_date,
    predicted_value,
    confidence_score,
    forecast_metadata

  )

  values (

    public.get_my_tenant_id(),

    'payroll',

    current_date + interval '1 day',

    v_avg_payroll_cost,

    78,

    jsonb_build_object(
      'model', 'rolling_30_day_average',
      'source', 'payroll_payouts'
    )

  );

  return true;

end;

$$;


ALTER FUNCTION "public"."generate_ai_forecasts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_ai_recommendations"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

begin

  -- INVENTORY RECOMMENDATIONS

  insert into public.ai_recommendations (

    tenant_id,
    recommendation_type,
    target_area,
    recommendation,
    expected_impact,
    priority

  )

  select

    i.tenant_id,

    'inventory_optimization',

    'inventory',

    'Increase reorder quantity for "' || i.name || '" to avoid shortages.',

    'Reduce stockout risk and improve kitchen continuity.',

    'high'

  from public.ingredients i

  where i.tenant_id =
    public.get_my_tenant_id()

  and i.current_stock <= i.minimum_stock;

  -- KITCHEN PERFORMANCE RECOMMENDATIONS

  insert into public.ai_recommendations (

    tenant_id,
    recommendation_type,
    target_area,
    recommendation,
    expected_impact,
    priority

  )

  select

    ksp.tenant_id,

    'kitchen_efficiency',

    'kitchen',

    'Review staffing and workflow for low-performing kitchen stations.',

    'Improve order completion speed and reduce delays.',

    'medium'

  from public.kitchen_station_performance ksp

  where ksp.tenant_id =
    public.get_my_tenant_id()

  and ksp.performance_score < 70;

  -- CUSTOMER EXPERIENCE RECOMMENDATIONS

  insert into public.ai_recommendations (

    tenant_id,
    recommendation_type,
    target_area,
    recommendation,
    expected_impact,
    priority

  )

  select

    cf.tenant_id,

    'customer_recovery',

    'customer_service',

    'Contact dissatisfied customers and provide service recovery incentives.',

    'Increase retention and improve reputation.',

    'high'

  from public.customer_feedback cf

  where cf.tenant_id =
    public.get_my_tenant_id()

  and cf.sentiment = 'negative'
  and cf.resolved = false;

  return true;

end;

$$;


ALTER FUNCTION "public"."generate_ai_recommendations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_automated_notifications"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

begin

  -- LOW STOCK

  insert into public.enterprise_notifications (

    tenant_id,
    notification_type,
    category,
    title,
    message,
    severity,
    target_role

  )

  select

    i.tenant_id,

    'inventory_alert',

    'inventory',

    'Low Stock Warning',

    'Ingredient "' || i.name ||
    '" is below minimum stock level.',

    'high',

    'manager'

  from public.ingredients i

  where i.tenant_id =
    public.get_my_tenant_id()

  and i.current_stock <= i.minimum_stock;

  -- NEGATIVE CUSTOMER FEEDBACK

  insert into public.enterprise_notifications (

    tenant_id,
    notification_type,
    category,
    title,
    message,
    severity,
    target_role

  )

  select

    cf.tenant_id,

    'customer_feedback',

    'customer_service',

    'Negative Customer Feedback',

    coalesce(
      cf.feedback,
      'Customer dissatisfaction detected.'
    ),

    'medium',

    'general_manager'

  from public.customer_feedback cf

  where cf.tenant_id =
    public.get_my_tenant_id()

  and cf.sentiment = 'negative'
  and cf.resolved = false;

  -- KITCHEN PERFORMANCE ALERT

  insert into public.enterprise_notifications (

    tenant_id,
    notification_type,
    category,
    title,
    message,
    severity,
    target_role

  )

  select

    ksp.tenant_id,

    'kitchen_performance',

    'operations',

    'Kitchen Performance Drop',

    'Kitchen station performance score below threshold.',

    'medium',

    'manager'

  from public.kitchen_station_performance ksp

  where ksp.tenant_id =
    public.get_my_tenant_id()

  and ksp.performance_score < 70;

  return true;

end;

$$;


ALTER FUNCTION "public"."generate_automated_notifications"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_cross_location_consolidation"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

begin

  insert into public.cross_location_consolidations (

    tenant_id,
    consolidation_date,
    total_revenue,
    total_orders,
    total_payroll_cost,
    total_inventory_value,
    total_locations,
    average_order_value,
    overall_performance_score,
    metadata

  )

  values (

    public.get_my_tenant_id(),

    current_date,

    (
      select coalesce(sum(total_amount), 0)
      from public.orders
      where tenant_id = public.get_my_tenant_id()
      and status = 'paid'
      and created_at::date = current_date
    ),

    (
      select count(*)
      from public.orders
      where tenant_id = public.get_my_tenant_id()
      and created_at::date = current_date
    ),

    (
      select coalesce(sum(amount), 0)
      from public.payroll_payouts
      where tenant_id = public.get_my_tenant_id()
      and created_at::date = current_date
    ),

    (
      select coalesce(
        sum(quantity_remaining * unit_cost),
        0
      )
      from public.inventory_cost_layers
      where tenant_id = public.get_my_tenant_id()
    ),

    (
      select count(*)
      from public.warehouse_locations
      where tenant_id = public.get_my_tenant_id()
      and active = true
    ),

    (
      select coalesce(avg(total_amount), 0)
      from public.orders
      where tenant_id = public.get_my_tenant_id()
      and status = 'paid'
      and created_at::date = current_date
    ),

    (
      select coalesce(avg(performance_score), 100)
      from public.kitchen_station_performance
      where tenant_id = public.get_my_tenant_id()
      and snapshot_date = current_date
    ),

    jsonb_build_object(

      'generated_at', now(),
      'source', 'enterprise_consolidation_engine'

    )

  );

  return true;

end;

$$;


ALTER FUNCTION "public"."generate_cross_location_consolidation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_enterprise_audit_summary"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

begin

  insert into public.enterprise_audit_summary (

    tenant_id,
    audit_date,
    total_api_requests,
    failed_api_requests,
    total_security_events,
    critical_security_events,
    total_notifications,
    unresolved_notifications,
    total_backup_jobs,
    failed_backup_jobs,
    system_health_status

  )

  values (

    public.get_my_tenant_id(),

    current_date,

    (
      select count(*)
      from public.api_access_logs
      where tenant_id = public.get_my_tenant_id()
      and created_at::date = current_date
    ),

    (
      select count(*)
      from public.api_access_logs
      where tenant_id = public.get_my_tenant_id()
      and response_status >= 400
      and created_at::date = current_date
    ),

    (
      select count(*)
      from public.security_events
      where tenant_id = public.get_my_tenant_id()
      and created_at::date = current_date
    ),

    (
      select count(*)
      from public.security_events
      where tenant_id = public.get_my_tenant_id()
      and severity = 'critical'
      and created_at::date = current_date
    ),

    (
      select count(*)
      from public.enterprise_notifications
      where tenant_id = public.get_my_tenant_id()
      and created_at::date = current_date
    ),

    (
      select count(*)
      from public.enterprise_notifications
      where tenant_id = public.get_my_tenant_id()
      and read = false
    ),

    (
      select count(*)
      from public.backup_jobs
      where tenant_id = public.get_my_tenant_id()
      and created_at::date = current_date
    ),

    (
      select count(*)
      from public.backup_jobs
      where tenant_id = public.get_my_tenant_id()
      and backup_status = 'failed'
      and created_at::date = current_date
    ),

    case

      when exists (
        select 1
        from public.security_events
        where tenant_id = public.get_my_tenant_id()
        and severity = 'critical'
        and created_at::date = current_date
      )

      then 'critical'

      when exists (
        select 1
        from public.enterprise_health_checks
        where tenant_id = public.get_my_tenant_id()
        and status in ('warning', 'critical')
        and checked_at::date = current_date
      )

      then 'warning'

      else 'healthy'

    end

  );

  return true;

end;

$$;


ALTER FUNCTION "public"."generate_enterprise_audit_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_executive_dashboard_snapshot"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

begin

  insert into public.executive_dashboard_snapshots (

    tenant_id,
    snapshot_date,
    total_revenue,
    total_orders,
    average_order_value,
    total_payroll_cost,
    total_inventory_value,
    low_stock_items,
    negative_feedback_count,
    kitchen_performance_score

  )

  select

    public.get_my_tenant_id(),

    current_date,

    coalesce((
      select sum(total_amount)
      from public.orders
      where tenant_id = public.get_my_tenant_id()
      and status = 'paid'
      and created_at::date = current_date
    ), 0),

    coalesce((
      select count(*)
      from public.orders
      where tenant_id = public.get_my_tenant_id()
      and created_at::date = current_date
    ), 0),

    coalesce((
      select avg(total_amount)
      from public.orders
      where tenant_id = public.get_my_tenant_id()
      and status = 'paid'
      and created_at::date = current_date
    ), 0),

    coalesce((
      select sum(amount)
      from public.payroll_payouts
      where tenant_id = public.get_my_tenant_id()
      and created_at::date = current_date
    ), 0),

    coalesce((
      select sum(quantity_remaining * unit_cost)
      from public.inventory_cost_layers
      where tenant_id = public.get_my_tenant_id()
    ), 0),

    coalesce((
      select count(*)
      from public.ingredients
      where tenant_id = public.get_my_tenant_id()
      and current_stock <= minimum_stock
    ), 0),

    coalesce((
      select count(*)
      from public.customer_feedback
      where tenant_id = public.get_my_tenant_id()
      and sentiment = 'negative'
      and created_at::date = current_date
    ), 0),

    coalesce((
      select avg(performance_score)
      from public.kitchen_station_performance
      where tenant_id = public.get_my_tenant_id()
      and snapshot_date = current_date
    ), 100);

  return true;

end;

$$;


ALTER FUNCTION "public"."generate_executive_dashboard_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_inventory_snapshot"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

begin

  insert into public.inventory_valuation_snapshots (

    tenant_id,
    snapshot_date,
    ingredient_id,
    quantity_on_hand,
    inventory_value,
    average_unit_cost

  )

  select

    public.get_my_tenant_id(),

    current_date,

    icl.ingredient_id,

    sum(icl.quantity_remaining),

    sum(
      icl.quantity_remaining * icl.unit_cost
    ),

    case
      when sum(icl.quantity_remaining) > 0
      then
        sum(
          icl.quantity_remaining * icl.unit_cost
        ) / sum(icl.quantity_remaining)
      else 0
    end

  from public.inventory_cost_layers icl

  where icl.tenant_id =
    public.get_my_tenant_id()

  group by icl.ingredient_id;

  return true;

end;

$$;


ALTER FUNCTION "public"."generate_inventory_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_labor_shift_forecasts"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_avg_orders numeric;

  v_avg_revenue numeric;

begin

  select
    coalesce(avg(daily_orders), 0),
    coalesce(avg(daily_revenue), 0)

  into
    v_avg_orders,
    v_avg_revenue

  from (

    select

      created_at::date as business_date,

      count(*) as daily_orders,

      sum(total_amount) as daily_revenue

    from public.orders

    where tenant_id = public.get_my_tenant_id()
    and status = 'paid'
    and created_at >= now() - interval '30 days'

    group by created_at::date

  ) forecast_data;

  -- FOH FORECAST

  insert into public.labor_shift_forecasts (

    tenant_id,
    forecast_date,
    department,
    predicted_orders,
    predicted_revenue,
    recommended_staff_count,
    recommended_labor_hours,
    confidence_score,
    metadata

  )

  values (

    public.get_my_tenant_id(),

    current_date + interval '1 day',

    'foh',

    round(v_avg_orders),

    v_avg_revenue,

    greatest(
      2,
      ceil(v_avg_orders / 40.0)
    ),

    greatest(
      16,
      ceil(v_avg_orders / 40.0) * 8
    ),

    84,

    jsonb_build_object(
      'model', 'historical_order_volume',
      'generated_at', now()
    )

  );

  -- KITCHEN FORECAST

  insert into public.labor_shift_forecasts (

    tenant_id,
    forecast_date,
    department,
    predicted_orders,
    predicted_revenue,
    recommended_staff_count,
    recommended_labor_hours,
    confidence_score,
    metadata

  )

  values (

    public.get_my_tenant_id(),

    current_date + interval '1 day',

    'kitchen',

    round(v_avg_orders),

    v_avg_revenue,

    greatest(
      2,
      ceil(v_avg_orders / 50.0)
    ),

    greatest(
      16,
      ceil(v_avg_orders / 50.0) * 8
    ),

    82,

    jsonb_build_object(
      'model', 'historical_kitchen_load',
      'generated_at', now()
    )

  );

  -- BAR FORECAST

  insert into public.labor_shift_forecasts (

    tenant_id,
    forecast_date,
    department,
    predicted_orders,
    predicted_revenue,
    recommended_staff_count,
    recommended_labor_hours,
    confidence_score,
    metadata

  )

  values (

    public.get_my_tenant_id(),

    current_date + interval '1 day',

    'bar',

    round(v_avg_orders),

    v_avg_revenue,

    greatest(
      1,
      ceil(v_avg_orders / 60.0)
    ),

    greatest(
      8,
      ceil(v_avg_orders / 60.0) * 8
    ),

    79,

    jsonb_build_object(
      'model', 'historical_bar_load',
      'generated_at', now()
    )

  );

  return true;

end;

$$;


ALTER FUNCTION "public"."generate_labor_shift_forecasts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_marketing_campaign_analytics"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

begin

  insert into public.marketing_campaign_analytics (

    tenant_id,
    marketing_campaign_id,
    analytics_date,
    impressions,
    opens,
    clicks,
    conversions,
    revenue_generated,
    conversion_rate,
    roi_percent,
    engagement_score,
    metadata

  )

  select

    mc.tenant_id,

    mc.id,

    current_date,

    coalesce(mcd.delivered_count, 0),

    coalesce(mcd.opened_count, 0),

    coalesce(mcd.clicked_count, 0),

    coalesce(mcd.conversion_count, 0),

    coalesce(mcd.revenue_generated, 0),

    case
      when coalesce(mcd.delivered_count, 0) > 0
      then (
        coalesce(mcd.conversion_count, 0)::numeric /
        mcd.delivered_count::numeric
      ) * 100
      else 0
    end,

    case
      when mc.budget > 0
      then (
        (
          coalesce(mcd.revenue_generated, 0) -
          mc.budget
        ) / mc.budget
      ) * 100
      else 0
    end,

    (
      (
        coalesce(mcd.opened_count, 0) * 0.3
      ) +
      (
        coalesce(mcd.clicked_count, 0) * 0.4
      ) +
      (
        coalesce(mcd.conversion_count, 0) * 0.3
      )
    ),

    jsonb_build_object(

      'campaign_name', mc.campaign_name,
      'campaign_type', mc.campaign_type,
      'generated_at', now()

    )

  from public.marketing_campaigns mc

  left join public.marketing_campaign_deliveries mcd
    on mcd.marketing_campaign_id = mc.id

  where mc.tenant_id =
    public.get_my_tenant_id()

  and mc.campaign_status = 'launched';

  return true;

end;

$$;


ALTER FUNCTION "public"."generate_marketing_campaign_analytics"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_system_health_snapshot"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_failed_jobs integer := 0;

  v_pending_notifications integer := 0;

  v_failed_webhooks integer := 0;

  v_open_security_incidents integer := 0;

begin

  select count(*)
  into v_failed_jobs
  from public.system_jobs
  where tenant_id = public.get_my_tenant_id()
  and status = 'failed';

  insert into public.enterprise_system_health (

    tenant_id,
    health_category,
    health_metric,
    metric_value,
    metric_status,
    warning_threshold,
    critical_threshold,
    metric_metadata

  )

  values (

    public.get_my_tenant_id(),

    'jobs',

    'failed_jobs',

    v_failed_jobs,

    case

      when v_failed_jobs >= 10
      then 'critical'

      when v_failed_jobs >= 5
      then 'warning'

      else 'healthy'

    end,

    5,
    10,

    jsonb_build_object(
      'generated_at', now()
    )

  );

  select count(*)
  into v_pending_notifications
  from public.enterprise_notification_queue
  where tenant_id = public.get_my_tenant_id()
  and delivery_status in ('pending', 'retrying');

  insert into public.enterprise_system_health (

    tenant_id,
    health_category,
    health_metric,
    metric_value,
    metric_status,
    warning_threshold,
    critical_threshold,
    metric_metadata

  )

  values (

    public.get_my_tenant_id(),

    'notifications',

    'pending_notifications',

    v_pending_notifications,

    case

      when v_pending_notifications >= 500
      then 'critical'

      when v_pending_notifications >= 100
      then 'warning'

      else 'healthy'

    end,

    100,
    500,

    jsonb_build_object(
      'generated_at', now()
    )

  );

  select count(*)
  into v_failed_webhooks
  from public.enterprise_webhook_deliveries
  where tenant_id = public.get_my_tenant_id()
  and delivery_status = 'failed';

  insert into public.enterprise_system_health (

    tenant_id,
    health_category,
    health_metric,
    metric_value,
    metric_status,
    warning_threshold,
    critical_threshold,
    metric_metadata

  )

  values (

    public.get_my_tenant_id(),

    'webhooks',

    'failed_webhooks',

    v_failed_webhooks,

    case

      when v_failed_webhooks >= 50
      then 'critical'

      when v_failed_webhooks >= 10
      then 'warning'

      else 'healthy'

    end,

    10,
    50,

    jsonb_build_object(
      'generated_at', now()
    )

  );

  select count(*)
  into v_open_security_incidents
  from public.enterprise_security_incidents
  where tenant_id = public.get_my_tenant_id()
  and incident_status = 'open';

  insert into public.enterprise_system_health (

    tenant_id,
    health_category,
    health_metric,
    metric_value,
    metric_status,
    warning_threshold,
    critical_threshold,
    metric_metadata

  )

  values (

    public.get_my_tenant_id(),

    'security',

    'open_security_incidents',

    v_open_security_incidents,

    case

      when v_open_security_incidents >= 20
      then 'critical'

      when v_open_security_incidents >= 5
      then 'warning'

      else 'healthy'

    end,

    5,
    20,

    jsonb_build_object(
      'generated_at', now()
    )

  );

  return true;

end;

$$;


ALTER FUNCTION "public"."generate_system_health_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_ai_agent_memory"("p_agent_name" "text", "p_memory_type" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 50) RETURNS TABLE("id" "uuid", "memory_type" "text", "memory_key" "text", "memory_value" "jsonb", "relevance_score" numeric, "expires_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

begin

  return query

  select

    aam.id,
    aam.memory_type,
    aam.memory_key,
    aam.memory_value,
    aam.relevance_score,
    aam.expires_at,
    aam.updated_at

  from public.ai_agent_memory aam

  where aam.tenant_id =
    public.get_my_tenant_id()

  and aam.agent_name =
    p_agent_name

  and (
    p_memory_type is null
    or aam.memory_type = p_memory_type
  )

  and (
    aam.expires_at is null
    or aam.expires_at > now()
  )

  order by

    aam.relevance_score desc,
    aam.updated_at desc

  limit p_limit;

end;

$$;


ALTER FUNCTION "public"."get_ai_agent_memory"("p_agent_name" "text", "p_memory_type" "text", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_role_level"() RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

  select rh.level

  from public.staff_accounts sa

  join public.role_hierarchy rh
    on rh.tenant_id = sa.tenant_id
   and rh.role = sa.role

  where sa.auth_user_id = auth.uid()

  limit 1;

$$;


ALTER FUNCTION "public"."get_my_role_level"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_tenant_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

  select tenant_id
  from public.staff_accounts
  where auth_user_id = auth.uid()
  limit 1;

$$;


ALTER FUNCTION "public"."get_my_tenant_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_department_permission"("target_department" "text", "permission_type" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

  select exists (

    select 1

    from public.staff_accounts sa

    join public.department_permissions dp
      on dp.tenant_id = sa.tenant_id
     and dp.role = sa.role

    where sa.auth_user_id = auth.uid()
    and dp.department = target_department

    and (

      (permission_type = 'view' and dp.can_view = true)

      or

      (permission_type = 'create' and dp.can_create = true)

      or

      (permission_type = 'update' and dp.can_update = true)

      or

      (permission_type = 'delete' and dp.can_delete = true)

    )

  );

$$;


ALTER FUNCTION "public"."has_department_permission"("target_department" "text", "permission_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inventory_realtime_event_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

begin

  perform public.publish_realtime_event(

    'inventory_updated',

    'inventory',

    tg_table_name,

    new.id,

    jsonb_build_object(

      'ingredient_id', new.id,
      'name', new.name,
      'current_stock', new.current_stock,
      'minimum_stock', new.minimum_stock,
      'updated_at', now()

    )

  );

  return new;

end;

$$;


ALTER FUNCTION "public"."inventory_realtime_event_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_feature_enabled"("p_feature_key" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

  select coalesce(
    (
      select enabled
      from public.enterprise_feature_flags
      where tenant_id = public.get_my_tenant_id()
      and feature_key = p_feature_key
      limit 1
    ),
    false
  );

$$;


ALTER FUNCTION "public"."is_feature_enabled"("p_feature_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_feature_enabled"("p_feature_key" "text", "p_environment" "text" DEFAULT 'production'::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_feature record;

begin

  select *
  into v_feature

  from public.enterprise_feature_flags

  where tenant_id = public.get_my_tenant_id()

  and feature_key = p_feature_key

  and environment = p_environment

  and enabled = true

  and (
    starts_at is null
    or starts_at <= now()
  )

  and (
    ends_at is null
    or ends_at >= now()
  )

  limit 1;

  if not found then
    return false;
  end if;

  if v_feature.rollout_percentage >= 100 then
    return true;
  end if;

  return (
    mod(
      abs(hashtext(auth.uid()::text)),
      100
    ) < v_feature.rollout_percentage
  );

end;

$$;


ALTER FUNCTION "public"."is_feature_enabled"("p_feature_key" "text", "p_environment" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_period_open"("p_date" "date") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_exists boolean;

begin

  select exists (

    select 1
    from public.financial_periods

    where tenant_id = public.get_my_tenant_id()

    and p_date between start_date and end_date

    and status = 'open'

  )

  into v_exists;

  return v_exists;

end;

$$;


ALTER FUNCTION "public"."is_period_open"("p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kitchen_realtime_event_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

begin

  perform public.publish_realtime_event(

    'kitchen_order_updated',

    'kitchen',

    'kitchen_station_orders',

    new.id,

    jsonb_build_object(

      'kitchen_order_id', new.id,
      'order_id', new.order_id,
      'station_id', new.kitchen_station_id,
      'status', new.status,
      'priority', new.priority,
      'assigned_to', new.assigned_to,
      'updated_at', now()

    )

  );

  return new;

end;

$$;


ALTER FUNCTION "public"."kitchen_realtime_event_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."launch_marketing_campaign"("p_campaign_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_campaign record;

  v_recipient_count integer;

begin

  select *
  into v_campaign
  from public.marketing_campaigns
  where id = p_campaign_id
  and tenant_id = public.get_my_tenant_id();

  if not found then
    raise exception 'Campaign not found';
  end if;

  select count(*)
  into v_recipient_count
  from public.customer_segment_memberships csm
  where csm.tenant_id = public.get_my_tenant_id()
  and csm.customer_segment_id =
      v_campaign.target_segment_id
  and csm.active = true;

  insert into public.marketing_campaign_deliveries (

    tenant_id,
    marketing_campaign_id,
    customer_segment_id,
    delivery_channel,
    delivery_status,
    total_recipients,
    scheduled_at,
    delivered_at,
    metadata

  )

  values (

    public.get_my_tenant_id(),
    v_campaign.id,
    v_campaign.target_segment_id,

    coalesce(
      v_campaign.campaign_content->>'channel',
      'email'
    ),

    'delivered',

    v_recipient_count,

    now(),

    now(),

    jsonb_build_object(
      'launched_by', auth.uid(),
      'campaign_type', v_campaign.campaign_type
    )

  );

  update public.marketing_campaigns
  set
    campaign_status = 'launched',
    launched_at = now()
  where id = v_campaign.id;

  perform public.publish_realtime_event(

    'marketing_campaign_launched',

    'marketing',

    'marketing_campaigns',

    v_campaign.id,

    jsonb_build_object(

      'campaign_id', v_campaign.id,
      'campaign_name', v_campaign.campaign_name,
      'campaign_type', v_campaign.campaign_type,
      'recipient_count', v_recipient_count,
      'launched_at', now()

    )

  );

  return true;

end;

$$;


ALTER FUNCTION "public"."launch_marketing_campaign"("p_campaign_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_api_access"("p_endpoint" "text", "p_request_method" "text", "p_response_status" integer, "p_ip_address" "text" DEFAULT NULL::"text", "p_user_agent" "text" DEFAULT NULL::"text", "p_request_duration_ms" integer DEFAULT NULL::integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_log_id uuid;

begin

  insert into public.api_access_logs (

    tenant_id,
    user_id,
    endpoint,
    request_method,
    response_status,
    ip_address,
    user_agent,
    request_duration_ms

  )

  values (

    public.get_my_tenant_id(),
    auth.uid(),
    p_endpoint,
    p_request_method,
    p_response_status,
    p_ip_address,
    p_user_agent,
    p_request_duration_ms

  )

  returning id into v_log_id;

  return v_log_id;

end;

$$;


ALTER FUNCTION "public"."log_api_access"("p_endpoint" "text", "p_request_method" "text", "p_response_status" integer, "p_ip_address" "text", "p_user_agent" "text", "p_request_duration_ms" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_enterprise_document_access"("p_document_id" "uuid", "p_access_type" "text", "p_ip_address" "text" DEFAULT NULL::"text", "p_user_agent" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_access_log_id uuid;

begin

  insert into public.enterprise_document_access_logs (

    tenant_id,
    enterprise_document_id,
    accessed_by,
    access_type,
    ip_address,
    user_agent,
    metadata

  )

  values (

    public.get_my_tenant_id(),
    p_document_id,
    auth.uid(),
    p_access_type,
    p_ip_address,
    p_user_agent,
    p_metadata

  )

  returning id into v_access_log_id;

  return v_access_log_id;

end;

$$;


ALTER FUNCTION "public"."log_enterprise_document_access"("p_document_id" "uuid", "p_access_type" "text", "p_ip_address" "text", "p_user_agent" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_security_event"("p_event_type" "text", "p_severity" "text", "p_event_details" "jsonb" DEFAULT '{}'::"jsonb", "p_ip_address" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_event_id uuid;

begin

  insert into public.security_events (

    tenant_id,
    event_type,
    severity,
    user_id,
    ip_address,
    event_details

  )

  values (

    public.get_my_tenant_id(),
    p_event_type,
    p_severity,
    auth.uid(),
    p_ip_address,
    p_event_details

  )

  returning id into v_event_id;

  return v_event_id;

end;

$$;


ALTER FUNCTION "public"."log_security_event"("p_event_type" "text", "p_severity" "text", "p_event_details" "jsonb", "p_ip_address" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_announcement_as_read"("p_announcement_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_read_id uuid;

begin

  insert into public.enterprise_announcement_reads (

    tenant_id,
    announcement_id,
    user_id

  )

  values (

    public.get_my_tenant_id(),
    p_announcement_id,
    auth.uid()

  )

  on conflict (

    tenant_id,
    announcement_id,
    user_id

  )

  do update set

    read_at = now()

  returning id into v_read_id;

  return v_read_id;

end;

$$;


ALTER FUNCTION "public"."mark_announcement_as_read"("p_announcement_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_websocket_event_delivered"("p_queue_id" "uuid", "p_response_message" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_queue record;

begin

  select *
  into v_queue
  from public.websocket_event_queue
  where id = p_queue_id
  and tenant_id = public.get_my_tenant_id();

  if not found then
    raise exception 'Websocket queue item not found';
  end if;

  update public.websocket_event_queue
  set
    delivery_status = 'delivered',
    delivered_at = now()
  where id = p_queue_id;

  insert into public.websocket_delivery_logs (

    tenant_id,
    websocket_session_id,
    websocket_event_queue_id,
    realtime_event_id,
    delivery_status,
    response_message,
    delivery_attempt

  )

  values (

    v_queue.tenant_id,
    v_queue.websocket_session_id,
    v_queue.id,
    v_queue.realtime_event_id,
    'delivered',
    p_response_message,
    v_queue.retry_count + 1

  );

  return true;

end;

$$;


ALTER FUNCTION "public"."mark_websocket_event_delivered"("p_queue_id" "uuid", "p_response_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notification_realtime_event_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

begin

  perform public.publish_realtime_event(

    'notification_created',

    'notifications',

    'enterprise_notifications',

    new.id,

    jsonb_build_object(

      'notification_id', new.id,
      'title', new.title,
      'message', new.message,
      'severity', new.severity,
      'target_role', new.target_role,
      'created_at', new.created_at

    )

  );

  return new;

end;

$$;


ALTER FUNCTION "public"."notification_realtime_event_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."order_realtime_event_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

begin

  perform public.publish_realtime_event(

    'order_updated',

    'orders',

    'orders',

    new.id,

    jsonb_build_object(

      'order_id', new.id,
      'status', new.status,
      'table_id', new.table_id,
      'total_amount', new.total_amount,
      'updated_at', now()

    )

  );

  return new;

end;

$$;


ALTER FUNCTION "public"."order_realtime_event_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_changes_in_closed_period"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_date date;

begin

  v_date := coalesce(

    new.created_at::date,
    old.created_at::date,
    current_date

  );

  if not public.is_period_open(v_date) then

    raise exception
    'Financial period is closed';

  end if;

  return coalesce(new, old);

end;

$$;


ALTER FUNCTION "public"."prevent_changes_in_closed_period"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_ai_agent_task"("p_task_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_task record;

begin

  select *
  into v_task
  from public.ai_agent_tasks
  where id = p_task_id
  and tenant_id = public.get_my_tenant_id();

  if not found then
    raise exception 'AI task not found';
  end if;

  update public.ai_agent_tasks
  set
    task_status = 'processing',
    started_at = now()
  where id = p_task_id;

  -- SIMULATED AI PROCESSING LOGIC

  update public.ai_agent_tasks
  set

    task_status = 'completed',

    completed_at = now(),

    result_payload = jsonb_build_object(

      'status', 'success',
      'processed_by', coalesce(
        v_task.assigned_agent,
        'default_ai_agent'
      ),
      'processed_at', now(),
      'task_type', v_task.task_type

    )

  where id = p_task_id;

  perform public.publish_realtime_event(

    'ai_task_completed',

    'ai_agents',

    'ai_agent_tasks',

    p_task_id,

    jsonb_build_object(

      'task_id', p_task_id,
      'task_type', v_task.task_type,
      'status', 'completed',
      'completed_at', now()

    )

  );

  return true;

exception when others then

  update public.ai_agent_tasks
  set
    task_status = 'failed',
    error_message = sqlerrm
  where id = p_task_id;

  raise;

end;

$$;


ALTER FUNCTION "public"."process_ai_agent_task"("p_task_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_approval"("p_request_id" "uuid", "p_action" "text", "p_reason" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_request record;

  v_workflow record;

  v_next_step jsonb;

  v_user_role text;

begin

  select *
  into v_request
  from public.approval_requests
  where id = p_request_id
  and tenant_id = public.get_my_tenant_id();

  if not found then
    raise exception 'Approval request not found';
  end if;

  select *
  into v_workflow
  from public.approval_workflows
  where id = v_request.workflow_id;

  select role
  into v_user_role
  from public.staff_accounts
  where auth_user_id = auth.uid()
  limit 1;

  select step_data
  into v_next_step
  from jsonb_array_elements(v_workflow.approval_steps) step_data
  where (step_data->>'step')::integer = v_request.current_step
  limit 1;

  if v_next_step is null then
    raise exception 'Approval step not found';
  end if;

  if v_next_step->>'role' != v_user_role then
    raise exception 'Unauthorized approval role';
  end if;

  if p_action = 'approve' then

    if exists (

      select 1
      from jsonb_array_elements(v_workflow.approval_steps) step_data
      where (step_data->>'step')::integer = v_request.current_step + 1

    ) then

      update public.approval_requests
      set
        current_step = current_step + 1,
        approved_by = auth.uid(),
        approved_at = now(),
        status = 'in_progress'
      where id = p_request_id;

    else

      update public.approval_requests
      set
        approved_by = auth.uid(),
        approved_at = now(),
        status = 'approved'
      where id = p_request_id;

    end if;

  elsif p_action = 'reject' then

    update public.approval_requests
    set
      rejected_by = auth.uid(),
      rejected_at = now(),
      rejection_reason = p_reason,
      status = 'rejected'
    where id = p_request_id;

  else

    raise exception 'Invalid action';

  end if;

  return true;

end;

$$;


ALTER FUNCTION "public"."process_approval"("p_request_id" "uuid", "p_action" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_notification_queue"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_notification record;

  v_processed_count integer := 0;

begin

  for v_notification in

    select *
    from public.enterprise_notification_queue

    where tenant_id = public.get_my_tenant_id()

    and delivery_status in ('pending', 'retrying')

    and scheduled_at <= now()

    order by scheduled_at asc

  loop

    begin

      -- SIMULATED DELIVERY ENGINE

      update public.enterprise_notification_queue
      set

        delivery_status = 'delivered',

        delivered_at = now(),

        error_message = null

      where id = v_notification.id;

      v_processed_count :=
        v_processed_count + 1;

      perform public.publish_realtime_event(

        'notification_delivered',

        'notifications',

        'enterprise_notification_queue',

        v_notification.id,

        jsonb_build_object(

          'notification_id', v_notification.id,
          'delivery_channel', v_notification.delivery_channel,
          'recipient_email', v_notification.recipient_email,
          'delivered_at', now()

        )

      );

    exception when others then

      update public.enterprise_notification_queue
      set

        delivery_status = case

          when retry_count + 1 >= 3
          then 'failed'

          else 'retrying'

        end,

        retry_count = retry_count + 1,

        failed_at = now(),

        error_message = sqlerrm

      where id = v_notification.id;

    end;

  end loop;

  return v_processed_count;

end;

$$;


ALTER FUNCTION "public"."process_notification_queue"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_pending_ai_agent_tasks"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_task record;

  v_processed_count integer := 0;

begin

  for v_task in

    select *
    from public.ai_agent_tasks

    where tenant_id = public.get_my_tenant_id()

    and task_status = 'pending'

    and (
      scheduled_at is null
      or scheduled_at <= now()
    )

    order by

      case priority
        when 'critical' then 1
        when 'high' then 2
        when 'medium' then 3
        when 'low' then 4
        else 5
      end,

      created_at asc

  loop

    perform public.process_ai_agent_task(
      v_task.id
    );

    v_processed_count :=
      v_processed_count + 1;

  end loop;

  return v_processed_count;

end;

$$;


ALTER FUNCTION "public"."process_pending_ai_agent_tasks"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_pending_webhook_deliveries"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_delivery record;

  v_processed_count integer := 0;

begin

  for v_delivery in

    select *
    from public.enterprise_webhook_deliveries

    where tenant_id = public.get_my_tenant_id()

    and delivery_status in ('pending', 'retrying')

    and (
      next_retry_at is null
      or next_retry_at <= now()
    )

    order by created_at asc

  loop

    -- SIMULATED WEBHOOK DELIVERY

    update public.enterprise_webhook_deliveries
    set

      delivery_status = 'delivered',

      response_status = 200,

      response_body = 'Webhook delivered successfully',

      delivered_at = now()

    where id = v_delivery.id;

    update public.enterprise_webhooks
    set

      last_triggered_at = now(),

      last_success_at = now(),

      updated_at = now()

    where id = v_delivery.enterprise_webhook_id;

    v_processed_count :=
      v_processed_count + 1;

  end loop;

  return v_processed_count;

exception when others then

  update public.enterprise_webhook_deliveries
  set

    delivery_status = 'retrying',

    retry_count = retry_count + 1,

    next_retry_at = now() + interval '5 minutes',

    response_body = sqlerrm

  where id = v_delivery.id;

  update public.enterprise_webhooks
  set

    last_failure_at = now(),

    updated_at = now()

  where id = v_delivery.enterprise_webhook_id;

  raise;

end;

$$;


ALTER FUNCTION "public"."process_pending_webhook_deliveries"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_production_run"("p_order_id" "uuid", "p_order_item_id" "uuid", "p_dish_id" "uuid", "p_quantity" numeric) RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_recipe record;

  v_total_cost numeric := 0;

  v_ingredient_cost numeric;

begin

  for v_recipe in

    select *
    from public.recipe_items

    where tenant_id = public.get_my_tenant_id()
    and dish_id = p_dish_id

  loop

    v_ingredient_cost := public.consume_inventory_fifo(

      v_recipe.ingredient_id,

      v_recipe.quantity * p_quantity

    );

    v_total_cost :=
      v_total_cost + v_ingredient_cost;

    insert into public.inventory_transactions (

      tenant_id,
      ingredient_id,
      transaction_type,
      quantity,
      reference_type,
      reference_id,
      created_at

    )

    values (

      public.get_my_tenant_id(),
      v_recipe.ingredient_id,
      'production_consumption',
      (v_recipe.quantity * p_quantity) * -1,
      'production_run',
      p_order_item_id,
      now()

    );

  end loop;

  insert into public.production_runs (

    tenant_id,
    order_id,
    order_item_id,
    dish_id,
    quantity,
    total_cost,
    produced_by

  )

  values (

    public.get_my_tenant_id(),
    p_order_id,
    p_order_item_id,
    p_dish_id,
    p_quantity,
    v_total_cost,
    auth.uid()

  );

  return v_total_cost;

end;

$$;


ALTER FUNCTION "public"."process_production_run"("p_order_id" "uuid", "p_order_item_id" "uuid", "p_dish_id" "uuid", "p_quantity" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_scheduled_integrations"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_integration record;

  v_processed_count integer := 0;

begin

  for v_integration in

    select *
    from public.enterprise_integrations

    where tenant_id = public.get_my_tenant_id()

    and active = true

    and (
      next_sync_at is null
      or next_sync_at <= now()
    )

  loop

    perform public.sync_enterprise_integration(

      v_integration.id,
      'scheduled'

    );

    v_processed_count :=
      v_processed_count + 1;

  end loop;

  return v_processed_count;

end;

$$;


ALTER FUNCTION "public"."process_scheduled_integrations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_warehouse_transfer"("p_transfer_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_transfer record;

begin

  select *
  into v_transfer
  from public.warehouse_transfers
  where id = p_transfer_id
  and tenant_id = public.get_my_tenant_id();

  if not found then
    raise exception 'Transfer not found';
  end if;

  if v_transfer.transfer_status != 'pending' then
    raise exception 'Transfer already processed';
  end if;

  update public.warehouse_inventory
  set
    quantity = quantity - v_transfer.quantity,
    updated_at = now()
  where warehouse_location_id =
    v_transfer.from_location_id
  and ingredient_id =
    v_transfer.ingredient_id;

  insert into public.warehouse_inventory (

    tenant_id,
    warehouse_location_id,
    ingredient_id,
    quantity,
    updated_at

  )

  values (

    public.get_my_tenant_id(),
    v_transfer.to_location_id,
    v_transfer.ingredient_id,
    v_transfer.quantity,
    now()

  )

  on conflict (
    warehouse_location_id,
    ingredient_id
  )

  do update set

    quantity =
      warehouse_inventory.quantity +
      excluded.quantity,

    updated_at = now();

  update public.warehouse_transfers
  set
    transfer_status = 'completed',
    approved_by = auth.uid(),
    approved_at = now(),
    transferred_at = now()
  where id = p_transfer_id;

  return true;

end;

$$;


ALTER FUNCTION "public"."process_warehouse_transfer"("p_transfer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."publish_realtime_event"("p_event_type" "text", "p_event_category" "text", "p_reference_table" "text" DEFAULT NULL::"text", "p_reference_id" "uuid" DEFAULT NULL::"uuid", "p_payload" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_event_id uuid;

begin

  insert into public.realtime_events (

    tenant_id,
    event_type,
    event_category,
    reference_table,
    reference_id,
    payload

  )

  values (

    public.get_my_tenant_id(),
    p_event_type,
    p_event_category,
    p_reference_table,
    p_reference_id,
    p_payload

  )

  returning id into v_event_id;

  return v_event_id;

end;

$$;


ALTER FUNCTION "public"."publish_realtime_event"("p_event_type" "text", "p_event_category" "text", "p_reference_table" "text", "p_reference_id" "uuid", "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."queue_notification_from_template"("p_template_id" "uuid", "p_recipient_user_id" "uuid" DEFAULT NULL::"uuid", "p_recipient_email" "text" DEFAULT NULL::"text", "p_recipient_phone" "text" DEFAULT NULL::"text", "p_template_variables" "jsonb" DEFAULT '{}'::"jsonb", "p_scheduled_at" timestamp with time zone DEFAULT "now"()) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_template record;

  v_queue_id uuid;

  v_subject text;

  v_body text;

begin

  select *
  into v_template
  from public.enterprise_notification_templates
  where id = p_template_id
  and tenant_id = public.get_my_tenant_id()
  and active = true;

  if not found then
    raise exception 'Notification template not found';
  end if;

  v_subject := v_template.subject_template;
  v_body := v_template.body_template;

  insert into public.enterprise_notification_queue (

    tenant_id,
    template_id,
    recipient_user_id,
    recipient_email,
    recipient_phone,
    delivery_channel,
    notification_subject,
    notification_body,
    template_variables,
    scheduled_at

  )

  values (

    public.get_my_tenant_id(),
    p_template_id,
    p_recipient_user_id,
    p_recipient_email,
    p_recipient_phone,
    v_template.delivery_channel,
    v_subject,
    v_body,
    p_template_variables,
    p_scheduled_at

  )

  returning id into v_queue_id;

  return v_queue_id;

end;

$$;


ALTER FUNCTION "public"."queue_notification_from_template"("p_template_id" "uuid", "p_recipient_user_id" "uuid", "p_recipient_email" "text", "p_recipient_phone" "text", "p_template_variables" "jsonb", "p_scheduled_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."queue_realtime_event_delivery"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

begin

  insert into public.websocket_event_queue (

    tenant_id,
    websocket_session_id,
    realtime_event_id,
    delivery_status

  )

  select

    ws.tenant_id,

    ws.id,

    new.id,

    'pending'

  from public.websocket_sessions ws

  where ws.tenant_id = new.tenant_id
  and ws.active = true

  and (

    ws.subscribed_events = '[]'::jsonb

    or

    ws.subscribed_events ? new.event_type

    or

    ws.subscribed_events ? new.event_category

  );

  return new;

end;

$$;


ALTER FUNCTION "public"."queue_realtime_event_delivery"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."queue_webhook_deliveries_for_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

begin

  insert into public.enterprise_webhook_deliveries (

    tenant_id,
    enterprise_webhook_id,
    event_type,
    payload,
    delivery_status

  )

  select

    ew.tenant_id,

    ew.id,

    new.event_type,

    jsonb_build_object(

      'event_id', new.id,
      'event_type', new.event_type,
      'event_category', new.event_category,
      'reference_table', new.reference_table,
      'reference_id', new.reference_id,
      'payload', new.payload,
      'created_at', new.created_at

    ),

    'pending'

  from public.enterprise_webhooks ew

  where ew.tenant_id = new.tenant_id

  and ew.active = true

  and (
    ew.event_types = '[]'::jsonb
    or ew.event_types ? new.event_type
  );

  return new;

end;

$$;


ALTER FUNCTION "public"."queue_webhook_deliveries_for_event"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."realtime_workflow_event_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

begin

  perform public.trigger_event_workflows(

    new.event_type,

    jsonb_build_object(

      'event_id', new.id,
      'event_type', new.event_type,
      'event_category', new.event_category,
      'reference_table', new.reference_table,
      'reference_id', new.reference_id,
      'payload', new.payload,
      'created_at', new.created_at

    )

  );

  return new;

end;

$$;


ALTER FUNCTION "public"."realtime_workflow_event_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_enterprise_api_key"("p_key_name" "text", "p_api_provider" "text", "p_api_key_hash" "text", "p_key_prefix" "text" DEFAULT NULL::"text", "p_permissions" "jsonb" DEFAULT '[]'::"jsonb", "p_expires_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_api_key_id uuid;

begin

  insert into public.enterprise_api_keys (

    tenant_id,
    key_name,
    api_provider,
    api_key_hash,
    key_prefix,
    permissions,
    expires_at,
    created_by

  )

  values (

    public.get_my_tenant_id(),
    p_key_name,
    p_api_provider,
    p_api_key_hash,
    p_key_prefix,
    p_permissions,
    p_expires_at,
    auth.uid()

  )

  returning id into v_api_key_id;

  return v_api_key_id;

end;

$$;


ALTER FUNCTION "public"."register_enterprise_api_key"("p_key_name" "text", "p_api_provider" "text", "p_api_key_hash" "text", "p_key_prefix" "text", "p_permissions" "jsonb", "p_expires_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_websocket_session"("p_connection_id" "text", "p_channel_name" "text", "p_subscribed_events" "jsonb" DEFAULT '[]'::"jsonb", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_session_id uuid;

begin

  insert into public.websocket_sessions (

    tenant_id,
    user_id,
    connection_id,
    channel_name,
    subscribed_events,
    metadata

  )

  values (

    public.get_my_tenant_id(),
    auth.uid(),
    p_connection_id,
    p_channel_name,
    p_subscribed_events,
    p_metadata

  )

  returning id into v_session_id;

  return v_session_id;

end;

$$;


ALTER FUNCTION "public"."register_websocket_session"("p_connection_id" "text", "p_channel_name" "text", "p_subscribed_events" "jsonb", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_approval"("p_workflow_type" "text", "p_reference_table" "text", "p_reference_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_workflow_id uuid;

  v_request_id uuid;

begin

  select id
  into v_workflow_id

  from public.approval_workflows

  where workflow_type = p_workflow_type
  and tenant_id = public.get_my_tenant_id()
  and active = true

  limit 1;

  if v_workflow_id is null then
    raise exception 'Workflow not found';
  end if;

  insert into public.approval_requests (

    tenant_id,
    workflow_id,
    reference_table,
    reference_id,
    requested_by

  )

  values (

    public.get_my_tenant_id(),
    v_workflow_id,
    p_reference_table,
    p_reference_id,
    auth.uid()

  )

  returning id into v_request_id;

  return v_request_id;

end;

$$;


ALTER FUNCTION "public"."request_approval"("p_workflow_type" "text", "p_reference_table" "text", "p_reference_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."retry_failed_websocket_events"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_retry_count integer := 0;

begin

  update public.websocket_event_queue
  set
    retry_count = retry_count + 1,
    last_retry_at = now(),
    delivery_status = 'retrying'
  where tenant_id = public.get_my_tenant_id()
  and delivery_status in ('failed', 'retrying')
  and retry_count < 5;

  get diagnostics v_retry_count = row_count;

  insert into public.websocket_delivery_logs (

    tenant_id,
    websocket_session_id,
    websocket_event_queue_id,
    realtime_event_id,
    delivery_status,
    response_message,
    delivery_attempt

  )

  select

    weq.tenant_id,
    weq.websocket_session_id,
    weq.id,
    weq.realtime_event_id,
    'retrying',
    'Automatic websocket retry initiated',
    weq.retry_count

  from public.websocket_event_queue weq

  where weq.tenant_id = public.get_my_tenant_id()
  and weq.delivery_status = 'retrying'
  and weq.last_retry_at::date = current_date;

  return v_retry_count;

end;

$$;


ALTER FUNCTION "public"."retry_failed_websocket_events"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_enterprise_api_key"("p_api_key_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

begin

  update public.enterprise_api_keys
  set

    revoked = true,

    revoked_at = now()

  where id = p_api_key_id

  and tenant_id = public.get_my_tenant_id();

  perform public.publish_realtime_event(

    'enterprise_api_key_revoked',

    'security',

    'enterprise_api_keys',

    p_api_key_id,

    jsonb_build_object(

      'api_key_id', p_api_key_id,
      'revoked_by', auth.uid(),
      'revoked_at', now()

    )

  );

  return true;

end;

$$;


ALTER FUNCTION "public"."revoke_enterprise_api_key"("p_api_key_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_enterprise_health_checks"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

begin

  -- LOW STOCK HEALTH

  insert into public.enterprise_health_checks (

    tenant_id,
    check_name,
    check_category,
    status,
    message,
    metadata

  )

  select

    public.get_my_tenant_id(),

    'inventory_low_stock_check',

    'inventory',

    case
      when count(*) > 0
      then 'warning'
      else 'healthy'
    end,

    case
      when count(*) > 0
      then 'Low stock items detected'
      else 'Inventory healthy'
    end,

    jsonb_build_object(
      'low_stock_count',
      count(*)
    )

  from public.ingredients

  where tenant_id =
    public.get_my_tenant_id()

  and current_stock <= minimum_stock;

  -- KITCHEN PERFORMANCE HEALTH

  insert into public.enterprise_health_checks (

    tenant_id,
    check_name,
    check_category,
    status,
    message,
    metadata

  )

  select

    public.get_my_tenant_id(),

    'kitchen_performance_check',

    'operations',

    case
      when avg(performance_score) < 70
      then 'warning'
      else 'healthy'
    end,

    case
      when avg(performance_score) < 70
      then 'Kitchen performance below threshold'
      else 'Kitchen performance healthy'
    end,

    jsonb_build_object(
      'average_score',
      avg(performance_score)
    )

  from public.kitchen_station_performance

  where tenant_id =
    public.get_my_tenant_id()

  and snapshot_date = current_date;

  -- CUSTOMER EXPERIENCE HEALTH

  insert into public.enterprise_health_checks (

    tenant_id,
    check_name,
    check_category,
    status,
    message,
    metadata

  )

  select

    public.get_my_tenant_id(),

    'customer_feedback_check',

    'customer_service',

    case
      when count(*) > 5
      then 'critical'
      when count(*) > 0
      then 'warning'
      else 'healthy'
    end,

    case
      when count(*) > 5
      then 'High volume of unresolved negative feedback'
      when count(*) > 0
      then 'Negative customer feedback detected'
      else 'Customer experience healthy'
    end,

    jsonb_build_object(
      'negative_feedback_count',
      count(*)
    )

  from public.customer_feedback

  where tenant_id =
    public.get_my_tenant_id()

  and sentiment = 'negative'
  and resolved = false;

  return true;

end;

$$;


ALTER FUNCTION "public"."run_enterprise_health_checks"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_production_atomic"("p_tenant_id" "uuid", "p_dish_id" "uuid", "p_quantity" numeric) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  r RECORD;
  needed NUMERIC;
BEGIN

  -- 1. CHECK RECIPE EXISTS
  IF NOT EXISTS (
    SELECT 1 FROM recipe_items
    WHERE tenant_id = p_tenant_id
    AND dish_id = p_dish_id
  ) THEN
    RAISE EXCEPTION 'No recipe found';
  END IF;

  -- 2. VALIDATE STOCK
  FOR r IN
    SELECT ingredient_id, quantity
    FROM recipe_items
    WHERE tenant_id = p_tenant_id
    AND dish_id = p_dish_id
  LOOP
    needed := r.quantity * p_quantity;

    IF (
      SELECT quantity FROM ingredient_stock
      WHERE tenant_id = p_tenant_id
      AND ingredient_id = r.ingredient_id
    ) < needed THEN
      RAISE EXCEPTION 'Not enough ingredient stock';
    END IF;
  END LOOP;

  -- 3. DEDUCT INGREDIENTS
  FOR r IN
    SELECT ingredient_id, quantity
    FROM recipe_items
    WHERE tenant_id = p_tenant_id
    AND dish_id = p_dish_id
  LOOP
    needed := r.quantity * p_quantity;

    UPDATE ingredient_stock
    SET quantity = quantity - needed
    WHERE tenant_id = p_tenant_id
    AND ingredient_id = r.ingredient_id;

    INSERT INTO stock_movements (
      tenant_id,
      item_type,
      item_id,
      movement_type,
      quantity
    )
    VALUES (
      p_tenant_id,
      'ingredient',
      r.ingredient_id,
      'production_out',
      needed
    );
  END LOOP;

  -- 4. ADD DISH STOCK
  UPDATE dish_stock
  SET quantity = quantity + p_quantity
  WHERE tenant_id = p_tenant_id
  AND dish_id = p_dish_id;

  INSERT INTO stock_movements (
    tenant_id,
    item_type,
    item_id,
    movement_type,
    quantity
  )
  VALUES (
    p_tenant_id,
    'dish',
    p_dish_id,
    'production_in',
    p_quantity
  );

END;
$$;


ALTER FUNCTION "public"."run_production_atomic"("p_tenant_id" "uuid", "p_dish_id" "uuid", "p_quantity" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_system_job"("p_job_name" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

begin

  update public.system_jobs
  set
    status = 'running',
    last_run_at = now()
  where tenant_id = public.get_my_tenant_id()
  and job_name = p_job_name;

  if p_job_name = 'inventory_snapshot_job' then

    perform public.generate_inventory_snapshot();

  elsif p_job_name = 'inventory_alert_job' then

    perform public.check_inventory_alerts();

  elsif p_job_name = 'kitchen_performance_job' then

    perform public.calculate_kitchen_station_performance();

  elsif p_job_name = 'ai_insight_job' then

    perform public.generate_ai_business_insights();

    perform public.generate_ai_recommendations();

  elsif p_job_name = 'executive_dashboard_job' then

    perform public.generate_executive_dashboard_snapshot();

  elsif p_job_name = 'enterprise_health_check_job' then

    perform public.run_enterprise_health_checks();

  elsif p_job_name = 'automated_notification_job' then

    perform public.generate_automated_notifications();

  elsif p_job_name = 'backup_monitoring_job' then

    perform public.create_enterprise_notification(

      'backup_monitoring',
      'system',
      'Backup Monitoring Check',
      'Backup monitoring job executed successfully.',
      'info',
      'owner',
      null

    );

  elsif p_job_name = 'enterprise_audit_summary_job' then

    perform public.generate_enterprise_audit_summary();

  elsif p_job_name = 'websocket_retry_job' then

    perform public.retry_failed_websocket_events();

  elsif p_job_name = 'presence_cleanup_job' then

    perform public.cleanup_stale_presence();

  elsif p_job_name = 'cross_location_consolidation_job' then

    perform public.generate_cross_location_consolidation();

  elsif p_job_name = 'ai_forecast_job' then

    perform public.generate_ai_forecasts();

  elsif p_job_name = 'labor_shift_forecast_job' then

    perform public.generate_labor_shift_forecasts();

  elsif p_job_name = 'customer_segmentation_job' then

    perform public.assign_customer_segments();

  elsif p_job_name = 'marketing_campaign_analytics_job' then

    perform public.generate_marketing_campaign_analytics();

  elsif p_job_name = 'ai_campaign_recommendation_job' then

    perform public.generate_ai_campaign_recommendations();

  elsif p_job_name = 'ai_agent_processing_job' then

    perform public.process_pending_ai_agent_tasks();

  elsif p_job_name = 'ai_memory_cleanup_job' then

    perform public.cleanup_expired_ai_agent_memory();

  elsif p_job_name = 'enterprise_integration_sync_job' then

    perform public.process_scheduled_integrations();

  elsif p_job_name = 'webhook_delivery_job' then

    perform public.process_pending_webhook_deliveries();

  elsif p_job_name = 'notification_queue_processing_job' then

    perform public.process_notification_queue();

  elsif p_job_name = 'security_incident_detection_job' then

    perform public.detect_suspicious_api_key_activity();

  elsif p_job_name = 'rate_limit_cleanup_job' then

    perform public.cleanup_expired_rate_limit_logs();

  elsif p_job_name = 'system_health_snapshot_job' then

    perform public.generate_system_health_snapshot();

  end if;

  update public.system_jobs
  set
    status = 'completed',
    last_result = 'success',

    next_run_at = case

      when run_frequency = 'hourly'
      then now() + interval '1 hour'

      when run_frequency = 'daily'
      then now() + interval '1 day'

      when run_frequency = 'weekly'
      then now() + interval '7 days'

      else now() + interval '1 day'

    end

  where tenant_id = public.get_my_tenant_id()
  and job_name = p_job_name;

  return true;

exception when others then

  update public.system_jobs
  set
    status = 'failed',
    last_result = sqlerrm
  where tenant_id = public.get_my_tenant_id()
  and job_name = p_job_name;

  raise;

end;

$$;


ALTER FUNCTION "public"."run_system_job"("p_job_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."same_tenant"("target_tenant_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

  select exists (

    select 1
    from public.staff_accounts
    where auth_user_id = auth.uid()
    and tenant_id = target_tenant_id

  );

$$;


ALTER FUNCTION "public"."same_tenant"("target_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_feature_flag"("p_feature_key" "text", "p_feature_name" "text", "p_feature_category" "text", "p_enabled" boolean DEFAULT false, "p_rollout_percentage" numeric DEFAULT 100, "p_feature_config" "jsonb" DEFAULT '{}'::"jsonb", "p_environment" "text" DEFAULT 'production'::"text", "p_starts_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_ends_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_feature_id uuid;

begin

  insert into public.enterprise_feature_flags (

    tenant_id,
    feature_key,
    feature_name,
    feature_category,
    enabled,
    rollout_percentage,
    feature_config,
    environment,
    starts_at,
    ends_at,
    created_by,
    updated_at

  )

  values (

    public.get_my_tenant_id(),
    p_feature_key,
    p_feature_name,
    p_feature_category,
    p_enabled,
    p_rollout_percentage,
    p_feature_config,
    p_environment,
    p_starts_at,
    p_ends_at,
    auth.uid(),
    now()

  )

  on conflict (

    tenant_id,
    feature_key,
    environment

  )

  do update set

    feature_name = excluded.feature_name,
    feature_category = excluded.feature_category,
    enabled = excluded.enabled,
    rollout_percentage = excluded.rollout_percentage,
    feature_config = excluded.feature_config,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    updated_at = now()

  returning id into v_feature_id;

  return v_feature_id;

end;

$$;


ALTER FUNCTION "public"."set_feature_flag"("p_feature_key" "text", "p_feature_name" "text", "p_feature_category" "text", "p_enabled" boolean, "p_rollout_percentage" numeric, "p_feature_config" "jsonb", "p_environment" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_tenant_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

begin

  if new.tenant_id is null then
    new.tenant_id := public.get_my_tenant_id();
  end if;

  return new;

end;

$$;


ALTER FUNCTION "public"."set_tenant_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_enterprise_integration"("p_integration_id" "uuid", "p_sync_type" "text" DEFAULT 'manual'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_integration record;

  v_sync_log_id uuid;

begin

  select *
  into v_integration
  from public.enterprise_integrations
  where id = p_integration_id
  and tenant_id = public.get_my_tenant_id();

  if not found then
    raise exception 'Integration not found';
  end if;

  insert into public.enterprise_integration_sync_logs (

    tenant_id,
    enterprise_integration_id,
    sync_type,
    sync_status,
    sync_started_at

  )

  values (

    public.get_my_tenant_id(),
    p_integration_id,
    p_sync_type,
    'running',
    now()

  )

  returning id into v_sync_log_id;

  -- SIMULATED INTEGRATION SYNC

  update public.enterprise_integration_sync_logs
  set

    sync_status = 'completed',

    records_processed = 100,

    records_failed = 0,

    sync_completed_at = now(),

    response_payload = jsonb_build_object(

      'provider', v_integration.provider,
      'integration_type', v_integration.integration_type,
      'sync_result', 'success',
      'synced_at', now()

    )

  where id = v_sync_log_id;

  update public.enterprise_integrations
  set

    connection_status = 'connected',

    last_sync_at = now(),

    next_sync_at = case

      when sync_frequency = 'hourly'
      then now() + interval '1 hour'

      when sync_frequency = 'daily'
      then now() + interval '1 day'

      when sync_frequency = 'weekly'
      then now() + interval '7 days'

      else now() + interval '1 hour'

    end,

    updated_at = now()

  where id = p_integration_id;

  perform public.publish_realtime_event(

    'integration_sync_completed',

    'integrations',

    'enterprise_integrations',

    p_integration_id,

    jsonb_build_object(

      'integration_id', p_integration_id,
      'provider', v_integration.provider,
      'sync_log_id', v_sync_log_id,
      'status', 'completed'

    )

  );

  return v_sync_log_id;

exception when others then

  if v_sync_log_id is not null then

    update public.enterprise_integration_sync_logs
    set

      sync_status = 'failed',

      error_message = sqlerrm,

      sync_completed_at = now()

    where id = v_sync_log_id;

  end if;

  raise;

end;

$$;


ALTER FUNCTION "public"."sync_enterprise_integration"("p_integration_id" "uuid", "p_sync_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_event_workflows"("p_event_name" "text", "p_input_payload" "jsonb" DEFAULT '{}'::"jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_workflow record;

  v_triggered_count integer := 0;

begin

  for v_workflow in

    select *
    from public.enterprise_workflows

    where tenant_id = public.get_my_tenant_id()

    and active = true

    and workflow_status = 'active'

    and trigger_event = p_event_name

  loop

    perform public.execute_enterprise_workflow(

      v_workflow.id,
      p_event_name,
      p_input_payload

    );

    v_triggered_count :=
      v_triggered_count + 1;

  end loop;

  return v_triggered_count;

end;

$$;


ALTER FUNCTION "public"."trigger_event_workflows"("p_event_name" "text", "p_input_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_customer_loyalty"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_customer record;

  v_points numeric;

  v_tier text;

begin

  if new.status = 'paid' then

    v_points := floor(
      coalesce(new.total_amount, 0)
    );

    select *
    into v_customer
    from public.customer_loyalty_accounts
    where tenant_id = new.tenant_id
    and customer_phone = new.customer_phone
    limit 1;

    if found then

      update public.customer_loyalty_accounts
      set

        loyalty_points =
          loyalty_points + v_points,

        total_spent =
          total_spent + coalesce(new.total_amount, 0),

        visit_count =
          visit_count + 1,

        last_visit_at = now(),

        tier = case

          when (
            total_spent + coalesce(new.total_amount, 0)
          ) >= 100000
          then 'platinum'

          when (
            total_spent + coalesce(new.total_amount, 0)
          ) >= 50000
          then 'gold'

          when (
            total_spent + coalesce(new.total_amount, 0)
          ) >= 10000
          then 'silver'

          else 'bronze'

        end

      where id = v_customer.id;

    else

      insert into public.customer_loyalty_accounts (

        tenant_id,
        customer_name,
        customer_phone,
        loyalty_points,
        total_spent,
        visit_count,
        tier,
        last_visit_at

      )

      values (

        new.tenant_id,
        coalesce(new.customer_name, 'Guest'),
        new.customer_phone,
        v_points,
        coalesce(new.total_amount, 0),
        1,

        case

          when coalesce(new.total_amount, 0)
            >= 100000
          then 'platinum'

          when coalesce(new.total_amount, 0)
            >= 50000
          then 'gold'

          when coalesce(new.total_amount, 0)
            >= 10000
          then 'silver'

          else 'bronze'

        end,

        now()

      );

    end if;

  end if;

  return new;

end;

$$;


ALTER FUNCTION "public"."update_customer_loyalty"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_realtime_presence"("p_connection_id" "text", "p_presence_channel" "text", "p_status" "text" DEFAULT 'online'::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_presence_id uuid;

begin

  insert into public.realtime_presence (

    tenant_id,
    user_id,
    connection_id,
    presence_channel,
    status,
    last_seen_at,
    metadata

  )

  values (

    public.get_my_tenant_id(),
    auth.uid(),
    p_connection_id,
    p_presence_channel,
    p_status,
    now(),
    p_metadata

  )

  on conflict (
    tenant_id,
    user_id,
    connection_id
  )

  do update set

    status = excluded.status,
    last_seen_at = now(),
    metadata = excluded.metadata

  returning id into v_presence_id;

  return v_presence_id;

end;

$$;


ALTER FUNCTION "public"."update_realtime_presence"("p_connection_id" "text", "p_presence_channel" "text", "p_status" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_ai_agent_memory"("p_agent_name" "text", "p_memory_type" "text", "p_memory_key" "text", "p_memory_value" "jsonb" DEFAULT '{}'::"jsonb", "p_relevance_score" numeric DEFAULT 0, "p_expires_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_memory_id uuid;

begin

  insert into public.ai_agent_memory (

    tenant_id,
    agent_name,
    memory_type,
    memory_key,
    memory_value,
    relevance_score,
    expires_at,
    updated_at

  )

  values (

    public.get_my_tenant_id(),
    p_agent_name,
    p_memory_type,
    p_memory_key,
    p_memory_value,
    p_relevance_score,
    p_expires_at,
    now()

  )

  on conflict (

    tenant_id,
    agent_name,
    memory_type,
    memory_key

  )

  do update set

    memory_value = excluded.memory_value,
    relevance_score = excluded.relevance_score,
    expires_at = excluded.expires_at,
    updated_at = now()

  returning id into v_memory_id;

  return v_memory_id;

end;

$$;


ALTER FUNCTION "public"."upsert_ai_agent_memory"("p_agent_name" "text", "p_memory_type" "text", "p_memory_key" "text", "p_memory_value" "jsonb", "p_relevance_score" numeric, "p_expires_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_period_open"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare

  v_allowed boolean;

  v_transaction_date date;

begin

  v_transaction_date := coalesce(

    new.created_at::date,
    now()::date

  );

  v_allowed := public.is_period_open(
    v_transaction_date
  );

  if not v_allowed then

    if not exists (

      select 1
      from public.period_lock_exceptions ple
      join public.financial_periods fp
        on fp.id = ple.period_id

      where ple.tenant_id =
        coalesce(new.tenant_id, old.tenant_id)

      and ple.table_name = tg_table_name

      and (
        ple.record_id is null
        or ple.record_id = coalesce(new.id, old.id)
      )

      and fp.start_date <= v_transaction_date
      and fp.end_date >= v_transaction_date

    ) then

      raise exception
      'Financial period is closed';

    end if;

  end if;

  return coalesce(new, old);

end;

$$;


ALTER FUNCTION "public"."validate_period_open"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."accounting-expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "date" "date",
    "category" "text",
    "description" "text",
    "amount" numeric,
    "payment_method" "text",
    "supplier" "text",
    "reference" "text",
    "notes" "text",
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL
);


ALTER TABLE "public"."accounting-expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."accounting_periods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "legal_entity_id" "uuid",
    "fiscal_year" integer NOT NULL,
    "fiscal_month" integer NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "status" "text" DEFAULT 'open'::"text",
    "closed_at" timestamp with time zone,
    "closed_by" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."accounting_periods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text",
    "ref_id" "uuid",
    "payload" "jsonb",
    "status" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL
);


ALTER TABLE "public"."actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_agent_memory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "agent_name" "text" NOT NULL,
    "memory_type" "text" NOT NULL,
    "memory_key" "text" NOT NULL,
    "memory_value" "jsonb" DEFAULT '{}'::"jsonb",
    "relevance_score" numeric DEFAULT 0,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ai_agent_memory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_agent_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "task_type" "text" NOT NULL,
    "task_category" "text" NOT NULL,
    "task_status" "text" DEFAULT 'pending'::"text",
    "priority" "text" DEFAULT 'medium'::"text",
    "assigned_agent" "text",
    "reference_table" "text",
    "reference_id" "uuid",
    "task_payload" "jsonb" DEFAULT '{}'::"jsonb",
    "result_payload" "jsonb" DEFAULT '{}'::"jsonb",
    "error_message" "text",
    "scheduled_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ai_agent_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_business_insights" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "insight_type" "text" NOT NULL,
    "category" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "severity" "text" DEFAULT 'info'::"text",
    "recommendation" "text",
    "generated_at" timestamp with time zone DEFAULT "now"(),
    "resolved" boolean DEFAULT false,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ai_business_insights" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_campaign_recommendations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "recommendation_type" "text" NOT NULL,
    "target_segment_id" "uuid",
    "recommended_campaign_type" "text" NOT NULL,
    "recommended_channel" "text" NOT NULL,
    "recommendation_reason" "text",
    "predicted_engagement_score" numeric DEFAULT 0,
    "predicted_conversion_rate" numeric DEFAULT 0,
    "predicted_revenue" numeric DEFAULT 0,
    "recommendation_status" "text" DEFAULT 'pending'::"text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ai_campaign_recommendations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_forecasts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "forecast_type" "text" NOT NULL,
    "forecast_date" "date" NOT NULL,
    "predicted_value" numeric DEFAULT 0 NOT NULL,
    "confidence_score" numeric DEFAULT 0,
    "actual_value" numeric,
    "variance" numeric,
    "forecast_metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ai_forecasts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_recommendations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "recommendation_type" "text" NOT NULL,
    "target_area" "text" NOT NULL,
    "recommendation" "text" NOT NULL,
    "expected_impact" "text",
    "priority" "text" DEFAULT 'medium'::"text",
    "implemented" boolean DEFAULT false,
    "implemented_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ai_recommendations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL,
    "alert_type" "text",
    "severity" "text",
    "message" "text",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."api_access_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "endpoint" "text" NOT NULL,
    "request_method" "text" NOT NULL,
    "response_status" integer,
    "ip_address" "text",
    "user_agent" "text",
    "request_duration_ms" integer,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."api_access_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."approval_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "from_status" "text",
    "to_status" "text" NOT NULL,
    "acted_by" "uuid",
    "role" "text",
    "notes" "text",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."approval_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."approval_rejections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "approval_id" "uuid",
    "staff_id" "uuid",
    "reason" "text",
    "note" "text",
    "status" "text" DEFAULT 'open'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."approval_rejections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."approval_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "workflow_id" "uuid",
    "reference_table" "text" NOT NULL,
    "reference_id" "uuid" NOT NULL,
    "current_step" integer DEFAULT 1,
    "status" "text" DEFAULT 'pending'::"text",
    "requested_by" "uuid",
    "approved_by" "uuid",
    "rejected_by" "uuid",
    "rejection_reason" "text",
    "approved_at" timestamp with time zone,
    "rejected_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."approval_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."approval_workflows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "workflow_type" "text" NOT NULL,
    "department" "text" NOT NULL,
    "minimum_role" "text" NOT NULL,
    "approval_steps" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."approval_workflows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."approvals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL,
    "source_table" "text",
    "source_id" "uuid",
    "approval_type" "text",
    "ai_recommendation" "text",
    "human_decision" "text",
    "status" "text",
    "requested_by" "uuid",
    "approved_by" "uuid",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "approved_at" timestamp without time zone
);


ALTER TABLE "public"."approvals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "url" "text" NOT NULL,
    "type" "text" DEFAULT 'photo'::"text",
    "source" "text" DEFAULT 'staff'::"text",
    "status" "text" DEFAULT 'pending'::"text",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "note" "text",
    "uploaded_by" "text",
    "approved_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "category" "text",
    "department" "text",
    "impact" "text",
    "uploaded_by_id" "uuid",
    "invoice_status" "text",
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL
);


ALTER TABLE "public"."assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "entity_type" "text",
    "entity_id" "uuid",
    "action_type" "text",
    "performed_by" "uuid",
    "performed_by_name" "text",
    "old_data" "jsonb",
    "new_data" "jsonb",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backup_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "backup_type" "text" NOT NULL,
    "backup_scope" "text" NOT NULL,
    "backup_status" "text" DEFAULT 'pending'::"text",
    "storage_location" "text",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "file_size_bytes" bigint DEFAULT 0,
    "initiated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."backup_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chart_of_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "subcategory" "text",
    "normal_balance" "text",
    "parent_account_id" "uuid",
    "is_active" boolean DEFAULT true,
    "is_system" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."chart_of_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."journal_entry_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "journal_entry_id" "uuid",
    "account_id" "uuid",
    "debit" numeric DEFAULT 0,
    "credit" numeric DEFAULT 0,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "cost_center_id" "uuid",
    "tenant_id" "uuid"
);


ALTER TABLE "public"."journal_entry_lines" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."balance_sheet_view" AS
 SELECT "coa"."category",
    "coa"."code",
    "coa"."name",
    "sum"("jel"."debit") AS "total_debits",
    "sum"("jel"."credit") AS "total_credits",
        CASE
            WHEN ("coa"."category" = 'Assets'::"text") THEN "sum"(("jel"."debit" - "jel"."credit"))
            ELSE "sum"(("jel"."credit" - "jel"."debit"))
        END AS "balance"
   FROM ("public"."chart_of_accounts" "coa"
     LEFT JOIN "public"."journal_entry_lines" "jel" ON (("coa"."id" = "jel"."account_id")))
  GROUP BY "coa"."category", "coa"."code", "coa"."name"
 HAVING ("coa"."category" = ANY (ARRAY['Assets'::"text", 'Liabilities'::"text", 'Equity'::"text"]))
  ORDER BY "coa"."code";


ALTER VIEW "public"."balance_sheet_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subscription_id" "uuid",
    "lead_id" "uuid",
    "invoice_number" "text",
    "company" "text",
    "email" "text",
    "currency" "text",
    "amount" numeric DEFAULT 0,
    "status" "text" DEFAULT 'draft'::"text",
    "due_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid" NOT NULL
);


ALTER TABLE "public"."billing_invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_asset_usage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid",
    "asset_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."campaign_asset_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_memory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "campaign_title" "text",
    "campaign_type" "text",
    "output_type" "text",
    "event_theme" "text",
    "mood_preset" "text",
    "composition_style" "text",
    "visual_style" "text",
    "image_url" "text",
    "prompt" "text",
    "caption" "text",
    "hashtags" "text",
    "cta" "text",
    "human_rating" integer,
    "human_feedback" "text",
    "status" "text" DEFAULT 'generated'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "final_poster_url" "text",
    "engagement_score" numeric DEFAULT 0,
    "conversion_score" numeric DEFAULT 0,
    "ai_rating" numeric DEFAULT 0,
    "title" "text",
    "subtitle" "text",
    "mood" "text",
    "lighting" "text",
    "composition" "text",
    "atmosphere" "text",
    "subject" "text",
    "venue" "text",
    "extra_direction" "text",
    "layout" "text",
    "style" "text",
    "format" "text",
    "platform" "text",
    "brand_identity" "text",
    "call_to_action" "text",
    "video_url" "text",
    "ai_score" numeric DEFAULT 0,
    "ai_feedback" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "campaign_id" "uuid",
    "marketing_campaign_id" "uuid",
    "queue_id" "uuid",
    "memory_score" numeric DEFAULT 0,
    "publish_status" "text" DEFAULT 'draft'::"text",
    "page_id" "text"
);


ALTER TABLE "public"."campaign_memory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_publish_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "campaign_id" "uuid",
    "provider" "text",
    "status" "text",
    "response" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."campaign_publish_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_publish_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_memory_id" "uuid",
    "platform" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "scheduled_at" timestamp with time zone,
    "published_at" timestamp with time zone,
    "post_id" "text",
    "post_url" "text",
    "engagement_likes" integer DEFAULT 0,
    "engagement_comments" integer DEFAULT 0,
    "engagement_shares" integer DEFAULT 0,
    "engagement_saves" integer DEFAULT 0,
    "engagement_reach" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "publish_error" "text",
    "published_platform" "text",
    "final_post_url" "text",
    "scheduled_for" timestamp with time zone,
    "retry_count" integer DEFAULT 0,
    "last_error" "text",
    "tenant_id" "uuid",
    "campaign_id" "uuid",
    "platforms" "jsonb",
    "error_message" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "facebook_post_id" "text",
    "instagram_post_id" "text",
    "page_id" "uuid",
    "publish_result" "jsonb"
);


ALTER TABLE "public"."campaign_publish_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaigns" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "image" "text",
    "caption" "text",
    "hashtags" "text",
    "platform" "text",
    "status" "text" DEFAULT 'draft'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL
);


ALTER TABLE "public"."campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."journal_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "entry_number" "text",
    "entry_date" "date" NOT NULL,
    "description" "text",
    "source_type" "text",
    "source_id" "uuid",
    "status" "text" DEFAULT 'posted'::"text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "legal_entity_id" "uuid"
);


ALTER TABLE "public"."journal_entries" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."cashflow_view" AS
 SELECT "je"."entry_date",
    "coa"."code",
    "coa"."name",
    "coa"."category",
    "sum"("jel"."debit") AS "total_debits",
    "sum"("jel"."credit") AS "total_credits",
    "sum"(("jel"."debit" - "jel"."credit")) AS "net_cashflow"
   FROM (("public"."journal_entry_lines" "jel"
     JOIN "public"."journal_entries" "je" ON (("jel"."journal_entry_id" = "je"."id")))
     JOIN "public"."chart_of_accounts" "coa" ON (("jel"."account_id" = "coa"."id")))
  WHERE ("coa"."code" = ANY (ARRAY['1000'::"text", '1100'::"text"]))
  GROUP BY "je"."entry_date", "coa"."code", "coa"."name", "coa"."category"
  ORDER BY "je"."entry_date";


ALTER VIEW "public"."cashflow_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cogs_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "dish_id" "uuid" NOT NULL,
    "quantity" numeric NOT NULL,
    "cost_amount" numeric NOT NULL,
    "revenue_amount" numeric DEFAULT 0,
    "profit_amount" numeric DEFAULT 0,
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."cogs_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."legal_entities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "code" "text" NOT NULL,
    "legal_name" "text" NOT NULL,
    "display_name" "text",
    "tax_id" "text",
    "registration_number" "text",
    "country" "text",
    "currency" "text" DEFAULT 'THB'::"text",
    "address" "text",
    "phone" "text",
    "email" "text",
    "parent_entity_id" "uuid",
    "is_holding_company" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."legal_entities" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."consolidated_trial_balance_view" AS
 SELECT "le"."id" AS "legal_entity_id",
    "le"."code" AS "legal_entity_code",
    "le"."legal_name",
    "coa"."code" AS "account_code",
    "coa"."name" AS "account_name",
    "coa"."category",
    "sum"("jel"."debit") AS "total_debits",
    "sum"("jel"."credit") AS "total_credits",
    "sum"(("jel"."debit" - "jel"."credit")) AS "balance"
   FROM ((("public"."journal_entry_lines" "jel"
     JOIN "public"."journal_entries" "je" ON (("jel"."journal_entry_id" = "je"."id")))
     JOIN "public"."chart_of_accounts" "coa" ON (("jel"."account_id" = "coa"."id")))
     LEFT JOIN "public"."legal_entities" "le" ON (("je"."legal_entity_id" = "le"."id")))
  GROUP BY "le"."id", "le"."code", "le"."legal_name", "coa"."code", "coa"."name", "coa"."category"
  ORDER BY "le"."code", "coa"."code";


ALTER VIEW "public"."consolidated_trial_balance_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cost_centers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text",
    "parent_cost_center_id" "uuid",
    "manager" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cost_centers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cross_location_consolidations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "consolidation_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "total_revenue" numeric DEFAULT 0,
    "total_orders" integer DEFAULT 0,
    "total_payroll_cost" numeric DEFAULT 0,
    "total_inventory_value" numeric DEFAULT 0,
    "total_locations" integer DEFAULT 0,
    "average_order_value" numeric DEFAULT 0,
    "overall_performance_score" numeric DEFAULT 100,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cross_location_consolidations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "customer_name" "text",
    "customer_phone" "text",
    "rating" numeric DEFAULT 5 NOT NULL,
    "feedback" "text",
    "sentiment" "text",
    "resolved" boolean DEFAULT false,
    "resolved_by" "uuid",
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."customer_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_loyalty_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "customer_name" "text" NOT NULL,
    "customer_phone" "text" NOT NULL,
    "loyalty_points" numeric DEFAULT 0,
    "total_spent" numeric DEFAULT 0,
    "visit_count" integer DEFAULT 0,
    "tier" "text" DEFAULT 'bronze'::"text",
    "last_visit_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."customer_loyalty_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_segment_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "customer_loyalty_account_id" "uuid",
    "customer_segment_id" "uuid",
    "assigned_at" timestamp with time zone DEFAULT "now"(),
    "active" boolean DEFAULT true,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."customer_segment_memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_segments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "segment_name" "text" NOT NULL,
    "segment_type" "text" NOT NULL,
    "minimum_spend" numeric DEFAULT 0,
    "minimum_visits" integer DEFAULT 0,
    "loyalty_tier" "text",
    "benefits" "jsonb" DEFAULT '{}'::"jsonb",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."customer_segments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily-reports" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "date" "text",
    "dishes" "jsonb",
    "revenue" numeric,
    "cost" numeric,
    "profit" numeric,
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL
);


ALTER TABLE "public"."daily-reports" OWNER TO "postgres";


ALTER TABLE "public"."daily-reports" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."daily-reports_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."daily_sales_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sales_date" "date" NOT NULL,
    "notes" "text",
    "total_revenue" numeric DEFAULT 0,
    "total_cost" numeric DEFAULT 0,
    "total_profit" numeric DEFAULT 0,
    "food_cost_percent" numeric DEFAULT 0,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL,
    "date" "date",
    "total" numeric
);


ALTER TABLE "public"."daily_sales_batches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_sales_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "batch_id" "uuid",
    "dish_id" "uuid",
    "quantity" numeric,
    "price" numeric,
    "revenue" numeric,
    "cost" numeric,
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL,
    "order_id" "uuid",
    "item_name" "text",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."daily_sales_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."department_budgets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "department" "text" NOT NULL,
    "fiscal_year" integer NOT NULL,
    "fiscal_month" integer NOT NULL,
    "budget_amount" numeric DEFAULT 0,
    "committed_amount" numeric DEFAULT 0,
    "actual_amount" numeric DEFAULT 0,
    "remaining_amount" numeric DEFAULT 0,
    "warning_threshold" numeric DEFAULT 80,
    "critical_threshold" numeric DEFAULT 95,
    "is_locked" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."department_budgets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."department_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "department" "text" NOT NULL,
    "can_view" boolean DEFAULT false,
    "can_create" boolean DEFAULT false,
    "can_update" boolean DEFAULT false,
    "can_delete" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."department_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."departments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text",
    "tenant_id" "uuid",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."departments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."depreciation_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "fixed_asset_id" "uuid",
    "depreciation_date" "date",
    "depreciation_amount" numeric DEFAULT 0,
    "accumulated_depreciation" numeric DEFAULT 0,
    "remaining_book_value" numeric DEFAULT 0,
    "journal_entry_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."depreciation_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dish_stock" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL,
    "quantity" integer DEFAULT 0,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "dish_id" "uuid" NOT NULL
);


ALTER TABLE "public"."dish_stock" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dishes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "price" numeric NOT NULL,
    "cost" numeric,
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL,
    "category" "text"
);


ALTER TABLE "public"."dishes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."dishes"."cost" IS 'dish cost';



CREATE TABLE IF NOT EXISTS "public"."dynamic_price_adjustments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "order_item_id" "uuid",
    "pricing_rule_id" "uuid",
    "original_price" numeric DEFAULT 0 NOT NULL,
    "adjusted_price" numeric DEFAULT 0 NOT NULL,
    "adjustment_percent" numeric DEFAULT 0 NOT NULL,
    "adjustment_reason" "text",
    "applied_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."dynamic_price_adjustments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dynamic_pricing_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "rule_name" "text" NOT NULL,
    "rule_type" "text" NOT NULL,
    "target_category" "text",
    "adjustment_percent" numeric DEFAULT 0 NOT NULL,
    "conditions" "jsonb" DEFAULT '{}'::"jsonb",
    "active" boolean DEFAULT true,
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."dynamic_pricing_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."engine_learning_memory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text",
    "page_id" "text",
    "campaign_id" "uuid",
    "campaign_type" "text",
    "engine" "text",
    "provider" "text",
    "performance_score" numeric DEFAULT 0,
    "success" boolean DEFAULT true,
    "avg_duration" numeric DEFAULT 0,
    "retry_count" integer DEFAULT 0,
    "engagement" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."engine_learning_memory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enterprise_announcement_reads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "announcement_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enterprise_announcement_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enterprise_announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "announcement_title" "text" NOT NULL,
    "announcement_body" "text" NOT NULL,
    "announcement_type" "text" DEFAULT 'general'::"text",
    "priority" "text" DEFAULT 'normal'::"text",
    "target_roles" "jsonb" DEFAULT '[]'::"jsonb",
    "target_departments" "jsonb" DEFAULT '[]'::"jsonb",
    "active" boolean DEFAULT true,
    "starts_at" timestamp with time zone DEFAULT "now"(),
    "ends_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enterprise_announcements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enterprise_api_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "key_name" "text" NOT NULL,
    "api_provider" "text" NOT NULL,
    "api_key_hash" "text" NOT NULL,
    "key_prefix" "text",
    "permissions" "jsonb" DEFAULT '[]'::"jsonb",
    "last_used_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "revoked" boolean DEFAULT false,
    "revoked_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enterprise_api_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enterprise_audit_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "enterprise_audit_rule_id" "uuid",
    "event_table" "text" NOT NULL,
    "event_action" "text" NOT NULL,
    "reference_id" "uuid",
    "triggered_by" "uuid",
    "severity" "text" DEFAULT 'medium'::"text",
    "event_payload" "jsonb" DEFAULT '{}'::"jsonb",
    "notification_sent" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enterprise_audit_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enterprise_audit_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "rule_name" "text" NOT NULL,
    "rule_category" "text" NOT NULL,
    "monitored_table" "text" NOT NULL,
    "monitored_action" "text" NOT NULL,
    "severity" "text" DEFAULT 'medium'::"text",
    "active" boolean DEFAULT true,
    "notification_enabled" boolean DEFAULT true,
    "rule_conditions" "jsonb" DEFAULT '{}'::"jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enterprise_audit_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enterprise_audit_summary" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "audit_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "total_api_requests" integer DEFAULT 0,
    "failed_api_requests" integer DEFAULT 0,
    "total_security_events" integer DEFAULT 0,
    "critical_security_events" integer DEFAULT 0,
    "total_notifications" integer DEFAULT 0,
    "unresolved_notifications" integer DEFAULT 0,
    "total_backup_jobs" integer DEFAULT 0,
    "failed_backup_jobs" integer DEFAULT 0,
    "system_health_status" "text" DEFAULT 'healthy'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enterprise_audit_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enterprise_document_access_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "enterprise_document_id" "uuid",
    "accessed_by" "uuid",
    "access_type" "text" NOT NULL,
    "ip_address" "text",
    "user_agent" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "accessed_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enterprise_document_access_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enterprise_document_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "enterprise_document_id" "uuid",
    "version_number" integer NOT NULL,
    "storage_path" "text",
    "file_size_bytes" bigint DEFAULT 0,
    "mime_type" "text",
    "change_summary" "text",
    "uploaded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enterprise_document_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enterprise_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "document_type" "text" NOT NULL,
    "document_name" "text" NOT NULL,
    "document_status" "text" DEFAULT 'draft'::"text",
    "reference_table" "text",
    "reference_id" "uuid",
    "storage_path" "text",
    "file_size_bytes" bigint DEFAULT 0,
    "mime_type" "text",
    "version_number" integer DEFAULT 1,
    "generated_by" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_by" "uuid",
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enterprise_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enterprise_feature_flag_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "feature_flag_id" "uuid",
    "feature_key" "text" NOT NULL,
    "old_enabled" boolean,
    "new_enabled" boolean,
    "old_rollout_percentage" numeric,
    "new_rollout_percentage" numeric,
    "environment" "text" DEFAULT 'production'::"text",
    "changed_by" "uuid",
    "change_reason" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enterprise_feature_flag_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enterprise_feature_flags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "feature_key" "text" NOT NULL,
    "feature_name" "text" NOT NULL,
    "enabled" boolean DEFAULT false,
    "rollout_percentage" integer DEFAULT 100,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "environment" "text" DEFAULT 'production'::"text"
);


ALTER TABLE "public"."enterprise_feature_flags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enterprise_health_checks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "check_name" "text" NOT NULL,
    "check_category" "text" NOT NULL,
    "status" "text" DEFAULT 'healthy'::"text" NOT NULL,
    "message" "text",
    "checked_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enterprise_health_checks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enterprise_integration_sync_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "enterprise_integration_id" "uuid",
    "sync_type" "text" NOT NULL,
    "sync_status" "text" DEFAULT 'pending'::"text",
    "records_processed" integer DEFAULT 0,
    "records_failed" integer DEFAULT 0,
    "sync_started_at" timestamp with time zone,
    "sync_completed_at" timestamp with time zone,
    "error_message" "text",
    "response_payload" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enterprise_integration_sync_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enterprise_integrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "integration_name" "text" NOT NULL,
    "integration_type" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "connection_status" "text" DEFAULT 'disconnected'::"text",
    "api_base_url" "text",
    "auth_type" "text",
    "encrypted_credentials" "jsonb" DEFAULT '{}'::"jsonb",
    "scopes" "jsonb" DEFAULT '[]'::"jsonb",
    "last_sync_at" timestamp with time zone,
    "next_sync_at" timestamp with time zone,
    "sync_frequency" "text" DEFAULT 'hourly'::"text",
    "active" boolean DEFAULT true,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enterprise_integrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enterprise_notification_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "template_id" "uuid",
    "recipient_user_id" "uuid",
    "recipient_email" "text",
    "recipient_phone" "text",
    "delivery_channel" "text" NOT NULL,
    "notification_subject" "text",
    "notification_body" "text" NOT NULL,
    "template_variables" "jsonb" DEFAULT '{}'::"jsonb",
    "delivery_status" "text" DEFAULT 'pending'::"text",
    "retry_count" integer DEFAULT 0,
    "scheduled_at" timestamp with time zone DEFAULT "now"(),
    "delivered_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enterprise_notification_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enterprise_notification_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "template_name" "text" NOT NULL,
    "template_type" "text" NOT NULL,
    "delivery_channel" "text" NOT NULL,
    "subject_template" "text",
    "body_template" "text" NOT NULL,
    "variables" "jsonb" DEFAULT '[]'::"jsonb",
    "active" boolean DEFAULT true,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enterprise_notification_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enterprise_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "notification_type" "text" NOT NULL,
    "category" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "severity" "text" DEFAULT 'info'::"text",
    "target_role" "text",
    "target_user_id" "uuid",
    "read" boolean DEFAULT false,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enterprise_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enterprise_rate_limit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "limit_key" "text" NOT NULL,
    "identifier" "text" NOT NULL,
    "request_count" integer DEFAULT 1,
    "window_type" "text" NOT NULL,
    "window_started_at" timestamp with time zone NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "blocked" boolean DEFAULT false,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enterprise_rate_limit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enterprise_rate_limits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "limit_key" "text" NOT NULL,
    "limit_category" "text" NOT NULL,
    "requests_per_minute" integer DEFAULT 60,
    "requests_per_hour" integer DEFAULT 1000,
    "requests_per_day" integer DEFAULT 10000,
    "active" boolean DEFAULT true,
    "applies_to" "text" DEFAULT 'tenant'::"text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enterprise_rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enterprise_security_incidents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "incident_type" "text" NOT NULL,
    "incident_category" "text" NOT NULL,
    "severity" "text" DEFAULT 'medium'::"text",
    "incident_status" "text" DEFAULT 'open'::"text",
    "source_system" "text",
    "reference_table" "text",
    "reference_id" "uuid",
    "detected_by" "text" DEFAULT 'system'::"text",
    "assigned_to" "uuid",
    "incident_summary" "text" NOT NULL,
    "incident_details" "jsonb" DEFAULT '{}'::"jsonb",
    "resolution_notes" "text",
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enterprise_security_incidents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enterprise_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "setting_key" "text" NOT NULL,
    "setting_value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "setting_category" "text",
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enterprise_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enterprise_system_health" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "health_category" "text" NOT NULL,
    "health_metric" "text" NOT NULL,
    "metric_value" numeric DEFAULT 0,
    "metric_status" "text" DEFAULT 'healthy'::"text",
    "warning_threshold" numeric,
    "critical_threshold" numeric,
    "metric_metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "checked_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enterprise_system_health" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enterprise_webhook_deliveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "enterprise_webhook_id" "uuid",
    "event_type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb",
    "delivery_status" "text" DEFAULT 'pending'::"text",
    "response_status" integer,
    "response_body" "text",
    "retry_count" integer DEFAULT 0,
    "delivered_at" timestamp with time zone,
    "next_retry_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enterprise_webhook_deliveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enterprise_webhooks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "webhook_name" "text" NOT NULL,
    "webhook_url" "text" NOT NULL,
    "event_types" "jsonb" DEFAULT '[]'::"jsonb",
    "secret_key_hash" "text",
    "active" boolean DEFAULT true,
    "retry_enabled" boolean DEFAULT true,
    "retry_limit" integer DEFAULT 3,
    "timeout_seconds" integer DEFAULT 30,
    "last_triggered_at" timestamp with time zone,
    "last_success_at" timestamp with time zone,
    "last_failure_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enterprise_webhooks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enterprise_workflow_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "enterprise_workflow_id" "uuid",
    "run_status" "text" DEFAULT 'pending'::"text",
    "trigger_source" "text",
    "input_payload" "jsonb" DEFAULT '{}'::"jsonb",
    "output_payload" "jsonb" DEFAULT '{}'::"jsonb",
    "error_message" "text",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "duration_ms" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enterprise_workflow_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enterprise_workflow_step_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "enterprise_workflow_run_id" "uuid",
    "enterprise_workflow_step_id" "uuid",
    "run_status" "text" DEFAULT 'pending'::"text",
    "retry_attempt" integer DEFAULT 0,
    "input_payload" "jsonb" DEFAULT '{}'::"jsonb",
    "output_payload" "jsonb" DEFAULT '{}'::"jsonb",
    "error_message" "text",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "duration_ms" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enterprise_workflow_step_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enterprise_workflow_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "enterprise_workflow_id" "uuid",
    "step_name" "text" NOT NULL,
    "step_order" integer NOT NULL,
    "step_type" "text" NOT NULL,
    "action_type" "text" NOT NULL,
    "action_config" "jsonb" DEFAULT '{}'::"jsonb",
    "retry_limit" integer DEFAULT 3,
    "timeout_seconds" integer DEFAULT 60,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enterprise_workflow_steps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enterprise_workflows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "workflow_name" "text" NOT NULL,
    "workflow_type" "text" NOT NULL,
    "workflow_status" "text" DEFAULT 'draft'::"text",
    "trigger_event" "text",
    "workflow_definition" "jsonb" DEFAULT '{}'::"jsonb",
    "last_run_at" timestamp with time zone,
    "next_run_at" timestamp with time zone,
    "total_runs" integer DEFAULT 0,
    "successful_runs" integer DEFAULT 0,
    "failed_runs" integer DEFAULT 0,
    "active" boolean DEFAULT true,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enterprise_workflows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."executive_dashboard_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "snapshot_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "total_revenue" numeric DEFAULT 0,
    "total_orders" integer DEFAULT 0,
    "average_order_value" numeric DEFAULT 0,
    "total_payroll_cost" numeric DEFAULT 0,
    "total_inventory_value" numeric DEFAULT 0,
    "low_stock_items" integer DEFAULT 0,
    "negative_feedback_count" integer DEFAULT 0,
    "kitchen_performance_score" numeric DEFAULT 100,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."executive_dashboard_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finance_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "role_id" "uuid",
    "permission_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."finance_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finance_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "role_code" "text" NOT NULL,
    "role_name" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."finance_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financial_periods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "period_name" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "status" "text" DEFAULT 'open'::"text",
    "closed_by" "uuid",
    "closed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."financial_periods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fixed_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "legal_entity_id" "uuid",
    "cost_center_id" "uuid",
    "asset_code" "text",
    "asset_name" "text" NOT NULL,
    "asset_category" "text",
    "purchase_date" "date",
    "purchase_cost" numeric DEFAULT 0,
    "useful_life_years" numeric DEFAULT 5,
    "salvage_value" numeric DEFAULT 0,
    "depreciation_method" "text" DEFAULT 'straight_line'::"text",
    "accumulated_depreciation" numeric DEFAULT 0,
    "current_book_value" numeric DEFAULT 0,
    "status" "text" DEFAULT 'active'::"text",
    "vendor_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."fixed_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."generation_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "campaign_id" "uuid",
    "engine" "text",
    "provider" "text",
    "prompt" "text",
    "status" "text" DEFAULT 'queued'::"text",
    "input" "jsonb",
    "output" "jsonb",
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "page_id" "text",
    "model" "text",
    "image_url" "text",
    "source_image_url" "text",
    "selected_assets" "jsonb" DEFAULT '[]'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "retry_count" integer DEFAULT 0,
    "queue_position" integer DEFAULT 0,
    "duration_ms" integer DEFAULT 0,
    "failed_at" timestamp with time zone
);


ALTER TABLE "public"."generation_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."goods_receipt_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "goods_receipt_id" "uuid",
    "purchase_order_item_id" "uuid",
    "item_name" "text",
    "ordered_qty" numeric DEFAULT 0,
    "received_qty" numeric DEFAULT 0,
    "damaged_qty" numeric DEFAULT 0,
    "accepted_qty" numeric DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid" NOT NULL
);


ALTER TABLE "public"."goods_receipt_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."goods_receipts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "grn_number" "text",
    "purchase_order_id" "uuid",
    "vendor_id" "uuid",
    "received_by" "text",
    "status" "text" DEFAULT 'received'::"text",
    "received_date" "date" DEFAULT "now"(),
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."goods_receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."history_days" (
    "id" bigint NOT NULL,
    "day_date" timestamp with time zone NOT NULL,
    "revenue" numeric NOT NULL,
    "service_pool" numeric,
    "payout_pool" numeric,
    "payout_status" "text",
    "foh_score" integer,
    "bar_score" integer,
    "kitchen_score" integer,
    "staff_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL,
    "orders" "jsonb",
    "subtotal" numeric,
    "discount_total" numeric,
    "final_revenue" numeric,
    "adjustments" "jsonb",
    "service_charge" numeric
);


ALTER TABLE "public"."history_days" OWNER TO "postgres";


ALTER TABLE "public"."history_days" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."history_days_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ingredient_stock" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "quantity" numeric DEFAULT 0,
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."ingredient_stock" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ingredients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "cost_per_unit" numeric NOT NULL,
    "unit" "text",
    "name_thai" "text",
    "department" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL,
    "quantity" numeric DEFAULT 0,
    "cost" numeric DEFAULT 0
);


ALTER TABLE "public"."ingredients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."intercompany_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "from_legal_entity_id" "uuid",
    "to_legal_entity_id" "uuid",
    "transaction_type" "text",
    "reference_number" "text",
    "description" "text",
    "amount" numeric DEFAULT 0,
    "currency" "text" DEFAULT 'THB'::"text",
    "status" "text" DEFAULT 'pending'::"text",
    "due_date" "date",
    "settled_at" timestamp with time zone,
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."intercompany_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ingredient_id" "uuid",
    "stock" numeric DEFAULT 0,
    "quantity" numeric,
    "cost_per_unit" numeric,
    "last_updated" timestamp without time zone DEFAULT "now"(),
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL,
    "current_stock" numeric DEFAULT 0,
    "ingredient_name" "text"
);


ALTER TABLE "public"."inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "alert_type" "text" NOT NULL,
    "current_quantity" numeric DEFAULT 0 NOT NULL,
    "minimum_quantity" numeric DEFAULT 0 NOT NULL,
    "message" "text",
    "resolved" boolean DEFAULT false,
    "resolved_by" "uuid",
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."inventory_alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_cost_layers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_id" "uuid",
    "quantity_received" numeric DEFAULT 0 NOT NULL,
    "quantity_remaining" numeric DEFAULT 0 NOT NULL,
    "unit_cost" numeric DEFAULT 0 NOT NULL,
    "total_cost" numeric GENERATED ALWAYS AS (("quantity_remaining" * "unit_cost")) STORED,
    "received_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."inventory_cost_layers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ingredient_id" "uuid",
    "change" numeric,
    "type" "text",
    "reference_id" "uuid",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL,
    "quantity" numeric,
    "source" "text",
    "dish_name" "text",
    "ingredient_name" "text"
);


ALTER TABLE "public"."inventory_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_valuation_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "snapshot_date" "date" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "quantity_on_hand" numeric DEFAULT 0 NOT NULL,
    "inventory_value" numeric DEFAULT 0 NOT NULL,
    "average_unit_cost" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."inventory_valuation_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_matches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "invoice_id" "uuid",
    "purchase_order_id" "uuid",
    "goods_receipt_id" "uuid",
    "match_status" "text" DEFAULT 'pending'::"text",
    "po_total" numeric DEFAULT 0,
    "grn_total" numeric DEFAULT 0,
    "invoice_total" numeric DEFAULT 0,
    "variance_amount" numeric DEFAULT 0,
    "variance_percent" numeric DEFAULT 0,
    "matched_by" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."invoice_matches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "uploaded_by_id" "uuid",
    "file_url" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "confidence" "text",
    "date" timestamp without time zone,
    "image_url" "text",
    "vendor" "text",
    "total_amount" numeric,
    "items" "jsonb",
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL,
    "vendor_id" "uuid"
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."item_learning" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text",
    "department" "text",
    "account_type" "text",
    "natural_account" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL
);


ALTER TABLE "public"."item_learning" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kitchen_station_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "kitchen_station_id" "uuid" NOT NULL,
    "order_item_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "priority" "text" DEFAULT 'normal'::"text",
    "assigned_to" "uuid",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."kitchen_station_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kitchen_station_performance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "kitchen_station_id" "uuid" NOT NULL,
    "staff_id" "uuid",
    "total_orders" integer DEFAULT 0,
    "completed_orders" integer DEFAULT 0,
    "average_completion_minutes" numeric DEFAULT 0,
    "delayed_orders" integer DEFAULT 0,
    "performance_score" numeric DEFAULT 100,
    "snapshot_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."kitchen_station_performance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kitchen_stations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "station_name" "text" NOT NULL,
    "station_code" "text" NOT NULL,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."kitchen_stations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."labor_shift_forecasts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "forecast_date" "date" NOT NULL,
    "department" "text" NOT NULL,
    "predicted_orders" integer DEFAULT 0,
    "predicted_revenue" numeric DEFAULT 0,
    "recommended_staff_count" integer DEFAULT 0,
    "recommended_labor_hours" numeric DEFAULT 0,
    "confidence_score" numeric DEFAULT 0,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."labor_shift_forecasts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text",
    "tenant_id" "uuid",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketing_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "asset_type" "text",
    "file_url" "text",
    "file_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "analysis" "jsonb" DEFAULT '{}'::"jsonb",
    "image_url" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "ai_generated" boolean DEFAULT false,
    "provider" "text",
    "campaign_id" "uuid",
    "name" "text",
    "title" "text",
    "description" "text",
    "thumbnail_url" "text",
    "engine" "text",
    "prompt" "text",
    "favorite" boolean DEFAULT false,
    "archived" boolean DEFAULT false,
    "performance_score" numeric DEFAULT 0,
    "usage_count" integer DEFAULT 0,
    "created_by" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "page_id" "text",
    "score" numeric DEFAULT 0,
    "ai_suggested_type" "text"
);


ALTER TABLE "public"."marketing_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketing_campaign_analytics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "marketing_campaign_id" "uuid",
    "analytics_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "impressions" integer DEFAULT 0,
    "opens" integer DEFAULT 0,
    "clicks" integer DEFAULT 0,
    "conversions" integer DEFAULT 0,
    "revenue_generated" numeric DEFAULT 0,
    "conversion_rate" numeric DEFAULT 0,
    "roi_percent" numeric DEFAULT 0,
    "engagement_score" numeric DEFAULT 0,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."marketing_campaign_analytics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketing_campaign_deliveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "marketing_campaign_id" "uuid",
    "customer_segment_id" "uuid",
    "delivery_channel" "text" NOT NULL,
    "delivery_status" "text" DEFAULT 'pending'::"text",
    "total_recipients" integer DEFAULT 0,
    "delivered_count" integer DEFAULT 0,
    "opened_count" integer DEFAULT 0,
    "clicked_count" integer DEFAULT 0,
    "conversion_count" integer DEFAULT 0,
    "revenue_generated" numeric DEFAULT 0,
    "scheduled_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."marketing_campaign_deliveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketing_campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "campaign_name" "text" NOT NULL,
    "campaign_type" "text" NOT NULL,
    "target_segment_id" "uuid",
    "campaign_status" "text" DEFAULT 'draft'::"text",
    "scheduled_at" timestamp with time zone,
    "launched_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "budget" numeric DEFAULT 0,
    "expected_revenue" numeric DEFAULT 0,
    "actual_revenue" numeric DEFAULT 0,
    "campaign_content" "jsonb" DEFAULT '{}'::"jsonb",
    "performance_metrics" "jsonb" DEFAULT '{}'::"jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."marketing_campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketing_prompt_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "prompt" "text",
    "recommendation" "jsonb",
    "selected_assets" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."marketing_prompt_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meta_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "platform" "text",
    "page_name" "text",
    "page_id" "text",
    "access_token" "text",
    "connected" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "instagram_business_id" "text",
    "tenant_id" "uuid"
);


ALTER TABLE "public"."meta_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL,
    "order_id" "uuid",
    "item_name" "text",
    "price" numeric,
    "quantity" integer,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'NEW'::"text",
    "station" "text",
    "course" "text" DEFAULT 'main'::"text",
    "dish_id" "uuid",
    "staff_id" "uuid"
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL,
    "table_number" "text",
    "staff_id" "uuid",
    "total" numeric,
    "status" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "kitchen_status" "text" DEFAULT 'pending'::"text",
    "dessert_fired" boolean DEFAULT false,
    "cost" numeric DEFAULT 0,
    "production_status" "text" DEFAULT 'pending'::"text",
    "staff_name" "text",
    "payment_status" "text" DEFAULT 'UNPAID'::"text",
    "paid_at" timestamp with time zone,
    "payment_method" "text",
    "amount_paid" numeric DEFAULT 0,
    "change_amount" numeric DEFAULT 0,
    "cashier_name" "text",
    "payment_reference" "text",
    "total_amount" numeric DEFAULT 0,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."order_profit_view" AS
 SELECT "id",
    "tenant_id",
    "table_number",
    "total" AS "revenue",
    COALESCE("cost", (0)::numeric) AS "cost",
    ("total" - COALESCE("cost", (0)::numeric)) AS "profit",
        CASE
            WHEN ("total" > (0)::numeric) THEN ((("total" - COALESCE("cost", (0)::numeric)) / "total") * (100)::numeric)
            ELSE (0)::numeric
        END AS "margin",
    "created_at"
   FROM "public"."orders" "o";


ALTER VIEW "public"."order_profit_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "text" NOT NULL,
    "company" "text" NOT NULL,
    "contact" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "website" "text",
    "industry" "text",
    "country" "text",
    "city" "text",
    "currency" "text" DEFAULT 'THB'::"text",
    "locations" "text",
    "employees" "text",
    "revenue" "text",
    "challenges" "text",
    "status" "text" DEFAULT 'new'::"text",
    "estimated_monthly_price" numeric DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "sms_verified" boolean DEFAULT false,
    "email_verified" boolean DEFAULT false,
    "selected_modules" "jsonb" DEFAULT '[]'::"jsonb",
    "subtotal" numeric DEFAULT 0,
    "discount_total" numeric DEFAULT 0,
    "final_monthly_total" numeric DEFAULT 0,
    "final_yearly_total" numeric DEFAULT 0,
    "billing_cycle" "text",
    "discount_code" "text",
    "domain_verification" boolean DEFAULT false
);


ALTER TABLE "public"."organization_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "table_session_id" "uuid",
    "table_number" "text",
    "payment_method" "text" DEFAULT 'CASH'::"text",
    "subtotal" numeric DEFAULT 0,
    "service_charge_amount" numeric DEFAULT 0,
    "vat_amount" numeric DEFAULT 0,
    "discount_amount" numeric DEFAULT 0,
    "final_total" numeric DEFAULT 0,
    "paid_amount" numeric DEFAULT 0,
    "change_amount" numeric DEFAULT 0,
    "status" "text" DEFAULT 'PAID'::"text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "receipt_number" "text",
    "cashier_name" "text",
    "notes" "text"
);


ALTER TABLE "public"."payment_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subscription_id" "uuid",
    "invoice_id" "uuid",
    "provider" "text",
    "provider_reference" "text",
    "amount" numeric DEFAULT 0,
    "currency" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid" NOT NULL
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payroll_payouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "payroll_record_id" "uuid",
    "staff_id" "uuid",
    "staff_name" "text",
    "amount" numeric DEFAULT 0,
    "payment_method" "text" DEFAULT 'BANK_TRANSFER'::"text",
    "payout_reference" "text",
    "payout_status" "text" DEFAULT 'PENDING'::"text",
    "processed_by" "uuid",
    "processed_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."payroll_payouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payroll_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "staff_id" "uuid",
    "staff_name" "text",
    "role" "text",
    "total_hours" numeric DEFAULT 0,
    "overtime_hours" numeric DEFAULT 0,
    "attendance_score" numeric DEFAULT 100,
    "base_salary" numeric DEFAULT 0,
    "overtime_pay" numeric DEFAULT 0,
    "service_charge_bonus" numeric DEFAULT 0,
    "deductions" numeric DEFAULT 0,
    "final_salary" numeric DEFAULT 0,
    "payroll_month" "text",
    "status" "text" DEFAULT 'PENDING'::"text",
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "payout_status" "text" DEFAULT 'PENDING'::"text",
    "payout_date" timestamp with time zone,
    "payment_reference" "text",
    "notes" "text"
);


ALTER TABLE "public"."payroll_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."performance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL,
    "name" "text",
    "department" "text",
    "score" numeric,
    "late" boolean DEFAULT false,
    "absent" boolean DEFAULT false,
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."performance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."period_lock_exceptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "period_id" "uuid",
    "table_name" "text" NOT NULL,
    "record_id" "uuid",
    "reason" "text",
    "approved_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."period_lock_exceptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_modules" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'active'::"text",
    "is_core" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."platform_modules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "access_token" "text" NOT NULL,
    "page_id" "text" NOT NULL,
    "page_token" "text" NOT NULL,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL
);


ALTER TABLE "public"."platform_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" "text",
    "email" "text" NOT NULL,
    "password" "text" NOT NULL,
    "role" "text" DEFAULT 'customer'::"text" NOT NULL,
    "tenant_id" "uuid",
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."platform_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos-sales" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "items" "jsonb" NOT NULL,
    "subtotal" numeric DEFAULT 0 NOT NULL,
    "service" numeric DEFAULT 0 NOT NULL,
    "discount" numeric DEFAULT 0 NOT NULL,
    "total" numeric DEFAULT 0 NOT NULL,
    "cash" numeric DEFAULT 0 NOT NULL,
    "change" numeric DEFAULT 0 NOT NULL,
    "note" "text",
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL
);


ALTER TABLE "public"."pos-sales" OWNER TO "postgres";


ALTER TABLE "public"."pos-sales" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."pos-sales_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."production_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "dish_id" "uuid" NOT NULL,
    "quantity" numeric NOT NULL,
    "total_cost" numeric DEFAULT 0,
    "cost_per_unit" numeric DEFAULT 0,
    "produced_at" timestamp without time zone DEFAULT "now"(),
    "created_by" "text",
    "reference_id" "uuid"
);


ALTER TABLE "public"."production_batches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."production_locks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "dish_id" "uuid",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."production_locks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."production_logs" (
    "id" "uuid" NOT NULL,
    "item_name" "text",
    "quantity" numeric,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL,
    "dish_name" "text",
    "order_id" "uuid",
    "source_id" "text",
    "revenue" numeric,
    "profit" numeric,
    "margin" numeric
);


ALTER TABLE "public"."production_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."production_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "order_item_id" "uuid",
    "dish_id" "uuid" NOT NULL,
    "quantity" numeric DEFAULT 1 NOT NULL,
    "total_cost" numeric DEFAULT 0,
    "status" "text" DEFAULT 'completed'::"text",
    "produced_by" "uuid",
    "produced_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."production_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text",
    "price" numeric,
    "category" "text",
    "tenant_id" "uuid",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."profit_and_loss_view" AS
 SELECT "coa"."category",
    "coa"."code",
    "coa"."name",
    "sum"("jel"."debit") AS "total_debits",
    "sum"("jel"."credit") AS "total_credits",
        CASE
            WHEN ("coa"."category" = ANY (ARRAY['Revenue'::"text", 'Other Income'::"text"])) THEN "sum"(("jel"."credit" - "jel"."debit"))
            ELSE "sum"(("jel"."debit" - "jel"."credit"))
        END AS "balance"
   FROM ("public"."chart_of_accounts" "coa"
     LEFT JOIN "public"."journal_entry_lines" "jel" ON (("coa"."id" = "jel"."account_id")))
  GROUP BY "coa"."category", "coa"."code", "coa"."name"
 HAVING ("coa"."category" = ANY (ARRAY['Revenue'::"text", 'COGS'::"text", 'Operating Expense'::"text", 'Other Income'::"text", 'Other Expense'::"text"]))
  ORDER BY "coa"."code";


ALTER VIEW "public"."profit_and_loss_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "purchase_order_id" "uuid",
    "item_name" "text",
    "qty" numeric DEFAULT 0,
    "unit_price" numeric DEFAULT 0,
    "total_price" numeric DEFAULT 0,
    "received_qty" numeric DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."purchase_order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "po_number" "text",
    "purchase_request_id" "uuid",
    "vendor_id" "uuid",
    "status" "text" DEFAULT 'draft'::"text",
    "ordered_by" "text",
    "approved_by" "text",
    "subtotal" numeric DEFAULT 0,
    "tax_amount" numeric DEFAULT 0,
    "total_amount" numeric DEFAULT 0,
    "currency" "text" DEFAULT 'THB'::"text",
    "expected_delivery_date" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."purchase_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_request_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "purchase_request_id" "uuid",
    "item_name" "text",
    "quantity" numeric DEFAULT 1,
    "unit_price" numeric DEFAULT 0,
    "total_price" numeric DEFAULT 0,
    "vendor_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."purchase_request_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "request_number" "text",
    "requested_by" "text",
    "department" "text",
    "vendor_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "priority" "text" DEFAULT 'normal'::"text",
    "estimated_cost" numeric DEFAULT 0,
    "status" "text" DEFAULT 'pending_manager'::"text",
    "needed_by" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."purchase_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."realtime_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "event_category" "text" NOT NULL,
    "reference_table" "text",
    "reference_id" "uuid",
    "payload" "jsonb" DEFAULT '{}'::"jsonb",
    "processed" boolean DEFAULT false,
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."realtime_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."realtime_presence" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "connection_id" "text" NOT NULL,
    "presence_channel" "text" NOT NULL,
    "status" "text" DEFAULT 'online'::"text",
    "last_seen_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."realtime_presence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recipe_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dish_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "quantity" numeric DEFAULT 1,
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL
);


ALTER TABLE "public"."recipe_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recipe_matrix" (
    "ingredient_name" "text",
    "dish_name" "text",
    "quantity" numeric,
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL,
    "dish_id" "uuid",
    "ingredient_id" "uuid",
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL
);


ALTER TABLE "public"."recipe_matrix" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recipes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL,
    "dish_id" "uuid" NOT NULL,
    "qty_per_dish" integer DEFAULT 1
);


ALTER TABLE "public"."recipes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurant_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "currency" "text" DEFAULT 'THB'::"text",
    "timezone" "text" DEFAULT 'Asia/Bangkok'::"text",
    "service_charge" numeric DEFAULT 5,
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."restaurant_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_hierarchy" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "level" integer DEFAULT 1 NOT NULL,
    "can_manage_role" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."role_hierarchy" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "module" "text" NOT NULL,
    "can_view" boolean DEFAULT false,
    "can_create" boolean DEFAULT false,
    "can_update" boolean DEFAULT false,
    "can_delete" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."salary_confirmations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "staff_id" "uuid",
    "email" "text",
    "confirmed_at" timestamp without time zone DEFAULT "now"(),
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL
);


ALTER TABLE "public"."salary_confirmations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "target_type" "text",
    "target_id" "uuid",
    "start_date" timestamp without time zone NOT NULL,
    "end_date" timestamp without time zone NOT NULL,
    "status" "text" DEFAULT 'active'::"text",
    "tenant_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp without time zone DEFAULT "now"(),
    CONSTRAINT "sales_events_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"]))),
    CONSTRAINT "sales_events_target_type_check" CHECK (("target_type" = ANY (ARRAY['dish'::"text", 'category'::"text", 'all'::"text"]))),
    CONSTRAINT "sales_events_type_check" CHECK (("type" = ANY (ARRAY['revenue'::"text", 'orders'::"text", 'item_quantity'::"text", 'item_revenue'::"text", 'category_quantity'::"text", 'category_revenue'::"text", 'avg_order_value'::"text"]))),
    CONSTRAINT "target_required" CHECK (((("type" = ANY (ARRAY['item_quantity'::"text", 'item_revenue'::"text"])) AND ((("target_type" = 'dish'::"text") AND ("target_id" IS NOT NULL)) OR (("target_type" = 'all'::"text") AND ("target_id" IS NULL)))) OR (("type" = ANY (ARRAY['category_quantity'::"text", 'category_revenue'::"text"])) AND ("target_type" = 'category'::"text") AND ("target_id" IS NOT NULL)) OR (("type" = ANY (ARRAY['revenue'::"text", 'orders'::"text", 'avg_order_value'::"text"])) AND ("target_type" = 'all'::"text"))))
);


ALTER TABLE "public"."sales_events" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."secure_audit_logs_view" AS
 SELECT "id",
    "tenant_id",
    "entity_type",
    "entity_id",
    "action_type",
    "performed_by",
    "performed_by_name",
    "old_data",
    "new_data",
    "metadata",
    "created_at"
   FROM "public"."audit_logs" "a"
  WHERE "public"."same_tenant"("tenant_id");


ALTER VIEW "public"."secure_audit_logs_view" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."secure_goods_receipts_view" AS
 SELECT "id",
    "tenant_id",
    "grn_number",
    "purchase_order_id",
    "vendor_id",
    "received_by",
    "status",
    "received_date",
    "notes",
    "created_at",
    "updated_at"
   FROM "public"."goods_receipts" "g"
  WHERE "public"."same_tenant"("tenant_id");


ALTER VIEW "public"."secure_goods_receipts_view" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."secure_inventory_transactions_view" AS
 SELECT "id",
    "ingredient_id",
    "change",
    "type",
    "reference_id",
    "created_at",
    "tenant_id",
    "quantity",
    "source",
    "dish_name",
    "ingredient_name"
   FROM "public"."inventory_transactions" "t"
  WHERE "public"."same_tenant"("tenant_id");


ALTER VIEW "public"."secure_inventory_transactions_view" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."secure_inventory_view" AS
 SELECT "id",
    "ingredient_id",
    "stock",
    "quantity",
    "cost_per_unit",
    "last_updated",
    "tenant_id",
    "current_stock",
    "ingredient_name"
   FROM "public"."inventory" "i"
  WHERE "public"."same_tenant"("tenant_id");


ALTER VIEW "public"."secure_inventory_view" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."secure_invoices_view" AS
 SELECT "id",
    "created_at",
    "uploaded_by_id",
    "file_url",
    "status",
    "confidence",
    "date",
    "image_url",
    "vendor",
    "total_amount",
    "items",
    "tenant_id",
    "vendor_id"
   FROM "public"."invoices" "i"
  WHERE "public"."same_tenant"("tenant_id");


ALTER VIEW "public"."secure_invoices_view" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."secure_orders_view" AS
 SELECT "id",
    "tenant_id",
    "table_number",
    "staff_id",
    "total",
    "status",
    "created_at",
    "kitchen_status",
    "dessert_fired",
    "cost",
    "production_status",
    "staff_name",
    "payment_status",
    "paid_at",
    "payment_method",
    "amount_paid",
    "change_amount",
    "cashier_name",
    "payment_reference",
    "total_amount",
    "started_at",
    "completed_at"
   FROM "public"."orders" "o"
  WHERE "public"."same_tenant"("tenant_id");


ALTER VIEW "public"."secure_orders_view" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."secure_payments_view" AS
 SELECT "id",
    "subscription_id",
    "invoice_id",
    "provider",
    "provider_reference",
    "amount",
    "currency",
    "status",
    "created_at",
    "tenant_id"
   FROM "public"."payments" "p"
  WHERE "public"."same_tenant"("tenant_id");


ALTER VIEW "public"."secure_payments_view" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."secure_payroll_view" AS
 SELECT "id",
    "tenant_id",
    "staff_id",
    "staff_name",
    "role",
    "total_hours",
    "overtime_hours",
    "attendance_score",
    "base_salary",
    "overtime_pay",
    "service_charge_bonus",
    "deductions",
    "final_salary",
    "payroll_month",
    "status",
    "approved_by",
    "approved_at",
    "created_at",
    "payout_status",
    "payout_date",
    "payment_reference",
    "notes"
   FROM "public"."payroll_records" "p"
  WHERE "public"."same_tenant"("tenant_id");


ALTER VIEW "public"."secure_payroll_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."security_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "severity" "text" DEFAULT 'low'::"text" NOT NULL,
    "user_id" "uuid",
    "ip_address" "text",
    "event_details" "jsonb" DEFAULT '{}'::"jsonb",
    "resolved" boolean DEFAULT false,
    "resolved_by" "uuid",
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."security_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shift_closures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "cashier_name" "text",
    "expected_cash" numeric DEFAULT 0,
    "actual_cash" numeric DEFAULT 0,
    "cash_difference" numeric DEFAULT 0,
    "card_total" numeric DEFAULT 0,
    "transfer_total" numeric DEFAULT 0,
    "total_revenue" numeric DEFAULT 0,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."shift_closures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shift_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "staff_id" "uuid",
    "staff_name" "text",
    "role" "text",
    "clock_in" timestamp with time zone,
    "clock_out" timestamp with time zone,
    "total_hours" numeric DEFAULT 0,
    "status" "text" DEFAULT 'CLOCKED_IN'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "late_minutes" numeric DEFAULT 0,
    "overtime_hours" numeric DEFAULT 0,
    "scheduled_start" timestamp with time zone,
    "scheduled_end" timestamp with time zone,
    "attendance_score" numeric DEFAULT 100
);


ALTER TABLE "public"."shift_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_accounts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "email" "text",
    "role" "text",
    "name" "text",
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL,
    "auth_user_id" "uuid",
    "position" "text" DEFAULT 'FOH'::"text",
    "active" boolean DEFAULT true,
    "department" "text",
    "user_id" "uuid"
);


ALTER TABLE "public"."staff_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "role" "text" NOT NULL,
    "score" integer DEFAULT 70 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL,
    CONSTRAINT "staff_members_role_check" CHECK (("role" = ANY (ARRAY['FOH'::"text", 'Bar'::"text", 'Kitchen'::"text", 'Owner'::"text"])))
);


ALTER TABLE "public"."staff_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "staff_name" "text" NOT NULL,
    "staff_role" "text" NOT NULL,
    "clock_in" timestamp with time zone NOT NULL,
    "clock_out" timestamp with time zone,
    "is_valid" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "penalty_multiplier" numeric DEFAULT 1,
    "is_late" boolean DEFAULT false,
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL
);


ALTER TABLE "public"."staff_shifts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "item_type" "text",
    "item_id" "uuid",
    "movement_type" "text",
    "quantity" numeric,
    "reference_id" "uuid",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."stock_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid",
    "organization_id" "uuid",
    "tenant_id" "uuid",
    "company" "text",
    "email" "text",
    "phone" "text",
    "currency" "text",
    "billing_cycle" "text" DEFAULT 'monthly'::"text",
    "subtotal" numeric DEFAULT 0,
    "discount_total" numeric DEFAULT 0,
    "final_monthly_total" numeric DEFAULT 0,
    "final_yearly_total" numeric DEFAULT 0,
    "selected_modules" "jsonb" DEFAULT '[]'::"jsonb",
    "status" "text" DEFAULT 'draft'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "alert_type" "text",
    "severity" "text" DEFAULT 'INFO'::"text",
    "title" "text",
    "message" "text",
    "source" "text",
    "source_id" "uuid",
    "status" "text" DEFAULT 'OPEN'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "resolved_at" timestamp with time zone
);


ALTER TABLE "public"."system_alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "job_name" "text" NOT NULL,
    "job_type" "text" NOT NULL,
    "last_run_at" timestamp with time zone,
    "next_run_at" timestamp with time zone,
    "status" "text" DEFAULT 'idle'::"text",
    "run_frequency" "text",
    "last_result" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."system_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."table_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "table_number" "text" NOT NULL,
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "guests" integer DEFAULT 0,
    "orders" integer DEFAULT 0,
    "revenue" numeric DEFAULT 0,
    "started_at" timestamp with time zone DEFAULT "now"(),
    "closed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "payment_method" "text" DEFAULT 'CASH'::"text",
    "paid_amount" numeric DEFAULT 0,
    "discount_amount" numeric DEFAULT 0,
    "service_charge_amount" numeric DEFAULT 0,
    "vat_amount" numeric DEFAULT 0,
    "final_total" numeric DEFAULT 0
);


ALTER TABLE "public"."table_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL,
    "type" "text",
    "status" "text" DEFAULT 'open'::"text",
    "message" "text",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "actor_email" "text",
    "action" "text" NOT NULL,
    "entity_type" "text",
    "entity_id" "text",
    "before_data" "jsonb",
    "after_data" "jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tenant_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_billing_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "billing_cycle" "text" DEFAULT 'monthly'::"text",
    "currency_code" "text",
    "subtotal" numeric DEFAULT 0,
    "discount_total" numeric DEFAULT 0,
    "final_monthly_total" numeric DEFAULT 0,
    "final_yearly_total" numeric DEFAULT 0,
    "status" "text" DEFAULT 'trial'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tenant_billing_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_modules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "module_id" "text" NOT NULL,
    "module_name" "text",
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tenant_modules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_platform_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "rbac_enabled" boolean DEFAULT true,
    "audit_enabled" boolean DEFAULT true,
    "billing_enabled" boolean DEFAULT true,
    "notifications_enabled" boolean DEFAULT true,
    "localization_enabled" boolean DEFAULT true,
    "ai_enabled" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tenant_platform_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "setting_key" "text" NOT NULL,
    "setting_value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "setting_type" "text" DEFAULT 'json'::"text",
    "description" "text",
    "is_system" boolean DEFAULT false
);


ALTER TABLE "public"."tenant_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "email" "text" NOT NULL,
    "full_name" "text",
    "role" "text" DEFAULT 'owner'::"text",
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "phone" "text",
    "auth_user_id" "uuid"
);


ALTER TABLE "public"."tenant_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text",
    "owner_user_id" "uuid",
    "plan" "text" DEFAULT 'basic'::"text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "currency" "text",
    "timezone" "text",
    "tenant_id" "uuid" DEFAULT '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'::"uuid" NOT NULL,
    "subscription_status" "text",
    "setup_step" integer,
    "setup_complete" boolean DEFAULT false,
    "service_charge" numeric,
    "foh_split" numeric,
    "bar_split" numeric,
    "kitchen_split" numeric,
    "approval_limit" numeric
);


ALTER TABLE "public"."tenants" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."trial_balance_view" AS
 SELECT "coa"."id" AS "account_id",
    "coa"."code",
    "coa"."name",
    "coa"."category",
    "sum"("jel"."debit") AS "total_debits",
    "sum"("jel"."credit") AS "total_credits",
    "sum"(("jel"."debit" - "jel"."credit")) AS "balance"
   FROM ("public"."chart_of_accounts" "coa"
     LEFT JOIN "public"."journal_entry_lines" "jel" ON (("coa"."id" = "jel"."account_id")))
  GROUP BY "coa"."id", "coa"."code", "coa"."name", "coa"."category"
  ORDER BY "coa"."code";


ALTER VIEW "public"."trial_balance_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_finance_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "user_id" "text" NOT NULL,
    "role_id" "uuid",
    "assigned_by" "text",
    "assigned_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_finance_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vendors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "vendor_code" "text",
    "legal_name" "text" NOT NULL,
    "display_name" "text",
    "tax_id" "text",
    "email" "text",
    "phone" "text",
    "address" "text",
    "payment_terms" "text",
    "default_expense_account" "uuid",
    "default_ap_account" "uuid",
    "is_active" boolean DEFAULT true,
    "is_blocked" boolean DEFAULT false,
    "risk_level" "text" DEFAULT 'normal'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."vendors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."warehouse_inventory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "warehouse_location_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "quantity" numeric DEFAULT 0 NOT NULL,
    "minimum_quantity" numeric DEFAULT 0,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."warehouse_inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."warehouse_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "location_code" "text" NOT NULL,
    "location_name" "text" NOT NULL,
    "location_type" "text",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."warehouse_locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."warehouse_transfers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "from_location_id" "uuid",
    "to_location_id" "uuid",
    "quantity" numeric DEFAULT 0 NOT NULL,
    "transfer_status" "text" DEFAULT 'pending'::"text",
    "transferred_by" "uuid",
    "approved_by" "uuid",
    "transferred_at" timestamp with time zone,
    "approved_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."warehouse_transfers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."waste_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "quantity" numeric NOT NULL,
    "reason" "text",
    "source" "text",
    "related_id" "uuid",
    "cost_impact" numeric DEFAULT 0,
    "created_by" "uuid",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'approved'::"text",
    CONSTRAINT "waste_logs_quantity_check" CHECK (("quantity" > (0)::numeric)),
    CONSTRAINT "waste_logs_source_check" CHECK (("source" = ANY (ARRAY['kitchen'::"text", 'stock_check'::"text", 'manager'::"text"]))),
    CONSTRAINT "waste_logs_status_check" CHECK (("status" = ANY (ARRAY['pending_approval'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "waste_logs_type_check" CHECK (("type" = ANY (ARRAY['ingredient'::"text", 'dish'::"text"])))
);


ALTER TABLE "public"."waste_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."websocket_delivery_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "websocket_session_id" "uuid",
    "websocket_event_queue_id" "uuid",
    "realtime_event_id" "uuid",
    "delivery_status" "text" NOT NULL,
    "response_message" "text",
    "delivery_attempt" integer DEFAULT 1,
    "delivered_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."websocket_delivery_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."websocket_event_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "websocket_session_id" "uuid",
    "realtime_event_id" "uuid",
    "delivery_status" "text" DEFAULT 'pending'::"text",
    "delivered_at" timestamp with time zone,
    "retry_count" integer DEFAULT 0,
    "last_retry_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."websocket_event_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."websocket_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "connection_id" "text" NOT NULL,
    "channel_name" "text" NOT NULL,
    "subscribed_events" "jsonb" DEFAULT '[]'::"jsonb",
    "connected_at" timestamp with time zone DEFAULT "now"(),
    "disconnected_at" timestamp with time zone,
    "active" boolean DEFAULT true,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."websocket_sessions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."accounting-expenses"
    ADD CONSTRAINT "accounting-expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."accounting_periods"
    ADD CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."actions"
    ADD CONSTRAINT "actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_agent_memory"
    ADD CONSTRAINT "ai_agent_memory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_agent_tasks"
    ADD CONSTRAINT "ai_agent_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_business_insights"
    ADD CONSTRAINT "ai_business_insights_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_campaign_recommendations"
    ADD CONSTRAINT "ai_campaign_recommendations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_forecasts"
    ADD CONSTRAINT "ai_forecasts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_recommendations"
    ADD CONSTRAINT "ai_recommendations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."alerts"
    ADD CONSTRAINT "alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_access_logs"
    ADD CONSTRAINT "api_access_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."approval_logs"
    ADD CONSTRAINT "approval_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."approval_rejections"
    ADD CONSTRAINT "approval_rejections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."approval_requests"
    ADD CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."approval_workflows"
    ADD CONSTRAINT "approval_workflows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."approvals"
    ADD CONSTRAINT "approvals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."backup_jobs"
    ADD CONSTRAINT "backup_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."billing_invoices"
    ADD CONSTRAINT "billing_invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_asset_usage"
    ADD CONSTRAINT "campaign_asset_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_memory"
    ADD CONSTRAINT "campaign_memory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_publish_logs"
    ADD CONSTRAINT "campaign_publish_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_publish_queue"
    ADD CONSTRAINT "campaign_publish_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chart_of_accounts"
    ADD CONSTRAINT "chart_of_accounts_code_unique" UNIQUE ("code");



ALTER TABLE ONLY "public"."chart_of_accounts"
    ADD CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cogs_entries"
    ADD CONSTRAINT "cogs_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cost_centers"
    ADD CONSTRAINT "cost_centers_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."cost_centers"
    ADD CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cross_location_consolidations"
    ADD CONSTRAINT "cross_location_consolidations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_feedback"
    ADD CONSTRAINT "customer_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_loyalty_accounts"
    ADD CONSTRAINT "customer_loyalty_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_segment_memberships"
    ADD CONSTRAINT "customer_segment_memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_segments"
    ADD CONSTRAINT "customer_segments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily-reports"
    ADD CONSTRAINT "daily-reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_sales_batches"
    ADD CONSTRAINT "daily_sales_batches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_sales_items"
    ADD CONSTRAINT "daily_sales_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."department_budgets"
    ADD CONSTRAINT "department_budgets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."department_permissions"
    ADD CONSTRAINT "department_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."depreciation_entries"
    ADD CONSTRAINT "depreciation_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dish_stock"
    ADD CONSTRAINT "dish_stock_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dishes"
    ADD CONSTRAINT "dishes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dynamic_price_adjustments"
    ADD CONSTRAINT "dynamic_price_adjustments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dynamic_pricing_rules"
    ADD CONSTRAINT "dynamic_pricing_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."engine_learning_memory"
    ADD CONSTRAINT "engine_learning_memory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_announcement_reads"
    ADD CONSTRAINT "enterprise_announcement_reads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_announcements"
    ADD CONSTRAINT "enterprise_announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_api_keys"
    ADD CONSTRAINT "enterprise_api_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_audit_events"
    ADD CONSTRAINT "enterprise_audit_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_audit_rules"
    ADD CONSTRAINT "enterprise_audit_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_audit_summary"
    ADD CONSTRAINT "enterprise_audit_summary_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_document_access_logs"
    ADD CONSTRAINT "enterprise_document_access_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_document_versions"
    ADD CONSTRAINT "enterprise_document_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_documents"
    ADD CONSTRAINT "enterprise_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_feature_flag_audit_logs"
    ADD CONSTRAINT "enterprise_feature_flag_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_feature_flags"
    ADD CONSTRAINT "enterprise_feature_flags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_health_checks"
    ADD CONSTRAINT "enterprise_health_checks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_integration_sync_logs"
    ADD CONSTRAINT "enterprise_integration_sync_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_integrations"
    ADD CONSTRAINT "enterprise_integrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_notification_queue"
    ADD CONSTRAINT "enterprise_notification_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_notification_templates"
    ADD CONSTRAINT "enterprise_notification_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_notifications"
    ADD CONSTRAINT "enterprise_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_rate_limit_logs"
    ADD CONSTRAINT "enterprise_rate_limit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_rate_limits"
    ADD CONSTRAINT "enterprise_rate_limits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_security_incidents"
    ADD CONSTRAINT "enterprise_security_incidents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_settings"
    ADD CONSTRAINT "enterprise_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_system_health"
    ADD CONSTRAINT "enterprise_system_health_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_webhook_deliveries"
    ADD CONSTRAINT "enterprise_webhook_deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_webhooks"
    ADD CONSTRAINT "enterprise_webhooks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_workflow_runs"
    ADD CONSTRAINT "enterprise_workflow_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_workflow_step_runs"
    ADD CONSTRAINT "enterprise_workflow_step_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_workflow_steps"
    ADD CONSTRAINT "enterprise_workflow_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_workflows"
    ADD CONSTRAINT "enterprise_workflows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."executive_dashboard_snapshots"
    ADD CONSTRAINT "executive_dashboard_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_permissions"
    ADD CONSTRAINT "finance_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_roles"
    ADD CONSTRAINT "finance_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_roles"
    ADD CONSTRAINT "finance_roles_role_code_key" UNIQUE ("role_code");



ALTER TABLE ONLY "public"."financial_periods"
    ADD CONSTRAINT "financial_periods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fixed_assets"
    ADD CONSTRAINT "fixed_assets_asset_code_key" UNIQUE ("asset_code");



ALTER TABLE ONLY "public"."fixed_assets"
    ADD CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."generation_jobs"
    ADD CONSTRAINT "generation_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."goods_receipt_items"
    ADD CONSTRAINT "goods_receipt_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."goods_receipts"
    ADD CONSTRAINT "goods_receipts_grn_number_key" UNIQUE ("grn_number");



ALTER TABLE ONLY "public"."goods_receipts"
    ADD CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."history_days"
    ADD CONSTRAINT "history_days_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ingredient_stock"
    ADD CONSTRAINT "ingredient_stock_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."intercompany_transactions"
    ADD CONSTRAINT "intercompany_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_alerts"
    ADD CONSTRAINT "inventory_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_cost_layers"
    ADD CONSTRAINT "inventory_cost_layers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_transactions"
    ADD CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_valuation_snapshots"
    ADD CONSTRAINT "inventory_valuation_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_matches"
    ADD CONSTRAINT "invoice_matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."item_learning"
    ADD CONSTRAINT "item_learning_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."item_learning"
    ADD CONSTRAINT "item_learning_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_entry_number_key" UNIQUE ("entry_number");



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."journal_entry_lines"
    ADD CONSTRAINT "journal_entry_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kitchen_station_orders"
    ADD CONSTRAINT "kitchen_station_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kitchen_station_performance"
    ADD CONSTRAINT "kitchen_station_performance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kitchen_stations"
    ADD CONSTRAINT "kitchen_stations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."labor_shift_forecasts"
    ADD CONSTRAINT "labor_shift_forecasts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."legal_entities"
    ADD CONSTRAINT "legal_entities_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."legal_entities"
    ADD CONSTRAINT "legal_entities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketing_assets"
    ADD CONSTRAINT "marketing_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketing_campaign_analytics"
    ADD CONSTRAINT "marketing_campaign_analytics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketing_campaign_deliveries"
    ADD CONSTRAINT "marketing_campaign_deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketing_campaigns"
    ADD CONSTRAINT "marketing_campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketing_prompt_history"
    ADD CONSTRAINT "marketing_prompt_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meta_accounts"
    ADD CONSTRAINT "meta_accounts_page_id_key" UNIQUE ("page_id");



ALTER TABLE ONLY "public"."meta_accounts"
    ADD CONSTRAINT "meta_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_leads"
    ADD CONSTRAINT "organization_leads_organization_id_key" UNIQUE ("organization_id");



ALTER TABLE ONLY "public"."organization_leads"
    ADD CONSTRAINT "organization_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_payouts"
    ADD CONSTRAINT "payroll_payouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_records"
    ADD CONSTRAINT "payroll_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."performance"
    ADD CONSTRAINT "performance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."period_lock_exceptions"
    ADD CONSTRAINT "period_lock_exceptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_modules"
    ADD CONSTRAINT "platform_modules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_tokens"
    ADD CONSTRAINT "platform_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_users"
    ADD CONSTRAINT "platform_users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."platform_users"
    ADD CONSTRAINT "platform_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos-sales"
    ADD CONSTRAINT "pos-sales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."production_batches"
    ADD CONSTRAINT "production_batches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."production_locks"
    ADD CONSTRAINT "production_locks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."production_logs"
    ADD CONSTRAINT "production_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."production_runs"
    ADD CONSTRAINT "production_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_po_number_key" UNIQUE ("po_number");



ALTER TABLE ONLY "public"."purchase_request_items"
    ADD CONSTRAINT "purchase_request_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_requests"
    ADD CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_requests"
    ADD CONSTRAINT "purchase_requests_request_number_key" UNIQUE ("request_number");



ALTER TABLE ONLY "public"."realtime_events"
    ADD CONSTRAINT "realtime_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."realtime_presence"
    ADD CONSTRAINT "realtime_presence_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipe_items"
    ADD CONSTRAINT "recipe_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipe_matrix"
    ADD CONSTRAINT "recipe_matrix_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_settings"
    ADD CONSTRAINT "restaurant_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_hierarchy"
    ADD CONSTRAINT "role_hierarchy_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."salary_confirmations"
    ADD CONSTRAINT "salary_confirmations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_events"
    ADD CONSTRAINT "sales_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_events"
    ADD CONSTRAINT "security_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shift_closures"
    ADD CONSTRAINT "shift_closures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shift_logs"
    ADD CONSTRAINT "shift_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_accounts"
    ADD CONSTRAINT "staff_accounts_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."staff_accounts"
    ADD CONSTRAINT "staff_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_members"
    ADD CONSTRAINT "staff_members_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."staff_members"
    ADD CONSTRAINT "staff_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_shifts"
    ADD CONSTRAINT "staff_shifts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_alerts"
    ADD CONSTRAINT "system_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_jobs"
    ADD CONSTRAINT "system_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."table_sessions"
    ADD CONSTRAINT "table_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_audit_logs"
    ADD CONSTRAINT "tenant_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_billing_profiles"
    ADD CONSTRAINT "tenant_billing_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_modules"
    ADD CONSTRAINT "tenant_modules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_platform_config"
    ADD CONSTRAINT "tenant_platform_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_settings"
    ADD CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_users"
    ADD CONSTRAINT "tenant_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "unique_dish_per_tenant" UNIQUE ("tenant_id", "dish_id");



ALTER TABLE ONLY "public"."dish_stock"
    ADD CONSTRAINT "unique_dish_stock_per_tenant" UNIQUE ("tenant_id", "dish_id");



ALTER TABLE ONLY "public"."ingredient_stock"
    ADD CONSTRAINT "unique_ingredient_stock_per_tenant" UNIQUE ("tenant_id", "ingredient_id");



ALTER TABLE ONLY "public"."user_finance_roles"
    ADD CONSTRAINT "user_finance_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_vendor_code_key" UNIQUE ("vendor_code");



ALTER TABLE ONLY "public"."warehouse_inventory"
    ADD CONSTRAINT "warehouse_inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."warehouse_inventory"
    ADD CONSTRAINT "warehouse_inventory_unique_location_ingredient" UNIQUE ("warehouse_location_id", "ingredient_id");



ALTER TABLE ONLY "public"."warehouse_locations"
    ADD CONSTRAINT "warehouse_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."warehouse_transfers"
    ADD CONSTRAINT "warehouse_transfers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."waste_logs"
    ADD CONSTRAINT "waste_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."websocket_delivery_logs"
    ADD CONSTRAINT "websocket_delivery_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."websocket_event_queue"
    ADD CONSTRAINT "websocket_event_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."websocket_sessions"
    ADD CONSTRAINT "websocket_sessions_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_accounting-expenses_tenant_id" ON "public"."accounting-expenses" USING "btree" ("tenant_id");



CREATE INDEX "idx_accounting_expenses_tenant_id" ON "public"."accounting-expenses" USING "btree" ("tenant_id");



CREATE INDEX "idx_accounting_periods_tenant_id" ON "public"."accounting_periods" USING "btree" ("tenant_id");



CREATE INDEX "idx_actions_tenant_id" ON "public"."actions" USING "btree" ("tenant_id");



CREATE INDEX "idx_ai_agent_memory_agent" ON "public"."ai_agent_memory" USING "btree" ("agent_name");



CREATE INDEX "idx_ai_agent_memory_tenant_id" ON "public"."ai_agent_memory" USING "btree" ("tenant_id");



CREATE INDEX "idx_ai_agent_memory_type" ON "public"."ai_agent_memory" USING "btree" ("memory_type");



CREATE UNIQUE INDEX "idx_ai_agent_memory_unique" ON "public"."ai_agent_memory" USING "btree" ("tenant_id", "agent_name", "memory_type", "memory_key");



CREATE INDEX "idx_ai_agent_tasks_category" ON "public"."ai_agent_tasks" USING "btree" ("task_category");



CREATE INDEX "idx_ai_agent_tasks_priority" ON "public"."ai_agent_tasks" USING "btree" ("priority");



CREATE INDEX "idx_ai_agent_tasks_status" ON "public"."ai_agent_tasks" USING "btree" ("task_status");



CREATE INDEX "idx_ai_agent_tasks_tenant" ON "public"."ai_agent_tasks" USING "btree" ("tenant_id");



CREATE INDEX "idx_ai_agent_tasks_tenant_id" ON "public"."ai_agent_tasks" USING "btree" ("tenant_id");



CREATE INDEX "idx_ai_business_insights_severity" ON "public"."ai_business_insights" USING "btree" ("severity");



CREATE INDEX "idx_ai_business_insights_tenant" ON "public"."ai_business_insights" USING "btree" ("tenant_id");



CREATE INDEX "idx_ai_business_insights_tenant_id" ON "public"."ai_business_insights" USING "btree" ("tenant_id");



CREATE INDEX "idx_ai_business_insights_type" ON "public"."ai_business_insights" USING "btree" ("insight_type");



CREATE INDEX "idx_ai_campaign_recommendations_segment" ON "public"."ai_campaign_recommendations" USING "btree" ("target_segment_id");



CREATE INDEX "idx_ai_campaign_recommendations_status" ON "public"."ai_campaign_recommendations" USING "btree" ("recommendation_status");



CREATE INDEX "idx_ai_campaign_recommendations_tenant" ON "public"."ai_campaign_recommendations" USING "btree" ("tenant_id");



CREATE INDEX "idx_ai_campaign_recommendations_tenant_id" ON "public"."ai_campaign_recommendations" USING "btree" ("tenant_id");



CREATE INDEX "idx_ai_forecasts_date" ON "public"."ai_forecasts" USING "btree" ("forecast_date");



CREATE INDEX "idx_ai_forecasts_tenant" ON "public"."ai_forecasts" USING "btree" ("tenant_id");



CREATE INDEX "idx_ai_forecasts_tenant_id" ON "public"."ai_forecasts" USING "btree" ("tenant_id");



CREATE INDEX "idx_ai_forecasts_type" ON "public"."ai_forecasts" USING "btree" ("forecast_type");



CREATE INDEX "idx_ai_recommendations_priority" ON "public"."ai_recommendations" USING "btree" ("priority");



CREATE INDEX "idx_ai_recommendations_tenant" ON "public"."ai_recommendations" USING "btree" ("tenant_id");



CREATE INDEX "idx_ai_recommendations_tenant_id" ON "public"."ai_recommendations" USING "btree" ("tenant_id");



CREATE INDEX "idx_ai_recommendations_type" ON "public"."ai_recommendations" USING "btree" ("recommendation_type");



CREATE INDEX "idx_alerts_tenant_id" ON "public"."alerts" USING "btree" ("tenant_id");



CREATE INDEX "idx_api_access_logs_created" ON "public"."api_access_logs" USING "btree" ("created_at");



CREATE INDEX "idx_api_access_logs_endpoint" ON "public"."api_access_logs" USING "btree" ("endpoint");



CREATE INDEX "idx_api_access_logs_tenant" ON "public"."api_access_logs" USING "btree" ("tenant_id");



CREATE INDEX "idx_api_access_logs_tenant_id" ON "public"."api_access_logs" USING "btree" ("tenant_id");



CREATE INDEX "idx_api_access_logs_user" ON "public"."api_access_logs" USING "btree" ("user_id");



CREATE INDEX "idx_approval_logs_tenant_id" ON "public"."approval_logs" USING "btree" ("tenant_id");



CREATE INDEX "idx_approval_rejections_tenant_id" ON "public"."approval_rejections" USING "btree" ("tenant_id");



CREATE INDEX "idx_approval_requests_reference" ON "public"."approval_requests" USING "btree" ("reference_table", "reference_id");



CREATE INDEX "idx_approval_requests_status" ON "public"."approval_requests" USING "btree" ("status");



CREATE INDEX "idx_approval_requests_tenant" ON "public"."approval_requests" USING "btree" ("tenant_id");



CREATE INDEX "idx_approval_requests_tenant_id" ON "public"."approval_requests" USING "btree" ("tenant_id");



CREATE INDEX "idx_approval_workflows_department" ON "public"."approval_workflows" USING "btree" ("department");



CREATE INDEX "idx_approval_workflows_tenant" ON "public"."approval_workflows" USING "btree" ("tenant_id");



CREATE INDEX "idx_approval_workflows_tenant_id" ON "public"."approval_workflows" USING "btree" ("tenant_id");



CREATE INDEX "idx_approval_workflows_type" ON "public"."approval_workflows" USING "btree" ("workflow_type");



CREATE INDEX "idx_approvals_tenant_id" ON "public"."approvals" USING "btree" ("tenant_id");



CREATE INDEX "idx_assets_tenant_id" ON "public"."assets" USING "btree" ("tenant_id");



CREATE INDEX "idx_audit_logs_action_type" ON "public"."audit_logs" USING "btree" ("action_type");



CREATE INDEX "idx_audit_logs_entity" ON "public"."audit_logs" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_audit_logs_tenant" ON "public"."audit_logs" USING "btree" ("tenant_id");



CREATE INDEX "idx_audit_logs_tenant_id" ON "public"."audit_logs" USING "btree" ("tenant_id");



CREATE INDEX "idx_backup_jobs_status" ON "public"."backup_jobs" USING "btree" ("backup_status");



CREATE INDEX "idx_backup_jobs_tenant" ON "public"."backup_jobs" USING "btree" ("tenant_id");



CREATE INDEX "idx_backup_jobs_tenant_id" ON "public"."backup_jobs" USING "btree" ("tenant_id");



CREATE INDEX "idx_backup_jobs_type" ON "public"."backup_jobs" USING "btree" ("backup_type");



CREATE INDEX "idx_billing_invoices_tenant_id" ON "public"."billing_invoices" USING "btree" ("tenant_id");



CREATE INDEX "idx_campaign_asset_usage_tenant_id" ON "public"."campaign_asset_usage" USING "btree" ("tenant_id");



CREATE INDEX "idx_campaign_memory_tenant_id" ON "public"."campaign_memory" USING "btree" ("tenant_id");



CREATE INDEX "idx_campaign_publish_logs_tenant_id" ON "public"."campaign_publish_logs" USING "btree" ("tenant_id");



CREATE INDEX "idx_campaign_publish_queue_campaign_memory_id" ON "public"."campaign_publish_queue" USING "btree" ("campaign_memory_id");



CREATE INDEX "idx_campaign_publish_queue_tenant_id" ON "public"."campaign_publish_queue" USING "btree" ("tenant_id");



CREATE INDEX "idx_campaigns_tenant_id" ON "public"."campaigns" USING "btree" ("tenant_id");



CREATE INDEX "idx_chart_of_accounts_tenant_id" ON "public"."chart_of_accounts" USING "btree" ("tenant_id");



CREATE INDEX "idx_cogs_entries_created_at" ON "public"."cogs_entries" USING "btree" ("created_at");



CREATE INDEX "idx_cogs_entries_dish" ON "public"."cogs_entries" USING "btree" ("dish_id");



CREATE INDEX "idx_cogs_entries_order" ON "public"."cogs_entries" USING "btree" ("order_id");



CREATE INDEX "idx_cogs_entries_tenant" ON "public"."cogs_entries" USING "btree" ("tenant_id");



CREATE INDEX "idx_cogs_entries_tenant_id" ON "public"."cogs_entries" USING "btree" ("tenant_id");



CREATE INDEX "idx_cost_centers_tenant_id" ON "public"."cost_centers" USING "btree" ("tenant_id");



CREATE INDEX "idx_cross_location_consolidations_date" ON "public"."cross_location_consolidations" USING "btree" ("consolidation_date");



CREATE INDEX "idx_cross_location_consolidations_tenant" ON "public"."cross_location_consolidations" USING "btree" ("tenant_id");



CREATE INDEX "idx_cross_location_consolidations_tenant_id" ON "public"."cross_location_consolidations" USING "btree" ("tenant_id");



CREATE INDEX "idx_customer_feedback_rating" ON "public"."customer_feedback" USING "btree" ("rating");



CREATE INDEX "idx_customer_feedback_resolved" ON "public"."customer_feedback" USING "btree" ("resolved");



CREATE INDEX "idx_customer_feedback_tenant" ON "public"."customer_feedback" USING "btree" ("tenant_id");



CREATE INDEX "idx_customer_feedback_tenant_id" ON "public"."customer_feedback" USING "btree" ("tenant_id");



CREATE INDEX "idx_customer_loyalty_accounts_phone" ON "public"."customer_loyalty_accounts" USING "btree" ("customer_phone");



CREATE INDEX "idx_customer_loyalty_accounts_tenant" ON "public"."customer_loyalty_accounts" USING "btree" ("tenant_id");



CREATE INDEX "idx_customer_loyalty_accounts_tenant_id" ON "public"."customer_loyalty_accounts" USING "btree" ("tenant_id");



CREATE INDEX "idx_customer_loyalty_accounts_tier" ON "public"."customer_loyalty_accounts" USING "btree" ("tier");



CREATE INDEX "idx_customer_segment_memberships_customer" ON "public"."customer_segment_memberships" USING "btree" ("customer_loyalty_account_id");



CREATE INDEX "idx_customer_segment_memberships_segment" ON "public"."customer_segment_memberships" USING "btree" ("customer_segment_id");



CREATE INDEX "idx_customer_segment_memberships_tenant" ON "public"."customer_segment_memberships" USING "btree" ("tenant_id");



CREATE INDEX "idx_customer_segment_memberships_tenant_id" ON "public"."customer_segment_memberships" USING "btree" ("tenant_id");



CREATE INDEX "idx_customer_segments_active" ON "public"."customer_segments" USING "btree" ("active");



CREATE INDEX "idx_customer_segments_tenant" ON "public"."customer_segments" USING "btree" ("tenant_id");



CREATE INDEX "idx_customer_segments_tenant_id" ON "public"."customer_segments" USING "btree" ("tenant_id");



CREATE INDEX "idx_customer_segments_type" ON "public"."customer_segments" USING "btree" ("segment_type");



CREATE INDEX "idx_daily-reports_tenant_id" ON "public"."daily-reports" USING "btree" ("tenant_id");



CREATE INDEX "idx_daily_reports_tenant_id" ON "public"."daily-reports" USING "btree" ("tenant_id");



CREATE INDEX "idx_daily_sales_batches_tenant_id" ON "public"."daily_sales_batches" USING "btree" ("tenant_id");



CREATE INDEX "idx_daily_sales_items_tenant_id" ON "public"."daily_sales_items" USING "btree" ("tenant_id");



CREATE INDEX "idx_department_budgets_tenant_id" ON "public"."department_budgets" USING "btree" ("tenant_id");



CREATE INDEX "idx_department_permissions_department" ON "public"."department_permissions" USING "btree" ("department");



CREATE INDEX "idx_department_permissions_role" ON "public"."department_permissions" USING "btree" ("role");



CREATE INDEX "idx_department_permissions_tenant" ON "public"."department_permissions" USING "btree" ("tenant_id");



CREATE INDEX "idx_department_permissions_tenant_id" ON "public"."department_permissions" USING "btree" ("tenant_id");



CREATE INDEX "idx_departments_tenant_id" ON "public"."departments" USING "btree" ("tenant_id");



CREATE INDEX "idx_depreciation_entries_tenant_id" ON "public"."depreciation_entries" USING "btree" ("tenant_id");



CREATE INDEX "idx_dish_stock_dish_id" ON "public"."dish_stock" USING "btree" ("dish_id");



CREATE INDEX "idx_dish_stock_tenant_id" ON "public"."dish_stock" USING "btree" ("tenant_id");



CREATE INDEX "idx_dishes_tenant_id" ON "public"."dishes" USING "btree" ("tenant_id");



CREATE INDEX "idx_dynamic_price_adjustments_order_item" ON "public"."dynamic_price_adjustments" USING "btree" ("order_item_id");



CREATE INDEX "idx_dynamic_price_adjustments_rule" ON "public"."dynamic_price_adjustments" USING "btree" ("pricing_rule_id");



CREATE INDEX "idx_dynamic_price_adjustments_tenant" ON "public"."dynamic_price_adjustments" USING "btree" ("tenant_id");



CREATE INDEX "idx_dynamic_price_adjustments_tenant_id" ON "public"."dynamic_price_adjustments" USING "btree" ("tenant_id");



CREATE INDEX "idx_dynamic_pricing_rules_active" ON "public"."dynamic_pricing_rules" USING "btree" ("active");



CREATE INDEX "idx_dynamic_pricing_rules_tenant" ON "public"."dynamic_pricing_rules" USING "btree" ("tenant_id");



CREATE INDEX "idx_dynamic_pricing_rules_tenant_id" ON "public"."dynamic_pricing_rules" USING "btree" ("tenant_id");



CREATE INDEX "idx_dynamic_pricing_rules_type" ON "public"."dynamic_pricing_rules" USING "btree" ("rule_type");



CREATE INDEX "idx_engine_learning_memory_tenant_id" ON "public"."engine_learning_memory" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_announcement_reads_announcement" ON "public"."enterprise_announcement_reads" USING "btree" ("announcement_id");



CREATE INDEX "idx_enterprise_announcement_reads_tenant" ON "public"."enterprise_announcement_reads" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_announcement_reads_tenant_id" ON "public"."enterprise_announcement_reads" USING "btree" ("tenant_id");



CREATE UNIQUE INDEX "idx_enterprise_announcement_reads_unique" ON "public"."enterprise_announcement_reads" USING "btree" ("tenant_id", "announcement_id", "user_id");



CREATE INDEX "idx_enterprise_announcement_reads_user" ON "public"."enterprise_announcement_reads" USING "btree" ("user_id");



CREATE INDEX "idx_enterprise_announcements_active" ON "public"."enterprise_announcements" USING "btree" ("active");



CREATE INDEX "idx_enterprise_announcements_priority" ON "public"."enterprise_announcements" USING "btree" ("priority");



CREATE INDEX "idx_enterprise_announcements_tenant" ON "public"."enterprise_announcements" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_announcements_tenant_id" ON "public"."enterprise_announcements" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_announcements_type" ON "public"."enterprise_announcements" USING "btree" ("announcement_type");



CREATE INDEX "idx_enterprise_api_keys_provider" ON "public"."enterprise_api_keys" USING "btree" ("api_provider");



CREATE INDEX "idx_enterprise_api_keys_revoked" ON "public"."enterprise_api_keys" USING "btree" ("revoked");



CREATE INDEX "idx_enterprise_api_keys_tenant" ON "public"."enterprise_api_keys" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_api_keys_tenant_id" ON "public"."enterprise_api_keys" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_audit_events_action" ON "public"."enterprise_audit_events" USING "btree" ("event_action");



CREATE INDEX "idx_enterprise_audit_events_rule" ON "public"."enterprise_audit_events" USING "btree" ("enterprise_audit_rule_id");



CREATE INDEX "idx_enterprise_audit_events_severity" ON "public"."enterprise_audit_events" USING "btree" ("severity");



CREATE INDEX "idx_enterprise_audit_events_table" ON "public"."enterprise_audit_events" USING "btree" ("event_table");



CREATE INDEX "idx_enterprise_audit_events_tenant" ON "public"."enterprise_audit_events" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_audit_events_tenant_id" ON "public"."enterprise_audit_events" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_audit_rules_action" ON "public"."enterprise_audit_rules" USING "btree" ("monitored_action");



CREATE INDEX "idx_enterprise_audit_rules_active" ON "public"."enterprise_audit_rules" USING "btree" ("active");



CREATE INDEX "idx_enterprise_audit_rules_table" ON "public"."enterprise_audit_rules" USING "btree" ("monitored_table");



CREATE INDEX "idx_enterprise_audit_rules_tenant" ON "public"."enterprise_audit_rules" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_audit_rules_tenant_id" ON "public"."enterprise_audit_rules" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_audit_summary_date" ON "public"."enterprise_audit_summary" USING "btree" ("audit_date");



CREATE INDEX "idx_enterprise_audit_summary_tenant" ON "public"."enterprise_audit_summary" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_audit_summary_tenant_id" ON "public"."enterprise_audit_summary" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_document_access_logs_document" ON "public"."enterprise_document_access_logs" USING "btree" ("enterprise_document_id");



CREATE INDEX "idx_enterprise_document_access_logs_tenant" ON "public"."enterprise_document_access_logs" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_document_access_logs_tenant_id" ON "public"."enterprise_document_access_logs" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_document_access_logs_user" ON "public"."enterprise_document_access_logs" USING "btree" ("accessed_by");



CREATE INDEX "idx_enterprise_document_versions_document" ON "public"."enterprise_document_versions" USING "btree" ("enterprise_document_id");



CREATE INDEX "idx_enterprise_document_versions_tenant" ON "public"."enterprise_document_versions" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_document_versions_tenant_id" ON "public"."enterprise_document_versions" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_document_versions_version" ON "public"."enterprise_document_versions" USING "btree" ("version_number");



CREATE INDEX "idx_enterprise_documents_status" ON "public"."enterprise_documents" USING "btree" ("document_status");



CREATE INDEX "idx_enterprise_documents_tenant" ON "public"."enterprise_documents" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_documents_tenant_id" ON "public"."enterprise_documents" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_documents_type" ON "public"."enterprise_documents" USING "btree" ("document_type");



CREATE INDEX "idx_enterprise_feature_flag_audit_logs_environment" ON "public"."enterprise_feature_flag_audit_logs" USING "btree" ("environment");



CREATE INDEX "idx_enterprise_feature_flag_audit_logs_feature" ON "public"."enterprise_feature_flag_audit_logs" USING "btree" ("feature_key");



CREATE INDEX "idx_enterprise_feature_flag_audit_logs_tenant" ON "public"."enterprise_feature_flag_audit_logs" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_feature_flag_audit_logs_tenant_id" ON "public"."enterprise_feature_flag_audit_logs" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_feature_flags_enabled" ON "public"."enterprise_feature_flags" USING "btree" ("enabled");



CREATE INDEX "idx_enterprise_feature_flags_tenant_id" ON "public"."enterprise_feature_flags" USING "btree" ("tenant_id");



CREATE UNIQUE INDEX "idx_enterprise_feature_flags_unique" ON "public"."enterprise_feature_flags" USING "btree" ("tenant_id", "feature_key");



CREATE INDEX "idx_enterprise_health_checks_category" ON "public"."enterprise_health_checks" USING "btree" ("check_category");



CREATE INDEX "idx_enterprise_health_checks_status" ON "public"."enterprise_health_checks" USING "btree" ("status");



CREATE INDEX "idx_enterprise_health_checks_tenant" ON "public"."enterprise_health_checks" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_health_checks_tenant_id" ON "public"."enterprise_health_checks" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_integration_sync_logs_integration" ON "public"."enterprise_integration_sync_logs" USING "btree" ("enterprise_integration_id");



CREATE INDEX "idx_enterprise_integration_sync_logs_status" ON "public"."enterprise_integration_sync_logs" USING "btree" ("sync_status");



CREATE INDEX "idx_enterprise_integration_sync_logs_tenant" ON "public"."enterprise_integration_sync_logs" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_integration_sync_logs_tenant_id" ON "public"."enterprise_integration_sync_logs" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_integrations_provider" ON "public"."enterprise_integrations" USING "btree" ("provider");



CREATE INDEX "idx_enterprise_integrations_status" ON "public"."enterprise_integrations" USING "btree" ("connection_status");



CREATE INDEX "idx_enterprise_integrations_tenant" ON "public"."enterprise_integrations" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_integrations_tenant_id" ON "public"."enterprise_integrations" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_integrations_type" ON "public"."enterprise_integrations" USING "btree" ("integration_type");



CREATE INDEX "idx_enterprise_notification_queue_channel" ON "public"."enterprise_notification_queue" USING "btree" ("delivery_channel");



CREATE INDEX "idx_enterprise_notification_queue_scheduled" ON "public"."enterprise_notification_queue" USING "btree" ("scheduled_at");



CREATE INDEX "idx_enterprise_notification_queue_status" ON "public"."enterprise_notification_queue" USING "btree" ("delivery_status");



CREATE INDEX "idx_enterprise_notification_queue_tenant" ON "public"."enterprise_notification_queue" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_notification_queue_tenant_id" ON "public"."enterprise_notification_queue" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_notification_templates_channel" ON "public"."enterprise_notification_templates" USING "btree" ("delivery_channel");



CREATE INDEX "idx_enterprise_notification_templates_tenant" ON "public"."enterprise_notification_templates" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_notification_templates_tenant_id" ON "public"."enterprise_notification_templates" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_notification_templates_type" ON "public"."enterprise_notification_templates" USING "btree" ("template_type");



CREATE INDEX "idx_enterprise_notifications_read" ON "public"."enterprise_notifications" USING "btree" ("read");



CREATE INDEX "idx_enterprise_notifications_role" ON "public"."enterprise_notifications" USING "btree" ("target_role");



CREATE INDEX "idx_enterprise_notifications_tenant" ON "public"."enterprise_notifications" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_notifications_tenant_id" ON "public"."enterprise_notifications" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_rate_limit_logs_expires" ON "public"."enterprise_rate_limit_logs" USING "btree" ("expires_at");



CREATE INDEX "idx_enterprise_rate_limit_logs_identifier" ON "public"."enterprise_rate_limit_logs" USING "btree" ("identifier");



CREATE INDEX "idx_enterprise_rate_limit_logs_key" ON "public"."enterprise_rate_limit_logs" USING "btree" ("limit_key");



CREATE INDEX "idx_enterprise_rate_limit_logs_tenant" ON "public"."enterprise_rate_limit_logs" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_rate_limit_logs_tenant_id" ON "public"."enterprise_rate_limit_logs" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_rate_limits_category" ON "public"."enterprise_rate_limits" USING "btree" ("limit_category");



CREATE INDEX "idx_enterprise_rate_limits_tenant" ON "public"."enterprise_rate_limits" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_rate_limits_tenant_id" ON "public"."enterprise_rate_limits" USING "btree" ("tenant_id");



CREATE UNIQUE INDEX "idx_enterprise_rate_limits_unique" ON "public"."enterprise_rate_limits" USING "btree" ("tenant_id", "limit_key");



CREATE INDEX "idx_enterprise_security_incidents_severity" ON "public"."enterprise_security_incidents" USING "btree" ("severity");



CREATE INDEX "idx_enterprise_security_incidents_status" ON "public"."enterprise_security_incidents" USING "btree" ("incident_status");



CREATE INDEX "idx_enterprise_security_incidents_tenant" ON "public"."enterprise_security_incidents" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_security_incidents_tenant_id" ON "public"."enterprise_security_incidents" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_security_incidents_type" ON "public"."enterprise_security_incidents" USING "btree" ("incident_type");



CREATE INDEX "idx_enterprise_settings_category" ON "public"."enterprise_settings" USING "btree" ("setting_category");



CREATE INDEX "idx_enterprise_settings_tenant_id" ON "public"."enterprise_settings" USING "btree" ("tenant_id");



CREATE UNIQUE INDEX "idx_enterprise_settings_unique" ON "public"."enterprise_settings" USING "btree" ("tenant_id", "setting_key");



CREATE INDEX "idx_enterprise_system_health_category" ON "public"."enterprise_system_health" USING "btree" ("health_category");



CREATE INDEX "idx_enterprise_system_health_checked" ON "public"."enterprise_system_health" USING "btree" ("checked_at");



CREATE INDEX "idx_enterprise_system_health_status" ON "public"."enterprise_system_health" USING "btree" ("metric_status");



CREATE INDEX "idx_enterprise_system_health_tenant" ON "public"."enterprise_system_health" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_system_health_tenant_id" ON "public"."enterprise_system_health" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_webhook_deliveries_status" ON "public"."enterprise_webhook_deliveries" USING "btree" ("delivery_status");



CREATE INDEX "idx_enterprise_webhook_deliveries_tenant" ON "public"."enterprise_webhook_deliveries" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_webhook_deliveries_tenant_id" ON "public"."enterprise_webhook_deliveries" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_webhook_deliveries_webhook" ON "public"."enterprise_webhook_deliveries" USING "btree" ("enterprise_webhook_id");



CREATE INDEX "idx_enterprise_webhooks_active" ON "public"."enterprise_webhooks" USING "btree" ("active");



CREATE INDEX "idx_enterprise_webhooks_tenant" ON "public"."enterprise_webhooks" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_webhooks_tenant_id" ON "public"."enterprise_webhooks" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_workflow_runs_status" ON "public"."enterprise_workflow_runs" USING "btree" ("run_status");



CREATE INDEX "idx_enterprise_workflow_runs_tenant" ON "public"."enterprise_workflow_runs" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_workflow_runs_tenant_id" ON "public"."enterprise_workflow_runs" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_workflow_runs_workflow" ON "public"."enterprise_workflow_runs" USING "btree" ("enterprise_workflow_id");



CREATE INDEX "idx_enterprise_workflow_step_runs_status" ON "public"."enterprise_workflow_step_runs" USING "btree" ("run_status");



CREATE INDEX "idx_enterprise_workflow_step_runs_step" ON "public"."enterprise_workflow_step_runs" USING "btree" ("enterprise_workflow_step_id");



CREATE INDEX "idx_enterprise_workflow_step_runs_tenant" ON "public"."enterprise_workflow_step_runs" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_workflow_step_runs_tenant_id" ON "public"."enterprise_workflow_step_runs" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_workflow_step_runs_workflow_run" ON "public"."enterprise_workflow_step_runs" USING "btree" ("enterprise_workflow_run_id");



CREATE INDEX "idx_enterprise_workflow_steps_order" ON "public"."enterprise_workflow_steps" USING "btree" ("step_order");



CREATE INDEX "idx_enterprise_workflow_steps_tenant" ON "public"."enterprise_workflow_steps" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_workflow_steps_tenant_id" ON "public"."enterprise_workflow_steps" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_workflow_steps_workflow" ON "public"."enterprise_workflow_steps" USING "btree" ("enterprise_workflow_id");



CREATE INDEX "idx_enterprise_workflows_active" ON "public"."enterprise_workflows" USING "btree" ("active");



CREATE INDEX "idx_enterprise_workflows_status" ON "public"."enterprise_workflows" USING "btree" ("workflow_status");



CREATE INDEX "idx_enterprise_workflows_tenant" ON "public"."enterprise_workflows" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_workflows_tenant_id" ON "public"."enterprise_workflows" USING "btree" ("tenant_id");



CREATE INDEX "idx_enterprise_workflows_type" ON "public"."enterprise_workflows" USING "btree" ("workflow_type");



CREATE INDEX "idx_executive_dashboard_snapshots_date" ON "public"."executive_dashboard_snapshots" USING "btree" ("snapshot_date");



CREATE INDEX "idx_executive_dashboard_snapshots_tenant" ON "public"."executive_dashboard_snapshots" USING "btree" ("tenant_id");



CREATE INDEX "idx_executive_dashboard_snapshots_tenant_id" ON "public"."executive_dashboard_snapshots" USING "btree" ("tenant_id");



CREATE INDEX "idx_finance_permissions_tenant_id" ON "public"."finance_permissions" USING "btree" ("tenant_id");



CREATE INDEX "idx_finance_roles_tenant_id" ON "public"."finance_roles" USING "btree" ("tenant_id");



CREATE INDEX "idx_financial_periods_status" ON "public"."financial_periods" USING "btree" ("status");



CREATE INDEX "idx_financial_periods_tenant" ON "public"."financial_periods" USING "btree" ("tenant_id");



CREATE INDEX "idx_financial_periods_tenant_id" ON "public"."financial_periods" USING "btree" ("tenant_id");



CREATE INDEX "idx_fixed_assets_tenant_id" ON "public"."fixed_assets" USING "btree" ("tenant_id");



CREATE INDEX "idx_generation_jobs_tenant_id" ON "public"."generation_jobs" USING "btree" ("tenant_id");



CREATE INDEX "idx_goods_receipt_items_tenant_id" ON "public"."goods_receipt_items" USING "btree" ("tenant_id");



CREATE INDEX "idx_goods_receipts_tenant_id" ON "public"."goods_receipts" USING "btree" ("tenant_id");



CREATE INDEX "idx_history_days_tenant_id" ON "public"."history_days" USING "btree" ("tenant_id");



CREATE INDEX "idx_ingredient_stock_tenant_id" ON "public"."ingredient_stock" USING "btree" ("tenant_id");



CREATE INDEX "idx_ingredients_tenant" ON "public"."ingredients" USING "btree" ("tenant_id");



CREATE INDEX "idx_ingredients_tenant_id" ON "public"."ingredients" USING "btree" ("tenant_id");



CREATE INDEX "idx_intercompany_transactions_tenant_id" ON "public"."intercompany_transactions" USING "btree" ("tenant_id");



CREATE INDEX "idx_inventory_alerts_ingredient" ON "public"."inventory_alerts" USING "btree" ("ingredient_id");



CREATE INDEX "idx_inventory_alerts_resolved" ON "public"."inventory_alerts" USING "btree" ("resolved");



CREATE INDEX "idx_inventory_alerts_tenant" ON "public"."inventory_alerts" USING "btree" ("tenant_id");



CREATE INDEX "idx_inventory_alerts_tenant_id" ON "public"."inventory_alerts" USING "btree" ("tenant_id");



CREATE INDEX "idx_inventory_cost_layers_ingredient" ON "public"."inventory_cost_layers" USING "btree" ("ingredient_id");



CREATE INDEX "idx_inventory_cost_layers_remaining" ON "public"."inventory_cost_layers" USING "btree" ("quantity_remaining");



CREATE INDEX "idx_inventory_cost_layers_tenant" ON "public"."inventory_cost_layers" USING "btree" ("tenant_id");



CREATE INDEX "idx_inventory_cost_layers_tenant_id" ON "public"."inventory_cost_layers" USING "btree" ("tenant_id");



CREATE INDEX "idx_inventory_tenant_id" ON "public"."inventory" USING "btree" ("tenant_id");



CREATE INDEX "idx_inventory_transactions_tenant_id" ON "public"."inventory_transactions" USING "btree" ("tenant_id");



CREATE INDEX "idx_inventory_valuation_snapshots_date" ON "public"."inventory_valuation_snapshots" USING "btree" ("snapshot_date");



CREATE INDEX "idx_inventory_valuation_snapshots_ingredient" ON "public"."inventory_valuation_snapshots" USING "btree" ("ingredient_id");



CREATE INDEX "idx_inventory_valuation_snapshots_tenant" ON "public"."inventory_valuation_snapshots" USING "btree" ("tenant_id");



CREATE INDEX "idx_inventory_valuation_snapshots_tenant_id" ON "public"."inventory_valuation_snapshots" USING "btree" ("tenant_id");



CREATE INDEX "idx_invoice_matches_tenant_id" ON "public"."invoice_matches" USING "btree" ("tenant_id");



CREATE INDEX "idx_invoices_tenant_id" ON "public"."invoices" USING "btree" ("tenant_id");



CREATE INDEX "idx_item_learning_tenant_id" ON "public"."item_learning" USING "btree" ("tenant_id");



CREATE INDEX "idx_journal_entries_tenant_id" ON "public"."journal_entries" USING "btree" ("tenant_id");



CREATE INDEX "idx_journal_entry_lines_tenant_id" ON "public"."journal_entry_lines" USING "btree" ("tenant_id");



CREATE INDEX "idx_kitchen_station_orders_station" ON "public"."kitchen_station_orders" USING "btree" ("kitchen_station_id");



CREATE INDEX "idx_kitchen_station_orders_status" ON "public"."kitchen_station_orders" USING "btree" ("status");



CREATE INDEX "idx_kitchen_station_orders_tenant" ON "public"."kitchen_station_orders" USING "btree" ("tenant_id");



CREATE INDEX "idx_kitchen_station_orders_tenant_id" ON "public"."kitchen_station_orders" USING "btree" ("tenant_id");



CREATE INDEX "idx_kitchen_station_performance_snapshot" ON "public"."kitchen_station_performance" USING "btree" ("snapshot_date");



CREATE INDEX "idx_kitchen_station_performance_station" ON "public"."kitchen_station_performance" USING "btree" ("kitchen_station_id");



CREATE INDEX "idx_kitchen_station_performance_tenant" ON "public"."kitchen_station_performance" USING "btree" ("tenant_id");



CREATE INDEX "idx_kitchen_station_performance_tenant_id" ON "public"."kitchen_station_performance" USING "btree" ("tenant_id");



CREATE INDEX "idx_kitchen_stations_code" ON "public"."kitchen_stations" USING "btree" ("station_code");



CREATE INDEX "idx_kitchen_stations_tenant" ON "public"."kitchen_stations" USING "btree" ("tenant_id");



CREATE INDEX "idx_kitchen_stations_tenant_id" ON "public"."kitchen_stations" USING "btree" ("tenant_id");



CREATE INDEX "idx_labor_shift_forecasts_date" ON "public"."labor_shift_forecasts" USING "btree" ("forecast_date");



CREATE INDEX "idx_labor_shift_forecasts_department" ON "public"."labor_shift_forecasts" USING "btree" ("department");



CREATE INDEX "idx_labor_shift_forecasts_tenant" ON "public"."labor_shift_forecasts" USING "btree" ("tenant_id");



CREATE INDEX "idx_labor_shift_forecasts_tenant_id" ON "public"."labor_shift_forecasts" USING "btree" ("tenant_id");



CREATE INDEX "idx_legal_entities_tenant_id" ON "public"."legal_entities" USING "btree" ("tenant_id");



CREATE INDEX "idx_locations_tenant_id" ON "public"."locations" USING "btree" ("tenant_id");



CREATE INDEX "idx_marketing_assets_tenant_id" ON "public"."marketing_assets" USING "btree" ("tenant_id");



CREATE INDEX "idx_marketing_campaign_analytics_campaign" ON "public"."marketing_campaign_analytics" USING "btree" ("marketing_campaign_id");



CREATE INDEX "idx_marketing_campaign_analytics_date" ON "public"."marketing_campaign_analytics" USING "btree" ("analytics_date");



CREATE INDEX "idx_marketing_campaign_analytics_tenant" ON "public"."marketing_campaign_analytics" USING "btree" ("tenant_id");



CREATE INDEX "idx_marketing_campaign_analytics_tenant_id" ON "public"."marketing_campaign_analytics" USING "btree" ("tenant_id");



CREATE INDEX "idx_marketing_campaign_deliveries_campaign" ON "public"."marketing_campaign_deliveries" USING "btree" ("marketing_campaign_id");



CREATE INDEX "idx_marketing_campaign_deliveries_status" ON "public"."marketing_campaign_deliveries" USING "btree" ("delivery_status");



CREATE INDEX "idx_marketing_campaign_deliveries_tenant" ON "public"."marketing_campaign_deliveries" USING "btree" ("tenant_id");



CREATE INDEX "idx_marketing_campaign_deliveries_tenant_id" ON "public"."marketing_campaign_deliveries" USING "btree" ("tenant_id");



CREATE INDEX "idx_marketing_campaigns_status" ON "public"."marketing_campaigns" USING "btree" ("campaign_status");



CREATE INDEX "idx_marketing_campaigns_tenant" ON "public"."marketing_campaigns" USING "btree" ("tenant_id");



CREATE INDEX "idx_marketing_campaigns_tenant_id" ON "public"."marketing_campaigns" USING "btree" ("tenant_id");



CREATE INDEX "idx_marketing_campaigns_type" ON "public"."marketing_campaigns" USING "btree" ("campaign_type");



CREATE INDEX "idx_marketing_prompt_history_tenant_id" ON "public"."marketing_prompt_history" USING "btree" ("tenant_id");



CREATE INDEX "idx_meta_accounts_tenant_id" ON "public"."meta_accounts" USING "btree" ("tenant_id");



CREATE INDEX "idx_order_items_order_id" ON "public"."order_items" USING "btree" ("order_id");



CREATE INDEX "idx_order_items_tenant_id" ON "public"."order_items" USING "btree" ("tenant_id");



CREATE INDEX "idx_orders_tenant_id" ON "public"."orders" USING "btree" ("tenant_id");



CREATE INDEX "idx_payment_transactions_receipt" ON "public"."payment_transactions" USING "btree" ("receipt_number");



CREATE INDEX "idx_payment_transactions_session" ON "public"."payment_transactions" USING "btree" ("table_session_id");



CREATE INDEX "idx_payment_transactions_tenant" ON "public"."payment_transactions" USING "btree" ("tenant_id");



CREATE INDEX "idx_payment_transactions_tenant_id" ON "public"."payment_transactions" USING "btree" ("tenant_id");



CREATE INDEX "idx_payments_tenant_id" ON "public"."payments" USING "btree" ("tenant_id");



CREATE INDEX "idx_payroll_payouts_staff" ON "public"."payroll_payouts" USING "btree" ("staff_id");



CREATE INDEX "idx_payroll_payouts_status" ON "public"."payroll_payouts" USING "btree" ("payout_status");



CREATE INDEX "idx_payroll_payouts_tenant" ON "public"."payroll_payouts" USING "btree" ("tenant_id");



CREATE INDEX "idx_payroll_payouts_tenant_id" ON "public"."payroll_payouts" USING "btree" ("tenant_id");



CREATE INDEX "idx_payroll_records_month" ON "public"."payroll_records" USING "btree" ("payroll_month");



CREATE INDEX "idx_payroll_records_payout" ON "public"."payroll_records" USING "btree" ("payout_status");



CREATE INDEX "idx_payroll_records_staff" ON "public"."payroll_records" USING "btree" ("staff_id");



CREATE INDEX "idx_payroll_records_tenant" ON "public"."payroll_records" USING "btree" ("tenant_id");



CREATE INDEX "idx_payroll_records_tenant_id" ON "public"."payroll_records" USING "btree" ("tenant_id");



CREATE INDEX "idx_performance_tenant_id" ON "public"."performance" USING "btree" ("tenant_id");



CREATE INDEX "idx_period_lock_exceptions_period" ON "public"."period_lock_exceptions" USING "btree" ("period_id");



CREATE INDEX "idx_period_lock_exceptions_tenant" ON "public"."period_lock_exceptions" USING "btree" ("tenant_id");



CREATE INDEX "idx_period_lock_exceptions_tenant_id" ON "public"."period_lock_exceptions" USING "btree" ("tenant_id");



CREATE INDEX "idx_platform_tokens_tenant_id" ON "public"."platform_tokens" USING "btree" ("tenant_id");



CREATE INDEX "idx_platform_users_tenant_id" ON "public"."platform_users" USING "btree" ("tenant_id");



CREATE INDEX "idx_pos-sales_tenant_id" ON "public"."pos-sales" USING "btree" ("tenant_id");



CREATE INDEX "idx_pos_sales_tenant_id" ON "public"."pos-sales" USING "btree" ("tenant_id");



CREATE INDEX "idx_production_batches_dish" ON "public"."production_batches" USING "btree" ("dish_id");



CREATE INDEX "idx_production_batches_produced_at" ON "public"."production_batches" USING "btree" ("produced_at");



CREATE INDEX "idx_production_batches_tenant" ON "public"."production_batches" USING "btree" ("tenant_id");



CREATE INDEX "idx_production_batches_tenant_id" ON "public"."production_batches" USING "btree" ("tenant_id");



CREATE INDEX "idx_production_locks_tenant_id" ON "public"."production_locks" USING "btree" ("tenant_id");



CREATE INDEX "idx_production_logs_tenant_id" ON "public"."production_logs" USING "btree" ("tenant_id");



CREATE INDEX "idx_production_runs_dish" ON "public"."production_runs" USING "btree" ("dish_id");



CREATE INDEX "idx_production_runs_order" ON "public"."production_runs" USING "btree" ("order_id");



CREATE INDEX "idx_production_runs_tenant" ON "public"."production_runs" USING "btree" ("tenant_id");



CREATE INDEX "idx_production_runs_tenant_id" ON "public"."production_runs" USING "btree" ("tenant_id");



CREATE INDEX "idx_products_tenant_id" ON "public"."products" USING "btree" ("tenant_id");



CREATE INDEX "idx_purchase_order_items_tenant_id" ON "public"."purchase_order_items" USING "btree" ("tenant_id");



CREATE INDEX "idx_purchase_orders_tenant_id" ON "public"."purchase_orders" USING "btree" ("tenant_id");



CREATE INDEX "idx_purchase_request_items_tenant_id" ON "public"."purchase_request_items" USING "btree" ("tenant_id");



CREATE INDEX "idx_purchase_requests_tenant_id" ON "public"."purchase_requests" USING "btree" ("tenant_id");



CREATE INDEX "idx_realtime_events_created" ON "public"."realtime_events" USING "btree" ("created_at");



CREATE INDEX "idx_realtime_events_processed" ON "public"."realtime_events" USING "btree" ("processed");



CREATE INDEX "idx_realtime_events_tenant" ON "public"."realtime_events" USING "btree" ("tenant_id");



CREATE INDEX "idx_realtime_events_tenant_id" ON "public"."realtime_events" USING "btree" ("tenant_id");



CREATE INDEX "idx_realtime_events_type" ON "public"."realtime_events" USING "btree" ("event_type");



CREATE INDEX "idx_realtime_presence_channel" ON "public"."realtime_presence" USING "btree" ("presence_channel");



CREATE INDEX "idx_realtime_presence_status" ON "public"."realtime_presence" USING "btree" ("status");



CREATE INDEX "idx_realtime_presence_tenant_id" ON "public"."realtime_presence" USING "btree" ("tenant_id");



CREATE UNIQUE INDEX "idx_realtime_presence_unique" ON "public"."realtime_presence" USING "btree" ("tenant_id", "user_id", "connection_id");



CREATE INDEX "idx_recipe_items_dish" ON "public"."recipe_items" USING "btree" ("dish_id");



CREATE INDEX "idx_recipe_items_ingredient" ON "public"."recipe_items" USING "btree" ("ingredient_id");



CREATE INDEX "idx_recipe_items_tenant" ON "public"."recipe_items" USING "btree" ("tenant_id");



CREATE INDEX "idx_recipe_items_tenant_id" ON "public"."recipe_items" USING "btree" ("tenant_id");



CREATE INDEX "idx_recipe_matrix_dish" ON "public"."recipe_matrix" USING "btree" ("dish_id");



CREATE INDEX "idx_recipe_matrix_ingredient" ON "public"."recipe_matrix" USING "btree" ("ingredient_id");



CREATE INDEX "idx_recipe_matrix_tenant" ON "public"."recipe_matrix" USING "btree" ("tenant_id");



CREATE INDEX "idx_recipe_matrix_tenant_id" ON "public"."recipe_matrix" USING "btree" ("tenant_id");



CREATE INDEX "idx_recipes_tenant_id" ON "public"."recipes" USING "btree" ("tenant_id");



CREATE INDEX "idx_restaurant_settings_tenant" ON "public"."restaurant_settings" USING "btree" ("tenant_id");



CREATE INDEX "idx_restaurant_settings_tenant_id" ON "public"."restaurant_settings" USING "btree" ("tenant_id");



CREATE INDEX "idx_role_hierarchy_role" ON "public"."role_hierarchy" USING "btree" ("role");



CREATE INDEX "idx_role_hierarchy_tenant" ON "public"."role_hierarchy" USING "btree" ("tenant_id");



CREATE INDEX "idx_role_hierarchy_tenant_id" ON "public"."role_hierarchy" USING "btree" ("tenant_id");



CREATE INDEX "idx_role_permissions_module" ON "public"."role_permissions" USING "btree" ("module");



CREATE INDEX "idx_role_permissions_role" ON "public"."role_permissions" USING "btree" ("role");



CREATE INDEX "idx_role_permissions_tenant" ON "public"."role_permissions" USING "btree" ("tenant_id");



CREATE INDEX "idx_role_permissions_tenant_id" ON "public"."role_permissions" USING "btree" ("tenant_id");



CREATE INDEX "idx_salary_confirmations_tenant_id" ON "public"."salary_confirmations" USING "btree" ("tenant_id");



CREATE INDEX "idx_sales_events_active" ON "public"."sales_events" USING "btree" ("tenant_id", "status", "start_date", "end_date");



CREATE INDEX "idx_sales_events_tenant_id" ON "public"."sales_events" USING "btree" ("tenant_id");



CREATE INDEX "idx_security_events_created" ON "public"."security_events" USING "btree" ("created_at");



CREATE INDEX "idx_security_events_severity" ON "public"."security_events" USING "btree" ("severity");



CREATE INDEX "idx_security_events_tenant" ON "public"."security_events" USING "btree" ("tenant_id");



CREATE INDEX "idx_security_events_tenant_id" ON "public"."security_events" USING "btree" ("tenant_id");



CREATE INDEX "idx_security_events_type" ON "public"."security_events" USING "btree" ("event_type");



CREATE INDEX "idx_shift_closures_tenant_id" ON "public"."shift_closures" USING "btree" ("tenant_id");



CREATE INDEX "idx_shift_logs_staff" ON "public"."shift_logs" USING "btree" ("staff_id");



CREATE INDEX "idx_shift_logs_tenant" ON "public"."shift_logs" USING "btree" ("tenant_id");



CREATE INDEX "idx_shift_logs_tenant_id" ON "public"."shift_logs" USING "btree" ("tenant_id");



CREATE INDEX "idx_staff_accounts_auth_user_id" ON "public"."staff_accounts" USING "btree" ("auth_user_id");



CREATE INDEX "idx_staff_accounts_tenant_id" ON "public"."staff_accounts" USING "btree" ("tenant_id");



CREATE INDEX "idx_staff_members_tenant_id" ON "public"."staff_members" USING "btree" ("tenant_id");



CREATE INDEX "idx_staff_shifts_tenant_id" ON "public"."staff_shifts" USING "btree" ("tenant_id");



CREATE INDEX "idx_stock_movements_tenant_id" ON "public"."stock_movements" USING "btree" ("tenant_id");



CREATE INDEX "idx_subscriptions_tenant_id" ON "public"."subscriptions" USING "btree" ("tenant_id");



CREATE INDEX "idx_system_alerts_tenant_id" ON "public"."system_alerts" USING "btree" ("tenant_id");



CREATE INDEX "idx_system_jobs_next_run" ON "public"."system_jobs" USING "btree" ("next_run_at");



CREATE INDEX "idx_system_jobs_status" ON "public"."system_jobs" USING "btree" ("status");



CREATE INDEX "idx_system_jobs_tenant" ON "public"."system_jobs" USING "btree" ("tenant_id");



CREATE INDEX "idx_system_jobs_tenant_id" ON "public"."system_jobs" USING "btree" ("tenant_id");



CREATE INDEX "idx_table_sessions_status" ON "public"."table_sessions" USING "btree" ("status");



CREATE INDEX "idx_table_sessions_table" ON "public"."table_sessions" USING "btree" ("table_number");



CREATE INDEX "idx_table_sessions_tenant" ON "public"."table_sessions" USING "btree" ("tenant_id");



CREATE INDEX "idx_table_sessions_tenant_id" ON "public"."table_sessions" USING "btree" ("tenant_id");



CREATE INDEX "idx_tasks_tenant_id" ON "public"."tasks" USING "btree" ("tenant_id");



CREATE INDEX "idx_tenant_audit_logs_tenant_id" ON "public"."tenant_audit_logs" USING "btree" ("tenant_id");



CREATE INDEX "idx_tenant_billing_profiles_tenant_id" ON "public"."tenant_billing_profiles" USING "btree" ("tenant_id");



CREATE INDEX "idx_tenant_modules_tenant_id" ON "public"."tenant_modules" USING "btree" ("tenant_id");



CREATE INDEX "idx_tenant_platform_config_tenant_id" ON "public"."tenant_platform_config" USING "btree" ("tenant_id");



CREATE INDEX "idx_tenant_settings_tenant" ON "public"."tenant_settings" USING "btree" ("tenant_id");



CREATE INDEX "idx_tenant_settings_tenant_id" ON "public"."tenant_settings" USING "btree" ("tenant_id");



CREATE UNIQUE INDEX "idx_tenant_settings_unique" ON "public"."tenant_settings" USING "btree" ("tenant_id", "category", "setting_key");



CREATE INDEX "idx_tenant_users_tenant_id" ON "public"."tenant_users" USING "btree" ("tenant_id");



CREATE INDEX "idx_tenants_tenant_id" ON "public"."tenants" USING "btree" ("tenant_id");



CREATE INDEX "idx_user_finance_roles_tenant_id" ON "public"."user_finance_roles" USING "btree" ("tenant_id");



CREATE INDEX "idx_vendors_tenant_id" ON "public"."vendors" USING "btree" ("tenant_id");



CREATE INDEX "idx_warehouse_inventory_ingredient" ON "public"."warehouse_inventory" USING "btree" ("ingredient_id");



CREATE INDEX "idx_warehouse_inventory_location" ON "public"."warehouse_inventory" USING "btree" ("warehouse_location_id");



CREATE INDEX "idx_warehouse_inventory_tenant" ON "public"."warehouse_inventory" USING "btree" ("tenant_id");



CREATE INDEX "idx_warehouse_inventory_tenant_id" ON "public"."warehouse_inventory" USING "btree" ("tenant_id");



CREATE INDEX "idx_warehouse_locations_code" ON "public"."warehouse_locations" USING "btree" ("location_code");



CREATE INDEX "idx_warehouse_locations_tenant" ON "public"."warehouse_locations" USING "btree" ("tenant_id");



CREATE INDEX "idx_warehouse_locations_tenant_id" ON "public"."warehouse_locations" USING "btree" ("tenant_id");



CREATE INDEX "idx_warehouse_transfers_ingredient" ON "public"."warehouse_transfers" USING "btree" ("ingredient_id");



CREATE INDEX "idx_warehouse_transfers_status" ON "public"."warehouse_transfers" USING "btree" ("transfer_status");



CREATE INDEX "idx_warehouse_transfers_tenant" ON "public"."warehouse_transfers" USING "btree" ("tenant_id");



CREATE INDEX "idx_warehouse_transfers_tenant_id" ON "public"."warehouse_transfers" USING "btree" ("tenant_id");



CREATE INDEX "idx_waste_logs_tenant_id" ON "public"."waste_logs" USING "btree" ("tenant_id");



CREATE INDEX "idx_websocket_delivery_logs_session" ON "public"."websocket_delivery_logs" USING "btree" ("websocket_session_id");



CREATE INDEX "idx_websocket_delivery_logs_status" ON "public"."websocket_delivery_logs" USING "btree" ("delivery_status");



CREATE INDEX "idx_websocket_delivery_logs_tenant" ON "public"."websocket_delivery_logs" USING "btree" ("tenant_id");



CREATE INDEX "idx_websocket_delivery_logs_tenant_id" ON "public"."websocket_delivery_logs" USING "btree" ("tenant_id");



CREATE INDEX "idx_websocket_event_queue_session" ON "public"."websocket_event_queue" USING "btree" ("websocket_session_id");



CREATE INDEX "idx_websocket_event_queue_status" ON "public"."websocket_event_queue" USING "btree" ("delivery_status");



CREATE INDEX "idx_websocket_event_queue_tenant" ON "public"."websocket_event_queue" USING "btree" ("tenant_id");



CREATE INDEX "idx_websocket_event_queue_tenant_id" ON "public"."websocket_event_queue" USING "btree" ("tenant_id");



CREATE INDEX "idx_websocket_sessions_active" ON "public"."websocket_sessions" USING "btree" ("active");



CREATE INDEX "idx_websocket_sessions_connection" ON "public"."websocket_sessions" USING "btree" ("connection_id");



CREATE INDEX "idx_websocket_sessions_tenant" ON "public"."websocket_sessions" USING "btree" ("tenant_id");



CREATE INDEX "idx_websocket_sessions_tenant_id" ON "public"."websocket_sessions" USING "btree" ("tenant_id");



CREATE INDEX "idx_websocket_sessions_user" ON "public"."websocket_sessions" USING "btree" ("user_id");



CREATE UNIQUE INDEX "platform_tokens_user_platform_page_idx" ON "public"."platform_tokens" USING "btree" ("user_id", "platform", "page_id");



CREATE UNIQUE INDEX "production_logs_source_id_unique" ON "public"."production_logs" USING "btree" ("source_id");



CREATE UNIQUE INDEX "production_logs_source_unique" ON "public"."production_logs" USING "btree" ("source_id");



CREATE UNIQUE INDEX "subscriptions_lead_id_unique" ON "public"."subscriptions" USING "btree" ("lead_id");



CREATE OR REPLACE TRIGGER "analyze_customer_sentiment" BEFORE INSERT OR UPDATE ON "public"."customer_feedback" FOR EACH ROW EXECUTE FUNCTION "public"."analyze_customer_sentiment"();



CREATE OR REPLACE TRIGGER "audit_billing_invoices" AFTER INSERT OR DELETE OR UPDATE ON "public"."billing_invoices" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_function"();



CREATE OR REPLACE TRIGGER "audit_goods_receipt_items" AFTER INSERT OR DELETE OR UPDATE ON "public"."goods_receipt_items" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_function"();



CREATE OR REPLACE TRIGGER "audit_goods_receipts" AFTER INSERT OR DELETE OR UPDATE ON "public"."goods_receipts" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_function"();



CREATE OR REPLACE TRIGGER "audit_ingredients" AFTER INSERT OR DELETE OR UPDATE ON "public"."ingredients" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_function"();



CREATE OR REPLACE TRIGGER "audit_inventory" AFTER INSERT OR DELETE OR UPDATE ON "public"."inventory" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_function"();



CREATE OR REPLACE TRIGGER "audit_inventory_transactions" AFTER INSERT OR DELETE OR UPDATE ON "public"."inventory_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_function"();



CREATE OR REPLACE TRIGGER "audit_invoice_matches" AFTER INSERT OR DELETE OR UPDATE ON "public"."invoice_matches" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_function"();



CREATE OR REPLACE TRIGGER "audit_invoices" AFTER INSERT OR DELETE OR UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_function"();



CREATE OR REPLACE TRIGGER "audit_order_items" AFTER INSERT OR DELETE OR UPDATE ON "public"."order_items" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_function"();



CREATE OR REPLACE TRIGGER "audit_orders" AFTER INSERT OR DELETE OR UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_function"();



CREATE OR REPLACE TRIGGER "audit_payment_transactions" AFTER INSERT OR DELETE OR UPDATE ON "public"."payment_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_function"();



CREATE OR REPLACE TRIGGER "audit_payments" AFTER INSERT OR DELETE OR UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_function"();



CREATE OR REPLACE TRIGGER "audit_payroll_payouts" AFTER INSERT OR DELETE OR UPDATE ON "public"."payroll_payouts" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_function"();



CREATE OR REPLACE TRIGGER "audit_payroll_records" AFTER INSERT OR DELETE OR UPDATE ON "public"."payroll_records" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_function"();



CREATE OR REPLACE TRIGGER "audit_restaurant_settings" AFTER INSERT OR DELETE OR UPDATE ON "public"."restaurant_settings" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_function"();



CREATE OR REPLACE TRIGGER "audit_stock_movements" AFTER INSERT OR DELETE OR UPDATE ON "public"."stock_movements" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_function"();



CREATE OR REPLACE TRIGGER "auto_create_kitchen_ticket" AFTER INSERT ON "public"."order_items" FOR EACH ROW EXECUTE FUNCTION "public"."auto_create_kitchen_ticket"();



CREATE OR REPLACE TRIGGER "auto_process_order_production" AFTER UPDATE ON "public"."order_items" FOR EACH ROW EXECUTE FUNCTION "public"."auto_process_order_production"();



CREATE OR REPLACE TRIGGER "enterprise_document_audit_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."enterprise_documents" FOR EACH ROW EXECUTE FUNCTION "public"."enterprise_document_audit_trigger"();



CREATE OR REPLACE TRIGGER "feature_flag_audit_trigger" AFTER UPDATE ON "public"."enterprise_feature_flags" FOR EACH ROW EXECUTE FUNCTION "public"."feature_flag_audit_trigger"();



CREATE OR REPLACE TRIGGER "inventory_realtime_event_trigger" AFTER INSERT OR UPDATE ON "public"."ingredients" FOR EACH ROW EXECUTE FUNCTION "public"."inventory_realtime_event_trigger"();



CREATE OR REPLACE TRIGGER "kitchen_realtime_event_trigger" AFTER INSERT OR UPDATE ON "public"."kitchen_station_orders" FOR EACH ROW EXECUTE FUNCTION "public"."kitchen_realtime_event_trigger"();



CREATE OR REPLACE TRIGGER "notification_realtime_event_trigger" AFTER INSERT ON "public"."enterprise_notifications" FOR EACH ROW EXECUTE FUNCTION "public"."notification_realtime_event_trigger"();



CREATE OR REPLACE TRIGGER "order_realtime_event_trigger" AFTER INSERT OR UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."order_realtime_event_trigger"();



CREATE OR REPLACE TRIGGER "platform_tokens_set_updated_at" BEFORE UPDATE ON "public"."platform_tokens" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "prevent_closed_period_orders" BEFORE INSERT OR DELETE OR UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_changes_in_closed_period"();



CREATE OR REPLACE TRIGGER "prevent_closed_period_payments" BEFORE INSERT OR DELETE OR UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_changes_in_closed_period"();



CREATE OR REPLACE TRIGGER "prevent_closed_period_payroll" BEFORE INSERT OR DELETE OR UPDATE ON "public"."payroll_records" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_changes_in_closed_period"();



CREATE OR REPLACE TRIGGER "queue_realtime_event_delivery" AFTER INSERT ON "public"."realtime_events" FOR EACH ROW EXECUTE FUNCTION "public"."queue_realtime_event_delivery"();



CREATE OR REPLACE TRIGGER "queue_webhook_deliveries_for_event" AFTER INSERT ON "public"."realtime_events" FOR EACH ROW EXECUTE FUNCTION "public"."queue_webhook_deliveries_for_event"();



CREATE OR REPLACE TRIGGER "realtime_workflow_event_trigger" AFTER INSERT ON "public"."realtime_events" FOR EACH ROW EXECUTE FUNCTION "public"."realtime_workflow_event_trigger"();



CREATE OR REPLACE TRIGGER "set_tenant_id_billing_invoices" BEFORE INSERT ON "public"."billing_invoices" FOR EACH ROW EXECUTE FUNCTION "public"."set_tenant_id"();



CREATE OR REPLACE TRIGGER "set_tenant_id_dish_stock" BEFORE INSERT ON "public"."dish_stock" FOR EACH ROW EXECUTE FUNCTION "public"."set_tenant_id"();



CREATE OR REPLACE TRIGGER "set_tenant_id_goods_receipt_items" BEFORE INSERT ON "public"."goods_receipt_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_tenant_id"();



CREATE OR REPLACE TRIGGER "set_tenant_id_goods_receipts" BEFORE INSERT ON "public"."goods_receipts" FOR EACH ROW EXECUTE FUNCTION "public"."set_tenant_id"();



CREATE OR REPLACE TRIGGER "set_tenant_id_ingredient_stock" BEFORE INSERT ON "public"."ingredient_stock" FOR EACH ROW EXECUTE FUNCTION "public"."set_tenant_id"();



CREATE OR REPLACE TRIGGER "set_tenant_id_ingredients" BEFORE INSERT ON "public"."ingredients" FOR EACH ROW EXECUTE FUNCTION "public"."set_tenant_id"();



CREATE OR REPLACE TRIGGER "set_tenant_id_inventory" BEFORE INSERT ON "public"."inventory" FOR EACH ROW EXECUTE FUNCTION "public"."set_tenant_id"();



CREATE OR REPLACE TRIGGER "set_tenant_id_inventory_transactions" BEFORE INSERT ON "public"."inventory_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."set_tenant_id"();



CREATE OR REPLACE TRIGGER "set_tenant_id_invoice_matches" BEFORE INSERT ON "public"."invoice_matches" FOR EACH ROW EXECUTE FUNCTION "public"."set_tenant_id"();



CREATE OR REPLACE TRIGGER "set_tenant_id_invoices" BEFORE INSERT ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."set_tenant_id"();



CREATE OR REPLACE TRIGGER "set_tenant_id_order_items" BEFORE INSERT ON "public"."order_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_tenant_id"();



CREATE OR REPLACE TRIGGER "set_tenant_id_orders" BEFORE INSERT ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."set_tenant_id"();



CREATE OR REPLACE TRIGGER "set_tenant_id_payment_transactions" BEFORE INSERT ON "public"."payment_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."set_tenant_id"();



CREATE OR REPLACE TRIGGER "set_tenant_id_payments" BEFORE INSERT ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."set_tenant_id"();



CREATE OR REPLACE TRIGGER "set_tenant_id_payroll_payouts" BEFORE INSERT ON "public"."payroll_payouts" FOR EACH ROW EXECUTE FUNCTION "public"."set_tenant_id"();



CREATE OR REPLACE TRIGGER "set_tenant_id_payroll_records" BEFORE INSERT ON "public"."payroll_records" FOR EACH ROW EXECUTE FUNCTION "public"."set_tenant_id"();



CREATE OR REPLACE TRIGGER "set_tenant_id_restaurant_settings" BEFORE INSERT ON "public"."restaurant_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_tenant_id"();



CREATE OR REPLACE TRIGGER "set_tenant_id_stock_movements" BEFORE INSERT ON "public"."stock_movements" FOR EACH ROW EXECUTE FUNCTION "public"."set_tenant_id"();



CREATE OR REPLACE TRIGGER "update_customer_loyalty" AFTER UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_customer_loyalty"();



CREATE OR REPLACE TRIGGER "validate_period_inventory_transactions" BEFORE INSERT OR UPDATE ON "public"."inventory_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."validate_period_open"();



CREATE OR REPLACE TRIGGER "validate_period_orders" BEFORE INSERT OR UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."validate_period_open"();



CREATE OR REPLACE TRIGGER "validate_period_payments" BEFORE INSERT OR UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."validate_period_open"();



CREATE OR REPLACE TRIGGER "validate_period_payroll_records" BEFORE INSERT OR UPDATE ON "public"."payroll_records" FOR EACH ROW EXECUTE FUNCTION "public"."validate_period_open"();



ALTER TABLE ONLY "public"."accounting_periods"
    ADD CONSTRAINT "accounting_periods_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id");



ALTER TABLE ONLY "public"."ai_campaign_recommendations"
    ADD CONSTRAINT "ai_campaign_recommendations_target_segment_id_fkey" FOREIGN KEY ("target_segment_id") REFERENCES "public"."customer_segments"("id");



ALTER TABLE ONLY "public"."approval_requests"
    ADD CONSTRAINT "approval_requests_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."approval_workflows"("id");



ALTER TABLE ONLY "public"."billing_invoices"
    ADD CONSTRAINT "billing_invoices_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."organization_leads"("id");



ALTER TABLE ONLY "public"."billing_invoices"
    ADD CONSTRAINT "billing_invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id");



ALTER TABLE ONLY "public"."campaign_publish_queue"
    ADD CONSTRAINT "campaign_publish_queue_campaign_memory_id_fkey" FOREIGN KEY ("campaign_memory_id") REFERENCES "public"."campaign_memory"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chart_of_accounts"
    ADD CONSTRAINT "chart_of_accounts_parent_account_id_fkey" FOREIGN KEY ("parent_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."cost_centers"
    ADD CONSTRAINT "cost_centers_parent_cost_center_id_fkey" FOREIGN KEY ("parent_cost_center_id") REFERENCES "public"."cost_centers"("id");



ALTER TABLE ONLY "public"."customer_segment_memberships"
    ADD CONSTRAINT "customer_segment_memberships_customer_loyalty_account_id_fkey" FOREIGN KEY ("customer_loyalty_account_id") REFERENCES "public"."customer_loyalty_accounts"("id");



ALTER TABLE ONLY "public"."customer_segment_memberships"
    ADD CONSTRAINT "customer_segment_memberships_customer_segment_id_fkey" FOREIGN KEY ("customer_segment_id") REFERENCES "public"."customer_segments"("id");



ALTER TABLE ONLY "public"."daily_sales_items"
    ADD CONSTRAINT "daily_sales_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."daily_sales_batches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_sales_items"
    ADD CONSTRAINT "daily_sales_items_dish_id_fkey" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id");



ALTER TABLE ONLY "public"."depreciation_entries"
    ADD CONSTRAINT "depreciation_entries_fixed_asset_id_fkey" FOREIGN KEY ("fixed_asset_id") REFERENCES "public"."fixed_assets"("id");



ALTER TABLE ONLY "public"."depreciation_entries"
    ADD CONSTRAINT "depreciation_entries_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id");



ALTER TABLE ONLY "public"."dynamic_price_adjustments"
    ADD CONSTRAINT "dynamic_price_adjustments_pricing_rule_id_fkey" FOREIGN KEY ("pricing_rule_id") REFERENCES "public"."dynamic_pricing_rules"("id");



ALTER TABLE ONLY "public"."enterprise_announcement_reads"
    ADD CONSTRAINT "enterprise_announcement_reads_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."enterprise_announcements"("id");



ALTER TABLE ONLY "public"."enterprise_audit_events"
    ADD CONSTRAINT "enterprise_audit_events_enterprise_audit_rule_id_fkey" FOREIGN KEY ("enterprise_audit_rule_id") REFERENCES "public"."enterprise_audit_rules"("id");



ALTER TABLE ONLY "public"."enterprise_document_access_logs"
    ADD CONSTRAINT "enterprise_document_access_logs_enterprise_document_id_fkey" FOREIGN KEY ("enterprise_document_id") REFERENCES "public"."enterprise_documents"("id");



ALTER TABLE ONLY "public"."enterprise_document_versions"
    ADD CONSTRAINT "enterprise_document_versions_enterprise_document_id_fkey" FOREIGN KEY ("enterprise_document_id") REFERENCES "public"."enterprise_documents"("id");



ALTER TABLE ONLY "public"."enterprise_feature_flag_audit_logs"
    ADD CONSTRAINT "enterprise_feature_flag_audit_logs_feature_flag_id_fkey" FOREIGN KEY ("feature_flag_id") REFERENCES "public"."enterprise_feature_flags"("id");



ALTER TABLE ONLY "public"."enterprise_integration_sync_logs"
    ADD CONSTRAINT "enterprise_integration_sync_logs_enterprise_integration_id_fkey" FOREIGN KEY ("enterprise_integration_id") REFERENCES "public"."enterprise_integrations"("id");



ALTER TABLE ONLY "public"."enterprise_notification_queue"
    ADD CONSTRAINT "enterprise_notification_queue_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."enterprise_notification_templates"("id");



ALTER TABLE ONLY "public"."enterprise_webhook_deliveries"
    ADD CONSTRAINT "enterprise_webhook_deliveries_enterprise_webhook_id_fkey" FOREIGN KEY ("enterprise_webhook_id") REFERENCES "public"."enterprise_webhooks"("id");



ALTER TABLE ONLY "public"."enterprise_workflow_runs"
    ADD CONSTRAINT "enterprise_workflow_runs_enterprise_workflow_id_fkey" FOREIGN KEY ("enterprise_workflow_id") REFERENCES "public"."enterprise_workflows"("id");



ALTER TABLE ONLY "public"."enterprise_workflow_step_runs"
    ADD CONSTRAINT "enterprise_workflow_step_runs_enterprise_workflow_run_id_fkey" FOREIGN KEY ("enterprise_workflow_run_id") REFERENCES "public"."enterprise_workflow_runs"("id");



ALTER TABLE ONLY "public"."enterprise_workflow_step_runs"
    ADD CONSTRAINT "enterprise_workflow_step_runs_enterprise_workflow_step_id_fkey" FOREIGN KEY ("enterprise_workflow_step_id") REFERENCES "public"."enterprise_workflow_steps"("id");



ALTER TABLE ONLY "public"."enterprise_workflow_steps"
    ADD CONSTRAINT "enterprise_workflow_steps_enterprise_workflow_id_fkey" FOREIGN KEY ("enterprise_workflow_id") REFERENCES "public"."enterprise_workflows"("id");



ALTER TABLE ONLY "public"."finance_permissions"
    ADD CONSTRAINT "finance_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."finance_roles"("id");



ALTER TABLE ONLY "public"."fixed_assets"
    ADD CONSTRAINT "fixed_assets_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id");



ALTER TABLE ONLY "public"."fixed_assets"
    ADD CONSTRAINT "fixed_assets_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id");



ALTER TABLE ONLY "public"."fixed_assets"
    ADD CONSTRAINT "fixed_assets_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id");



ALTER TABLE ONLY "public"."recipe_items"
    ADD CONSTRAINT "fk_recipe" FOREIGN KEY ("dish_id") REFERENCES "public"."recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipe_matrix"
    ADD CONSTRAINT "fk_recipe_matrix_dish" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id");



ALTER TABLE ONLY "public"."recipe_matrix"
    ADD CONSTRAINT "fk_recipe_matrix_ingredient" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id");



ALTER TABLE ONLY "public"."goods_receipt_items"
    ADD CONSTRAINT "goods_receipt_items_goods_receipt_id_fkey" FOREIGN KEY ("goods_receipt_id") REFERENCES "public"."goods_receipts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."goods_receipt_items"
    ADD CONSTRAINT "goods_receipt_items_purchase_order_item_id_fkey" FOREIGN KEY ("purchase_order_item_id") REFERENCES "public"."purchase_order_items"("id");



ALTER TABLE ONLY "public"."goods_receipts"
    ADD CONSTRAINT "goods_receipts_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id");



ALTER TABLE ONLY "public"."goods_receipts"
    ADD CONSTRAINT "goods_receipts_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id");



ALTER TABLE ONLY "public"."intercompany_transactions"
    ADD CONSTRAINT "intercompany_transactions_from_legal_entity_id_fkey" FOREIGN KEY ("from_legal_entity_id") REFERENCES "public"."legal_entities"("id");



ALTER TABLE ONLY "public"."intercompany_transactions"
    ADD CONSTRAINT "intercompany_transactions_to_legal_entity_id_fkey" FOREIGN KEY ("to_legal_entity_id") REFERENCES "public"."legal_entities"("id");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_matches"
    ADD CONSTRAINT "invoice_matches_goods_receipt_id_fkey" FOREIGN KEY ("goods_receipt_id") REFERENCES "public"."goods_receipts"("id");



ALTER TABLE ONLY "public"."invoice_matches"
    ADD CONSTRAINT "invoice_matches_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id");



ALTER TABLE ONLY "public"."invoice_matches"
    ADD CONSTRAINT "invoice_matches_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id");



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id");



ALTER TABLE ONLY "public"."journal_entry_lines"
    ADD CONSTRAINT "journal_entry_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."journal_entry_lines"
    ADD CONSTRAINT "journal_entry_lines_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id");



ALTER TABLE ONLY "public"."journal_entry_lines"
    ADD CONSTRAINT "journal_entry_lines_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kitchen_station_orders"
    ADD CONSTRAINT "kitchen_station_orders_kitchen_station_id_fkey" FOREIGN KEY ("kitchen_station_id") REFERENCES "public"."kitchen_stations"("id");



ALTER TABLE ONLY "public"."kitchen_station_performance"
    ADD CONSTRAINT "kitchen_station_performance_kitchen_station_id_fkey" FOREIGN KEY ("kitchen_station_id") REFERENCES "public"."kitchen_stations"("id");



ALTER TABLE ONLY "public"."legal_entities"
    ADD CONSTRAINT "legal_entities_parent_entity_id_fkey" FOREIGN KEY ("parent_entity_id") REFERENCES "public"."legal_entities"("id");



ALTER TABLE ONLY "public"."marketing_campaign_analytics"
    ADD CONSTRAINT "marketing_campaign_analytics_marketing_campaign_id_fkey" FOREIGN KEY ("marketing_campaign_id") REFERENCES "public"."marketing_campaigns"("id");



ALTER TABLE ONLY "public"."marketing_campaign_deliveries"
    ADD CONSTRAINT "marketing_campaign_deliveries_customer_segment_id_fkey" FOREIGN KEY ("customer_segment_id") REFERENCES "public"."customer_segments"("id");



ALTER TABLE ONLY "public"."marketing_campaign_deliveries"
    ADD CONSTRAINT "marketing_campaign_deliveries_marketing_campaign_id_fkey" FOREIGN KEY ("marketing_campaign_id") REFERENCES "public"."marketing_campaigns"("id");



ALTER TABLE ONLY "public"."marketing_campaigns"
    ADD CONSTRAINT "marketing_campaigns_target_segment_id_fkey" FOREIGN KEY ("target_segment_id") REFERENCES "public"."customer_segments"("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id");



ALTER TABLE ONLY "public"."period_lock_exceptions"
    ADD CONSTRAINT "period_lock_exceptions_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "public"."financial_periods"("id");



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_purchase_request_id_fkey" FOREIGN KEY ("purchase_request_id") REFERENCES "public"."purchase_requests"("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id");



ALTER TABLE ONLY "public"."purchase_request_items"
    ADD CONSTRAINT "purchase_request_items_purchase_request_id_fkey" FOREIGN KEY ("purchase_request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_request_items"
    ADD CONSTRAINT "purchase_request_items_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id");



ALTER TABLE ONLY "public"."purchase_requests"
    ADD CONSTRAINT "purchase_requests_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id");



ALTER TABLE ONLY "public"."recipe_items"
    ADD CONSTRAINT "recipe_items_ingredient_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."organization_leads"("id");



ALTER TABLE ONLY "public"."tenant_billing_profiles"
    ADD CONSTRAINT "tenant_billing_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_modules"
    ADD CONSTRAINT "tenant_modules_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "public"."platform_modules"("id");



ALTER TABLE ONLY "public"."tenant_modules"
    ADD CONSTRAINT "tenant_modules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_platform_config"
    ADD CONSTRAINT "tenant_platform_config_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."tenant_users"
    ADD CONSTRAINT "tenant_users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_finance_roles"
    ADD CONSTRAINT "user_finance_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."finance_roles"("id");



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_default_ap_account_fkey" FOREIGN KEY ("default_ap_account") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_default_expense_account_fkey" FOREIGN KEY ("default_expense_account") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."warehouse_inventory"
    ADD CONSTRAINT "warehouse_inventory_warehouse_location_id_fkey" FOREIGN KEY ("warehouse_location_id") REFERENCES "public"."warehouse_locations"("id");



ALTER TABLE ONLY "public"."warehouse_transfers"
    ADD CONSTRAINT "warehouse_transfers_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "public"."warehouse_locations"("id");



ALTER TABLE ONLY "public"."warehouse_transfers"
    ADD CONSTRAINT "warehouse_transfers_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "public"."warehouse_locations"("id");



ALTER TABLE ONLY "public"."websocket_delivery_logs"
    ADD CONSTRAINT "websocket_delivery_logs_realtime_event_id_fkey" FOREIGN KEY ("realtime_event_id") REFERENCES "public"."realtime_events"("id");



ALTER TABLE ONLY "public"."websocket_delivery_logs"
    ADD CONSTRAINT "websocket_delivery_logs_websocket_event_queue_id_fkey" FOREIGN KEY ("websocket_event_queue_id") REFERENCES "public"."websocket_event_queue"("id");



ALTER TABLE ONLY "public"."websocket_delivery_logs"
    ADD CONSTRAINT "websocket_delivery_logs_websocket_session_id_fkey" FOREIGN KEY ("websocket_session_id") REFERENCES "public"."websocket_sessions"("id");



ALTER TABLE ONLY "public"."websocket_event_queue"
    ADD CONSTRAINT "websocket_event_queue_realtime_event_id_fkey" FOREIGN KEY ("realtime_event_id") REFERENCES "public"."realtime_events"("id");



ALTER TABLE ONLY "public"."websocket_event_queue"
    ADD CONSTRAINT "websocket_event_queue_websocket_session_id_fkey" FOREIGN KEY ("websocket_session_id") REFERENCES "public"."websocket_sessions"("id");



CREATE POLICY "Allow anon insert pos sales" ON "public"."pos-sales" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Allow anon select pos sales" ON "public"."pos-sales" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Allow insert for now" ON "public"."staff_accounts" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow read alerts" ON "public"."alerts" FOR SELECT USING (true);



CREATE POLICY "Allow read dish stock" ON "public"."dish_stock" FOR SELECT USING (true);



CREATE POLICY "Allow read for all" ON "public"."salary_confirmations" FOR SELECT USING (true);



CREATE POLICY "Allow read ingredients" ON "public"."ingredients" FOR SELECT USING (true);



CREATE POLICY "Allow read tasks" ON "public"."tasks" FOR SELECT USING (true);



CREATE POLICY "Allow tenant access" ON "public"."staff_accounts" USING (("tenant_id" = "auth"."uid"())) WITH CHECK (("tenant_id" = "auth"."uid"()));



CREATE POLICY "Basic safe access" ON "public"."staff_accounts" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Staff can access own account" ON "public"."staff_accounts" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Tenant can read alerts" ON "public"."alerts" FOR SELECT USING (("tenant_id" = "auth"."uid"()));



CREATE POLICY "Tenant can read tasks" ON "public"."tasks" FOR SELECT USING (("tenant_id" = "auth"."uid"()));



CREATE POLICY "Tenant departments" ON "public"."departments" USING (("tenant_id" IN ( SELECT "staff_accounts"."tenant_id"
   FROM "public"."staff_accounts"
  WHERE ("staff_accounts"."user_id" = "auth"."uid"())))) WITH CHECK (("tenant_id" IN ( SELECT "staff_accounts"."tenant_id"
   FROM "public"."staff_accounts"
  WHERE ("staff_accounts"."user_id" = "auth"."uid"()))));



CREATE POLICY "Tenant ingredients" ON "public"."ingredients" USING (("tenant_id" IN ( SELECT "staff_accounts"."tenant_id"
   FROM "public"."staff_accounts"
  WHERE ("staff_accounts"."user_id" = "auth"."uid"())))) WITH CHECK (("tenant_id" IN ( SELECT "staff_accounts"."tenant_id"
   FROM "public"."staff_accounts"
  WHERE ("staff_accounts"."user_id" = "auth"."uid"()))));



CREATE POLICY "Tenant isolation" ON "public"."staff_accounts" USING (("tenant_id" = ((("current_setting"('request.jwt.claims'::"text", true))::json ->> 'tenant_id'::"text"))::"uuid")) WITH CHECK (("tenant_id" = ((("current_setting"('request.jwt.claims'::"text", true))::json ->> 'tenant_id'::"text"))::"uuid"));



CREATE POLICY "Tenant locations" ON "public"."locations" USING (("tenant_id" IN ( SELECT "staff_accounts"."tenant_id"
   FROM "public"."staff_accounts"
  WHERE ("staff_accounts"."user_id" = "auth"."uid"())))) WITH CHECK (("tenant_id" IN ( SELECT "staff_accounts"."tenant_id"
   FROM "public"."staff_accounts"
  WHERE ("staff_accounts"."user_id" = "auth"."uid"()))));



CREATE POLICY "Tenant products" ON "public"."products" USING (("tenant_id" IN ( SELECT "staff_accounts"."tenant_id"
   FROM "public"."staff_accounts"
  WHERE ("staff_accounts"."user_id" = "auth"."uid"())))) WITH CHECK (("tenant_id" IN ( SELECT "staff_accounts"."tenant_id"
   FROM "public"."staff_accounts"
  WHERE ("staff_accounts"."user_id" = "auth"."uid"()))));



CREATE POLICY "Tenant recipes" ON "public"."recipes" USING (("tenant_id" IN ( SELECT "staff_accounts"."tenant_id"
   FROM "public"."staff_accounts"
  WHERE ("staff_accounts"."user_id" = "auth"."uid"())))) WITH CHECK (("tenant_id" IN ( SELECT "staff_accounts"."tenant_id"
   FROM "public"."staff_accounts"
  WHERE ("staff_accounts"."user_id" = "auth"."uid"()))));



CREATE POLICY "User can access their tenant" ON "public"."tenants" USING (("id" IN ( SELECT "staff_accounts"."tenant_id"
   FROM "public"."staff_accounts"
  WHERE ("staff_accounts"."user_id" = "auth"."uid"())))) WITH CHECK (("id" IN ( SELECT "staff_accounts"."tenant_id"
   FROM "public"."staff_accounts"
  WHERE ("staff_accounts"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."accounting-expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."accounting_periods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_agent_memory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_agent_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_business_insights" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_campaign_recommendations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_forecasts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_recommendations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."alerts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "allow_authenticated_read" ON "public"."staff_accounts" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."api_access_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."approval_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."approval_rejections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."approval_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."approval_workflows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."approvals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."backup_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."billing_invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_asset_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_memory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_publish_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_publish_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chart_of_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cogs_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cogs_entries_select" ON "public"."cogs_entries" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."cost_centers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cross_location_consolidations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_loyalty_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_segment_memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_segments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily-reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_sales_batches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_sales_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."department_budgets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."department_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."departments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."depreciation_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dish_stock" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dishes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dynamic_price_adjustments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dynamic_pricing_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."engine_learning_memory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enterprise_announcement_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enterprise_announcements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enterprise_api_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enterprise_audit_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enterprise_audit_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enterprise_audit_summary" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enterprise_document_access_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enterprise_document_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enterprise_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enterprise_feature_flag_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enterprise_feature_flags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enterprise_health_checks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enterprise_integration_sync_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enterprise_integrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enterprise_notification_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enterprise_notification_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enterprise_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enterprise_rate_limit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enterprise_rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enterprise_security_incidents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enterprise_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enterprise_system_health" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enterprise_webhook_deliveries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enterprise_webhooks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enterprise_workflow_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enterprise_workflow_step_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enterprise_workflow_steps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enterprise_workflows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."executive_dashboard_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finance_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finance_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."financial_periods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fixed_assets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."generation_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."goods_receipt_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."goods_receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."history_days" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ingredient_stock" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ingredient_stock_select" ON "public"."ingredient_stock" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."ingredients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."intercompany_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_alerts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_cost_layers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_valuation_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoice_matches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."item_learning" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."journal_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."journal_entry_lines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kitchen_station_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kitchen_station_performance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kitchen_stations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."labor_shift_forecasts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."legal_entities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "manager_delete_staff_accounts" ON "public"."staff_accounts" FOR DELETE USING ("public"."can_manage_role"("role"));



CREATE POLICY "manager_update_staff_accounts" ON "public"."staff_accounts" FOR UPDATE USING ("public"."can_manage_role"("role"));



ALTER TABLE "public"."marketing_assets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketing_campaign_analytics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketing_campaign_deliveries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketing_campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketing_prompt_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meta_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payroll_payouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payroll_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."performance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."period_lock_exceptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_modules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pos-sales" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."production_batches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "production_batches_select" ON "public"."production_batches" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."production_locks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."production_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."production_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_request_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."realtime_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."realtime_presence" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recipe_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recipe_matrix" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recipes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_hierarchy" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."salary_confirmations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."security_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shift_close_insert" ON "public"."shift_closures" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "shift_close_select" ON "public"."shift_closures" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."shift_closures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shift_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff_shifts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_movements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock_movements_select" ON "public"."stock_movements" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_alerts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "system_alerts_insert" ON "public"."system_alerts" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "system_alerts_select" ON "public"."system_alerts" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "system_alerts_update" ON "public"."system_alerts" FOR UPDATE TO "authenticated" USING (true);



ALTER TABLE "public"."system_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."table_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant isolation" ON "public"."daily_sales_batches" USING (("tenant_id" = ( SELECT "staff_accounts"."tenant_id"
   FROM "public"."staff_accounts"
  WHERE ("staff_accounts"."id" = "auth"."uid"()))));



CREATE POLICY "tenant isolation" ON "public"."daily_sales_items" USING (("tenant_id" = ( SELECT "staff_accounts"."tenant_id"
   FROM "public"."staff_accounts"
  WHERE ("staff_accounts"."id" = "auth"."uid"()))));



CREATE POLICY "tenant isolation" ON "public"."history_days" USING (("tenant_id" = ( SELECT "staff_accounts"."tenant_id"
   FROM "public"."staff_accounts"
  WHERE ("staff_accounts"."id" = "auth"."uid"()))));



CREATE POLICY "tenant isolation" ON "public"."pos-sales" USING (("tenant_id" = ( SELECT "staff_accounts"."tenant_id"
   FROM "public"."staff_accounts"
  WHERE ("staff_accounts"."id" = "auth"."uid"()))));



CREATE POLICY "tenant isolation" ON "public"."staff_members" USING (("tenant_id" = ( SELECT "staff_accounts"."tenant_id"
   FROM "public"."staff_accounts"
  WHERE ("staff_accounts"."id" = "auth"."uid"()))));



CREATE POLICY "tenant isolation" ON "public"."staff_shifts" USING (("tenant_id" = ( SELECT "staff_accounts"."tenant_id"
   FROM "public"."staff_accounts"
  WHERE ("staff_accounts"."id" = "auth"."uid"()))));



ALTER TABLE "public"."tenant_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenant_billing_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_delete_accounting_expenses" ON "public"."accounting-expenses" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_actions" ON "public"."actions" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_ai_agent_memory" ON "public"."ai_agent_memory" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_ai_agent_tasks" ON "public"."ai_agent_tasks" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_ai_business_insights" ON "public"."ai_business_insights" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_ai_campaign_recommendations" ON "public"."ai_campaign_recommendations" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_ai_forecasts" ON "public"."ai_forecasts" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_ai_recommendations" ON "public"."ai_recommendations" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_alerts" ON "public"."alerts" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_api_access_logs" ON "public"."api_access_logs" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_approval_requests" ON "public"."approval_requests" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_approval_workflows" ON "public"."approval_workflows" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_approvals" ON "public"."approvals" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_assets" ON "public"."assets" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_audit_logs" ON "public"."audit_logs" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_backup_jobs" ON "public"."backup_jobs" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_billing_invoices" ON "public"."billing_invoices" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_campaign_asset_usage" ON "public"."campaign_asset_usage" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_campaign_memory" ON "public"."campaign_memory" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_campaign_publish_queue" ON "public"."campaign_publish_queue" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_campaigns" ON "public"."campaigns" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_cross_location_consolidations" ON "public"."cross_location_consolidations" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_customer_feedback" ON "public"."customer_feedback" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_customer_loyalty_accounts" ON "public"."customer_loyalty_accounts" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_customer_segment_memberships" ON "public"."customer_segment_memberships" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_customer_segments" ON "public"."customer_segments" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_daily_reports" ON "public"."daily-reports" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_daily_sales_batches" ON "public"."daily_sales_batches" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_daily_sales_items" ON "public"."daily_sales_items" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_department_permissions" ON "public"."department_permissions" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_dish_stock" ON "public"."dish_stock" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_dishes" ON "public"."dishes" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_dynamic_price_adjustments" ON "public"."dynamic_price_adjustments" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_dynamic_pricing_rules" ON "public"."dynamic_pricing_rules" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_enterprise_announcement_reads" ON "public"."enterprise_announcement_reads" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_enterprise_announcements" ON "public"."enterprise_announcements" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_enterprise_api_keys" ON "public"."enterprise_api_keys" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_enterprise_audit_events" ON "public"."enterprise_audit_events" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_enterprise_audit_rules" ON "public"."enterprise_audit_rules" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_enterprise_audit_summary" ON "public"."enterprise_audit_summary" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_enterprise_document_access_logs" ON "public"."enterprise_document_access_logs" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_enterprise_document_versions" ON "public"."enterprise_document_versions" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_enterprise_documents" ON "public"."enterprise_documents" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_enterprise_feature_flag_audit_logs" ON "public"."enterprise_feature_flag_audit_logs" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_enterprise_feature_flags" ON "public"."enterprise_feature_flags" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_enterprise_health_checks" ON "public"."enterprise_health_checks" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_enterprise_integration_sync_logs" ON "public"."enterprise_integration_sync_logs" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_enterprise_integrations" ON "public"."enterprise_integrations" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_enterprise_notification_queue" ON "public"."enterprise_notification_queue" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_enterprise_notification_templates" ON "public"."enterprise_notification_templates" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_enterprise_notifications" ON "public"."enterprise_notifications" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_enterprise_rate_limit_logs" ON "public"."enterprise_rate_limit_logs" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_enterprise_rate_limits" ON "public"."enterprise_rate_limits" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_enterprise_security_incidents" ON "public"."enterprise_security_incidents" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_enterprise_settings" ON "public"."enterprise_settings" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_enterprise_system_health" ON "public"."enterprise_system_health" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_enterprise_webhook_deliveries" ON "public"."enterprise_webhook_deliveries" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_enterprise_webhooks" ON "public"."enterprise_webhooks" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_enterprise_workflow_runs" ON "public"."enterprise_workflow_runs" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_enterprise_workflow_step_runs" ON "public"."enterprise_workflow_step_runs" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_enterprise_workflow_steps" ON "public"."enterprise_workflow_steps" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_enterprise_workflows" ON "public"."enterprise_workflows" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_executive_dashboard_snapshots" ON "public"."executive_dashboard_snapshots" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_financial_periods" ON "public"."financial_periods" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_generation_jobs" ON "public"."generation_jobs" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_goods_receipt_items" ON "public"."goods_receipt_items" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_goods_receipts" ON "public"."goods_receipts" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_history_days" ON "public"."history_days" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_ingredient_stock" ON "public"."ingredient_stock" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_ingredients" ON "public"."ingredients" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_inventory" ON "public"."inventory" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_inventory_alerts" ON "public"."inventory_alerts" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_inventory_cost_layers" ON "public"."inventory_cost_layers" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_inventory_transactions" ON "public"."inventory_transactions" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_inventory_valuation_snapshots" ON "public"."inventory_valuation_snapshots" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_invoice_matches" ON "public"."invoice_matches" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_invoices" ON "public"."invoices" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_item_learning" ON "public"."item_learning" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_kitchen_station_orders" ON "public"."kitchen_station_orders" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_kitchen_station_performance" ON "public"."kitchen_station_performance" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_kitchen_stations" ON "public"."kitchen_stations" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_labor_shift_forecasts" ON "public"."labor_shift_forecasts" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_marketing_assets" ON "public"."marketing_assets" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_marketing_campaign_analytics" ON "public"."marketing_campaign_analytics" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_marketing_campaign_deliveries" ON "public"."marketing_campaign_deliveries" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_marketing_campaigns" ON "public"."marketing_campaigns" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_marketing_prompt_history" ON "public"."marketing_prompt_history" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_meta_accounts" ON "public"."meta_accounts" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_order_items" ON "public"."order_items" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_orders" ON "public"."orders" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_payment_transactions" ON "public"."payment_transactions" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_payments" ON "public"."payments" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_payroll_payouts" ON "public"."payroll_payouts" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_payroll_records" ON "public"."payroll_records" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_performance" ON "public"."performance" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_period_lock_exceptions" ON "public"."period_lock_exceptions" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_platform_tokens" ON "public"."platform_tokens" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_pos_sales" ON "public"."pos-sales" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_production_logs" ON "public"."production_logs" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_production_runs" ON "public"."production_runs" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_realtime_events" ON "public"."realtime_events" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_realtime_presence" ON "public"."realtime_presence" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_recipe_items" ON "public"."recipe_items" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_recipe_matrix" ON "public"."recipe_matrix" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_restaurant_settings" ON "public"."restaurant_settings" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_role_hierarchy" ON "public"."role_hierarchy" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_role_permissions" ON "public"."role_permissions" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_salary_confirmations" ON "public"."salary_confirmations" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_security_events" ON "public"."security_events" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_sessions" ON "public"."table_sessions" FOR DELETE USING (("tenant_id" IN ( SELECT "staff_accounts"."tenant_id"
   FROM "public"."staff_accounts"
  WHERE ("staff_accounts"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "tenant_delete_staff" ON "public"."staff_accounts" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_staff_members" ON "public"."staff_members" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_staff_shifts" ON "public"."staff_shifts" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_stock_movements" ON "public"."stock_movements" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_system_jobs" ON "public"."system_jobs" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_table_sessions" ON "public"."table_sessions" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_tasks" ON "public"."tasks" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_warehouse_inventory" ON "public"."warehouse_inventory" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_warehouse_locations" ON "public"."warehouse_locations" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_warehouse_transfers" ON "public"."warehouse_transfers" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_websocket_delivery_logs" ON "public"."websocket_delivery_logs" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_websocket_event_queue" ON "public"."websocket_event_queue" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_delete_websocket_sessions" ON "public"."websocket_sessions" FOR DELETE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_accounting_expenses" ON "public"."accounting-expenses" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_actions" ON "public"."actions" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_ai_agent_memory" ON "public"."ai_agent_memory" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_ai_agent_tasks" ON "public"."ai_agent_tasks" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_ai_business_insights" ON "public"."ai_business_insights" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_ai_campaign_recommendations" ON "public"."ai_campaign_recommendations" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_ai_forecasts" ON "public"."ai_forecasts" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_ai_recommendations" ON "public"."ai_recommendations" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_alerts" ON "public"."alerts" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_api_access_logs" ON "public"."api_access_logs" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_approval_requests" ON "public"."approval_requests" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_approval_workflows" ON "public"."approval_workflows" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_approvals" ON "public"."approvals" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_assets" ON "public"."assets" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_audit_logs" ON "public"."audit_logs" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_backup_jobs" ON "public"."backup_jobs" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_billing_invoices" ON "public"."billing_invoices" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_campaign_asset_usage" ON "public"."campaign_asset_usage" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_campaign_memory" ON "public"."campaign_memory" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_campaign_publish_queue" ON "public"."campaign_publish_queue" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_campaigns" ON "public"."campaigns" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_cross_location_consolidations" ON "public"."cross_location_consolidations" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_customer_feedback" ON "public"."customer_feedback" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_customer_loyalty_accounts" ON "public"."customer_loyalty_accounts" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_customer_segment_memberships" ON "public"."customer_segment_memberships" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_customer_segments" ON "public"."customer_segments" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_daily_reports" ON "public"."daily-reports" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_daily_sales_batches" ON "public"."daily_sales_batches" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_daily_sales_items" ON "public"."daily_sales_items" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_department_permissions" ON "public"."department_permissions" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_dish_stock" ON "public"."dish_stock" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_dishes" ON "public"."dishes" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_dynamic_price_adjustments" ON "public"."dynamic_price_adjustments" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_dynamic_pricing_rules" ON "public"."dynamic_pricing_rules" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_enterprise_announcement_reads" ON "public"."enterprise_announcement_reads" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_enterprise_announcements" ON "public"."enterprise_announcements" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_enterprise_api_keys" ON "public"."enterprise_api_keys" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_enterprise_audit_events" ON "public"."enterprise_audit_events" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_enterprise_audit_rules" ON "public"."enterprise_audit_rules" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_enterprise_audit_summary" ON "public"."enterprise_audit_summary" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_enterprise_document_access_logs" ON "public"."enterprise_document_access_logs" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_enterprise_document_versions" ON "public"."enterprise_document_versions" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_enterprise_documents" ON "public"."enterprise_documents" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_enterprise_feature_flag_audit_logs" ON "public"."enterprise_feature_flag_audit_logs" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_enterprise_feature_flags" ON "public"."enterprise_feature_flags" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_enterprise_health_checks" ON "public"."enterprise_health_checks" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_enterprise_integration_sync_logs" ON "public"."enterprise_integration_sync_logs" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_enterprise_integrations" ON "public"."enterprise_integrations" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_enterprise_notification_queue" ON "public"."enterprise_notification_queue" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_enterprise_notification_templates" ON "public"."enterprise_notification_templates" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_enterprise_notifications" ON "public"."enterprise_notifications" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_enterprise_rate_limit_logs" ON "public"."enterprise_rate_limit_logs" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_enterprise_rate_limits" ON "public"."enterprise_rate_limits" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_enterprise_security_incidents" ON "public"."enterprise_security_incidents" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_enterprise_settings" ON "public"."enterprise_settings" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_enterprise_system_health" ON "public"."enterprise_system_health" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_enterprise_webhook_deliveries" ON "public"."enterprise_webhook_deliveries" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_enterprise_webhooks" ON "public"."enterprise_webhooks" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_enterprise_workflow_runs" ON "public"."enterprise_workflow_runs" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_enterprise_workflow_step_runs" ON "public"."enterprise_workflow_step_runs" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_enterprise_workflow_steps" ON "public"."enterprise_workflow_steps" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_enterprise_workflows" ON "public"."enterprise_workflows" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_executive_dashboard_snapshots" ON "public"."executive_dashboard_snapshots" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_financial_periods" ON "public"."financial_periods" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_generation_jobs" ON "public"."generation_jobs" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_goods_receipt_items" ON "public"."goods_receipt_items" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_goods_receipts" ON "public"."goods_receipts" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_history_days" ON "public"."history_days" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_ingredient_stock" ON "public"."ingredient_stock" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_ingredients" ON "public"."ingredients" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_inventory" ON "public"."inventory" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_inventory_alerts" ON "public"."inventory_alerts" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_inventory_cost_layers" ON "public"."inventory_cost_layers" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_inventory_transactions" ON "public"."inventory_transactions" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_inventory_valuation_snapshots" ON "public"."inventory_valuation_snapshots" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_invoice_matches" ON "public"."invoice_matches" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_invoices" ON "public"."invoices" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_item_learning" ON "public"."item_learning" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_kitchen_station_orders" ON "public"."kitchen_station_orders" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_kitchen_station_performance" ON "public"."kitchen_station_performance" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_kitchen_stations" ON "public"."kitchen_stations" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_labor_shift_forecasts" ON "public"."labor_shift_forecasts" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_marketing_assets" ON "public"."marketing_assets" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_marketing_campaign_analytics" ON "public"."marketing_campaign_analytics" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_marketing_campaign_deliveries" ON "public"."marketing_campaign_deliveries" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_marketing_campaigns" ON "public"."marketing_campaigns" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_marketing_prompt_history" ON "public"."marketing_prompt_history" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_meta_accounts" ON "public"."meta_accounts" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_order_items" ON "public"."order_items" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_orders" ON "public"."orders" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_payment_transactions" ON "public"."payment_transactions" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_payments" ON "public"."payments" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_payroll_payouts" ON "public"."payroll_payouts" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_payroll_records" ON "public"."payroll_records" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_performance" ON "public"."performance" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_period_lock_exceptions" ON "public"."period_lock_exceptions" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_platform_tokens" ON "public"."platform_tokens" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_pos_sales" ON "public"."pos-sales" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_production_logs" ON "public"."production_logs" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_production_runs" ON "public"."production_runs" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_realtime_events" ON "public"."realtime_events" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_realtime_presence" ON "public"."realtime_presence" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_recipe_items" ON "public"."recipe_items" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_recipe_matrix" ON "public"."recipe_matrix" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_restaurant_settings" ON "public"."restaurant_settings" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_role_hierarchy" ON "public"."role_hierarchy" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_role_permissions" ON "public"."role_permissions" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_salary_confirmations" ON "public"."salary_confirmations" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_security_events" ON "public"."security_events" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_sessions" ON "public"."table_sessions" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "staff_accounts"."tenant_id"
   FROM "public"."staff_accounts"
  WHERE ("staff_accounts"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "tenant_insert_staff" ON "public"."staff_accounts" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_staff_members" ON "public"."staff_members" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_staff_shifts" ON "public"."staff_shifts" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_stock_movements" ON "public"."stock_movements" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_system_jobs" ON "public"."system_jobs" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_table_sessions" ON "public"."table_sessions" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_tasks" ON "public"."tasks" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_warehouse_inventory" ON "public"."warehouse_inventory" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_warehouse_locations" ON "public"."warehouse_locations" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_warehouse_transfers" ON "public"."warehouse_transfers" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_websocket_delivery_logs" ON "public"."websocket_delivery_logs" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_websocket_event_queue" ON "public"."websocket_event_queue" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_insert_websocket_sessions" ON "public"."websocket_sessions" FOR INSERT WITH CHECK ("public"."same_tenant"("tenant_id"));



ALTER TABLE "public"."tenant_modules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenant_platform_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_select_accounting_expenses" ON "public"."accounting-expenses" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_actions" ON "public"."actions" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_ai_agent_memory" ON "public"."ai_agent_memory" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_ai_agent_tasks" ON "public"."ai_agent_tasks" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_ai_business_insights" ON "public"."ai_business_insights" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_ai_campaign_recommendations" ON "public"."ai_campaign_recommendations" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_ai_forecasts" ON "public"."ai_forecasts" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_ai_recommendations" ON "public"."ai_recommendations" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_alerts" ON "public"."alerts" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_api_access_logs" ON "public"."api_access_logs" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_approval_requests" ON "public"."approval_requests" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_approval_workflows" ON "public"."approval_workflows" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_approvals" ON "public"."approvals" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_assets" ON "public"."assets" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_audit_logs" ON "public"."audit_logs" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_backup_jobs" ON "public"."backup_jobs" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_billing_invoices" ON "public"."billing_invoices" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_campaign_asset_usage" ON "public"."campaign_asset_usage" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_campaign_memory" ON "public"."campaign_memory" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_campaign_publish_queue" ON "public"."campaign_publish_queue" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_campaigns" ON "public"."campaigns" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_cross_location_consolidations" ON "public"."cross_location_consolidations" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_customer_feedback" ON "public"."customer_feedback" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_customer_loyalty_accounts" ON "public"."customer_loyalty_accounts" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_customer_segment_memberships" ON "public"."customer_segment_memberships" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_customer_segments" ON "public"."customer_segments" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_daily_reports" ON "public"."daily-reports" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_daily_sales_batches" ON "public"."daily_sales_batches" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_daily_sales_items" ON "public"."daily_sales_items" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_department_permissions" ON "public"."department_permissions" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_dish_stock" ON "public"."dish_stock" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_dishes" ON "public"."dishes" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_dynamic_price_adjustments" ON "public"."dynamic_price_adjustments" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_dynamic_pricing_rules" ON "public"."dynamic_pricing_rules" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_enterprise_announcement_reads" ON "public"."enterprise_announcement_reads" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_enterprise_announcements" ON "public"."enterprise_announcements" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_enterprise_api_keys" ON "public"."enterprise_api_keys" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_enterprise_audit_events" ON "public"."enterprise_audit_events" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_enterprise_audit_rules" ON "public"."enterprise_audit_rules" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_enterprise_audit_summary" ON "public"."enterprise_audit_summary" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_enterprise_document_access_logs" ON "public"."enterprise_document_access_logs" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_enterprise_document_versions" ON "public"."enterprise_document_versions" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_enterprise_documents" ON "public"."enterprise_documents" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_enterprise_feature_flag_audit_logs" ON "public"."enterprise_feature_flag_audit_logs" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_enterprise_feature_flags" ON "public"."enterprise_feature_flags" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_enterprise_health_checks" ON "public"."enterprise_health_checks" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_enterprise_integration_sync_logs" ON "public"."enterprise_integration_sync_logs" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_enterprise_integrations" ON "public"."enterprise_integrations" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_enterprise_notification_queue" ON "public"."enterprise_notification_queue" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_enterprise_notification_templates" ON "public"."enterprise_notification_templates" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_enterprise_notifications" ON "public"."enterprise_notifications" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_enterprise_rate_limit_logs" ON "public"."enterprise_rate_limit_logs" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_enterprise_rate_limits" ON "public"."enterprise_rate_limits" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_enterprise_security_incidents" ON "public"."enterprise_security_incidents" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_enterprise_settings" ON "public"."enterprise_settings" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_enterprise_system_health" ON "public"."enterprise_system_health" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_enterprise_webhook_deliveries" ON "public"."enterprise_webhook_deliveries" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_enterprise_webhooks" ON "public"."enterprise_webhooks" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_enterprise_workflow_runs" ON "public"."enterprise_workflow_runs" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_enterprise_workflow_step_runs" ON "public"."enterprise_workflow_step_runs" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_enterprise_workflow_steps" ON "public"."enterprise_workflow_steps" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_enterprise_workflows" ON "public"."enterprise_workflows" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_executive_dashboard_snapshots" ON "public"."executive_dashboard_snapshots" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_financial_periods" ON "public"."financial_periods" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_generation_jobs" ON "public"."generation_jobs" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_goods_receipt_items" ON "public"."goods_receipt_items" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_goods_receipts" ON "public"."goods_receipts" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_history_days" ON "public"."history_days" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_ingredient_stock" ON "public"."ingredient_stock" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_ingredients" ON "public"."ingredients" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_inventory" ON "public"."inventory" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_inventory_alerts" ON "public"."inventory_alerts" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_inventory_cost_layers" ON "public"."inventory_cost_layers" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_inventory_transactions" ON "public"."inventory_transactions" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_inventory_valuation_snapshots" ON "public"."inventory_valuation_snapshots" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_invoice_matches" ON "public"."invoice_matches" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_invoices" ON "public"."invoices" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_item_learning" ON "public"."item_learning" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_kitchen_station_orders" ON "public"."kitchen_station_orders" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_kitchen_station_performance" ON "public"."kitchen_station_performance" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_kitchen_stations" ON "public"."kitchen_stations" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_labor_shift_forecasts" ON "public"."labor_shift_forecasts" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_marketing_assets" ON "public"."marketing_assets" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_marketing_campaign_analytics" ON "public"."marketing_campaign_analytics" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_marketing_campaign_deliveries" ON "public"."marketing_campaign_deliveries" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_marketing_campaigns" ON "public"."marketing_campaigns" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_marketing_prompt_history" ON "public"."marketing_prompt_history" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_meta_accounts" ON "public"."meta_accounts" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_order_items" ON "public"."order_items" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_orders" ON "public"."orders" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_payment_transactions" ON "public"."payment_transactions" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_payments" ON "public"."payments" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_payroll_payouts" ON "public"."payroll_payouts" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_payroll_records" ON "public"."payroll_records" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_performance" ON "public"."performance" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_period_lock_exceptions" ON "public"."period_lock_exceptions" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_platform_tokens" ON "public"."platform_tokens" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_pos_sales" ON "public"."pos-sales" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_production_logs" ON "public"."production_logs" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_production_runs" ON "public"."production_runs" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_realtime_events" ON "public"."realtime_events" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_realtime_presence" ON "public"."realtime_presence" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_recipe_items" ON "public"."recipe_items" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_recipe_matrix" ON "public"."recipe_matrix" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_restaurant_settings" ON "public"."restaurant_settings" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_role_hierarchy" ON "public"."role_hierarchy" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_role_permissions" ON "public"."role_permissions" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_salary_confirmations" ON "public"."salary_confirmations" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_security_events" ON "public"."security_events" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_sessions" ON "public"."table_sessions" FOR SELECT USING (("tenant_id" IN ( SELECT "staff_accounts"."tenant_id"
   FROM "public"."staff_accounts"
  WHERE ("staff_accounts"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "tenant_select_staff" ON "public"."staff_accounts" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_staff_members" ON "public"."staff_members" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_staff_shifts" ON "public"."staff_shifts" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_stock_movements" ON "public"."stock_movements" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_system_jobs" ON "public"."system_jobs" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_table_sessions" ON "public"."table_sessions" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_tasks" ON "public"."tasks" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_warehouse_inventory" ON "public"."warehouse_inventory" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_warehouse_locations" ON "public"."warehouse_locations" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_warehouse_transfers" ON "public"."warehouse_transfers" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_websocket_delivery_logs" ON "public"."websocket_delivery_logs" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_websocket_event_queue" ON "public"."websocket_event_queue" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_select_websocket_sessions" ON "public"."websocket_sessions" FOR SELECT USING ("public"."same_tenant"("tenant_id"));



ALTER TABLE "public"."tenant_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_update_accounting_expenses" ON "public"."accounting-expenses" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_actions" ON "public"."actions" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_ai_agent_memory" ON "public"."ai_agent_memory" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_ai_agent_tasks" ON "public"."ai_agent_tasks" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_ai_business_insights" ON "public"."ai_business_insights" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_ai_campaign_recommendations" ON "public"."ai_campaign_recommendations" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_ai_forecasts" ON "public"."ai_forecasts" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_ai_recommendations" ON "public"."ai_recommendations" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_alerts" ON "public"."alerts" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_api_access_logs" ON "public"."api_access_logs" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_approval_requests" ON "public"."approval_requests" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_approval_workflows" ON "public"."approval_workflows" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_approvals" ON "public"."approvals" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_assets" ON "public"."assets" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_audit_logs" ON "public"."audit_logs" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_backup_jobs" ON "public"."backup_jobs" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_billing_invoices" ON "public"."billing_invoices" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_campaign_asset_usage" ON "public"."campaign_asset_usage" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_campaign_memory" ON "public"."campaign_memory" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_campaign_publish_queue" ON "public"."campaign_publish_queue" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_campaigns" ON "public"."campaigns" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_cross_location_consolidations" ON "public"."cross_location_consolidations" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_customer_feedback" ON "public"."customer_feedback" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_customer_loyalty_accounts" ON "public"."customer_loyalty_accounts" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_customer_segment_memberships" ON "public"."customer_segment_memberships" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_customer_segments" ON "public"."customer_segments" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_daily_reports" ON "public"."daily-reports" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_daily_sales_batches" ON "public"."daily_sales_batches" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_daily_sales_items" ON "public"."daily_sales_items" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_department_permissions" ON "public"."department_permissions" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_dish_stock" ON "public"."dish_stock" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_dishes" ON "public"."dishes" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_dynamic_price_adjustments" ON "public"."dynamic_price_adjustments" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_dynamic_pricing_rules" ON "public"."dynamic_pricing_rules" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_enterprise_announcement_reads" ON "public"."enterprise_announcement_reads" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_enterprise_announcements" ON "public"."enterprise_announcements" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_enterprise_api_keys" ON "public"."enterprise_api_keys" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_enterprise_audit_events" ON "public"."enterprise_audit_events" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_enterprise_audit_rules" ON "public"."enterprise_audit_rules" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_enterprise_audit_summary" ON "public"."enterprise_audit_summary" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_enterprise_document_access_logs" ON "public"."enterprise_document_access_logs" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_enterprise_document_versions" ON "public"."enterprise_document_versions" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_enterprise_documents" ON "public"."enterprise_documents" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_enterprise_feature_flag_audit_logs" ON "public"."enterprise_feature_flag_audit_logs" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_enterprise_feature_flags" ON "public"."enterprise_feature_flags" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_enterprise_health_checks" ON "public"."enterprise_health_checks" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_enterprise_integration_sync_logs" ON "public"."enterprise_integration_sync_logs" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_enterprise_integrations" ON "public"."enterprise_integrations" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_enterprise_notification_queue" ON "public"."enterprise_notification_queue" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_enterprise_notification_templates" ON "public"."enterprise_notification_templates" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_enterprise_notifications" ON "public"."enterprise_notifications" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_enterprise_rate_limit_logs" ON "public"."enterprise_rate_limit_logs" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_enterprise_rate_limits" ON "public"."enterprise_rate_limits" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_enterprise_security_incidents" ON "public"."enterprise_security_incidents" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_enterprise_settings" ON "public"."enterprise_settings" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_enterprise_system_health" ON "public"."enterprise_system_health" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_enterprise_webhook_deliveries" ON "public"."enterprise_webhook_deliveries" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_enterprise_webhooks" ON "public"."enterprise_webhooks" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_enterprise_workflow_runs" ON "public"."enterprise_workflow_runs" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_enterprise_workflow_step_runs" ON "public"."enterprise_workflow_step_runs" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_enterprise_workflow_steps" ON "public"."enterprise_workflow_steps" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_enterprise_workflows" ON "public"."enterprise_workflows" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_executive_dashboard_snapshots" ON "public"."executive_dashboard_snapshots" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_financial_periods" ON "public"."financial_periods" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_generation_jobs" ON "public"."generation_jobs" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_goods_receipt_items" ON "public"."goods_receipt_items" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_goods_receipts" ON "public"."goods_receipts" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_history_days" ON "public"."history_days" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_ingredient_stock" ON "public"."ingredient_stock" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_ingredients" ON "public"."ingredients" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_inventory" ON "public"."inventory" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_inventory_alerts" ON "public"."inventory_alerts" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_inventory_cost_layers" ON "public"."inventory_cost_layers" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_inventory_transactions" ON "public"."inventory_transactions" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_inventory_valuation_snapshots" ON "public"."inventory_valuation_snapshots" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_invoice_matches" ON "public"."invoice_matches" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_invoices" ON "public"."invoices" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_item_learning" ON "public"."item_learning" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_kitchen_station_orders" ON "public"."kitchen_station_orders" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_kitchen_station_performance" ON "public"."kitchen_station_performance" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_kitchen_stations" ON "public"."kitchen_stations" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_labor_shift_forecasts" ON "public"."labor_shift_forecasts" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_marketing_assets" ON "public"."marketing_assets" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_marketing_campaign_analytics" ON "public"."marketing_campaign_analytics" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_marketing_campaign_deliveries" ON "public"."marketing_campaign_deliveries" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_marketing_campaigns" ON "public"."marketing_campaigns" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_marketing_prompt_history" ON "public"."marketing_prompt_history" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_meta_accounts" ON "public"."meta_accounts" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_order_items" ON "public"."order_items" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_orders" ON "public"."orders" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_payment_transactions" ON "public"."payment_transactions" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_payments" ON "public"."payments" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_payroll_payouts" ON "public"."payroll_payouts" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_payroll_records" ON "public"."payroll_records" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_performance" ON "public"."performance" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_period_lock_exceptions" ON "public"."period_lock_exceptions" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_platform_tokens" ON "public"."platform_tokens" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_pos_sales" ON "public"."pos-sales" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_production_logs" ON "public"."production_logs" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_production_runs" ON "public"."production_runs" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_realtime_events" ON "public"."realtime_events" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_realtime_presence" ON "public"."realtime_presence" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_recipe_items" ON "public"."recipe_items" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_recipe_matrix" ON "public"."recipe_matrix" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_restaurant_settings" ON "public"."restaurant_settings" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_role_hierarchy" ON "public"."role_hierarchy" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_role_permissions" ON "public"."role_permissions" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_salary_confirmations" ON "public"."salary_confirmations" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_security_events" ON "public"."security_events" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_sessions" ON "public"."table_sessions" FOR UPDATE USING (("tenant_id" IN ( SELECT "staff_accounts"."tenant_id"
   FROM "public"."staff_accounts"
  WHERE ("staff_accounts"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "tenant_update_staff" ON "public"."staff_accounts" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_staff_members" ON "public"."staff_members" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_staff_shifts" ON "public"."staff_shifts" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_stock_movements" ON "public"."stock_movements" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_system_jobs" ON "public"."system_jobs" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_table_sessions" ON "public"."table_sessions" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_tasks" ON "public"."tasks" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_warehouse_inventory" ON "public"."warehouse_inventory" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_warehouse_locations" ON "public"."warehouse_locations" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_warehouse_transfers" ON "public"."warehouse_transfers" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_websocket_delivery_logs" ON "public"."websocket_delivery_logs" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_websocket_event_queue" ON "public"."websocket_event_queue" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



CREATE POLICY "tenant_update_websocket_sessions" ON "public"."websocket_sessions" FOR UPDATE USING ("public"."same_tenant"("tenant_id"));



ALTER TABLE "public"."tenant_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_finance_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vendors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."warehouse_inventory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."warehouse_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."warehouse_transfers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."waste_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."websocket_delivery_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."websocket_event_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."websocket_sessions" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."analyze_customer_sentiment"() TO "anon";
GRANT ALL ON FUNCTION "public"."analyze_customer_sentiment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."analyze_customer_sentiment"() TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_dynamic_pricing"("p_order_item_id" "uuid", "p_original_price" numeric, "p_target_category" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_dynamic_pricing"("p_order_item_id" "uuid", "p_original_price" numeric, "p_target_category" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_dynamic_pricing"("p_order_item_id" "uuid", "p_original_price" numeric, "p_target_category" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."approve_enterprise_document"("p_document_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_enterprise_document"("p_document_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_enterprise_document"("p_document_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_customer_segments"() TO "anon";
GRANT ALL ON FUNCTION "public"."assign_customer_segments"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_customer_segments"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_trigger_function"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_trigger_function"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_trigger_function"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_create_kitchen_ticket"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_create_kitchen_ticket"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_create_kitchen_ticket"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_process_order_production"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_process_order_production"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_process_order_production"() TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_kitchen_station_performance"() TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_kitchen_station_performance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_kitchen_station_performance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_role"("target_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_role"("target_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_role"("target_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_inventory_alerts"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_inventory_alerts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_inventory_alerts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_limit_key" "text", "p_identifier" "text", "p_window_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_limit_key" "text", "p_identifier" "text", "p_window_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_limit_key" "text", "p_identifier" "text", "p_window_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_ai_agent_memory"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_ai_agent_memory"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_ai_agent_memory"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_rate_limit_logs"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_rate_limit_logs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_rate_limit_logs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_stale_presence"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_stale_presence"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_stale_presence"() TO "service_role";



GRANT ALL ON FUNCTION "public"."close_financial_period"("p_period_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."close_financial_period"("p_period_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."close_financial_period"("p_period_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."consume_inventory_fifo"("p_ingredient_id" "uuid", "p_quantity" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."consume_inventory_fifo"("p_ingredient_id" "uuid", "p_quantity" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_inventory_fifo"("p_ingredient_id" "uuid", "p_quantity" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_ai_agent_task"("p_task_type" "text", "p_task_category" "text", "p_priority" "text", "p_assigned_agent" "text", "p_reference_table" "text", "p_reference_id" "uuid", "p_task_payload" "jsonb", "p_scheduled_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."create_ai_agent_task"("p_task_type" "text", "p_task_category" "text", "p_priority" "text", "p_assigned_agent" "text", "p_reference_table" "text", "p_reference_id" "uuid", "p_task_payload" "jsonb", "p_scheduled_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_ai_agent_task"("p_task_type" "text", "p_task_category" "text", "p_priority" "text", "p_assigned_agent" "text", "p_reference_table" "text", "p_reference_id" "uuid", "p_task_payload" "jsonb", "p_scheduled_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_backup_job"("p_backup_type" "text", "p_backup_scope" "text", "p_storage_location" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_backup_job"("p_backup_type" "text", "p_backup_scope" "text", "p_storage_location" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_backup_job"("p_backup_type" "text", "p_backup_scope" "text", "p_storage_location" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_enterprise_audit_event"("p_event_table" "text", "p_event_action" "text", "p_reference_id" "uuid", "p_event_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_enterprise_audit_event"("p_event_table" "text", "p_event_action" "text", "p_reference_id" "uuid", "p_event_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_enterprise_audit_event"("p_event_table" "text", "p_event_action" "text", "p_reference_id" "uuid", "p_event_payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_enterprise_document"("p_document_type" "text", "p_document_name" "text", "p_reference_table" "text", "p_reference_id" "uuid", "p_storage_path" "text", "p_file_size_bytes" bigint, "p_mime_type" "text", "p_generated_by" "text", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_enterprise_document"("p_document_type" "text", "p_document_name" "text", "p_reference_table" "text", "p_reference_id" "uuid", "p_storage_path" "text", "p_file_size_bytes" bigint, "p_mime_type" "text", "p_generated_by" "text", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_enterprise_document"("p_document_type" "text", "p_document_name" "text", "p_reference_table" "text", "p_reference_id" "uuid", "p_storage_path" "text", "p_file_size_bytes" bigint, "p_mime_type" "text", "p_generated_by" "text", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_enterprise_document_version"("p_document_id" "uuid", "p_storage_path" "text", "p_file_size_bytes" bigint, "p_mime_type" "text", "p_change_summary" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_enterprise_document_version"("p_document_id" "uuid", "p_storage_path" "text", "p_file_size_bytes" bigint, "p_mime_type" "text", "p_change_summary" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_enterprise_document_version"("p_document_id" "uuid", "p_storage_path" "text", "p_file_size_bytes" bigint, "p_mime_type" "text", "p_change_summary" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_enterprise_notification"("p_notification_type" "text", "p_category" "text", "p_title" "text", "p_message" "text", "p_severity" "text", "p_target_role" "text", "p_target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_enterprise_notification"("p_notification_type" "text", "p_category" "text", "p_title" "text", "p_message" "text", "p_severity" "text", "p_target_role" "text", "p_target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_enterprise_notification"("p_notification_type" "text", "p_category" "text", "p_title" "text", "p_message" "text", "p_severity" "text", "p_target_role" "text", "p_target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_security_incident"("p_incident_type" "text", "p_incident_category" "text", "p_severity" "text", "p_source_system" "text", "p_reference_table" "text", "p_reference_id" "uuid", "p_incident_summary" "text", "p_incident_details" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_security_incident"("p_incident_type" "text", "p_incident_category" "text", "p_severity" "text", "p_source_system" "text", "p_reference_table" "text", "p_reference_id" "uuid", "p_incident_summary" "text", "p_incident_details" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_security_incident"("p_incident_type" "text", "p_incident_category" "text", "p_severity" "text", "p_source_system" "text", "p_reference_table" "text", "p_reference_id" "uuid", "p_incident_summary" "text", "p_incident_details" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."decrement_dish_stock"("p_item_id" "uuid", "p_quantity" numeric, "p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."decrement_dish_stock"("p_item_id" "uuid", "p_quantity" numeric, "p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrement_dish_stock"("p_item_id" "uuid", "p_quantity" numeric, "p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."decrement_dish_stock"("p_tenant_id" "uuid", "p_dish_id" "uuid", "p_qty" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."decrement_dish_stock"("p_tenant_id" "uuid", "p_dish_id" "uuid", "p_qty" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrement_dish_stock"("p_tenant_id" "uuid", "p_dish_id" "uuid", "p_qty" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."decrement_ingredient_stock"("p_item_id" "uuid", "p_quantity" numeric, "p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."decrement_ingredient_stock"("p_item_id" "uuid", "p_quantity" numeric, "p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrement_ingredient_stock"("p_item_id" "uuid", "p_quantity" numeric, "p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."decrement_ingredient_stock"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_qty" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."decrement_ingredient_stock"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_qty" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrement_ingredient_stock"("p_tenant_id" "uuid", "p_ingredient_id" "uuid", "p_qty" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."decrement_stock"("ing_id" "uuid", "amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."decrement_stock"("ing_id" "uuid", "amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrement_stock"("ing_id" "uuid", "amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."detect_suspicious_api_key_activity"() TO "anon";
GRANT ALL ON FUNCTION "public"."detect_suspicious_api_key_activity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."detect_suspicious_api_key_activity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."disconnect_websocket_session"("p_connection_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."disconnect_websocket_session"("p_connection_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."disconnect_websocket_session"("p_connection_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."enterprise_document_audit_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."enterprise_document_audit_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enterprise_document_audit_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."execute_approval"("p_entity_type" "text", "p_entity_id" "uuid", "p_next_status" "text", "p_tenant_id" "uuid", "p_from_status" "text", "p_to_status" "text", "p_acted_by" "uuid", "p_role" "text", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."execute_approval"("p_entity_type" "text", "p_entity_id" "uuid", "p_next_status" "text", "p_tenant_id" "uuid", "p_from_status" "text", "p_to_status" "text", "p_acted_by" "uuid", "p_role" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."execute_approval"("p_entity_type" "text", "p_entity_id" "uuid", "p_next_status" "text", "p_tenant_id" "uuid", "p_from_status" "text", "p_to_status" "text", "p_acted_by" "uuid", "p_role" "text", "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."execute_approval"("p_table" "text", "p_entity_id" "uuid", "p_next_status" "text", "p_tenant_id" "uuid", "p_entity_type" "text", "p_from_status" "text", "p_to_status" "text", "p_acted_by" "uuid", "p_role" "text", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."execute_approval"("p_table" "text", "p_entity_id" "uuid", "p_next_status" "text", "p_tenant_id" "uuid", "p_entity_type" "text", "p_from_status" "text", "p_to_status" "text", "p_acted_by" "uuid", "p_role" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."execute_approval"("p_table" "text", "p_entity_id" "uuid", "p_next_status" "text", "p_tenant_id" "uuid", "p_entity_type" "text", "p_from_status" "text", "p_to_status" "text", "p_acted_by" "uuid", "p_role" "text", "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."execute_enterprise_workflow"("p_workflow_id" "uuid", "p_trigger_source" "text", "p_input_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."execute_enterprise_workflow"("p_workflow_id" "uuid", "p_trigger_source" "text", "p_input_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."execute_enterprise_workflow"("p_workflow_id" "uuid", "p_trigger_source" "text", "p_input_payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."execute_enterprise_workflow_steps"("p_workflow_run_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."execute_enterprise_workflow_steps"("p_workflow_run_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."execute_enterprise_workflow_steps"("p_workflow_run_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."feature_flag_audit_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."feature_flag_audit_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."feature_flag_audit_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_ai_business_insights"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_ai_business_insights"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_ai_business_insights"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_ai_campaign_recommendations"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_ai_campaign_recommendations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_ai_campaign_recommendations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_ai_forecasts"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_ai_forecasts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_ai_forecasts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_ai_recommendations"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_ai_recommendations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_ai_recommendations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_automated_notifications"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_automated_notifications"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_automated_notifications"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_cross_location_consolidation"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_cross_location_consolidation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_cross_location_consolidation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_enterprise_audit_summary"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_enterprise_audit_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_enterprise_audit_summary"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_executive_dashboard_snapshot"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_executive_dashboard_snapshot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_executive_dashboard_snapshot"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_inventory_snapshot"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_inventory_snapshot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_inventory_snapshot"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_labor_shift_forecasts"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_labor_shift_forecasts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_labor_shift_forecasts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_marketing_campaign_analytics"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_marketing_campaign_analytics"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_marketing_campaign_analytics"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_system_health_snapshot"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_system_health_snapshot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_system_health_snapshot"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_ai_agent_memory"("p_agent_name" "text", "p_memory_type" "text", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_ai_agent_memory"("p_agent_name" "text", "p_memory_type" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_ai_agent_memory"("p_agent_name" "text", "p_memory_type" "text", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_role_level"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_role_level"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_role_level"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_tenant_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_tenant_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_tenant_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_department_permission"("target_department" "text", "permission_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_department_permission"("target_department" "text", "permission_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_department_permission"("target_department" "text", "permission_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."inventory_realtime_event_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."inventory_realtime_event_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."inventory_realtime_event_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_feature_enabled"("p_feature_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_feature_enabled"("p_feature_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_feature_enabled"("p_feature_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_feature_enabled"("p_feature_key" "text", "p_environment" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_feature_enabled"("p_feature_key" "text", "p_environment" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_feature_enabled"("p_feature_key" "text", "p_environment" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_period_open"("p_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."is_period_open"("p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_period_open"("p_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."kitchen_realtime_event_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."kitchen_realtime_event_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."kitchen_realtime_event_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."launch_marketing_campaign"("p_campaign_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."launch_marketing_campaign"("p_campaign_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."launch_marketing_campaign"("p_campaign_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_api_access"("p_endpoint" "text", "p_request_method" "text", "p_response_status" integer, "p_ip_address" "text", "p_user_agent" "text", "p_request_duration_ms" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."log_api_access"("p_endpoint" "text", "p_request_method" "text", "p_response_status" integer, "p_ip_address" "text", "p_user_agent" "text", "p_request_duration_ms" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_api_access"("p_endpoint" "text", "p_request_method" "text", "p_response_status" integer, "p_ip_address" "text", "p_user_agent" "text", "p_request_duration_ms" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."log_enterprise_document_access"("p_document_id" "uuid", "p_access_type" "text", "p_ip_address" "text", "p_user_agent" "text", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_enterprise_document_access"("p_document_id" "uuid", "p_access_type" "text", "p_ip_address" "text", "p_user_agent" "text", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_enterprise_document_access"("p_document_id" "uuid", "p_access_type" "text", "p_ip_address" "text", "p_user_agent" "text", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_security_event"("p_event_type" "text", "p_severity" "text", "p_event_details" "jsonb", "p_ip_address" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."log_security_event"("p_event_type" "text", "p_severity" "text", "p_event_details" "jsonb", "p_ip_address" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_security_event"("p_event_type" "text", "p_severity" "text", "p_event_details" "jsonb", "p_ip_address" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_announcement_as_read"("p_announcement_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_announcement_as_read"("p_announcement_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_announcement_as_read"("p_announcement_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_websocket_event_delivered"("p_queue_id" "uuid", "p_response_message" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_websocket_event_delivered"("p_queue_id" "uuid", "p_response_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_websocket_event_delivered"("p_queue_id" "uuid", "p_response_message" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."notification_realtime_event_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."notification_realtime_event_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notification_realtime_event_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."order_realtime_event_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."order_realtime_event_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."order_realtime_event_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_changes_in_closed_period"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_changes_in_closed_period"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_changes_in_closed_period"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_ai_agent_task"("p_task_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."process_ai_agent_task"("p_task_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_ai_agent_task"("p_task_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_approval"("p_request_id" "uuid", "p_action" "text", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."process_approval"("p_request_id" "uuid", "p_action" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_approval"("p_request_id" "uuid", "p_action" "text", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_notification_queue"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_notification_queue"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_notification_queue"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_pending_ai_agent_tasks"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_pending_ai_agent_tasks"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_pending_ai_agent_tasks"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_pending_webhook_deliveries"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_pending_webhook_deliveries"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_pending_webhook_deliveries"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_production_run"("p_order_id" "uuid", "p_order_item_id" "uuid", "p_dish_id" "uuid", "p_quantity" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."process_production_run"("p_order_id" "uuid", "p_order_item_id" "uuid", "p_dish_id" "uuid", "p_quantity" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_production_run"("p_order_id" "uuid", "p_order_item_id" "uuid", "p_dish_id" "uuid", "p_quantity" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."process_scheduled_integrations"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_scheduled_integrations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_scheduled_integrations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_warehouse_transfer"("p_transfer_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."process_warehouse_transfer"("p_transfer_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_warehouse_transfer"("p_transfer_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."publish_realtime_event"("p_event_type" "text", "p_event_category" "text", "p_reference_table" "text", "p_reference_id" "uuid", "p_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."publish_realtime_event"("p_event_type" "text", "p_event_category" "text", "p_reference_table" "text", "p_reference_id" "uuid", "p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."publish_realtime_event"("p_event_type" "text", "p_event_category" "text", "p_reference_table" "text", "p_reference_id" "uuid", "p_payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."queue_notification_from_template"("p_template_id" "uuid", "p_recipient_user_id" "uuid", "p_recipient_email" "text", "p_recipient_phone" "text", "p_template_variables" "jsonb", "p_scheduled_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."queue_notification_from_template"("p_template_id" "uuid", "p_recipient_user_id" "uuid", "p_recipient_email" "text", "p_recipient_phone" "text", "p_template_variables" "jsonb", "p_scheduled_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."queue_notification_from_template"("p_template_id" "uuid", "p_recipient_user_id" "uuid", "p_recipient_email" "text", "p_recipient_phone" "text", "p_template_variables" "jsonb", "p_scheduled_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."queue_realtime_event_delivery"() TO "anon";
GRANT ALL ON FUNCTION "public"."queue_realtime_event_delivery"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."queue_realtime_event_delivery"() TO "service_role";



GRANT ALL ON FUNCTION "public"."queue_webhook_deliveries_for_event"() TO "anon";
GRANT ALL ON FUNCTION "public"."queue_webhook_deliveries_for_event"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."queue_webhook_deliveries_for_event"() TO "service_role";



GRANT ALL ON FUNCTION "public"."realtime_workflow_event_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."realtime_workflow_event_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."realtime_workflow_event_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."register_enterprise_api_key"("p_key_name" "text", "p_api_provider" "text", "p_api_key_hash" "text", "p_key_prefix" "text", "p_permissions" "jsonb", "p_expires_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."register_enterprise_api_key"("p_key_name" "text", "p_api_provider" "text", "p_api_key_hash" "text", "p_key_prefix" "text", "p_permissions" "jsonb", "p_expires_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_enterprise_api_key"("p_key_name" "text", "p_api_provider" "text", "p_api_key_hash" "text", "p_key_prefix" "text", "p_permissions" "jsonb", "p_expires_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."register_websocket_session"("p_connection_id" "text", "p_channel_name" "text", "p_subscribed_events" "jsonb", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."register_websocket_session"("p_connection_id" "text", "p_channel_name" "text", "p_subscribed_events" "jsonb", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_websocket_session"("p_connection_id" "text", "p_channel_name" "text", "p_subscribed_events" "jsonb", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."request_approval"("p_workflow_type" "text", "p_reference_table" "text", "p_reference_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."request_approval"("p_workflow_type" "text", "p_reference_table" "text", "p_reference_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_approval"("p_workflow_type" "text", "p_reference_table" "text", "p_reference_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."retry_failed_websocket_events"() TO "anon";
GRANT ALL ON FUNCTION "public"."retry_failed_websocket_events"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."retry_failed_websocket_events"() TO "service_role";



GRANT ALL ON FUNCTION "public"."revoke_enterprise_api_key"("p_api_key_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."revoke_enterprise_api_key"("p_api_key_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_enterprise_api_key"("p_api_key_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."run_enterprise_health_checks"() TO "anon";
GRANT ALL ON FUNCTION "public"."run_enterprise_health_checks"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_enterprise_health_checks"() TO "service_role";



GRANT ALL ON FUNCTION "public"."run_production_atomic"("p_tenant_id" "uuid", "p_dish_id" "uuid", "p_quantity" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."run_production_atomic"("p_tenant_id" "uuid", "p_dish_id" "uuid", "p_quantity" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_production_atomic"("p_tenant_id" "uuid", "p_dish_id" "uuid", "p_quantity" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."run_system_job"("p_job_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."run_system_job"("p_job_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_system_job"("p_job_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."same_tenant"("target_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."same_tenant"("target_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."same_tenant"("target_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_feature_flag"("p_feature_key" "text", "p_feature_name" "text", "p_feature_category" "text", "p_enabled" boolean, "p_rollout_percentage" numeric, "p_feature_config" "jsonb", "p_environment" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."set_feature_flag"("p_feature_key" "text", "p_feature_name" "text", "p_feature_category" "text", "p_enabled" boolean, "p_rollout_percentage" numeric, "p_feature_config" "jsonb", "p_environment" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_feature_flag"("p_feature_key" "text", "p_feature_name" "text", "p_feature_category" "text", "p_enabled" boolean, "p_rollout_percentage" numeric, "p_feature_config" "jsonb", "p_environment" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_tenant_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_tenant_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_tenant_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_enterprise_integration"("p_integration_id" "uuid", "p_sync_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."sync_enterprise_integration"("p_integration_id" "uuid", "p_sync_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_enterprise_integration"("p_integration_id" "uuid", "p_sync_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_event_workflows"("p_event_name" "text", "p_input_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_event_workflows"("p_event_name" "text", "p_input_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_event_workflows"("p_event_name" "text", "p_input_payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_customer_loyalty"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_customer_loyalty"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_customer_loyalty"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_realtime_presence"("p_connection_id" "text", "p_presence_channel" "text", "p_status" "text", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."update_realtime_presence"("p_connection_id" "text", "p_presence_channel" "text", "p_status" "text", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_realtime_presence"("p_connection_id" "text", "p_presence_channel" "text", "p_status" "text", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_ai_agent_memory"("p_agent_name" "text", "p_memory_type" "text", "p_memory_key" "text", "p_memory_value" "jsonb", "p_relevance_score" numeric, "p_expires_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_ai_agent_memory"("p_agent_name" "text", "p_memory_type" "text", "p_memory_key" "text", "p_memory_value" "jsonb", "p_relevance_score" numeric, "p_expires_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_ai_agent_memory"("p_agent_name" "text", "p_memory_type" "text", "p_memory_key" "text", "p_memory_value" "jsonb", "p_relevance_score" numeric, "p_expires_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_period_open"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_period_open"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_period_open"() TO "service_role";



GRANT ALL ON TABLE "public"."accounting-expenses" TO "anon";
GRANT ALL ON TABLE "public"."accounting-expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."accounting-expenses" TO "service_role";



GRANT ALL ON TABLE "public"."accounting_periods" TO "anon";
GRANT ALL ON TABLE "public"."accounting_periods" TO "authenticated";
GRANT ALL ON TABLE "public"."accounting_periods" TO "service_role";



GRANT ALL ON TABLE "public"."actions" TO "anon";
GRANT ALL ON TABLE "public"."actions" TO "authenticated";
GRANT ALL ON TABLE "public"."actions" TO "service_role";



GRANT ALL ON TABLE "public"."ai_agent_memory" TO "anon";
GRANT ALL ON TABLE "public"."ai_agent_memory" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_agent_memory" TO "service_role";



GRANT ALL ON TABLE "public"."ai_agent_tasks" TO "anon";
GRANT ALL ON TABLE "public"."ai_agent_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_agent_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."ai_business_insights" TO "anon";
GRANT ALL ON TABLE "public"."ai_business_insights" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_business_insights" TO "service_role";



GRANT ALL ON TABLE "public"."ai_campaign_recommendations" TO "anon";
GRANT ALL ON TABLE "public"."ai_campaign_recommendations" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_campaign_recommendations" TO "service_role";



GRANT ALL ON TABLE "public"."ai_forecasts" TO "anon";
GRANT ALL ON TABLE "public"."ai_forecasts" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_forecasts" TO "service_role";



GRANT ALL ON TABLE "public"."ai_recommendations" TO "anon";
GRANT ALL ON TABLE "public"."ai_recommendations" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_recommendations" TO "service_role";



GRANT ALL ON TABLE "public"."alerts" TO "anon";
GRANT ALL ON TABLE "public"."alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."alerts" TO "service_role";



GRANT ALL ON TABLE "public"."api_access_logs" TO "anon";
GRANT ALL ON TABLE "public"."api_access_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."api_access_logs" TO "service_role";



GRANT ALL ON TABLE "public"."approval_logs" TO "anon";
GRANT ALL ON TABLE "public"."approval_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."approval_logs" TO "service_role";



GRANT ALL ON TABLE "public"."approval_rejections" TO "anon";
GRANT ALL ON TABLE "public"."approval_rejections" TO "authenticated";
GRANT ALL ON TABLE "public"."approval_rejections" TO "service_role";



GRANT ALL ON TABLE "public"."approval_requests" TO "anon";
GRANT ALL ON TABLE "public"."approval_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."approval_requests" TO "service_role";



GRANT ALL ON TABLE "public"."approval_workflows" TO "anon";
GRANT ALL ON TABLE "public"."approval_workflows" TO "authenticated";
GRANT ALL ON TABLE "public"."approval_workflows" TO "service_role";



GRANT ALL ON TABLE "public"."approvals" TO "anon";
GRANT ALL ON TABLE "public"."approvals" TO "authenticated";
GRANT ALL ON TABLE "public"."approvals" TO "service_role";



GRANT ALL ON TABLE "public"."assets" TO "anon";
GRANT ALL ON TABLE "public"."assets" TO "authenticated";
GRANT ALL ON TABLE "public"."assets" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."backup_jobs" TO "anon";
GRANT ALL ON TABLE "public"."backup_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."backup_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."chart_of_accounts" TO "anon";
GRANT ALL ON TABLE "public"."chart_of_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."chart_of_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."journal_entry_lines" TO "anon";
GRANT ALL ON TABLE "public"."journal_entry_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."journal_entry_lines" TO "service_role";



GRANT ALL ON TABLE "public"."balance_sheet_view" TO "anon";
GRANT ALL ON TABLE "public"."balance_sheet_view" TO "authenticated";
GRANT ALL ON TABLE "public"."balance_sheet_view" TO "service_role";



GRANT ALL ON TABLE "public"."billing_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_asset_usage" TO "anon";
GRANT ALL ON TABLE "public"."campaign_asset_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_asset_usage" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_memory" TO "anon";
GRANT ALL ON TABLE "public"."campaign_memory" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_memory" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_publish_logs" TO "anon";
GRANT ALL ON TABLE "public"."campaign_publish_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_publish_logs" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_publish_queue" TO "anon";
GRANT ALL ON TABLE "public"."campaign_publish_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_publish_queue" TO "service_role";



GRANT ALL ON TABLE "public"."campaigns" TO "anon";
GRANT ALL ON TABLE "public"."campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."journal_entries" TO "anon";
GRANT ALL ON TABLE "public"."journal_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."journal_entries" TO "service_role";



GRANT ALL ON TABLE "public"."cashflow_view" TO "anon";
GRANT ALL ON TABLE "public"."cashflow_view" TO "authenticated";
GRANT ALL ON TABLE "public"."cashflow_view" TO "service_role";



GRANT ALL ON TABLE "public"."cogs_entries" TO "anon";
GRANT ALL ON TABLE "public"."cogs_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."cogs_entries" TO "service_role";



GRANT ALL ON TABLE "public"."legal_entities" TO "anon";
GRANT ALL ON TABLE "public"."legal_entities" TO "authenticated";
GRANT ALL ON TABLE "public"."legal_entities" TO "service_role";



GRANT ALL ON TABLE "public"."consolidated_trial_balance_view" TO "anon";
GRANT ALL ON TABLE "public"."consolidated_trial_balance_view" TO "authenticated";
GRANT ALL ON TABLE "public"."consolidated_trial_balance_view" TO "service_role";



GRANT ALL ON TABLE "public"."cost_centers" TO "anon";
GRANT ALL ON TABLE "public"."cost_centers" TO "authenticated";
GRANT ALL ON TABLE "public"."cost_centers" TO "service_role";



GRANT ALL ON TABLE "public"."cross_location_consolidations" TO "anon";
GRANT ALL ON TABLE "public"."cross_location_consolidations" TO "authenticated";
GRANT ALL ON TABLE "public"."cross_location_consolidations" TO "service_role";



GRANT ALL ON TABLE "public"."customer_feedback" TO "anon";
GRANT ALL ON TABLE "public"."customer_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."customer_loyalty_accounts" TO "anon";
GRANT ALL ON TABLE "public"."customer_loyalty_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_loyalty_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."customer_segment_memberships" TO "anon";
GRANT ALL ON TABLE "public"."customer_segment_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_segment_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."customer_segments" TO "anon";
GRANT ALL ON TABLE "public"."customer_segments" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_segments" TO "service_role";



GRANT ALL ON TABLE "public"."daily-reports" TO "anon";
GRANT ALL ON TABLE "public"."daily-reports" TO "authenticated";
GRANT ALL ON TABLE "public"."daily-reports" TO "service_role";



GRANT ALL ON SEQUENCE "public"."daily-reports_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."daily-reports_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."daily-reports_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."daily_sales_batches" TO "anon";
GRANT ALL ON TABLE "public"."daily_sales_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_sales_batches" TO "service_role";



GRANT ALL ON TABLE "public"."daily_sales_items" TO "anon";
GRANT ALL ON TABLE "public"."daily_sales_items" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_sales_items" TO "service_role";



GRANT ALL ON TABLE "public"."department_budgets" TO "anon";
GRANT ALL ON TABLE "public"."department_budgets" TO "authenticated";
GRANT ALL ON TABLE "public"."department_budgets" TO "service_role";



GRANT ALL ON TABLE "public"."department_permissions" TO "anon";
GRANT ALL ON TABLE "public"."department_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."department_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."departments" TO "anon";
GRANT ALL ON TABLE "public"."departments" TO "authenticated";
GRANT ALL ON TABLE "public"."departments" TO "service_role";



GRANT ALL ON TABLE "public"."depreciation_entries" TO "anon";
GRANT ALL ON TABLE "public"."depreciation_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."depreciation_entries" TO "service_role";



GRANT ALL ON TABLE "public"."dish_stock" TO "anon";
GRANT ALL ON TABLE "public"."dish_stock" TO "authenticated";
GRANT ALL ON TABLE "public"."dish_stock" TO "service_role";



GRANT ALL ON TABLE "public"."dishes" TO "anon";
GRANT ALL ON TABLE "public"."dishes" TO "authenticated";
GRANT ALL ON TABLE "public"."dishes" TO "service_role";



GRANT ALL ON TABLE "public"."dynamic_price_adjustments" TO "anon";
GRANT ALL ON TABLE "public"."dynamic_price_adjustments" TO "authenticated";
GRANT ALL ON TABLE "public"."dynamic_price_adjustments" TO "service_role";



GRANT ALL ON TABLE "public"."dynamic_pricing_rules" TO "anon";
GRANT ALL ON TABLE "public"."dynamic_pricing_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."dynamic_pricing_rules" TO "service_role";



GRANT ALL ON TABLE "public"."engine_learning_memory" TO "anon";
GRANT ALL ON TABLE "public"."engine_learning_memory" TO "authenticated";
GRANT ALL ON TABLE "public"."engine_learning_memory" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_announcement_reads" TO "anon";
GRANT ALL ON TABLE "public"."enterprise_announcement_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_announcement_reads" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_announcements" TO "anon";
GRANT ALL ON TABLE "public"."enterprise_announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_announcements" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_api_keys" TO "anon";
GRANT ALL ON TABLE "public"."enterprise_api_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_api_keys" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_audit_events" TO "anon";
GRANT ALL ON TABLE "public"."enterprise_audit_events" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_audit_events" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_audit_rules" TO "anon";
GRANT ALL ON TABLE "public"."enterprise_audit_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_audit_rules" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_audit_summary" TO "anon";
GRANT ALL ON TABLE "public"."enterprise_audit_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_audit_summary" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_document_access_logs" TO "anon";
GRANT ALL ON TABLE "public"."enterprise_document_access_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_document_access_logs" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_document_versions" TO "anon";
GRANT ALL ON TABLE "public"."enterprise_document_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_document_versions" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_documents" TO "anon";
GRANT ALL ON TABLE "public"."enterprise_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_documents" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_feature_flag_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."enterprise_feature_flag_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_feature_flag_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_feature_flags" TO "anon";
GRANT ALL ON TABLE "public"."enterprise_feature_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_feature_flags" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_health_checks" TO "anon";
GRANT ALL ON TABLE "public"."enterprise_health_checks" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_health_checks" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_integration_sync_logs" TO "anon";
GRANT ALL ON TABLE "public"."enterprise_integration_sync_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_integration_sync_logs" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_integrations" TO "anon";
GRANT ALL ON TABLE "public"."enterprise_integrations" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_integrations" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_notification_queue" TO "anon";
GRANT ALL ON TABLE "public"."enterprise_notification_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_notification_queue" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_notification_templates" TO "anon";
GRANT ALL ON TABLE "public"."enterprise_notification_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_notification_templates" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_notifications" TO "anon";
GRANT ALL ON TABLE "public"."enterprise_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_rate_limit_logs" TO "anon";
GRANT ALL ON TABLE "public"."enterprise_rate_limit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_rate_limit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."enterprise_rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_security_incidents" TO "anon";
GRANT ALL ON TABLE "public"."enterprise_security_incidents" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_security_incidents" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_settings" TO "anon";
GRANT ALL ON TABLE "public"."enterprise_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_settings" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_system_health" TO "anon";
GRANT ALL ON TABLE "public"."enterprise_system_health" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_system_health" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_webhook_deliveries" TO "anon";
GRANT ALL ON TABLE "public"."enterprise_webhook_deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_webhook_deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_webhooks" TO "anon";
GRANT ALL ON TABLE "public"."enterprise_webhooks" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_webhooks" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_workflow_runs" TO "anon";
GRANT ALL ON TABLE "public"."enterprise_workflow_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_workflow_runs" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_workflow_step_runs" TO "anon";
GRANT ALL ON TABLE "public"."enterprise_workflow_step_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_workflow_step_runs" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_workflow_steps" TO "anon";
GRANT ALL ON TABLE "public"."enterprise_workflow_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_workflow_steps" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_workflows" TO "anon";
GRANT ALL ON TABLE "public"."enterprise_workflows" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_workflows" TO "service_role";



GRANT ALL ON TABLE "public"."executive_dashboard_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."executive_dashboard_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."executive_dashboard_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."finance_permissions" TO "anon";
GRANT ALL ON TABLE "public"."finance_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."finance_roles" TO "anon";
GRANT ALL ON TABLE "public"."finance_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_roles" TO "service_role";



GRANT ALL ON TABLE "public"."financial_periods" TO "anon";
GRANT ALL ON TABLE "public"."financial_periods" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_periods" TO "service_role";



GRANT ALL ON TABLE "public"."fixed_assets" TO "anon";
GRANT ALL ON TABLE "public"."fixed_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."fixed_assets" TO "service_role";



GRANT ALL ON TABLE "public"."generation_jobs" TO "anon";
GRANT ALL ON TABLE "public"."generation_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."generation_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."goods_receipt_items" TO "authenticated";
GRANT ALL ON TABLE "public"."goods_receipt_items" TO "service_role";



GRANT ALL ON TABLE "public"."goods_receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."goods_receipts" TO "service_role";



GRANT ALL ON TABLE "public"."history_days" TO "anon";
GRANT ALL ON TABLE "public"."history_days" TO "authenticated";
GRANT ALL ON TABLE "public"."history_days" TO "service_role";



GRANT ALL ON SEQUENCE "public"."history_days_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."history_days_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."history_days_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ingredient_stock" TO "anon";
GRANT ALL ON TABLE "public"."ingredient_stock" TO "authenticated";
GRANT ALL ON TABLE "public"."ingredient_stock" TO "service_role";



GRANT ALL ON TABLE "public"."ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."ingredients" TO "service_role";



GRANT ALL ON TABLE "public"."intercompany_transactions" TO "anon";
GRANT ALL ON TABLE "public"."intercompany_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."intercompany_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_alerts" TO "anon";
GRANT ALL ON TABLE "public"."inventory_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_alerts" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_cost_layers" TO "anon";
GRANT ALL ON TABLE "public"."inventory_cost_layers" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_cost_layers" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_transactions" TO "anon";
GRANT ALL ON TABLE "public"."inventory_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_valuation_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."inventory_valuation_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_valuation_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_matches" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_matches" TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."item_learning" TO "anon";
GRANT ALL ON TABLE "public"."item_learning" TO "authenticated";
GRANT ALL ON TABLE "public"."item_learning" TO "service_role";



GRANT ALL ON TABLE "public"."kitchen_station_orders" TO "anon";
GRANT ALL ON TABLE "public"."kitchen_station_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."kitchen_station_orders" TO "service_role";



GRANT ALL ON TABLE "public"."kitchen_station_performance" TO "anon";
GRANT ALL ON TABLE "public"."kitchen_station_performance" TO "authenticated";
GRANT ALL ON TABLE "public"."kitchen_station_performance" TO "service_role";



GRANT ALL ON TABLE "public"."kitchen_stations" TO "anon";
GRANT ALL ON TABLE "public"."kitchen_stations" TO "authenticated";
GRANT ALL ON TABLE "public"."kitchen_stations" TO "service_role";



GRANT ALL ON TABLE "public"."labor_shift_forecasts" TO "anon";
GRANT ALL ON TABLE "public"."labor_shift_forecasts" TO "authenticated";
GRANT ALL ON TABLE "public"."labor_shift_forecasts" TO "service_role";



GRANT ALL ON TABLE "public"."locations" TO "anon";
GRANT ALL ON TABLE "public"."locations" TO "authenticated";
GRANT ALL ON TABLE "public"."locations" TO "service_role";



GRANT ALL ON TABLE "public"."marketing_assets" TO "anon";
GRANT ALL ON TABLE "public"."marketing_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."marketing_assets" TO "service_role";



GRANT ALL ON TABLE "public"."marketing_campaign_analytics" TO "anon";
GRANT ALL ON TABLE "public"."marketing_campaign_analytics" TO "authenticated";
GRANT ALL ON TABLE "public"."marketing_campaign_analytics" TO "service_role";



GRANT ALL ON TABLE "public"."marketing_campaign_deliveries" TO "anon";
GRANT ALL ON TABLE "public"."marketing_campaign_deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."marketing_campaign_deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."marketing_campaigns" TO "anon";
GRANT ALL ON TABLE "public"."marketing_campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."marketing_campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."marketing_prompt_history" TO "anon";
GRANT ALL ON TABLE "public"."marketing_prompt_history" TO "authenticated";
GRANT ALL ON TABLE "public"."marketing_prompt_history" TO "service_role";



GRANT ALL ON TABLE "public"."meta_accounts" TO "anon";
GRANT ALL ON TABLE "public"."meta_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."meta_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."order_profit_view" TO "anon";
GRANT ALL ON TABLE "public"."order_profit_view" TO "authenticated";
GRANT ALL ON TABLE "public"."order_profit_view" TO "service_role";



GRANT ALL ON TABLE "public"."organization_leads" TO "anon";
GRANT ALL ON TABLE "public"."organization_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_leads" TO "service_role";



GRANT ALL ON TABLE "public"."payment_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_payouts" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_payouts" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_records" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_records" TO "service_role";



GRANT ALL ON TABLE "public"."performance" TO "anon";
GRANT ALL ON TABLE "public"."performance" TO "authenticated";
GRANT ALL ON TABLE "public"."performance" TO "service_role";



GRANT ALL ON TABLE "public"."period_lock_exceptions" TO "anon";
GRANT ALL ON TABLE "public"."period_lock_exceptions" TO "authenticated";
GRANT ALL ON TABLE "public"."period_lock_exceptions" TO "service_role";



GRANT ALL ON TABLE "public"."platform_modules" TO "anon";
GRANT ALL ON TABLE "public"."platform_modules" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_modules" TO "service_role";



GRANT ALL ON TABLE "public"."platform_tokens" TO "anon";
GRANT ALL ON TABLE "public"."platform_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."platform_users" TO "anon";
GRANT ALL ON TABLE "public"."platform_users" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_users" TO "service_role";



GRANT ALL ON TABLE "public"."pos-sales" TO "anon";
GRANT ALL ON TABLE "public"."pos-sales" TO "authenticated";
GRANT ALL ON TABLE "public"."pos-sales" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pos-sales_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pos-sales_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pos-sales_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."production_batches" TO "anon";
GRANT ALL ON TABLE "public"."production_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."production_batches" TO "service_role";



GRANT ALL ON TABLE "public"."production_locks" TO "anon";
GRANT ALL ON TABLE "public"."production_locks" TO "authenticated";
GRANT ALL ON TABLE "public"."production_locks" TO "service_role";



GRANT ALL ON TABLE "public"."production_logs" TO "anon";
GRANT ALL ON TABLE "public"."production_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."production_logs" TO "service_role";



GRANT ALL ON TABLE "public"."production_runs" TO "anon";
GRANT ALL ON TABLE "public"."production_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."production_runs" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."profit_and_loss_view" TO "anon";
GRANT ALL ON TABLE "public"."profit_and_loss_view" TO "authenticated";
GRANT ALL ON TABLE "public"."profit_and_loss_view" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_order_items" TO "anon";
GRANT ALL ON TABLE "public"."purchase_order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_order_items" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_orders" TO "anon";
GRANT ALL ON TABLE "public"."purchase_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_orders" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_request_items" TO "anon";
GRANT ALL ON TABLE "public"."purchase_request_items" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_request_items" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_requests" TO "anon";
GRANT ALL ON TABLE "public"."purchase_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_requests" TO "service_role";



GRANT ALL ON TABLE "public"."realtime_events" TO "anon";
GRANT ALL ON TABLE "public"."realtime_events" TO "authenticated";
GRANT ALL ON TABLE "public"."realtime_events" TO "service_role";



GRANT ALL ON TABLE "public"."realtime_presence" TO "anon";
GRANT ALL ON TABLE "public"."realtime_presence" TO "authenticated";
GRANT ALL ON TABLE "public"."realtime_presence" TO "service_role";



GRANT ALL ON TABLE "public"."recipe_items" TO "anon";
GRANT ALL ON TABLE "public"."recipe_items" TO "authenticated";
GRANT ALL ON TABLE "public"."recipe_items" TO "service_role";



GRANT ALL ON TABLE "public"."recipe_matrix" TO "anon";
GRANT ALL ON TABLE "public"."recipe_matrix" TO "authenticated";
GRANT ALL ON TABLE "public"."recipe_matrix" TO "service_role";



GRANT ALL ON TABLE "public"."recipes" TO "anon";
GRANT ALL ON TABLE "public"."recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."recipes" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_settings" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_settings" TO "service_role";



GRANT ALL ON TABLE "public"."role_hierarchy" TO "anon";
GRANT ALL ON TABLE "public"."role_hierarchy" TO "authenticated";
GRANT ALL ON TABLE "public"."role_hierarchy" TO "service_role";



GRANT ALL ON TABLE "public"."role_permissions" TO "anon";
GRANT ALL ON TABLE "public"."role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."salary_confirmations" TO "anon";
GRANT ALL ON TABLE "public"."salary_confirmations" TO "authenticated";
GRANT ALL ON TABLE "public"."salary_confirmations" TO "service_role";



GRANT ALL ON TABLE "public"."sales_events" TO "anon";
GRANT ALL ON TABLE "public"."sales_events" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_events" TO "service_role";



GRANT ALL ON TABLE "public"."secure_audit_logs_view" TO "anon";
GRANT ALL ON TABLE "public"."secure_audit_logs_view" TO "authenticated";
GRANT ALL ON TABLE "public"."secure_audit_logs_view" TO "service_role";



GRANT ALL ON TABLE "public"."secure_goods_receipts_view" TO "anon";
GRANT ALL ON TABLE "public"."secure_goods_receipts_view" TO "authenticated";
GRANT ALL ON TABLE "public"."secure_goods_receipts_view" TO "service_role";



GRANT ALL ON TABLE "public"."secure_inventory_transactions_view" TO "anon";
GRANT ALL ON TABLE "public"."secure_inventory_transactions_view" TO "authenticated";
GRANT ALL ON TABLE "public"."secure_inventory_transactions_view" TO "service_role";



GRANT ALL ON TABLE "public"."secure_inventory_view" TO "anon";
GRANT ALL ON TABLE "public"."secure_inventory_view" TO "authenticated";
GRANT ALL ON TABLE "public"."secure_inventory_view" TO "service_role";



GRANT ALL ON TABLE "public"."secure_invoices_view" TO "anon";
GRANT ALL ON TABLE "public"."secure_invoices_view" TO "authenticated";
GRANT ALL ON TABLE "public"."secure_invoices_view" TO "service_role";



GRANT ALL ON TABLE "public"."secure_orders_view" TO "anon";
GRANT ALL ON TABLE "public"."secure_orders_view" TO "authenticated";
GRANT ALL ON TABLE "public"."secure_orders_view" TO "service_role";



GRANT ALL ON TABLE "public"."secure_payments_view" TO "anon";
GRANT ALL ON TABLE "public"."secure_payments_view" TO "authenticated";
GRANT ALL ON TABLE "public"."secure_payments_view" TO "service_role";



GRANT ALL ON TABLE "public"."secure_payroll_view" TO "anon";
GRANT ALL ON TABLE "public"."secure_payroll_view" TO "authenticated";
GRANT ALL ON TABLE "public"."secure_payroll_view" TO "service_role";



GRANT ALL ON TABLE "public"."security_events" TO "anon";
GRANT ALL ON TABLE "public"."security_events" TO "authenticated";
GRANT ALL ON TABLE "public"."security_events" TO "service_role";



GRANT ALL ON TABLE "public"."shift_closures" TO "anon";
GRANT ALL ON TABLE "public"."shift_closures" TO "authenticated";
GRANT ALL ON TABLE "public"."shift_closures" TO "service_role";



GRANT ALL ON TABLE "public"."shift_logs" TO "anon";
GRANT ALL ON TABLE "public"."shift_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."shift_logs" TO "service_role";



GRANT ALL ON TABLE "public"."staff_accounts" TO "anon";
GRANT ALL ON TABLE "public"."staff_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."staff_members" TO "anon";
GRANT ALL ON TABLE "public"."staff_members" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_members" TO "service_role";



GRANT ALL ON TABLE "public"."staff_shifts" TO "anon";
GRANT ALL ON TABLE "public"."staff_shifts" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_shifts" TO "service_role";



GRANT ALL ON TABLE "public"."stock_movements" TO "anon";
GRANT ALL ON TABLE "public"."stock_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_movements" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."system_alerts" TO "anon";
GRANT ALL ON TABLE "public"."system_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."system_alerts" TO "service_role";



GRANT ALL ON TABLE "public"."system_jobs" TO "anon";
GRANT ALL ON TABLE "public"."system_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."system_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."table_sessions" TO "anon";
GRANT ALL ON TABLE "public"."table_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."table_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."tenant_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_billing_profiles" TO "anon";
GRANT ALL ON TABLE "public"."tenant_billing_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_billing_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_modules" TO "anon";
GRANT ALL ON TABLE "public"."tenant_modules" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_modules" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_platform_config" TO "anon";
GRANT ALL ON TABLE "public"."tenant_platform_config" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_platform_config" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_settings" TO "anon";
GRANT ALL ON TABLE "public"."tenant_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_settings" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_users" TO "anon";
GRANT ALL ON TABLE "public"."tenant_users" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_users" TO "service_role";



GRANT ALL ON TABLE "public"."tenants" TO "anon";
GRANT ALL ON TABLE "public"."tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."tenants" TO "service_role";



GRANT ALL ON TABLE "public"."trial_balance_view" TO "anon";
GRANT ALL ON TABLE "public"."trial_balance_view" TO "authenticated";
GRANT ALL ON TABLE "public"."trial_balance_view" TO "service_role";



GRANT ALL ON TABLE "public"."user_finance_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_finance_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_finance_roles" TO "service_role";



GRANT ALL ON TABLE "public"."vendors" TO "anon";
GRANT ALL ON TABLE "public"."vendors" TO "authenticated";
GRANT ALL ON TABLE "public"."vendors" TO "service_role";



GRANT ALL ON TABLE "public"."warehouse_inventory" TO "anon";
GRANT ALL ON TABLE "public"."warehouse_inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."warehouse_inventory" TO "service_role";



GRANT ALL ON TABLE "public"."warehouse_locations" TO "anon";
GRANT ALL ON TABLE "public"."warehouse_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."warehouse_locations" TO "service_role";



GRANT ALL ON TABLE "public"."warehouse_transfers" TO "anon";
GRANT ALL ON TABLE "public"."warehouse_transfers" TO "authenticated";
GRANT ALL ON TABLE "public"."warehouse_transfers" TO "service_role";



GRANT ALL ON TABLE "public"."waste_logs" TO "anon";
GRANT ALL ON TABLE "public"."waste_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."waste_logs" TO "service_role";



GRANT ALL ON TABLE "public"."websocket_delivery_logs" TO "anon";
GRANT ALL ON TABLE "public"."websocket_delivery_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."websocket_delivery_logs" TO "service_role";



GRANT ALL ON TABLE "public"."websocket_event_queue" TO "anon";
GRANT ALL ON TABLE "public"."websocket_event_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."websocket_event_queue" TO "service_role";



GRANT ALL ON TABLE "public"."websocket_sessions" TO "anon";
GRANT ALL ON TABLE "public"."websocket_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."websocket_sessions" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";








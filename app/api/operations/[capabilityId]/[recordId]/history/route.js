export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { resolveOperationsRequestContext } from "@/lib/operations/api/resolveOperationsRequestContext";
import { serverOperationsEvents } from "@/lib/operations/events/serverOperationsEvents";
import { OPERATIONS_ACTIONS } from "@/lib/operations/security/OperationsAuthorizationPolicy";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function scoped(query, context) {
  let next = query.eq("organization_id", context.organization_id);
  next = context.entity_id == null
    ? next.is("entity_id", null)
    : next.eq("entity_id", context.entity_id);
  next = context.period_id == null
    ? next.is("period_id", null)
    : next.eq("period_id", context.period_id);
  return next;
}

async function resolveActors(actorIds) {
  const ids = [...new Set((actorIds || []).filter(Boolean))];
  if (!ids.length) return {};

  const { data: staffRows, error: staffError } = await supabaseAdmin
    .from("staff_accounts")
    .select("id, auth_user_id, name, email, role, position, department, party_id")
    .in("auth_user_id", ids);

  if (staffError) throw staffError;

  const partyIds = (staffRows || []).map((row) => row.party_id).filter(Boolean);
  let parties = [];

  if (partyIds.length) {
    const { data, error } = await supabaseAdmin
      .from("parties")
      .select("id, display_name")
      .in("id", partyIds);
    if (error) throw error;
    parties = data || [];
  }

  const partyNames = Object.fromEntries(
    parties.map((party) => [party.id, party.display_name]),
  );

  return Object.fromEntries((staffRows || []).map((staff) => [
    staff.auth_user_id,
    {
      actor_id: staff.auth_user_id,
      staff_account_id: staff.id,
      party_id: staff.party_id || null,
      name: partyNames[staff.party_id] || staff.name || staff.email || "Unknown user",
      email: staff.email || null,
      role: staff.role || null,
      position: staff.position || null,
      department: staff.department || null,
    },
  ]));
}

export async function GET(request, { params }) {
  const resolvedParams = await params;
  const capabilityId = String(resolvedParams?.capabilityId || "").trim();
  const recordId = String(resolvedParams?.recordId || "").trim();
  const { searchParams } = new URL(request.url);
  const resolved = await resolveOperationsRequestContext({
    request,
    input: Object.fromEntries(searchParams.entries()),
    capabilityId,
    action: OPERATIONS_ACTIONS.AUDIT,
  });

  if (!resolved.success) {
    return NextResponse.json(
      {
        ok: false,
        error: resolved.error,
        required_permissions: resolved.required_permissions || [],
      },
      { status: resolved.status || 400 },
    );
  }

  if (!capabilityId || !recordId) {
    return NextResponse.json(
      { ok: false, error: "Operations record history requires capabilityId and recordId." },
      { status: 400 },
    );
  }

  try {
    const recordQuery = scoped(
      supabaseAdmin
        .from("operations_records")
        .select("id, capability_id, name, code, status, created_by, updated_by, created_at, updated_at")
        .eq("id", recordId)
        .eq("capability_id", capabilityId),
      resolved.context,
    );

    const commandQuery = scoped(
      supabaseAdmin
        .from("operations_command_ledger")
        .select("id, command, command_key, status, actor_id, payload, result, error, started_at, completed_at, failed_at")
        .eq("record_id", recordId)
        .eq("capability_id", capabilityId)
        .order("started_at", { ascending: false })
        .limit(200),
      resolved.context,
    );

    const [recordResult, commandsResult, events] = await Promise.all([
      recordQuery.maybeSingle(),
      commandQuery,
      serverOperationsEvents.listEvents({
        context: resolved.context,
        capabilityId,
        aggregateId: recordId,
        limit: 200,
      }),
    ]);

    if (recordResult.error) throw recordResult.error;
    if (!recordResult.data) {
      return NextResponse.json(
        { ok: false, error: "Operations record not found in requested scope." },
        { status: 404 },
      );
    }
    if (commandsResult.error) throw commandsResult.error;

    const commands = commandsResult.data || [];
    const actorIds = [
      recordResult.data.created_by,
      recordResult.data.updated_by,
      ...commands.map((command) => command.actor_id),
      ...events.map((event) => event.actor_id),
    ];
    const actors = await resolveActors(actorIds);

    const timeline = [
      ...commands.map((command) => ({
        id: `command:${command.id}`,
        type: "command",
        occurred_at: command.completed_at || command.failed_at || command.started_at,
        command: command.command,
        status: command.status,
        actor_id: command.actor_id,
        actor: actors[command.actor_id] || null,
        command_key: command.command_key,
        payload: command.payload,
        result: command.result,
        error: command.error,
      })),
      ...events.map((event) => ({
        id: `event:${event.id}`,
        type: "event",
        occurred_at: event.occurred_at,
        command: event.command,
        status: "published",
        actor_id: event.actor_id,
        actor: actors[event.actor_id] || null,
        event_type: event.event_type,
        payload: event.payload,
      })),
    ].sort((a, b) => new Date(b.occurred_at || 0) - new Date(a.occurred_at || 0));

    return NextResponse.json({
      ok: true,
      record: recordResult.data,
      commands,
      events,
      actors,
      timeline,
      count: timeline.length,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || "Operations record history could not be loaded." },
      { status: 500 },
    );
  }
}

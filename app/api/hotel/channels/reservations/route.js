import { NextResponse } from 'next/server';

import { HotelChannelReservationIngestRuntime } from '@/lib/hotel/channels/HotelChannelReservationIngestRuntime';
import { requireOrganizationAccess } from '@/lib/platform/security/requireOrganizationAccess';
import { supabaseAdmin } from '@/lib/shared/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function clean(value) {
  return String(value ?? '').trim();
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body.organizationId || body.organization_id);
    const connectionId = clean(body.connectionId || body.connection_id);
    if (!organizationId || !connectionId) {
      return NextResponse.json({ success: false, error: 'organizationId and connectionId required' }, { status: 400 });
    }

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return NextResponse.json(access, { status: access.status });

    const result = await HotelChannelReservationIngestRuntime.pullAndProcess({
      supabase: supabaseAdmin,
      organizationId: access.organizationId,
      connectionId,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('HOTEL_CHANNEL_RESERVATION_INGEST_ERROR', error);
    const message = clean(error?.message) || 'Hotel channel reservation ingest failed';
    const conflict = /INVENTORY_CONFLICT|MAPPING|CHECKED_IN|PROPERTY_MISMATCH|NOT_CERTIFIED_ACTIVE/.test(message);
    return NextResponse.json({ success: false, error: message }, { status: conflict ? 409 : 400 });
  }
}

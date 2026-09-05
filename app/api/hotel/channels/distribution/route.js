import { NextResponse } from 'next/server';

import { HotelChannelDistributionRuntime } from '@/lib/hotel/channels/HotelChannelDistributionRuntime';
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
    const jobId = clean(body.jobId || body.job_id);
    if (!organizationId || !jobId) {
      return NextResponse.json({ success: false, error: 'organizationId and jobId required' }, { status: 400 });
    }

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return NextResponse.json(access, { status: access.status });

    const result = await HotelChannelDistributionRuntime.dispatchRateInventoryJob({
      supabase: supabaseAdmin,
      organizationId: access.organizationId,
      jobId,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('HOTEL_CHANNEL_DISTRIBUTION_ERROR', error);
    const message = clean(error?.message) || 'Hotel channel distribution failed';
    const conflict = /STATE_CHANGED|ROW_COUNT_CHANGED|NOT_DISPATCHABLE|MAPPING_REQUIRED|INVENTORY_REQUIRED/.test(message);
    return NextResponse.json({ success: false, error: message }, { status: conflict ? 409 : 400 });
  }
}

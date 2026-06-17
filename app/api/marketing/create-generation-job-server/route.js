import { createServerSupabase } from '@/lib/shared/supabase/server';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await request.json();

    const supabase = createServerSupabase(); // server-side with service role

    const { data, error } = await supabase
      .from('generation_jobs')
      .insert([body])
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, job: data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
